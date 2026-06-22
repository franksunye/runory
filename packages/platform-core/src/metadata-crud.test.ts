import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  db,
  queryOne,
  execute,
  batch,
  genId,
  now,
} from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import {
  createRecord,
  getRecord,
  getRecords,
  updateRecord,
  deleteRecord,
  getFields,
  getObjects,
} from "./metadata";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Test fixture ──

let orgId: string;
let workspaceId: string;
let workspaceId2: string;
let userId: string;

beforeAll(async () => {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;

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

  // Create test business table (persists for all tests; data cleared in beforeEach)
  await execute(
    `CREATE TABLE IF NOT EXISTS ${businessTable("test_item")} (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );
});

beforeEach(async () => {
  const tables = [
    TABLES.extensionFieldValues, TABLES.auditLogs, TABLES.navigationItems,
    TABLES.viewDefinitions, TABLES.fieldDefinitions, TABLES.objectDefinitions,
    TABLES.installations, TABLES.invitationWorkspaceGrants, TABLES.organizationInvitations,
    TABLES.apiKeys, TABLES.usageEvents, TABLES.usageRollups,
    TABLES.organizationEntitlements, TABLES.exportJobs, TABLES.deletionJobs,
    TABLES.workspaceMemberships, TABLES.organizationMemberships,
    TABLES.workspaceTenants, TABLES.workspaces, TABLES.organizations, TABLES.users,
  ];
  for (const t of tables) {
    try { await db.execute({ sql: `DELETE FROM ${t}` }); } catch {}
  }

  // Clear business tables
  const bizTables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'runory_business_%' ORDER BY name DESC",
  });
  for (const row of bizTables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DELETE FROM "${name}"` });
  }

  // Create fixture
  const ts = now();
  orgId = genId("org");
  workspaceId = genId("ws");
  workspaceId2 = genId("ws");
  userId = genId("usr");

  await batch([
    { sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [userId, `ext_${userId}`, "test@metadata.local", "Test User", ts, ts] },
    { sql: `INSERT INTO ${TABLES.organizations} (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [orgId, "Test Org", "test-org", ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [workspaceId, "Test WS", "test-ws", ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [workspaceId2, "Test WS 2", "test-ws-2", ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [workspaceId, orgId, ts] },
    { sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [workspaceId2, orgId, ts] },
    { sql: `INSERT INTO ${TABLES.organizationMemberships} (id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?)`,
      args: [genId("orgmem"), orgId, userId, ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), workspaceId, userId, ts, ts] },
  ]);

  // Insert object definition for test_item in both workspaces
  await execute(
    `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'test_item', 'Test Item', NULL, 'module_owned', ?)`,
    [genId("objdef"), workspaceId, ts]
  );
  await execute(
    `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'test_item', 'Test Item', NULL, 'module_owned', ?)`,
    [genId("objdef"), workspaceId2, ts]
  );

  // Insert field definitions for test_item (name, email) in both workspaces
  await execute(
    `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, created_at) VALUES (?, ?, 'test_item', 'name', 'Name', 'text', 'module_owned', 0, ?)`,
    [genId("flddef"), workspaceId, ts]
  );
  await execute(
    `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, created_at) VALUES (?, ?, 'test_item', 'email', 'Email', 'email', 'module_owned', 0, ?)`,
    [genId("flddef"), workspaceId, ts]
  );
  await execute(
    `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, created_at) VALUES (?, ?, 'test_item', 'name', 'Name', 'text', 'module_owned', 0, ?)`,
    [genId("flddef"), workspaceId2, ts]
  );
  await execute(
    `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, created_at) VALUES (?, ?, 'test_item', 'email', 'Email', 'email', 'module_owned', 0, ?)`,
    [genId("flddef"), workspaceId2, ts]
  );
});

// ── Metadata CRUD Tests ──

describe("metadata CRUD", () => {
  it("createRecord inserts a record with all fields", async () => {
    const created = await createRecord(workspaceId, "test_item", { name: "Alice", email: "alice@test.com" });
    expect(created.id).toBeDefined();

    const fetched = await getRecord(workspaceId, "test_item", created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.name).toBe("Alice");
    expect(fetched!.email).toBe("alice@test.com");
  });

  it("getRecord returns undefined for non-existent", async () => {
    const record = await getRecord(workspaceId, "test_item", "nonexistent");
    expect(record).toBeUndefined();
  });

  it("updateRecord modifies fields", async () => {
    const created = await createRecord(workspaceId, "test_item", { name: "Bob" });
    await updateRecord(workspaceId, "test_item", created.id, { name: "Robert" });
    const record = await getRecord(workspaceId, "test_item", created.id);
    expect(record).toBeDefined();
    expect(record!.name).toBe("Robert");
  });

  it("deleteRecord removes the record", async () => {
    const created = await createRecord(workspaceId, "test_item", { name: "ToDelete" });
    const deleted = await deleteRecord(workspaceId, "test_item", created.id);
    expect(deleted).toBe(true);
    const record = await getRecord(workspaceId, "test_item", created.id);
    expect(record).toBeUndefined();
  });

  it("deleteRecord returns false for non-existent", async () => {
    const deleted = await deleteRecord(workspaceId, "test_item", "nonexistent");
    expect(deleted).toBe(false);
  });

  it("getRecords returns all records for workspace", async () => {
    await createRecord(workspaceId, "test_item", { name: "A" });
    await createRecord(workspaceId, "test_item", { name: "B" });
    const records = await getRecords(workspaceId, "test_item");
    expect(records.length).toBe(2);
  });

  it("records are isolated by workspace", async () => {
    await createRecord(workspaceId, "test_item", { name: "WS1" });
    await createRecord(workspaceId2, "test_item", { name: "WS2" });
    const records1 = await getRecords(workspaceId, "test_item");
    const records2 = await getRecords(workspaceId2, "test_item");
    expect(records1.length).toBe(1);
    expect(records2.length).toBe(1);
    expect(records1[0].name).toBe("WS1");
    expect(records2[0].name).toBe("WS2");
  });

  it("getFields returns field definitions for an object", async () => {
    const fields = await getFields(workspaceId, "test_item");
    expect(fields.length).toBe(2);
    const keys = fields.map(f => f.fieldKey);
    expect(keys).toContain("name");
    expect(keys).toContain("email");
    const nameField = fields.find(f => f.fieldKey === "name");
    expect(nameField!.label).toBe("Name");
    expect(nameField!.type).toBe("text");
    expect(nameField!.ownership).toBe("module_owned");
  });

  it("getObjects returns object definitions for a workspace", async () => {
    const objects = await getObjects(workspaceId);
    expect(objects.length).toBe(1);
    expect(objects[0].objectKey).toBe("test_item");
    expect(objects[0].label).toBe("Test Item");
    expect(objects[0].ownership).toBe("module_owned");
  });

  it("updateRecord returns the updated record", async () => {
    const created = await createRecord(workspaceId, "test_item", { name: "Original" });
    const updated = await updateRecord(workspaceId, "test_item", created.id, { name: "Updated" });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("Updated");
  });

  it("updateRecord on non-existent returns undefined", async () => {
    const updated = await updateRecord(workspaceId, "test_item", "nonexistent", { name: "X" });
    expect(updated).toBeUndefined();
  });

  it("createRecord isolates records by workspace", async () => {
    const created1 = await createRecord(workspaceId, "test_item", { name: "InWS1" });
    const created2 = await createRecord(workspaceId2, "test_item", { name: "InWS2" });

    // WS1 should not see WS2's record
    const record1 = await getRecord(workspaceId, "test_item", created2.id);
    expect(record1).toBeUndefined();

    // WS2 should not see WS1's record
    const record2 = await getRecord(workspaceId2, "test_item", created1.id);
    expect(record2).toBeUndefined();
  });
});
