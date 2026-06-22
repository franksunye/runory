import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  db,
  queryAll,
  queryOne,
  execute,
  batch,
  genId,
  now,
} from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import {
  authorizeWorkspace,
  listUserWorkspaces,
  effectiveRole,
  roleAllows,
} from "./tenancy";
import {
  createRequestContext,
  type Principal,
  type WorkspaceRole,
  type OrganizationRole,
  AuthenticationError,
  AuthorizationError,
} from "./context";
import {
  requireWorkspaceAccess,
  requireOrganizationAccess,
  effectiveWorkspaceRole,
  canAccessWorkspace,
  canAccessOrganization,
} from "./authorization";
import {
  getObjects,
  getRecord,
  getRecords,
  createWorkspace,
} from "./metadata";
import { getAuditLogs } from "./audit";

// Ensure test data directory exists
const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// ── Test fixture: multi-tenant world ──
//
// Org A
//   ├── Workspace A1 (User A = owner→admin, User B = viewer)
//   └── Workspace A2 (User A = owner→admin, User B = no access)
//
// Org B
//   ├── Workspace B1 (User C = owner→admin)
//   └── Workspace B2 (User C = owner→admin, User A = no access)

interface TestTenant {
  orgA: { orgId: string; wsA1: string; wsA2: string };
  orgB: { orgId: string; wsB1: string; wsB2: string };
  userA: string; // owner of Org A
  userB: string; // member of Org A, viewer in A1 only
  userC: string; // owner of Org B
}

let fixture: TestTenant;

function makePrincipal(userId: string, email: string): Principal {
  return {
    userId,
    email,
    displayName: email.split("@")[0],
    authMethod: "session",
  };
}

async function createTestTenant(): Promise<TestTenant> {
  const ts = now();

  // Create users
  const userA = genId("usr");
  const userB = genId("usr");
  const userC = genId("usr");

  // Create organizations
  const orgA = genId("org");
  const orgB = genId("org");

  // Create workspaces
  const wsA1 = genId("ws");
  const wsA2 = genId("ws");
  const wsB1 = genId("ws");
  const wsB2 = genId("ws");

  await batch([
    // Users
    {
      sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [userA, `ext_${userA}`, "alice@test.local", "Alice", ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [userB, `ext_${userB}`, "bob@test.local", "Bob", ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [userC, `ext_${userC}`, "carol@test.local", "Carol", ts, ts],
    },
    // Organizations
    {
      sql: `INSERT INTO ${TABLES.organizations} (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [orgA, "Org A", "org-a", ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.organizations} (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [orgB, "Org B", "org-b", ts, ts],
    },
    // Workspaces
    {
      sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [wsA1, "WS A1", "ws-a1", ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [wsA2, "WS A2", "ws-a2", ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [wsB1, "WS B1", "ws-b1", ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [wsB2, "WS B2", "ws-b2", ts, ts],
    },
    // Workspace tenants (workspace → org mapping)
    {
      sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [wsA1, orgA, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [wsA2, orgA, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [wsB1, orgB, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [wsB2, orgB, ts],
    },
    // Organization memberships
    // User A = owner of Org A
    {
      sql: `INSERT INTO ${TABLES.organizationMemberships} (id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?)`,
      args: [genId("orgmem"), orgA, userA, ts, ts],
    },
    // User B = member of Org A
    {
      sql: `INSERT INTO ${TABLES.organizationMemberships} (id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'member', 'active', ?, ?)`,
      args: [genId("orgmem"), orgA, userB, ts, ts],
    },
    // User C = owner of Org B
    {
      sql: `INSERT INTO ${TABLES.organizationMemberships} (id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?)`,
      args: [genId("orgmem"), orgB, userC, ts, ts],
    },
    // Workspace memberships
    // User A = admin in A1 and A2 (explicit, in addition to org owner inheritance)
    {
      sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), wsA1, userA, ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), wsA2, userA, ts, ts],
    },
    // User B = viewer in A1 only (no access to A2)
    {
      sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'viewer', 'active', ?, ?)`,
      args: [genId("wsmem"), wsA1, userB, ts, ts],
    },
    // User C = admin in B1 and B2
    {
      sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), wsB1, userC, ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), wsB2, userC, ts, ts],
    },
  ]);

  return {
    orgA: { orgId: orgA, wsA1, wsA2 },
    orgB: { orgId: orgB, wsB1, wsB2 },
    userA,
    userB,
    userC,
  };
}

