import type { NextRequest } from "next/server";
import {
  authorizeWorkspace,
  getWorkspace,
  provisionWorkspaceTenant,
  resolveWorkspaceId,
  workspaceHasTenant,
  resolveSession,
  resolveApiKey,
  queryOne,
  TABLES,
  type ActorIdentity,
  type WorkspaceRole,
  type WorkspaceAccess,
  type Principal,
  type RequestContext,
  getOrCreateRequestId,
  createRequestContext,
  AuthenticationError,
  AuthorizationError,
} from "@runory/platform-core";

const SESSION_COOKIE = "runory_session";

const DEVELOPMENT_ACTOR: ActorIdentity = {
  externalId: "dev-local-owner",
  displayName: "Local workspace owner",
};

export interface OrganizationMembership {
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "member";
}

// ── Get Request Actor ──

export async function getRequestActor(request: NextRequest): Promise<ActorIdentity> {
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    const principal = await resolveSession(sessionToken);
    if (principal) {
      return {
        externalId: principal.userId,
        email: principal.email ?? undefined,
        displayName: principal.displayName,
      };
    }
  }

  const trustHeaders = process.env.RUNORY_TRUST_IDENTITY_HEADERS === "true";
  if (trustHeaders) {
    const externalId = request.headers.get("x-runory-user-id");
    if (externalId) {
      return {
        externalId,
        email: request.headers.get("x-runory-user-email") ?? undefined,
        displayName: request.headers.get("x-runory-user-name") ?? externalId,
      };
    }
  }

  if (process.env.NODE_ENV !== "production") return DEVELOPMENT_ACTOR;
  throw new AuthenticationError("Authentication is required");
}

// ── Get Current Principal (session-based) ──

export async function getCurrentPrincipal(request: NextRequest): Promise<Principal | null> {
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return null;
  return resolveSession(sessionToken);
}

// ── Require Authenticated Principal (session or API key) ──

export async function requirePrincipal(request: NextRequest): Promise<Principal> {
  // Try session first
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    const principal = await resolveSession(sessionToken);
    if (principal) return principal;
  }

  if (process.env.NODE_ENV !== "production") {
    // Dev bootstrap fallback
    const principal: Principal = {
      userId: DEVELOPMENT_ACTOR.externalId,
      email: null,
      displayName: DEVELOPMENT_ACTOR.displayName,
      authMethod: "dev_bootstrap",
    };
    return principal;
  }

  throw new AuthenticationError("Authentication is required");
}

// ── Organization Membership Resolution ──

