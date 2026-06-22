import { batch, execute, genId, now, queryAll, queryOne } from "./db";
import { TABLES } from "./contracts";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  InvalidInputError,
  type OrganizationRole,
  type WorkspaceRole,
} from "./context";

// ── Types ──

export interface OrganizationMember {
  userId: string;
  email: string | null;
  displayName: string;
  role: OrganizationRole;
  membershipId: string;
  joinedAt: string;
}

export interface WorkspaceMembershipEntry {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: WorkspaceRole;
}

// ── Authorization ──

function canManageMembers(actorOrgRole: OrganizationRole | null): boolean {
  return actorOrgRole === "owner" || actorOrgRole === "admin";
}

function canTransferOwnership(actorOrgRole: OrganizationRole | null): boolean {
  return actorOrgRole === "owner";
}

// ── List Organization Members ──

export async function listOrganizationMembers(
  organizationId: string,
  actorOrgRole: OrganizationRole | null
): Promise<OrganizationMember[]> {
  if (!canManageMembers(actorOrgRole)) {
    throw new AuthorizationError();
  }

  const rows = await queryAll<{
    user_id: string;
    email: string | null;
    display_name: string;
    role: OrganizationRole;
    membership_id: string;
    joined_at: string;
  }>(
    `SELECT u.id AS user_id, u.email, u.display_name,
            om.role, om.id AS membership_id, om.created_at AS joined_at
     FROM ${TABLES.organizationMemberships} om
     JOIN ${TABLES.users} u ON u.id = om.user_id
     WHERE om.organization_id = ? AND om.status = 'active'
     ORDER BY om.role = 'owner' DESC, om.role = 'admin' DESC, u.display_name ASC`,
    [organizationId]
  );

  return rows.map(r => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    membershipId: r.membership_id,
    joinedAt: r.joined_at,
  }));
}

// ── Count Organization Owners (for last-owner invariant) ──