// Reset database before all tests
beforeAll(async () => {
  globalThis.__runorySchemaReady = undefined;
  globalThis.__runoryMigrationsRun = undefined;

  // Disable foreign keys to allow dropping tables with constraints
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });

  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DROP TABLE IF EXISTS "${name}"` });
  }

  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
});

// Clean up and rebuild fixture before each test
beforeEach(async () => {
  const tables = [
    "runory_extension_field_values",
    "runory_audit_logs",
    "runory_navigation_items",
    "runory_view_definitions",
    "runory_field_definitions",
    "runory_object_definitions",
    "runory_installations",
    "runory_workspace_memberships",
    "runory_organization_memberships",
    "runory_workspace_tenants",
    "runory_workspaces",
    "runory_organizations",
    "runory_users",
    "runory_organization_invitations",
    "runory_invitation_workspace_grants",
  ];
  for (const t of tables) {
    try {
      await db.execute({ sql: `DELETE FROM ${t}` });
    } catch {
      // Table may not exist yet
    }
  }

  // Drop any business tables created by module installs
  const bizTables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'runory_%'",
  });
  for (const row of bizTables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DROP TABLE IF EXISTS "${name}"` });
  }

  fixture = await createTestTenant();
});

// ── 1. Cross-Organization Access Denial ──

describe("cross-tenant isolation: organization boundary", () => {
  it("User A (Org A owner) cannot authorize into Org B's workspace", async () => {
    const access = await authorizeWorkspace(
      fixture.orgB.wsB1,
      `ext_${fixture.userA}`,
      "viewer"
    );
    expect(access).toBeNull();
  });

  it("User C (Org B owner) cannot authorize into Org A's workspace", async () => {
    const access = await authorizeWorkspace(
      fixture.orgA.wsA1,
      `ext_${fixture.userC}`,
      "viewer"
    );
    expect(access).toBeNull();
  });

  it("User B (Org A member) cannot access Org B's workspace", async () => {
    const access = await authorizeWorkspace(
      fixture.orgB.wsB1,
      `ext_${fixture.userB}`,
      "viewer"
    );
    expect(access).toBeNull();
  });
});

// ── 2. Within-Org Workspace Isolation ──

describe("cross-tenant isolation: workspace boundary within same org", () => {
  it("User B (viewer in A1) cannot access A2", async () => {
    const access = await authorizeWorkspace(
      fixture.orgA.wsA2,
      `ext_${fixture.userB}`,
      "viewer"
    );
    expect(access).toBeNull();
  });

  it("User B can access A1 as viewer but not as member", async () => {
    const viewerAccess = await authorizeWorkspace(
      fixture.orgA.wsA1,
      `ext_${fixture.userB}`,
      "viewer"
    );
    expect(viewerAccess).not.toBeNull();
    expect(viewerAccess!.role).toBe("viewer");

    const memberAccess = await authorizeWorkspace(
      fixture.orgA.wsA1,
      `ext_${fixture.userB}`,
      "member"
    );
    expect(memberAccess).toBeNull();
  });
});

// ── 3. Organization Admin Inheritance ──

describe("cross-tenant isolation: org admin inheritance", () => {
  it("Org owner gets workspace admin even without explicit workspace membership", async () => {
    // Remove User A's explicit workspace membership in A1
    await execute(
      `DELETE FROM ${TABLES.workspaceMemberships} WHERE workspace_id = ? AND user_id = ?`,
      [fixture.orgA.wsA1, fixture.userA]
    );

    const access = await authorizeWorkspace(
      fixture.orgA.wsA1,
      `ext_${fixture.userA}`,
      "admin"
    );
    expect(access).not.toBeNull();
    expect(access!.role).toBe("admin");
    expect(access!.organizationRole).toBe("owner");
  });

  it("Org admin inherits workspace admin", async () => {
    // Promote User B to Org A admin
    await execute(
      `UPDATE ${TABLES.organizationMemberships} SET role = 'admin' WHERE organization_id = ? AND user_id = ?`,
      [fixture.orgA.orgId, fixture.userB]
    );

    // Now User B should have admin in A2 via org inheritance even without workspace membership
    const access = await authorizeWorkspace(
      fixture.orgA.wsA2,
      `ext_${fixture.userB}`,
      "admin"
    );
    expect(access).not.toBeNull();
    expect(access!.role).toBe("admin");
  });

  it("Org member without workspace membership does NOT inherit workspace access", async () => {
    // User B is org member, has no workspace membership in A2
    const access = await authorizeWorkspace(
      fixture.orgA.wsA2,
      `ext_${fixture.userB}`,
      "viewer"
    );
    expect(access).toBeNull();
  });
});

