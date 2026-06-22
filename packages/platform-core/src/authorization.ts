import {
  type OrganizationRole,
  type WorkspaceRole,
  type RequestContext,
  AuthenticationError,
  AuthorizationError,
} from "./context";

// ── Role Hierarchy ──
//
// Per SaaS Core Boundaries §5.2:
//   Organization Roles: owner > admin > member
//   Workspace Roles: admin > member > viewer
//   Organization owner/admin auto-inherit workspace admin.

const ORG_ROLE_RANK: Record<OrganizationRole, number> = {
  owner: 30,
  admin: 20,
  member: 10,
};

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  admin: 30,
  member: 20,
  viewer: 10,
};

export function orgRoleAllows(actual: OrganizationRole, required: OrganizationRole): boolean {
  return ORG_ROLE_RANK[actual] >= ORG_ROLE_RANK[required];
}

export function workspaceRoleAllows(actual: WorkspaceRole, required: WorkspaceRole): boolean {
  return WORKSPACE_ROLE_RANK[actual] >= WORKSPACE_ROLE_RANK[required];
}

// ── Effective Workspace Role ──
//
// Organization owner/admin automatically get workspace admin.
// This is the canonical "effective role" computation.

export function effectiveWorkspaceRole(ctx: RequestContext): WorkspaceRole | null {
  // Direct workspace membership takes precedence
  if (ctx.workspaceRole) return ctx.workspaceRole;

  // Organization owner/admin inherit workspace admin
  if (ctx.organizationRole === "owner" || ctx.organizationRole === "admin") {
    return "admin";
  }

  return null;
}

// ── Authorization Policy ──
//
// Per SaaS Core Boundaries §8, minimum role policy:
//   Read business records       → Workspace viewer
//   Create/modify records       → Workspace member
//   Install Pack / apply Ext    → Workspace admin
//   Invite members              → Organization admin
//   Billing / delete org        → Organization owner

export type WorkspaceOperation = "read" | "write" | "admin";
export type OrganizationOperation = "read" | "admin" | "owner";

const WORKSPACE_OP_REQUIRED: Record<WorkspaceOperation, WorkspaceRole> = {
  read: "viewer",
  write: "member",
  admin: "admin",
};

const ORG_OP_REQUIRED: Record<OrganizationOperation, OrganizationRole> = {
  read: "member",
  admin: "admin",
  owner: "owner",
};

// ── Require Workspace Access ──

export function requireWorkspaceAccess(
  ctx: RequestContext,
  operation: WorkspaceOperation
): void {
  if (!ctx.principal) {
    throw new AuthenticationError("Authentication required");
  }
  if (!ctx.workspaceId) {
    throw new AuthorizationError("Request is not scoped to a workspace");
  }

  const effectiveRole = effectiveWorkspaceRole(ctx);
  if (!effectiveRole) {
    throw new AuthorizationError("You are not a member of this workspace");
  }

  const required = WORKSPACE_OP_REQUIRED[operation];
  if (!workspaceRoleAllows(effectiveRole, required)) {
    throw new AuthorizationError(
      `This operation requires workspace '${required}' role (your role: ${effectiveRole})`
    );
  }
}

// ── Require Organization Access ──

export function requireOrganizationAccess(
  ctx: RequestContext,
  operation: OrganizationOperation
): void {
  if (!ctx.principal) {
    throw new AuthenticationError("Authentication required");
  }
  if (!ctx.organizationId) {
    throw new AuthorizationError("Request is not scoped to an organization");
  }

  if (!ctx.organizationRole) {
    throw new AuthorizationError("You are not a member of this organization");
  }

  const required = ORG_OP_REQUIRED[operation];
  if (!orgRoleAllows(ctx.organizationRole, required)) {
    throw new AuthorizationError(
      `This operation requires organization '${required}' role (your role: ${ctx.organizationRole})`
    );
  }
}

// ── Check (non-throwing variants for conditional logic) ──

export function canAccessWorkspace(ctx: RequestContext, operation: WorkspaceOperation): boolean {
  if (!ctx.principal || !ctx.workspaceId) return false;
  const role = effectiveWorkspaceRole(ctx);
  if (!role) return false;
  return workspaceRoleAllows(role, WORKSPACE_OP_REQUIRED[operation]);
}

export function canAccessOrganization(ctx: RequestContext, operation: OrganizationOperation): boolean {
  if (!ctx.principal || !ctx.organizationId || !ctx.organizationRole) return false;
  return orgRoleAllows(ctx.organizationRole, ORG_OP_REQUIRED[operation]);
}
