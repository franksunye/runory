import { randomUUID } from "node:crypto";

// ── Role Enums (Phase 0: split Organization and Workspace roles) ──

export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const WORKSPACE_ROLES = ["admin", "member", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

// ── Platform Roles (Catalog & Release Control Plane, per docs/09 §4) ──
// These are separate from Organization/Workspace RBAC.
// Platform roles are granted via env-var allowlist (PLATFORM_ADMIN_EMAILS)
// and checked at the service layer.

export const PLATFORM_ROLES = ["catalog_viewer", "catalog_editor", "release_manager", "security_manager"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// ── Principal: the authenticated user identity (server-derived) ──

export interface Principal {
  userId: string;
  email: string | null;
  displayName: string;
  /** How the principal was authenticated: 'session' | 'api_key' | 'trust_headers' | 'dev_bootstrap' */
  authMethod: "session" | "api_key" | "trust_headers" | "dev_bootstrap";
  /** For API key auth, the key ID (for audit); null otherwise */
  apiKeyId?: string;
}

// ── RequestContext: the canonical server-derived request context ──
//
// Per SaaS Core Boundaries §8:
//   - Never trust client-supplied userId, Actor, or Workspace ownership.
//   - All record lookups use WHERE workspace_id = ? AND id = ?.
//   - RequestContext is built by the auth middleware, not by route handlers.
//
// This object is frozen at creation to prevent mutation by downstream code.

export interface RequestContext {
  /** Unique per-request ID for tracing, audit, and logs */
  readonly requestId: string;
  /** Authenticated principal (null for unauthenticated requests) */
  readonly principal: Principal | null;
  /** Resolved organization ID (null if not scoped to an org) */
  readonly organizationId: string | null;
  /** Resolved workspace ID (null if not scoped to a workspace) */
  readonly workspaceId: string | null;
  /** Principal's role in the organization (null if not a member) */
  readonly organizationRole: OrganizationRole | null;
  /** Principal's role in the workspace (null if not a member) */
  readonly workspaceRole: WorkspaceRole | null;
}

// ── RequestContext Builder ──

export interface RequestContextInit {
  requestId?: string;
  principal?: Principal | null;
  organizationId?: string | null;
  workspaceId?: string | null;
  organizationRole?: OrganizationRole | null;
  workspaceRole?: WorkspaceRole | null;
}

export function createRequestContext(init: RequestContextInit = {}): RequestContext {
  const ctx: RequestContext = {
    requestId: init.requestId ?? generateRequestId(),
    principal: init.principal ?? null,
    organizationId: init.organizationId ?? null,
    workspaceId: init.workspaceId ?? null,
    organizationRole: init.organizationRole ?? null,
    workspaceRole: init.workspaceRole ?? null,
  };
  return Object.freeze(ctx);
}

export function generateRequestId(): string {
  return `req_${randomUUID()}`;
}

// ── Unauthenticated context (for public routes) ──

export function unauthenticatedContext(requestId?: string): RequestContext {
  return createRequestContext({ requestId });
}

// ── Check if context is authenticated ──

export function isAuthenticated(ctx: RequestContext): ctx is RequestContext & {
  principal: Principal;
} {
  return ctx.principal !== null;
}

// ── Require authentication (throws if not) ──

export function requirePrincipal(ctx: RequestContext): Principal {
  if (!ctx.principal) {
    throw new AuthenticationError("Authentication required");
  }
  return ctx.principal;
}

// ── Errors used by authorization layer ──

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have access to this resource") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message = "Resource conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class InvalidInputError extends Error {
  constructor(message = "Invalid input") {
    super(message);
    this.name = "InvalidInputError";
  }
}