// ── 4. Data Query Isolation ──

describe("cross-tenant isolation: data query scoping", () => {
  it("getObjects only returns objects from the specified workspace", async () => {
    // Create object definitions in A1 and B1
    await execute(
      `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'customer', 'Customer', NULL, 'module_owned', ?)`,
      [genId("objdef"), fixture.orgA.wsA1, now()]
    );
    await execute(
      `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'customer', 'Customer', NULL, 'module_owned', ?)`,
      [genId("objdef"), fixture.orgB.wsB1, now()]
    );

    const a1Objects = await getObjects(fixture.orgA.wsA1);
    const b1Objects = await getObjects(fixture.orgB.wsB1);

    expect(a1Objects).toHaveLength(1);
    expect(a1Objects[0].workspaceId).toBe(fixture.orgA.wsA1);

    expect(b1Objects).toHaveLength(1);
    expect(b1Objects[0].workspaceId).toBe(fixture.orgB.wsB1);
  });

  it("getRecord returns undefined for a record ID from another workspace", async () => {
    // Create a customer table and insert records in A1 and B1
    await execute(
      `CREATE TABLE customer (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT, created_at TEXT, updated_at TEXT)`
    );
    await execute(
      `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'customer', 'Customer', NULL, 'module_owned', ?)`,
      [genId("objdef"), fixture.orgA.wsA1, now()]
    );
    await execute(
      `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'customer', 'Customer', NULL, 'module_owned', ?)`,
      [genId("objdef"), fixture.orgB.wsB1, now()]
    );

    const recordA = genId("rec");
    const recordB = genId("rec");
    await execute(
      `INSERT INTO customer (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, 'Alice Corp', ?, ?)`,
      [recordA, fixture.orgA.wsA1, now(), now()]
    );
    await execute(
      `INSERT INTO customer (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, 'Bob Corp', ?, ?)`,
      [recordB, fixture.orgB.wsB1, now(), now()]
    );

    // A1 can read its own record
    const ownRecord = await getRecord(fixture.orgA.wsA1, "customer", recordA);
    expect(ownRecord).toBeDefined();
    expect(ownRecord!.id).toBe(recordA);

    // A1 cannot read B1's record (WHERE workspace_id = ? AND id = ? prevents leak)
    const crossRecord = await getRecord(fixture.orgA.wsA1, "customer", recordB);
    expect(crossRecord).toBeUndefined();

    // B1 cannot read A1's record
    const crossRecord2 = await getRecord(fixture.orgB.wsB1, "customer", recordA);
    expect(crossRecord2).toBeUndefined();
  });

  it("getAuditLogs only returns logs from the specified workspace", async () => {
    await execute(
      `INSERT INTO ${TABLES.auditLogs} (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, extension_version_id, created_at) VALUES (?, ?, 'user', ?, 'create', 'customer', ?, NULL, NULL, NULL, ?)`,
      [genId("audit"), fixture.orgA.wsA1, fixture.userA, genId("rec"), now()]
    );
    await execute(
      `INSERT INTO ${TABLES.auditLogs} (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, extension_version_id, created_at) VALUES (?, ?, 'user', ?, 'create', 'customer', ?, NULL, NULL, NULL, ?)`,
      [genId("audit"), fixture.orgB.wsB1, fixture.userC, genId("rec"), now()]
    );

    const a1Logs = await getAuditLogs(fixture.orgA.wsA1);
    const b1Logs = await getAuditLogs(fixture.orgB.wsB1);

    expect(a1Logs).toHaveLength(1);
    expect(a1Logs[0].workspaceId).toBe(fixture.orgA.wsA1);
    expect(a1Logs[0].actorId).toBe(fixture.userA);

    expect(b1Logs).toHaveLength(1);
    expect(b1Logs[0].workspaceId).toBe(fixture.orgB.wsB1);
    expect(b1Logs[0].actorId).toBe(fixture.userC);
  });
});

// ── 5. RequestContext Authorization Policy ──

