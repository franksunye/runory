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
  SESSION_COOKIE_NAME,
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
import { PLATFORM_CONFIG, isTrustHeadersEnabled, isPlatformAdmin } from "@runory/platform-core";

const DEVELOPMENT_ACTOR: ActorIdentity = {
  externalId: "dev-local-owner",
  displayName: "Local workspace owner",
};

// ── Dev bootstrap flag ──
//
// The dev bootstrap fallback (auto-authenticating as a local owner) is gated on
// an explicit opt-in flag rather than NODE_ENV. This prevents accidental
// unauthenticated access when NODE_ENV is unset or set to a non-production value
// like "staging" or "test".
function isDevBootstrapEnabled(): boolean {
  return process.env.PLATFORM_DEV_BOOTSTRAP === "true";
}

// ── Trust headers startup warning ──
//
// Trust identity headers (x-platform-user-id etc.) can be spoofed by any client
// unless a reverse proxy strips and re-injects them. Warn loudly at startup if
// the operator enabled trust headers without confirming the proxy is verified.
if (isTrustHeadersEnabled() && process.env.PLATFORM_TRUST_PROXY_VERIFIED !== "true") {
  console.warn(
    "[auth] PLATFORM_TRUST_IDENTITY_HEADERS is enabled but PLATFORM_TRUST_PROXY_VERIFIED is not 'true'. " +
      "Trust headers can be spoofed by any client. Only enable this behind a verified reverse proxy that strips incoming identity headers."
  );
}

// ── Resolve principal from trust headers ──
//
// Shared by getRequestActor and requireWorkspaceContext so both code paths
// honor trusted identity headers consistently.
function resolvePrincipalFromTrustHeaders(request: NextRequest): Principal | null {
  if (!isTrustHeadersEnabled()) return null;
  const externalId = request.headers.get(PLATFORM_CONFIG.userIdHeader);
  if (!externalId) return null;
  return {
    userId: externalId,
    email: request.headers.get(PLATFORM_CONFIG.userEmailHeader) ?? null,
    displayName: request.headers.get(PLATFORM_CONFIG.userNameHeader) ?? externalId,
    authMethod: "trust_headers",
  };
}

export interface OrganizationMembership {
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "member";
}

// ── Get Request Actor ──

export async function getRequestActor(request: NextRequest): Promise<ActorIdentity> {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
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

  const trustHeadersPrincipal = resolvePrincipalFromTrustHeaders(request);
  if (trustHeadersPrincipal) {
    return {
      externalId: trustHeadersPrincipal.userId,
      email: trustHeadersPrincipal.email ?? undefined,
      displayName: trustHeadersPrincipal.displayName,
    };
  }

  if (isDevBootstrapEnabled()) return DEVELOPMENT_ACTOR;
  throw new AuthenticationError("Authentication is required");
}

// ── Get Current Principal (session-based) ──

export async function getCurrentPrincipal(request: NextRequest): Promise<Principal | null> {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;
  return resolveSession(sessionToken);
}

// ── Require Authenticated Principal (session or API key) ──

export async function requirePrincipal(request: NextRequest): Promise<Principal> {
  // Try session first
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    const principal = await resolveSession(sessionToken);
    if (principal) return principal;
  }

  if (isDevBootstrapEnabled()) {
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

// ── Require Platform Admin ──
//
// Ensures the request is authenticated AND the principal is a platform admin
// (per PLATFORM_ADMIN_EMAILS allowlist). Used by all /api/platform routes.

export async function requirePlatformAdmin(
  request: NextRequest
): Promise<{ principal: Principal; requestId: string }> {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  const principal = await getCurrentPrincipal(request);
  if (!principal || !isPlatformAdmin(principal.email)) {
    throw new AuthorizationError("Platform admin access required");
  }
  return { principal, requestId };
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

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
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

  if (!access && isDevBootstrapEnabled() && !(await workspaceHasTenant(workspaceId))) {
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

  if (!access && isDevBootstrapEnabled() && !(await workspaceHasTenant(workspaceId))) {
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
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionToken) {
      principal = await resolveSession(sessionToken);
    }
  }

  // Fall back to trust headers (consistent with getRequestActor / requireWorkspaceAccess)
  if (!principal) {
    principal = resolvePrincipalFromTrustHeaders(request);
  }

  // Dev bootstrap fallback
  if (!principal && isDevBootstrapEnabled()) {
    principal = {
      userId: DEVELOPMENT_ACTOR.externalId,
      email: null,
      displayName: DEVELOPMENT_ACTOR.displayName,
      authMethod: "dev_bootstrap",
    };
  }

  if (!principal) throw new AuthenticationError("Authentication is required");

  let access = await authorizeWorkspace(workspaceId, principal.userId, requiredRole);

  // Dev bootstrap: auto-provision workspace tenant
  if (!access && isDevBootstrapEnabled() && !(await workspaceHasTenant(workspaceId))) {
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