async function authorizeOrganization(
  organizationId: string,
  userId: string
): Promise<OrganizationMembership | null> {
  const row = await queryOne<{
    organization_id: string;
    user_id: string;
    role: "owner" | "admin" | "member";
  }>(
    `SELECT organization_id, user_id, role FROM ${TABLES.organizationMemberships}
     WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    [organizationId, userId]
  );
  if (!row) return null;
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
  };
}

export async function requireOrganizationAccess(
  request: NextRequest,
  organizationId: string
): Promise<{ principal: Principal; membership: OrganizationMembership }> {
  const principal = await requirePrincipal(request);
  const membership = await authorizeOrganization(organizationId, principal.userId);
  if (!membership) throw new AuthorizationError();
  return { principal, membership };
}

// ── Build RequestContext from request ──

export async function buildRequestContext(
  request: NextRequest,
  workspaceReference?: string
): Promise<RequestContext> {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));

  let principal: Principal | null = null;

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    principal = await resolveSession(sessionToken);
  }

  if (!principal) {
    try {
      const actor = await getRequestActor(request);
      principal = {
        userId: actor.externalId,
        email: actor.email ?? null,
        displayName: actor.displayName,
        authMethod: "dev_bootstrap",
      };
    } catch {
      principal = null;
    }
  }

  if (!workspaceReference) {
    return createRequestContext({ requestId, principal });
  }

  const workspaceId = await resolveWorkspaceId(workspaceReference);
  let access: WorkspaceAccess | null = await authorizeWorkspace(workspaceId, principal?.userId ?? "");

  if (!access && process.env.NODE_ENV !== "production" && !(await workspaceHasTenant(workspaceId))) {
    const workspace = await getWorkspace(workspaceId);
    if (workspace && principal) {
      access = await provisionWorkspaceTenant(workspaceId, workspace.name, {
        externalId: principal.userId,
        email: principal.email ?? undefined,
        displayName: principal.displayName,
      });
    }
  }

  if (!access) {
    return createRequestContext({ requestId, principal });
  }

  return createRequestContext({
    requestId,
    principal,
    workspaceId: access.workspaceId,
    organizationId: access.organizationId,
    workspaceRole: access.workspaceRole,
    organizationRole: access.organizationRole,
  });
}

// ── Require Workspace Access ──

export async function requireWorkspaceAccess(
  request: NextRequest,
  reference: string,
  requiredRole: WorkspaceRole = "viewer"
): Promise<{ actor: ActorIdentity; access: WorkspaceAccess; workspaceId: string }> {
  const actor = await getRequestActor(request);
  const workspaceId = await resolveWorkspaceId(reference);
  let access = await authorizeWorkspace(workspaceId, actor.externalId, requiredRole);

  if (!access && process.env.NODE_ENV !== "production" && !(await workspaceHasTenant(workspaceId))) {
    const workspace = await getWorkspace(workspaceId);
    if (workspace) access = await provisionWorkspaceTenant(workspaceId, workspace.name, actor);
  }

  if (!access) throw new AuthorizationError();
  return { actor, access, workspaceId };
}

// ── Require Workspace Context (unified RequestContext pattern) ──
//
// Per Phase 3: all HTTP entry points should use unified RequestContext.
// This helper resolves the principal, workspace, and authorization in one step,
// returning a frozen RequestContext that flows through the entire request lifecycle.

export async function requireWorkspaceContext(
  request: NextRequest,
  reference: string,
  requiredRole: WorkspaceRole = "viewer"
): Promise<{ ctx: RequestContext; workspaceId: string }> {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));

  // Resolve workspace
  const workspaceId = await resolveWorkspaceId(reference);

  // Try API key authentication first (Bearer token)
  const authHeader = request.headers.get("authorization");
  let principal: Principal | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const apiKeyResult = await resolveApiKey(token, workspaceId);
    if (apiKeyResult) {
      principal = apiKeyResult.principal;
    }
  }

  // Fall back to session
  if (!principal) {
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (sessionToken) {
      principal = await resolveSession(sessionToken);
    }
  }

  // Dev bootstrap fallback
  if (!principal && process.env.NODE_ENV !== "production") {
    principal = {
      userId: DEVELOPMENT_ACTOR.externalId,
      email: null,
      displayName: DEVELOPMENT_ACTOR.displayName,
      authMethod: "dev_bootstrap",
    };
  }

  if (!principal) throw new AuthenticationError("Authentication is required");

  let access = await authorizeWorkspace(workspaceId, principal.userId, requiredRole);

  // Dev bootstrap: auto-provision workspace tenant in non-production
  if (!access && process.env.NODE_ENV !== "production" && !(await workspaceHasTenant(workspaceId))) {
    const workspace = await getWorkspace(workspaceId);
    if (workspace) {
      access = await provisionWorkspaceTenant(workspaceId, workspace.name, {
        externalId: principal.userId,
        email: principal.email ?? undefined,
        displayName: principal.displayName,
      });
    }
  }

  if (!access) throw new AuthorizationError();

  const ctx = createRequestContext({
    requestId,
    principal,
    workspaceId: access.workspaceId,
    organizationId: access.organizationId,
    workspaceRole: access.workspaceRole,
    organizationRole: access.organizationRole,
  });

  return { ctx, workspaceId };
}