describe("cross-tenant isolation: RequestContext authorization policy", () => {
  it("unauthenticated request throws AuthenticationError", () => {
    const ctx = createRequestContext({ principal: null });
    expect(() => requireWorkspaceAccess(ctx, "read")).toThrow(AuthenticationError);
    expect(() => requireOrganizationAccess(ctx, "read")).toThrow(AuthenticationError);
  });

  it("authenticated but unscoped request throws AuthorizationError", () => {
    const ctx = createRequestContext({
      principal: makePrincipal(fixture.userA, "alice@test.local"),
      // no workspaceId or organizationId
    });
    expect(() => requireWorkspaceAccess(ctx, "read")).toThrow(AuthorizationError);
    expect(() => requireOrganizationAccess(ctx, "read")).toThrow(AuthorizationError);
  });

  it("User A with workspace context can read but User B with wrong workspace cannot", () => {
    const ctxA = createRequestContext({
      principal: makePrincipal(fixture.userA, "alice@test.local"),
      workspaceId: fixture.orgA.wsA1,
      organizationId: fixture.orgA.orgId,
      organizationRole: "owner",
      workspaceRole: "admin",
    });
    expect(() => requireWorkspaceAccess(ctxA, "read")).not.toThrow();
    expect(() => requireWorkspaceAccess(ctxA, "write")).not.toThrow();
    expect(() => requireWorkspaceAccess(ctxA, "admin")).not.toThrow();

    // User B in A2 (no membership) — simulated context
    const ctxB = createRequestContext({
      principal: makePrincipal(fixture.userB, "bob@test.local"),
      workspaceId: fixture.orgA.wsA2,
      organizationId: fixture.orgA.orgId,
      organizationRole: "member",
      workspaceRole: null, // no direct workspace membership
    });
    expect(() => requireWorkspaceAccess(ctxB, "read")).toThrow(AuthorizationError);
  });

  it("viewer can read but cannot write", () => {
    const ctx = createRequestContext({
      principal: makePrincipal(fixture.userB, "bob@test.local"),
      workspaceId: fixture.orgA.wsA1,
      organizationId: fixture.orgA.orgId,
      organizationRole: "member",
      workspaceRole: "viewer",
    });
    expect(() => requireWorkspaceAccess(ctx, "read")).not.toThrow();
    expect(() => requireWorkspaceAccess(ctx, "write")).toThrow(AuthorizationError);
    expect(() => requireWorkspaceAccess(ctx, "admin")).toThrow(AuthorizationError);
  });

  it("org owner inherits workspace admin even with null workspaceRole", () => {
    const ctx = createRequestContext({
      principal: makePrincipal(fixture.userA, "alice@test.local"),
      workspaceId: fixture.orgA.wsA2,
      organizationId: fixture.orgA.orgId,
      organizationRole: "owner",
      workspaceRole: null, // no explicit workspace membership
    });
    expect(() => requireWorkspaceAccess(ctx, "admin")).not.toThrow();
    expect(effectiveWorkspaceRole(ctx)).toBe("admin");
  });

  it("canAccessWorkspace returns false for cross-org access", () => {
    // User A trying to access Org B's workspace
    const ctx = createRequestContext({
      principal: makePrincipal(fixture.userA, "alice@test.local"),
      workspaceId: fixture.orgB.wsB1,
      organizationId: null, // User A has no org membership in Org B
      organizationRole: null,
      workspaceRole: null,
    });
    expect(canAccessWorkspace(ctx, "read")).toBe(false);
    expect(canAccessWorkspace(ctx, "write")).toBe(false);
  });

  it("canAccessOrganization enforces org membership", () => {
    // User A in Org A
    const ctxA = createRequestContext({
      principal: makePrincipal(fixture.userA, "alice@test.local"),
      organizationId: fixture.orgA.orgId,
      organizationRole: "owner",
    });
    expect(canAccessOrganization(ctxA, "owner")).toBe(true);

    // User A pretending to be in Org B (no membership)
    const ctxB = createRequestContext({
      principal: makePrincipal(fixture.userA, "alice@test.local"),
      organizationId: fixture.orgB.orgId,
      organizationRole: null, // no membership
    });
    expect(canAccessOrganization(ctxB, "read")).toBe(false);
  });
});

// ── 6. listUserWorkspaces isolation ──

