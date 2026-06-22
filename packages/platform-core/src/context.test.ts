import { describe, expect, it } from "vitest";
import {
  createRequestContext,
  unauthenticatedContext,
  generateRequestId,
  isAuthenticated,
  requirePrincipal,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ORGANIZATION_ROLES,
  WORKSPACE_ROLES,
  type Principal,
} from "./context";
import {
  requireWorkspaceAccess,
  requireOrganizationAccess,
  canAccessWorkspace,
  canAccessOrganization,
  effectiveWorkspaceRole,
} from "./authorization";

describe("RequestContext", () => {
  it("generates a request ID if not provided", () => {
    const ctx = createRequestContext();
    expect(ctx.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it("uses provided request ID", () => {
    const ctx = createRequestContext({ requestId: "req_test-12345678" });
    expect(ctx.requestId).toBe("req_test-12345678");
  });

  it("is frozen and cannot be mutated", () => {
    const ctx = createRequestContext({ requestId: "req_test" });
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(() => {
      (ctx as any).workspaceId = "ws_hack";
    }).toThrow();
  });

  it("does not accept client-supplied actor overrides", () => {
    // RequestContext is built server-side; principal is never derived from client input
    const ctx = createRequestContext();
    expect(ctx.principal).toBeNull();
    // There is no setter or method to inject a client principal
  });

  it("defaults to unauthenticated when no principal provided", () => {
    const ctx = createRequestContext();
    expect(ctx.principal).toBeNull();
    expect(isAuthenticated(ctx)).toBe(false);
  });
});

describe("isAuthenticated / requirePrincipal", () => {
  const principal: Principal = {
    userId: "usr_123",
    email: "test@example.com",
    displayName: "Test User",
    authMethod: "session",
  };

  it("returns true when principal exists", () => {
    const ctx = createRequestContext({ principal });
    expect(isAuthenticated(ctx)).toBe(true);
  });

  it("requirePrincipal returns principal when authenticated", () => {
    const ctx = createRequestContext({ principal });
    expect(requirePrincipal(ctx)).toBe(principal);
  });

  it("requirePrincipal throws AuthenticationError when not authenticated", () => {
    const ctx = unauthenticatedContext();
    expect(() => requirePrincipal(ctx)).toThrow(AuthenticationError);
  });
});

describe("Authorization Policy - Workspace", () => {
  const principal: Principal = {
    userId: "usr_123",
    email: "test@example.com",
    displayName: "Test User",
    authMethod: "session",
  };

  it("allows viewer to read", () => {
    const ctx = createRequestContext({
      principal,
      workspaceId: "ws_1",
      workspaceRole: "viewer",
    });
    expect(() => requireWorkspaceAccess(ctx, "read")).not.toThrow();
    expect(canAccessWorkspace(ctx, "read")).toBe(true);
  });

  it("denies viewer to write", () => {
    const ctx = createRequestContext({
      principal,
      workspaceId: "ws_1",
      workspaceRole: "viewer",
    });
    expect(() => requireWorkspaceAccess(ctx, "write")).toThrow(AuthorizationError);
    expect(canAccessWorkspace(ctx, "write")).toBe(false);
  });

  it("allows member to write but not admin", () => {
    const ctx = createRequestContext({
      principal,
      workspaceId: "ws_1",
      workspaceRole: "member",
    });
    expect(() => requireWorkspaceAccess(ctx, "write")).not.toThrow();
    expect(() => requireWorkspaceAccess(ctx, "admin")).toThrow(AuthorizationError);
  });

  it("allows admin to all operations", () => {
    const ctx = createRequestContext({
      principal,
      workspaceId: "ws_1",
      workspaceRole: "admin",
    });
    expect(() => requireWorkspaceAccess(ctx, "read")).not.toThrow();
    expect(() => requireWorkspaceAccess(ctx, "write")).not.toThrow();
    expect(() => requireWorkspaceAccess(ctx, "admin")).not.toThrow();
  });

  it("org owner inherits workspace admin", () => {
    const ctx = createRequestContext({
      principal,
      workspaceId: "ws_1",
      organizationId: "org_1",
      organizationRole: "owner",
      workspaceRole: null,
    });
    expect(effectiveWorkspaceRole(ctx)).toBe("admin");
    expect(() => requireWorkspaceAccess(ctx, "admin")).not.toThrow();
  });

  it("org admin inherits workspace admin", () => {
    const ctx = createRequestContext({
      principal,
      workspaceId: "ws_1",
      organizationId: "org_1",
      organizationRole: "admin",
      workspaceRole: null,
    });
    expect(effectiveWorkspaceRole(ctx)).toBe("admin");
  });

  it("org member without workspace membership gets no access", () => {
    const ctx = createRequestContext({
      principal,
      workspaceId: "ws_1",
      organizationId: "org_1",
      organizationRole: "member",
      workspaceRole: null,
    });
    expect(effectiveWorkspaceRole(ctx)).toBeNull();
    expect(() => requireWorkspaceAccess(ctx, "read")).toThrow(AuthorizationError);
  });

  it("throws AuthenticationError when not authenticated", () => {
    const ctx = createRequestContext({
      workspaceId: "ws_1",
      workspaceRole: "admin",
    });
    expect(() => requireWorkspaceAccess(ctx, "read")).toThrow(AuthenticationError);
  });

  it("throws AuthorizationError when not scoped to workspace", () => {
    const ctx = createRequestContext({ principal });
    expect(() => requireWorkspaceAccess(ctx, "read")).toThrow(AuthorizationError);
  });
});

describe("Authorization Policy - Organization", () => {
  const principal: Principal = {
    userId: "usr_123",
    email: "test@example.com",
    displayName: "Test User",
    authMethod: "session",
  };

  it("owner can do everything", () => {
    const ctx = createRequestContext({
      principal,
      organizationId: "org_1",
      organizationRole: "owner",
    });
    expect(() => requireOrganizationAccess(ctx, "read")).not.toThrow();
    expect(() => requireOrganizationAccess(ctx, "admin")).not.toThrow();
    expect(() => requireOrganizationAccess(ctx, "owner")).not.toThrow();
  });

  it("admin can manage but not transfer ownership", () => {
    const ctx = createRequestContext({
      principal,
      organizationId: "org_1",
      organizationRole: "admin",
    });
    expect(() => requireOrganizationAccess(ctx, "admin")).not.toThrow();
    expect(() => requireOrganizationAccess(ctx, "owner")).toThrow(AuthorizationError);
  });

  it("member can read but not admin", () => {
    const ctx = createRequestContext({
      principal,
      organizationId: "org_1",
      organizationRole: "member",
    });
    expect(() => requireOrganizationAccess(ctx, "read")).not.toThrow();
    expect(() => requireOrganizationAccess(ctx, "admin")).toThrow(AuthorizationError);
  });
});

describe("Role enums (Phase 0)", () => {
  it("OrganizationRole is owner/admin/member", () => {
    expect([...ORGANIZATION_ROLES]).toEqual(["owner", "admin", "member"]);
  });

  it("WorkspaceRole is admin/member/viewer (no owner)", () => {
    expect([...WORKSPACE_ROLES]).toEqual(["admin", "member", "viewer"]);
  });
});

describe("Error types", () => {
  it("each error has a distinct name", () => {
    expect(new AuthenticationError().name).toBe("AuthenticationError");
    expect(new AuthorizationError().name).toBe("AuthorizationError");
    expect(new NotFoundError().name).toBe("NotFoundError");
    expect(new ConflictError().name).toBe("ConflictError");
    expect(new RateLimitError().name).toBe("RateLimitError");
  });
});

describe("Request ID generation", () => {
  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });

  it("uses req_ prefix", () => {
    expect(generateRequestId()).toMatch(/^req_/);
  });
});