async function countOrganizationOwners(organizationId: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${TABLES.organizationMemberships}
     WHERE organization_id = ? AND role = 'owner' AND status = 'active'`,
    [organizationId]
  );
  return row?.count ?? 0;
}

// ── Update Organization Role ──

export async function updateOrganizationMemberRole(
  organizationId: string,
  targetUserId: string,
  newRole: OrganizationRole,
  actorUserId: string,
  actorOrgRole: OrganizationRole
): Promise<void> {
  if (!canManageMembers(actorOrgRole)) {
    throw new AuthorizationError();
  }

  // Can only set to member/admin — owner transfer uses a separate function
  if (newRole !== "member" && newRole !== "admin") {
    throw new InvalidInputError("Role must be member or admin");
  }

  // Check target is a member
  const target = await queryOne<{ role: OrganizationRole }>(
    `SELECT role FROM ${TABLES.organizationMemberships}
     WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    [organizationId, targetUserId]
  );
  if (!target) throw new NotFoundError("Member not found");

  // Cannot modify owner via this function (use transferOwnership)
  if (target.role === "owner") {
    throw new ConflictError("Cannot modify owner role directly; use ownership transfer");
  }

  // admin cannot demote/promote other admins unless they're an owner
  if (actorOrgRole === "admin" && target.role === "admin") {
    throw new AuthorizationError();
  }
  if (actorOrgRole === "admin" && newRole === "admin") {
    throw new AuthorizationError();
  }

  const ts = now();
  await batch([
    {
      sql: `UPDATE ${TABLES.organizationMemberships}
            SET role = ?, updated_at = ?
            WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
      args: [newRole, ts, organizationId, targetUserId],
    },
    {
      sql: `INSERT INTO ${TABLES.auditLogs}
            (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id,
             before_json, after_json, created_at)
            VALUES (?, ?, 'user', ?, 'organization.member_role_updated', 'membership', ?, ?, ?, ?)`,
      args: [genId("aud"), organizationId, actorUserId, targetUserId,
             JSON.stringify({ oldRole: target.role, newRole }), ts],
    },
  ]);
}

// ── Remove Member ──

export async function removeOrganizationMember(
  organizationId: string,
  targetUserId: string,
  actorUserId: string,
  actorOrgRole: OrganizationRole
): Promise<void> {
  if (!canManageMembers(actorOrgRole)) {
    throw new AuthorizationError();
  }

  // Check target is a member
  const target = await queryOne<{ role: OrganizationRole }>(
    `SELECT role FROM ${TABLES.organizationMemberships}
     WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    [organizationId, targetUserId]
  );
  if (!target) return; // Already removed, idempotent

  // Cannot remove last owner
  if (target.role === "owner") {
    const ownerCount = await countOrganizationOwners(organizationId);
    if (ownerCount <= 1) {
      throw new ConflictError("Cannot remove the last owner. Transfer ownership first.");
    }
  }

  // Cannot remove yourself unless you're owner of another org (leave operation)
  if (targetUserId === actorUserId && actorOrgRole !== "owner") {
    throw new AuthorizationError();
  }

  // Admin cannot remove admin
  if (actorOrgRole === "admin" && target.role === "admin") {
    throw new AuthorizationError();
  }

  const ts = now();

  // Get all workspace memberships for this user in this org
  const workspaceRows = await queryAll<{ workspace_id: string }>(
    `SELECT wm.workspace_id FROM ${TABLES.workspaceMemberships} wm
     JOIN ${TABLES.workspaceTenants} wt ON wt.workspace_id = wm.workspace_id
     WHERE wt.organization_id = ? AND wm.user_id = ? AND wm.status = 'active'`,
    [organizationId, targetUserId]
  );

  const statements: Array<{ sql: string; args: unknown[] }> = [];

  // Remove org membership
  statements.push({
    sql: `UPDATE ${TABLES.organizationMemberships}
          SET status = 'inactive', updated_at = ?
          WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    args: [ts, organizationId, targetUserId],
  });

  // Remove all workspace memberships in this org
  for (const ws of workspaceRows) {
    statements.push({
      sql: `UPDATE ${TABLES.workspaceMemberships}
            SET status = 'inactive', updated_at = ?
            WHERE workspace_id = ? AND user_id = ? AND status = 'active'`,
      args: [ts, ws.workspace_id, targetUserId],
    });
  }

  // Revoke all sessions for this user (immediate cache invalidation)
  statements.push({
    sql: `UPDATE ${TABLES.sessions}
          SET status = 'revoked', revoked_at = ?
          WHERE user_id = ? AND status = 'active'`,
    args: [ts, targetUserId],
  });

  // Audit log
  statements.push({
    sql: `INSERT INTO ${TABLES.auditLogs}
          (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, after_json, created_at)
          VALUES (?, ?, 'user', ?, 'organization.member_removed', 'membership', ?, ?, ?)`,
    args: [genId("aud"), organizationId, actorUserId, targetUserId,
           JSON.stringify({ role: target.role, workspacesRemoved: workspaceRows.length }), ts],
  });

  await batch(statements);
}

// ── Transfer Ownership ──

export async function transferOwnership(
  organizationId: string,
  targetUserId: string,
  actorUserId: string,
  actorOrgRole: OrganizationRole
): Promise<void> {
  if (!canTransferOwnership(actorOrgRole)) {
    throw new AuthorizationError();
  }

  // Cannot transfer to yourself
  if (targetUserId === actorUserId) {
    throw new InvalidInputError("Cannot transfer ownership to yourself");
  }

  // Check target is a member
  const target = await queryOne<{ role: OrganizationRole }>(
    `SELECT role FROM ${TABLES.organizationMemberships}
     WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    [organizationId, targetUserId]
  );
  if (!target) throw new NotFoundError("Target user is not a member of this organization");

  const ts = now();
  await batch([
    // Demote the current owner to admin
    {
      sql: `UPDATE ${TABLES.organizationMemberships}
            SET role = 'admin', updated_at = ?
            WHERE organization_id = ? AND user_id = ? AND status = 'active' AND role = 'owner'`,
      args: [ts, organizationId, actorUserId],
    },
    // Promote target to owner
    {
      sql: `UPDATE ${TABLES.organizationMemberships}
            SET role = 'owner', updated_at = ?
            WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
      args: [ts, organizationId, targetUserId],
    },
    // Audit log
    {
      sql: `INSERT INTO ${TABLES.auditLogs}
            (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, after_json, created_at)
            VALUES (?, ?, 'user', ?, 'organization.owner_transferred', 'organization', ?, ?, ?)`,
      args: [genId("aud"), organizationId, actorUserId, organizationId,
             JSON.stringify({ newOwnerUserId: targetUserId, previousOwnerUserId: actorUserId }), ts],
    },
  ]);
}

// ── Self-Leave (Leave Organization) ──

export async function leaveOrganization(
  organizationId: string,
  userId: string,
  userOrgRole: OrganizationRole
): Promise<void> {
  // Last owner cannot leave
  if (userOrgRole === "owner") {
    const ownerCount = await countOrganizationOwners(organizationId);
    if (ownerCount <= 1) {
      throw new ConflictError("Cannot leave as the last owner. Transfer ownership first.");
    }
  }

  const ts = now();
  await removeOrganizationMember(
    organizationId,
    userId,
    userId,
    userOrgRole // Act as self (authorized via the role check above; we allow owner to leave if not last)
  );
}

// ── Workspace Assignment for a Member ──

export async function getMemberWorkspaceAssignments(
  organizationId: string,
  userId: string,
  actorOrgRole: OrganizationRole | null
): Promise<WorkspaceMembershipEntry[]> {
  if (!canManageMembers(actorOrgRole)) {
    throw new AuthorizationError();
  }

  const rows = await queryAll<{
    workspace_id: string;
    workspace_name: string;
    workspace_slug: string;
    role: WorkspaceRole;
  }>(
    `SELECT wm.workspace_id, w.name AS workspace_name, w.slug AS workspace_slug, wm.role
     FROM ${TABLES.workspaceMemberships} wm
     JOIN ${TABLES.workspaces} w ON w.id = wm.workspace_id
     JOIN ${TABLES.workspaceTenants} wt ON wt.workspace_id = w.id
     WHERE wt.organization_id = ? AND wm.user_id = ? AND wm.status = 'active'
     ORDER BY w.name ASC`,
    [organizationId, userId]
  );

  return rows.map(r => ({
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
    workspaceSlug: r.workspace_slug,
    role: r.role,
  }));
}

export async function updateWorkspaceAssignment(
  organizationId: string,
  userId: string,
  workspaceId: string,
  newRole: WorkspaceRole,
  actorOrgRole: OrganizationRole | null
): Promise<void> {
  if (!canManageMembers(actorOrgRole)) {
    throw new AuthorizationError();
  }

  // Verify workspace belongs to this org
  const ws = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.workspaceTenants}
     WHERE workspace_id = ? AND organization_id = ?`,
    [workspaceId, organizationId]
  );
  if (!ws) throw new NotFoundError("Workspace not found in this organization");

  // Validate role
  if (!["admin", "member", "viewer"].includes(newRole)) {
    throw new InvalidInputError("Invalid workspace role");
  }

  // Check existing
  const existing = await queryOne<{ role: WorkspaceRole; status: string }>(
    `SELECT role, status FROM ${TABLES.workspaceMemberships}
     WHERE workspace_id = ? AND user_id = ?`,
    [workspaceId, userId]
  );

  const ts = now();
  const statements: Array<{ sql: string; args: unknown[] }> = [];

  if (existing?.status === "active") {
    // Update existing
    statements.push({
      sql: `UPDATE ${TABLES.workspaceMemberships}
            SET role = ?, updated_at = ?
            WHERE workspace_id = ? AND user_id = ? AND status = 'active'`,
      args: [newRole, ts, workspaceId, userId],
    });
    statements.push({
      sql: `INSERT INTO ${TABLES.auditLogs}
            (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, created_at)
            VALUES (?, ?, 'user', ?, 'workspace.member_role_updated', 'workspace_membership', ?, ?, ?, ?)`,
      args: [genId("aud"), workspaceId, "system", userId,
             JSON.stringify({ oldRole: existing.role }), ts],
    });
  } else if (existing?.status === "inactive") {
    // Reactivate
    statements.push({
      sql: `UPDATE ${TABLES.workspaceMemberships}
            SET role = ?, status = 'active', updated_at = ?
            WHERE workspace_id = ? AND user_id = ?`,
      args: [newRole, ts, workspaceId, userId],
    });
  } else {
    // Create new
    statements.push({
      sql: `INSERT INTO ${TABLES.workspaceMemberships}
            (id, workspace_id, user_id, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [genId("wsmem"), workspaceId, userId, newRole, ts, ts],
    });
    statements.push({
      sql: `INSERT INTO ${TABLES.auditLogs}
            (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, after_json, created_at)
            VALUES (?, ?, 'user', ?, 'workspace.member_added', 'workspace_membership', ?, ?, ?)`,
      args: [genId("aud"), workspaceId, "system", userId,
             JSON.stringify({ role: newRole }), ts],
    });
  }

  await batch(statements);
}

export async function removeWorkspaceAssignment(
  organizationId: string,
  userId: string,
  workspaceId: string,
  actorOrgRole: OrganizationRole | null
): Promise<void> {
  if (!canManageMembers(actorOrgRole)) {
    throw new AuthorizationError();
  }

  // Verify workspace belongs to this org
  const ws = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.workspaceTenants}
     WHERE workspace_id = ? AND organization_id = ?`,
    [workspaceId, organizationId]
  );
  if (!ws) throw new NotFoundError("Workspace not found in this organization");

  const ts = now();
  await execute(
    `UPDATE ${TABLES.workspaceMemberships}
     SET status = 'inactive', updated_at = ?
     WHERE workspace_id = ? AND user_id = ? AND status = 'active'`,
    [ts, workspaceId, userId]
  );
}