describe("cross-tenant isolation: listUserWorkspaces", () => {
  it("User A only sees Org A workspaces, not Org B", async () => {
    const workspaces = await listUserWorkspaces(fixture.userA);
    expect(workspaces).toHaveLength(2); // A1 and A2
    const wsIds = workspaces.map((w) => w.workspaceId);
    expect(wsIds).toContain(fixture.orgA.wsA1);
    expect(wsIds).toContain(fixture.orgA.wsA2);
    expect(wsIds).not.toContain(fixture.orgB.wsB1);
    expect(wsIds).not.toContain(fixture.orgB.wsB2);
  });

  it("User B only sees A1 (explicit membership), not A2 or Org B", async () => {
    const workspaces = await listUserWorkspaces(fixture.userB);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].workspaceId).toBe(fixture.orgA.wsA1);
    expect(workspaces[0].workspaceRole).toBe("viewer");
  });

  it("User C only sees Org B workspaces", async () => {
    const workspaces = await listUserWorkspaces(fixture.userC);
    expect(workspaces).toHaveLength(2);
    const wsIds = workspaces.map((w) => w.workspaceId);
    expect(wsIds).toContain(fixture.orgB.wsB1);
    expect(wsIds).toContain(fixture.orgB.wsB2);
    expect(wsIds).not.toContain(fixture.orgA.wsA1);
  });
});

// ── 7. Extension Field Value Isolation ──

describe("cross-tenant isolation: extension field values", () => {
  it("extension field values are workspace-scoped", async () => {
    // Create object definitions in A1 and B1
    await execute(
      `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'customer', 'Customer', NULL, 'module_owned', ?)`,
      [genId("objdef"), fixture.orgA.wsA1, now()]
    );
    await execute(
      `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'customer', 'Customer', NULL, 'module_owned', ?)`,
      [genId("objdef"), fixture.orgB.wsB1, now()]
    );

    // Create customer table
    await execute(
      `CREATE TABLE customer (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT, created_at TEXT, updated_at TEXT)`
    );

    const recordA = genId("rec");
    const recordB = genId("rec");
    await execute(
      `INSERT INTO customer (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, 'Alice Corp', ?, ?)`,
      [recordA, fixture.orgA.wsA1, now(), now()]
    );
    await execute(
      `INSERT INTO customer (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, 'Bob Corp', ?, ?)`,
      [recordB, fixture.orgB.wsB1, now(), now()]
    );

    // Create extension definitions for both workspaces
    const extA = genId("ext");
    const extB = genId("ext");
    await execute(
      `INSERT INTO ${TABLES.extensionDefinitions} (id, workspace_id, name, namespace, status, current_version, created_at, updated_at) VALUES (?, ?, 'Custom Extension', 'custom', 'active', 1, ?, ?)`,
      [extA, fixture.orgA.wsA1, now(), now()]
    );
    await execute(
      `INSERT INTO ${TABLES.extensionDefinitions} (id, workspace_id, name, namespace, status, current_version, created_at, updated_at) VALUES (?, ?, 'Custom Extension', 'custom', 'active', 1, ?, ?)`,
      [extB, fixture.orgB.wsB1, now(), now()]
    );

    // Create field definitions: module-owned "name" + workspace_extension "custom_field"
    await execute(
      `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, extension_id, created_at) VALUES (?, ?, 'customer', 'name', 'Name', 'text', 'module_owned', 0, NULL, NULL, NULL, NULL, ?)`,
      [genId("fd"), fixture.orgA.wsA1, now()]
    );
    await execute(
      `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, extension_id, created_at) VALUES (?, ?, 'customer', 'name', 'Name', 'text', 'module_owned', 0, NULL, NULL, NULL, NULL, ?)`,
      [genId("fd"), fixture.orgB.wsB1, now()]
    );
    await execute(
      `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, extension_id, created_at) VALUES (?, ?, 'customer', 'custom_field', 'Custom Field', 'text', 'workspace_extension', 0, NULL, NULL, NULL, ?, ?)`,
      [genId("fd"), fixture.orgA.wsA1, extA, now()]
    );
    await execute(
      `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, extension_id, created_at) VALUES (?, ?, 'customer', 'custom_field', 'Custom Field', 'text', 'workspace_extension', 0, NULL, NULL, NULL, ?, ?)`,
      [genId("fd"), fixture.orgB.wsB1, extB, now()]
    );

    // Insert extension field values
    await execute(
      `INSERT INTO ${TABLES.extensionFieldValues} (id, workspace_id, object_key, record_id, field_key, value_json, extension_id, created_at, updated_at) VALUES (?, ?, 'customer', ?, 'custom_field', ?, ?, ?, ?)`,
      [genId("efv"), fixture.orgA.wsA1, recordA, JSON.stringify("A1 secret"), extA, now(), now()]
    );
    await execute(
      `INSERT INTO ${TABLES.extensionFieldValues} (id, workspace_id, object_key, record_id, field_key, value_json, extension_id, created_at, updated_at) VALUES (?, ?, 'customer', ?, 'custom_field', ?, ?, ?, ?)`,
      [genId("efv"), fixture.orgB.wsB1, recordB, JSON.stringify("B1 secret"), extB, now(), now()]
    );

    // A1 can read its own extension values
    const a1Record = await getRecord(fixture.orgA.wsA1, "customer", recordA);
    expect(a1Record).toBeDefined();
    expect(a1Record!.custom_field).toBe("A1 secret");

    // A1 cannot read B1's extension values (different workspace_id in WHERE)
    const crossRecord = await getRecord(fixture.orgA.wsA1, "customer", recordB);
    expect(crossRecord).toBeUndefined();

    // Direct query: extension values are scoped by workspace_id
    const a1ExtValues = await queryAll<{ value_json: string }>(
      `SELECT value_json FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND object_key = 'customer'`,
      [fixture.orgA.wsA1]
    );
    expect(a1ExtValues).toHaveLength(1);
    expect(JSON.parse(a1ExtValues[0].value_json)).toBe("A1 secret");

    const b1ExtValues = await queryAll<{ value_json: string }>(
      `SELECT value_json FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND object_key = 'customer'`,
      [fixture.orgB.wsB1]
    );
    expect(b1ExtValues).toHaveLength(1);
    expect(JSON.parse(b1ExtValues[0].value_json)).toBe("B1 secret");
  });
});

