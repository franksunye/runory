import { batch, genId, now, queryAll, queryOne } from "./db";
import { TABLES } from "./contracts";
import {
  ORGANIZATION_ROLES,
  WORKSPACE_ROLES,
  type OrganizationRole,
  type WorkspaceRole,
} from "./context";

// ── Re-export role types for backward compatibility ──
//
// Phase 0: WorkspaceRole no longer includes 'owner'.
// Use OrganizationRole for organization-level ownership.

export { ORGANIZATION_ROLES, WORKSPACE_ROLES, type OrganizationRole, type WorkspaceRole };

// Legacy alias — TenantRole includes 'owner' for backward compat with existing routes
// @deprecated Use WorkspaceRole or OrganizationRole explicitly
export type TenantRole = WorkspaceRole | "owner";

// ── Legacy Actor Identity (used by dev bootstrap) ──

export interface ActorIdentity {
  externalId: string;
  email?: string;
  displayName: string;
}

// ── Workspace Access Result ──

export interface WorkspaceAccess {
  workspaceId: string;
  organizationId: string;
  userId: string;
  workspaceRole: WorkspaceRole | null;
  organizationRole: OrganizationRole | null;
  /** Effective role (workspace role, or admin if org owner/admin) */
  role: WorkspaceRole;
}

// ── Role Hierarchy (legacy, for backward compat) ──

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  admin: 30,
  member: 20,
  viewer: 10,
};

export function roleAllows(actual: WorkspaceRole, required: WorkspaceRole): boolean {
  return WORKSPACE_ROLE_RANK[actual] >= WORKSPACE_ROLE_RANK[required];
}

// ── Effective role computation ──

export function effectiveRole(
  workspaceRole: WorkspaceRole | null,
  organizationRole: OrganizationRole | null
): WorkspaceRole | null {
  if (workspaceRole) return workspaceRole;
  if (organizationRole === "owner" || organizationRole === "admin") return "admin";
  return null;
}

// ── Provision Workspace Tenant (dev bootstrap) ──
//
// Creates a User, Organization, Workspace tenant, and memberships.
// The creator becomes Organization 'owner' and Workspace 'admin'.
// Note: Workspace no longer has 'owner' — ownership belongs to Organization.

