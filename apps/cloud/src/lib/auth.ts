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

// ── Dev persona switching ──
//
// In dev mode, developers can switch between Golden Demo personas via the
// /api/dev/persona endpoint, which sets an httpOnly "dev-persona" cookie.
// This function reads that cookie and returns the matching ActorIdentity so
// that API calls are made as the selected persona (with their workspace
// membership and permission groups) instead of the default dev-local-owner.
//
// The cookie is httpOnly so it cannot be tampered with from client JS. Only
// known persona IDs are honored; anything else falls back to DEVELOPMENT_ACTOR.
const DEV_PERSONAS: Record<string, ActorIdentity> = {
  "persona:sales-rep": { externalId: "persona:sales-rep", displayName: "Sarah Chen" },
  "persona:sales-manager": { externalId: "persona:sales-manager", displayName: "Michael Torres" },
  "persona:dispatcher": { externalId: "persona:dispatcher", displayName: "Lisa Wang" },
  "persona:technician": { externalId: "persona:technician", displayName: "David Park" },
  "persona:supervisor": { externalId: "persona:supervisor", displayName: "Robert Kim" },
};

function getDevActor(request: NextRequest): ActorIdentity {
  const personaId = request.cookies.get("dev-persona")?.value;
  if (personaId && personaId !== "dev-local-owner") {
    return DEV_PERSONAS[personaId] ?? DEVELOPMENT_ACTOR;
  }
  return DEVELOPMENT_ACTOR;
}

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

  if (isDevBootstrapEnabled()) return getDevActor(request);
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
    // Dev bootstrap fallback — honor the dev-persona cookie if set
    const devActor = getDevActor(request);
    const principal: Principal = {
      userId: devActor.externalId,
      email: null,
      displayName: devActor.displayName,
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
  if (principal && isPlatformAdmin(principal.email)) {
    return { principal, requestId };
  }
  // Dev bootstrap: allow the local dev owner to act as platform admin so the
  // catalog seed and admin surfaces work without a real admin session. Gated
  // on the explicit PLATFORM_DEV_BOOTSTRAP flag — never active in production.
  if (isDevBootstrapEnabled()) {
    const devPrincipal = await requirePrincipal(request);
    return { principal: devPrincipal, requestId };
  }
  throw new AuthorizationError("Platform admin access required");
}

// ── Organization Membership Resolution ──

async function authorizeOrganization(
  organizationId: string,
  userId: string
): Promise<OrganizationMembership | null> {
  // Resolve membership by both saas_users.id and external_id. The dev bootstrap
  // principal carries external_id ("dev-local-owner") as userId, while membership
  // rows store the resolved saas_users.id. Joining users (mirroring authorizeWorkspace)
  // makes both session and dev-bootstrap principals resolve consistently.
  const row = await queryOne<{
    organization_id: string;
    user_id: string;
    role: "owner" | "admin" | "member";
  }>(
    `SELECT om.organization_id, om.user_id, om.role
     FROM ${TABLES.organizationMemberships} om
     JOIN ${TABLES.users} u ON u.id = om.user_id AND u.status = 'active'
     WHERE om.organization_id = ? AND (u.id = ? OR u.external_id = ?) AND om.status = 'active'`,
    [organizationId, userId, userId]
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
    // Honor the dev-persona cookie if set so requests act as the selected persona
    const devActor = getDevActor(request);
    principal = {
      userId: devActor.externalId,
      email: null,
      displayName: devActor.displayName,
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
