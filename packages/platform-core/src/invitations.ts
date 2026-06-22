import { createHash, randomBytes } from "node:crypto";
import { batch, execute, genId, now, queryAll, queryOne } from "./db";
import { TABLES } from "./contracts";
import {
  ConflictError,
  NotFoundError,
  AuthorizationError,
  InvalidInputError,
  AuthenticationError,
  type OrganizationRole,
  type WorkspaceRole,
} from "./context";

// ── Configuration ──

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOKEN_BYTES = 32;

// ── Types ──

export interface Invitation {
  id: string;
  organizationId: string;
  emailNormalized: string;
  emailDisplay: string | null;
  organizationRole: OrganizationRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedBy: string;
  workspaceGrants: Array<{ workspaceId: string; workspaceName: string; workspaceRole: WorkspaceRole }>;
}

export interface InvitationCreate {
  email: string;
  organizationRole: "member" | "admin";
  workspaceGrants?: Array<{ workspaceId: string; workspaceRole: WorkspaceRole }>;
}

// ── Helpers ──

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim()) && email.trim().length <= 254;
}

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf-8").digest("hex");
}

// ── Authorization: check actor has invite permission ──

export function canInvite(actorOrgRole: OrganizationRole | null): boolean {
  return actorOrgRole === "owner" || actorOrgRole === "admin";
}

export function canManageMembers(actorOrgRole: OrganizationRole | null): boolean {
  return actorOrgRole === "owner" || actorOrgRole === "admin";
}

export function canTransferOwnership(actorOrgRole: OrganizationRole | null): boolean {
  return actorOrgRole === "owner";
}

// ── Create Invitation ──