export async function provisionWorkspaceTenant(
  workspaceId: string,
  workspaceName: string,
  actor: ActorIdentity
): Promise<WorkspaceAccess> {
  const timestamp = now();
  const organizationId = genId("org");
  const organizationSlug = `${workspaceId.replace(/[^a-z0-9]/gi, "").slice(-12).toLowerCase()}-org`;

  // Resolve the actual saas_users.id for the actor.
  // actor.externalId may already be a saas_users.id (e.g. when the actor
  // was created via OTP login), or it may be an external identity string.
  // We look up by both id and external_id to avoid creating a duplicate
  // user record.
  const existingUser = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.users} WHERE id = ? OR external_id = ?`,
    [actor.externalId, actor.externalId]
  );

  const userId = existingUser?.id ?? genId("usr");

  await batch([
    // Only insert user if it doesn't already exist (by id).
    // If the user already exists (looked up by id or external_id above),
    // skip the insert entirely to avoid creating a duplicate record with
    // a mismatched external_id.
    ...(existingUser ? [] : [{
      sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?) ON CONFLICT(external_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`,
      args: [userId, actor.externalId, actor.email ?? null, actor.displayName, timestamp, timestamp],
    }]),
    {
      sql: `INSERT INTO ${TABLES.organizations} (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [organizationId, workspaceName, organizationSlug, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [workspaceId, organizationId, timestamp],
    },
    {
      sql: `INSERT INTO ${TABLES.organizationMemberships} (id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?)`,
      args: [genId("orgmem"), organizationId, userId, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), workspaceId, userId, timestamp, timestamp],
    },
  ]);

  return {
    workspaceId,
    organizationId,
    userId,
    workspaceRole: "admin",
    organizationRole: "owner",
    role: "admin",
  };
}

// ── Authorize Workspace Access ──
//
// Resolves the user's effective workspace role.
// Organization owner/admin inherit workspace admin.

export async function authorizeWorkspace(
  workspaceId: string,
  externalUserId: string,
  requiredRole: WorkspaceRole = "viewer"
): Promise<WorkspaceAccess | null> {
  const access = await queryOne<{
    workspace_id: string;
    organization_id: string;
    user_id: string;
    workspace_role: WorkspaceRole | null;
    organization_role: OrganizationRole | null;
  }>(
    `SELECT wt.workspace_id, wt.organization_id, u.id AS user_id,
       wm.role AS workspace_role, om.role AS organization_role
     FROM ${TABLES.workspaceTenants} wt
     JOIN ${TABLES.users} u ON (u.id = ? OR u.external_id = ?) AND u.status = 'active'
     LEFT JOIN ${TABLES.workspaceMemberships} wm
       ON wm.workspace_id = wt.workspace_id AND wm.user_id = u.id AND wm.status = 'active'
     LEFT JOIN ${TABLES.organizationMemberships} om
       ON om.organization_id = wt.organization_id AND om.user_id = u.id AND om.status = 'active'
     WHERE wt.workspace_id = ?`,
    [externalUserId, externalUserId, workspaceId]
  );
  if (!access) return null;

  const effective = effectiveRole(access.workspace_role, access.organization_role);
  if (!effective || !roleAllows(effective, requiredRole)) return null;

  return {
    workspaceId: access.workspace_id,
    organizationId: access.organization_id,
    userId: access.user_id,
    workspaceRole: access.workspace_role,
    organizationRole: access.organization_role,
    role: effective,
  };
}

export async function workspaceHasTenant(workspaceId: string): Promise<boolean> {
  return Boolean(
    await queryOne(
      `SELECT workspace_id FROM ${TABLES.workspaceTenants} WHERE workspace_id = ?`,
      [workspaceId]
    )
  );
}

// ── List User Workspaces ──
//
// Returns all workspaces the user can access, with effective role and organization info.
// Used by dashboard / workspace switcher.

export interface UserWorkspaceEntry {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceStatus: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  workspaceRole: WorkspaceRole | null;
  organizationRole: OrganizationRole | null;
  effectiveRole: WorkspaceRole;
}

export async function listUserWorkspaces(userId: string): Promise<UserWorkspaceEntry[]> {
  const rows = await queryAll<{
    workspace_id: string;
    workspace_name: string;
    workspace_slug: string;
    workspace_status: string;
    organization_id: string;
    organization_name: string;
    organization_slug: string;
    workspace_role: WorkspaceRole | null;
    organization_role: OrganizationRole | null;
  }>(
    `SELECT w.id AS workspace_id, w.name AS workspace_name, w.slug AS workspace_slug, w.status AS workspace_status,
       o.id AS organization_id, o.name AS organization_name, o.slug AS organization_slug,
       wm.role AS workspace_role, om.role AS organization_role
     FROM ${TABLES.workspaceMemberships} wm
     JOIN ${TABLES.workspaces} w ON w.id = wm.workspace_id
     JOIN ${TABLES.workspaceTenants} wt ON wt.workspace_id = w.id
     JOIN ${TABLES.organizations} o ON o.id = wt.organization_id
     LEFT JOIN ${TABLES.organizationMemberships} om
       ON om.organization_id = o.id AND om.user_id = wm.user_id AND om.status = 'active'
     WHERE wm.user_id = ? AND wm.status = 'active'
     ORDER BY w.name ASC`,
    [userId]
  );

  return rows.map((r) => ({
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
    workspaceSlug: r.workspace_slug,
    workspaceStatus: r.workspace_status,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    organizationSlug: r.organization_slug,
    workspaceRole: r.workspace_role,
    organizationRole: r.organization_role,
    effectiveRole: effectiveRole(r.workspace_role, r.organization_role) ?? "viewer",
  }));
}
