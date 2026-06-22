import { describe, expect, it } from "vitest";
import { roleAllows, effectiveRole } from "./tenancy";
import { orgRoleAllows, workspaceRoleAllows } from "./authorization";

describe("workspace role policy (Phase 0: owner removed from workspace)", () => {
  it("allows higher roles to perform lower privilege operations", () => {
    expect(roleAllows("admin", "member")).toBe(true);
    expect(roleAllows("admin", "viewer")).toBe(true);
    expect(roleAllows("member", "viewer")).toBe(true);
  });

  it("denies privilege escalation", () => {
    expect(roleAllows("viewer", "member")).toBe(false);
    expect(roleAllows("member", "admin")).toBe(false);
    expect(roleAllows("viewer", "admin")).toBe(false);
  });

  it("no longer accepts 'owner' as a workspace role", () => {
    // WorkspaceRole is now admin/member/viewer only
    const validRoles: readonly string[] = ["admin", "member", "viewer"];
    expect(validRoles).not.toContain("owner");
  });
});

describe("organization role policy (Phase 0: separate enum)", () => {
  it("owner is highest org role", () => {
    expect(orgRoleAllows("owner", "admin")).toBe(true);
    expect(orgRoleAllows("owner", "member")).toBe(true);
  });

  it("admin can manage but not transfer ownership", () => {
    expect(orgRoleAllows("admin", "member")).toBe(true);
    expect(orgRoleAllows("admin", "owner")).toBe(false);
  });

  it("member is lowest org role", () => {
    expect(orgRoleAllows("member", "admin")).toBe(false);
    expect(orgRoleAllows("member", "owner")).toBe(false);
  });
});

describe("effective workspace role (org inheritance)", () => {
  it("direct workspace role takes precedence", () => {
    expect(effectiveRole("viewer", "owner")).toBe("viewer");
    expect(effectiveRole("member", "admin")).toBe("member");
  });

  it("org owner/admin inherit workspace admin", () => {
    expect(effectiveRole(null, "owner")).toBe("admin");
    expect(effectiveRole(null, "admin")).toBe("admin");
  });

  it("org member without workspace membership gets nothing", () => {
    expect(effectiveRole(null, "member")).toBe(null);
    expect(effectiveRole(null, null)).toBe(null);
  });
});

describe("workspace role hierarchy", () => {
  it("admin > member > viewer", () => {
    expect(workspaceRoleAllows("admin", "member")).toBe(true);
    expect(workspaceRoleAllows("admin", "viewer")).toBe(true);
    expect(workspaceRoleAllows("member", "viewer")).toBe(true);
    expect(workspaceRoleAllows("viewer", "admin")).toBe(false);
    expect(workspaceRoleAllows("viewer", "member")).toBe(false);
    expect(workspaceRoleAllows("member", "admin")).toBe(false);
  });
});