export async function createInvitation(
  organizationId: string,
  inviterUserId: string,
  inviterOrgRole: OrganizationRole,
  input: InvitationCreate
): Promise<{ invitation: Invitation; token: string }> {
  if (!canInvite(inviterOrgRole)) {
    throw new AuthorizationError();
  }

  if (!isValidEmail(input.email)) {
    throw new InvalidInputError("A valid email address is required");
  }

  if (input.organizationRole !== "member" && input.organizationRole !== "admin") {
    throw new InvalidInputError("Role must be member or admin");
  }

  const emailNormalized = normalizeEmail(input.email);
  const emailDisplay = input.email.trim();

  // Check organization exists
  const org = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM ${TABLES.organizations} WHERE id = ?`,
    [organizationId]
  );
  if (!org) throw new NotFoundError("Organization not found");

  // Check if this email already has a pending invitation for this org
  const existing = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM ${TABLES.organizationInvitations}
     WHERE organization_id = ? AND email_normalized = ? AND status = 'pending'`,
    [organizationId, emailNormalized]
  );
  if (existing) {
    throw new ConflictError("A pending invitation already exists for this email");
  }

  // Check if this email is already a member
  const existingMember = await queryOne<{ id: string }>(
    `SELECT u.id FROM ${TABLES.users} u
     JOIN ${TABLES.authIdentities} ai ON ai.user_id = u.id
     JOIN ${TABLES.organizationMemberships} om ON om.user_id = u.id
     WHERE ai.email_normalized = ? AND om.organization_id = ? AND om.status = 'active'`,
    [emailNormalized, organizationId]
  );
  if (existingMember) {
    throw new ConflictError("This user is already a member of the organization");
  }

  // Validate workspace grants
  const grants = input.workspaceGrants ?? [];
  for (const grant of grants) {
    const ws = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.workspaces} w
       JOIN ${TABLES.workspaceTenants} wt ON wt.workspace_id = w.id
       WHERE w.id = ? AND wt.organization_id = ?`,
      [grant.workspaceId, organizationId]
    );
    if (!ws) throw new NotFoundError(`Workspace ${grant.workspaceId} not found in this organization`);
    if (!["admin", "member", "viewer"].includes(grant.workspaceRole)) {
      throw new InvalidInputError("Invalid workspace role");
    }
  }

  // Create invitation
  const token = generateToken();
  const tokenHash = hashToken(token);
  const invitationId = genId("inv");
  const ts = now();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

  const statements: Array<{ sql: string; args: unknown[] }> = [
    {
      sql: `INSERT INTO ${TABLES.organizationInvitations}
            (id, organization_id, email_normalized, email_display, token_hash,
             organization_role, status, invited_by, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      args: [invitationId, organizationId, emailNormalized, emailDisplay, tokenHash,
             input.organizationRole, inviterUserId, expiresAt, ts, ts],
    },
  ];

  for (const grant of grants) {
    statements.push({
      sql: `INSERT INTO ${TABLES.invitationWorkspaceGrants}
            (id, invitation_id, workspace_id, workspace_role, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [genId("grant"), invitationId, grant.workspaceId, grant.workspaceRole, ts],
    });
  }

  // Audit log
  statements.push({
    sql: `INSERT INTO ${TABLES.auditLogs}
          (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id,
           before_json, after_json, created_at)
          VALUES (?, ?, 'user', ?, 'invitation.create', 'invitation', ?, NULL, ?, ?)`,
    args: [genId("aud"), organizationId, inviterUserId, invitationId,
           JSON.stringify({ email: emailNormalized, role: input.organizationRole, grants: grants.length }), ts],
  });

  await batch(statements);

  const invitation = await getInvitationById(invitationId);
  return { invitation: invitation!, token };
}

// ── Get Invitation ──

export async function getInvitationById(id: string): Promise<Invitation | null> {
  const row = await queryOne<{
    id: string;
    organization_id: string;
    email_normalized: string;
    email_display: string | null;
    organization_role: OrganizationRole;
    status: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    invited_by: string;
  }>(
    `SELECT id, organization_id, email_normalized, email_display,
            organization_role, status, expires_at, accepted_at, revoked_at, invited_by
     FROM ${TABLES.organizationInvitations} WHERE id = ?`,
    [id]
  );
  if (!row) return null;

  const grants = await queryAll<{ workspace_id: string; workspace_name: string; workspace_role: WorkspaceRole }>(
    `SELECT iwg.workspace_id, w.name AS workspace_name, iwg.workspace_role
     FROM ${TABLES.invitationWorkspaceGrants} iwg
     JOIN ${TABLES.workspaces} w ON w.id = iwg.workspace_id
     WHERE iwg.invitation_id = ?`,
    [id]
  );

  return {
    id: row.id,
    organizationId: row.organization_id,
    emailNormalized: row.email_normalized,
    emailDisplay: row.email_display,
    organizationRole: row.organization_role,
    status: row.status as Invitation["status"],
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    invitedBy: row.invited_by,
    workspaceGrants: grants.map(g => ({
      workspaceId: g.workspace_id,
      workspaceName: g.workspace_name,
      workspaceRole: g.workspace_role,
    })),
  };
}

// ── Get Invitation by Token (for acceptance) ──

export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const tokenHash = hashToken(token);
  const row = await queryOne<{
    id: string;
    organization_id: string;
    email_normalized: string;
    email_display: string | null;
    organization_role: OrganizationRole;
    status: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    invited_by: string;
  }>(
    `SELECT id, organization_id, email_normalized, email_display,
            organization_role, status, expires_at, accepted_at, revoked_at, invited_by
     FROM ${TABLES.organizationInvitations} WHERE token_hash = ?`,
    [tokenHash]
  );
  if (!row) return null;

  const grants = await queryAll<{ workspace_id: string; workspace_name: string; workspace_role: WorkspaceRole }>(
    `SELECT iwg.workspace_id, w.name AS workspace_name, iwg.workspace_role
     FROM ${TABLES.invitationWorkspaceGrants} iwg
     JOIN ${TABLES.workspaces} w ON w.id = iwg.workspace_id
     WHERE iwg.invitation_id = ?`,
    [row.id]
  );

  return {
    id: row.id,
    organizationId: row.organization_id,
    emailNormalized: row.email_normalized,
    emailDisplay: row.email_display,
    organizationRole: row.organization_role,
    status: row.status as Invitation["status"],
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    invitedBy: row.invited_by,
    workspaceGrants: grants.map(g => ({
      workspaceId: g.workspace_id,
      workspaceName: g.workspace_name,
      workspaceRole: g.workspace_role,
    })),
  };
}

// ── List Invitations for Organization ──

export async function listOrganizationInvitations(
  organizationId: string,
  actorOrgRole: OrganizationRole | null
): Promise<Invitation[]> {
  if (!canManageMembers(actorOrgRole)) {
    throw new AuthorizationError();
  }

  const rows = await queryAll<{
    id: string;
    email_normalized: string;
    email_display: string | null;
    organization_role: OrganizationRole;
    status: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    invited_by: string;
  }>(
    `SELECT id, email_normalized, email_display, organization_role, status,
            expires_at, accepted_at, revoked_at, invited_by
     FROM ${TABLES.organizationInvitations}
     WHERE organization_id = ? ORDER BY created_at DESC`,
    [organizationId]
  );

  // Fetch all grants in a single query, then map by invitation id
  const allGrantIds = rows.map(r => r.id);
  const allGrants: Array<{
    invitation_id: string;
    workspace_id: string;
    workspace_name: string;
    workspace_role: WorkspaceRole;
  }> = allGrantIds.length > 0
    ? await queryAll(
        `SELECT iwg.invitation_id, iwg.workspace_id, w.name AS workspace_name, iwg.workspace_role
         FROM ${TABLES.invitationWorkspaceGrants} iwg
         JOIN ${TABLES.workspaces} w ON w.id = iwg.workspace_id
         WHERE iwg.invitation_id IN (${allGrantIds.map(() => "?").join(",")})`,
        allGrantIds
      )
    : [];

  const grantsByInvitation = new Map<string, typeof allGrants>();
  for (const g of allGrants) {
    const list = grantsByInvitation.get(g.invitation_id) ?? [];
    list.push(g);
    grantsByInvitation.set(g.invitation_id, list);
  }

  return rows.map(row => {
    const grants = grantsByInvitation.get(row.id) ?? [];
    return {
      id: row.id,
      organizationId,
      emailNormalized: row.email_normalized,
      emailDisplay: row.email_display,
      organizationRole: row.organization_role,
      status: row.status as Invitation["status"],
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
      invitedBy: row.invited_by,
      workspaceGrants: grants.map(g => ({
        workspaceId: g.workspace_id,
        workspaceName: g.workspace_name,
        workspaceRole: g.workspace_role,
      })),
    };
  });
}

// ── Resend Invitation ──

export async function resendInvitation(
  invitationId: string,
  actorUserId: string,
  actorOrgRole: OrganizationRole
): Promise<{ invitation: Invitation; token: string }> {
  if (!canInvite(actorOrgRole)) {
    throw new AuthorizationError();
  }

  const existing = await getInvitationById(invitationId);
  if (!existing) throw new NotFoundError("Invitation not found");
  if (existing.status !== "pending") {
    throw new ConflictError("Only pending invitations can be resent");
  }

  // Revoke old invitation
  const ts = now();
  await execute(
    `UPDATE ${TABLES.organizationInvitations} SET status = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = ? WHERE id = ?`,
    [ts, actorUserId, ts, invitationId]
  );

  // Create new invitation with same details
  const newToken = generateToken();
  const newTokenHash = hashToken(newToken);
  const newInvitationId = genId("inv");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

  const statements: Array<{ sql: string; args: unknown[] }> = [
    {
      sql: `INSERT INTO ${TABLES.organizationInvitations}
            (id, organization_id, email_normalized, email_display, token_hash,
             organization_role, status, invited_by, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      args: [newInvitationId, existing.organizationId, existing.emailNormalized, existing.emailDisplay,
             newTokenHash, existing.organizationRole, actorUserId, expiresAt, ts, ts],
    },
  ];

  for (const grant of existing.workspaceGrants) {
    statements.push({
      sql: `INSERT INTO ${TABLES.invitationWorkspaceGrants}
            (id, invitation_id, workspace_id, workspace_role, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [genId("grant"), newInvitationId, grant.workspaceId, grant.workspaceRole, ts],
    });
  }

  // Audit log
  statements.push({
    sql: `INSERT INTO ${TABLES.auditLogs}
          (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, after_json, created_at)
          VALUES (?, ?, 'user', ?, 'invitation.resend', 'invitation', ?, ?, ?)`,
    args: [genId("aud"), existing.organizationId, actorUserId, newInvitationId,
           JSON.stringify({ email: existing.emailNormalized, oldInvitationId: invitationId }), ts],
  });

  await batch(statements);

  const newInvitation = await getInvitationById(newInvitationId);
  return { invitation: newInvitation!, token: newToken };
}

// ── Revoke Invitation ──

export async function revokeInvitation(
  invitationId: string,
  actorUserId: string,
  actorOrgRole: OrganizationRole
): Promise<void> {
  if (!canManageMembers(actorOrgRole)) {
    throw new AuthorizationError();
  }

  const invitation = await getInvitationById(invitationId);
  if (!invitation) throw new NotFoundError("Invitation not found");
  if (invitation.status !== "pending") {
    throw new ConflictError("Only pending invitations can be revoked");
  }

  const ts = now();
  await batch([
    {
      sql: `UPDATE ${TABLES.organizationInvitations}
            SET status = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = ?
            WHERE id = ?`,
      args: [ts, actorUserId, ts, invitationId],
    },
    {
      sql: `INSERT INTO ${TABLES.auditLogs}
            (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, after_json, created_at)
            VALUES (?, ?, 'user', ?, 'invitation.revoke', 'invitation', ?, ?, ?)`,
      args: [genId("aud"), invitation.organizationId, actorUserId, invitationId,
             JSON.stringify({ email: invitation.emailNormalized }), ts],
    },
  ]);
}

// ── Accept Invitation ──
//
// Accepts an invitation by token. The accepting user must:
//  - Be authenticated (have a valid user account)
//  - Have their auth identity email match the invitation email
//
// On acceptance, transactionally creates:
//  - OrganizationMembership (with the invited role)
//  - WorkspaceMembership for each workspace grant
// And:
//  - Marks the invitation as accepted
//  - Revokes all other pending invitations for the same email in this org
//  - Immediately invalidates session cache

export async function acceptInvitation(
  token: string,
  acceptingUserId: string,
  acceptingUserEmail: string
): Promise<Invitation> {
  const invitation = await getInvitationByToken(token);
  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  // Check status
  if (invitation.status === "revoked") {
    throw new AuthenticationError("This invitation has been revoked");
  }
  if (invitation.status === "accepted") {
    throw new AuthenticationError("This invitation has already been used");
  }

  // Check expiry
  if (new Date(invitation.expiresAt) < new Date()) {
    await execute(
      `UPDATE ${TABLES.organizationInvitations} SET status = 'expired', updated_at = ? WHERE id = ?`,
      [now(), invitation.id]
    );
    throw new AuthenticationError("This invitation has expired");
  }

  // Check email match — the accepting user must have the same email as the invitation
  const userEmailNormalized = normalizeEmail(acceptingUserEmail);
  if (userEmailNormalized !== invitation.emailNormalized) {
    throw new AuthenticationError("This invitation is for a different email address");
  }

  // Check that user isn't already a member
  const existingMember = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.organizationMemberships}
     WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    [invitation.organizationId, acceptingUserId]
  );
  if (existingMember) {
    // Already a member — mark as accepted to clean up, but don't create duplicate memberships
    await execute(
      `UPDATE ${TABLES.organizationInvitations} SET status = 'accepted', accepted_at = ?, accepted_by = ?, updated_at = ? WHERE id = ?`,
      [now(), acceptingUserId, now(), invitation.id]
    );
    return await getInvitationById(invitation.id) as Invitation;
  }

  const ts = now();
  const orgMembershipId = genId("orgmem");

  const statements: Array<{ sql: string; args: unknown[] }> = [
    // Organization membership
    {
      sql: `INSERT INTO ${TABLES.organizationMemberships}
            (id, organization_id, user_id, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [orgMembershipId, invitation.organizationId, acceptingUserId, invitation.organizationRole, ts, ts],
    },
  ];

  // Workspace memberships from grants
  for (const grant of invitation.workspaceGrants) {
    statements.push({
      sql: `INSERT INTO ${TABLES.workspaceMemberships}
            (id, workspace_id, user_id, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [genId("wsmem"), grant.workspaceId, acceptingUserId, grant.workspaceRole, ts, ts],
    });
  }

  // Mark invitation accepted
  statements.push({
    sql: `UPDATE ${TABLES.organizationInvitations}
          SET status = 'accepted', accepted_at = ?, accepted_by = ?, updated_at = ? WHERE id = ?`,
    args: [ts, acceptingUserId, ts, invitation.id],
  });

  // Revoke other pending invitations for this email in the same org
  statements.push({
    sql: `UPDATE ${TABLES.organizationInvitations}
          SET status = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = ?
          WHERE organization_id = ? AND email_normalized = ?
            AND status = 'pending' AND id != ?`,
    args: [ts, acceptingUserId, ts, invitation.organizationId, invitation.emailNormalized, invitation.id],
  });

  // Audit: invitation accepted
  statements.push({
    sql: `INSERT INTO ${TABLES.auditLogs}
          (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, after_json, created_at)
          VALUES (?, ?, 'user', ?, 'invitation.accept', 'invitation', ?, ?, ?)`,
    args: [genId("aud"), invitation.organizationId, acceptingUserId, invitation.id,
           JSON.stringify({
             email: invitation.emailNormalized,
             organizationRole: invitation.organizationRole,
             workspaceGrants: invitation.workspaceGrants.length,
           }), ts],
  });

  // Audit: member joined organization
  statements.push({
    sql: `INSERT INTO ${TABLES.auditLogs}
          (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, after_json, created_at)
          VALUES (?, ?, 'user', ?, 'organization.member_joined', 'organization', ?, ?, ?)`,
    args: [genId("aud"), invitation.organizationId, acceptingUserId, invitation.organizationId,
           JSON.stringify({ role: invitation.organizationRole, fromInvitation: true }), ts],
  });

  await batch(statements);

  return (await getInvitationById(invitation.id)) as Invitation;
}