// ── 8. Full Access Matrix ──

describe("cross-tenant isolation: full access matrix", () => {
  const matrix: Array<{
    user: keyof TestTenant;
    workspace: string;
    requiredRole: WorkspaceRole;
    shouldAccess: boolean;
    description: string;
  }> = [
    // User A (Org A owner)
    { user: "userA", workspace: "wsA1", requiredRole: "admin", shouldAccess: true, description: "A→A1 admin" },
    { user: "userA", workspace: "wsA2", requiredRole: "admin", shouldAccess: true, description: "A→A2 admin" },
    { user: "userA", workspace: "wsB1", requiredRole: "viewer", shouldAccess: false, description: "A→B1 denied" },
    { user: "userA", workspace: "wsB2", requiredRole: "viewer", shouldAccess: false, description: "A→B2 denied" },
    // User B (Org A member, viewer in A1)
    { user: "userB", workspace: "wsA1", requiredRole: "viewer", shouldAccess: true, description: "B→A1 viewer" },
    { user: "userB", workspace: "wsA1", requiredRole: "member", shouldAccess: false, description: "B→A1 write denied" },
    { user: "userB", workspace: "wsA2", requiredRole: "viewer", shouldAccess: false, description: "B→A2 denied" },
    { user: "userB", workspace: "wsB1", requiredRole: "viewer", shouldAccess: false, description: "B→B1 denied" },
    // User C (Org B owner)
    { user: "userC", workspace: "wsB1", requiredRole: "admin", shouldAccess: true, description: "C→B1 admin" },
    { user: "userC", workspace: "wsB2", requiredRole: "admin", shouldAccess: true, description: "C→B2 admin" },
    { user: "userC", workspace: "wsA1", requiredRole: "viewer", shouldAccess: false, description: "C→A1 denied" },
  ];

  for (const entry of matrix) {
    it(`${entry.description}: ${entry.shouldAccess ? "allowed" : "denied"}`, async () => {
      const userId = fixture[entry.user] as string;
      const workspaceId = entry.workspace.startsWith("ws")
        ? fixture.orgA[entry.workspace as keyof typeof fixture.orgA] ??
          fixture.orgB[entry.workspace as keyof typeof fixture.orgB]
        : entry.workspace;

      const access = await authorizeWorkspace(
        workspaceId as string,
        `ext_${userId}`,
        entry.requiredRole
      );

      if (entry.shouldAccess) {
        expect(access).not.toBeNull();
        expect(roleAllows(access!.role, entry.requiredRole)).toBe(true);
      } else {
        expect(access).toBeNull();
      }
    });
  }
});
