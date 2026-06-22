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
  ConflictError,
} from "./context";
import {
  archiveWorkspace,
  scheduleWorkspaceDeletion,
  restoreWorkspace,
  purgeWorkspace,
} from "./lifecycle";
import { createApiKey } from "./api-keys";
import { writeAuditEvent } from "./audit-service";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Test fixture ──

let orgId: string;
let workspaceIdA: string;
let workspaceIdB: string;
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
});

beforeEach(async () => {
  const tables = [
    TABLES.extensionFieldValues, TABLES.auditLogs, TABLES.navigationItems,
    TABLES.viewDefinitions, TABLES.fieldDefinitions, TABLES.objectDefinitions,
    TABLES.installations, TABLES.extensionDefinitions, TABLES.extensionVersions,
    TABLES.invitationWorkspaceGrants, TABLES.organizationInvitations,
    TABLES.apiKeys, TABLES.usageEvents, TABLES.usageRollups,
    TABLES.organizationEntitlements, TABLES.exportJobs, TABLES.deletionJobs,
    TABLES.workspaceMemberships, TABLES.organizationMemberships,
    TABLES.workspaceTenants, TABLES.workspaces, TABLES.organizations, TABLES.users,
    TABLES.sessions, TABLES.authIdentities, TABLES.authChallenges,
  ];
  for (const t of tables) {
    try { await db.execute({ sql: `DELETE FROM ${t}` }); } catch {}
  }

  const bizTables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'runory_business_%' ORDER BY name DESC",
  });
  for (const row of bizTables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DELETE FROM "${name}"` });
  }

  // Create fixture: one org, two workspaces (A and B), one user (admin in both)
  const ts = now();
  orgId = genId("org");
  workspaceIdA = genId("ws");
  workspaceIdB = genId("ws");
  userId = genId("usr");

  await batch([
    { sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [userId, `ext_${userId}`, "test@lifecycle.local", "Test User", ts, ts] },
    { sql: `INSERT INTO ${TABLES.organizations} (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [orgId, "Test Org", "test-org", ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [workspaceIdA, "WS A", "ws-a", ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [workspaceIdB, "WS B", "ws-b", ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [workspaceIdA, orgId, ts] },
    { sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [workspaceIdB, orgId, ts] },
    { sql: `INSERT INTO ${TABLES.organizationMemberships} (id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?)`,
      args: [genId("orgmem"), orgId, userId, ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), workspaceIdA, userId, ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), workspaceIdB, userId, ts, ts] },
  ]);
});

// ── OPS-06: Lifecycle Idempotency ──

describe("OPS-06: Lifecycle Idempotency", () => {
  it("archiveWorkspace throws ConflictError when archiving an already-archived workspace", async () => {
    await archiveWorkspace(workspaceIdA, userId);

    // Archiving again should throw ConflictError (not silent success)
    await expect(archiveWorkspace(workspaceIdA, userId)).rejects.toThrow(ConflictError);

    const ws = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdA]
    );
    expect(ws!.status).toBe("archived");
  });

  it("restoreWorkspace throws ConflictError when restoring an already-active workspace", async () => {
    // Workspace is active by default — restoring should throw ConflictError
    await expect(restoreWorkspace(workspaceIdA, userId)).rejects.toThrow(ConflictError);
  });

  it("scheduleWorkspaceDeletion throws ConflictError when deletion is already scheduled", async () => {
    await scheduleWorkspaceDeletion(workspaceIdA, orgId, userId);

    // Scheduling again should throw ConflictError
    await expect(scheduleWorkspaceDeletion(workspaceIdA, orgId, userId)).rejects.toThrow(ConflictError);
  });

  it("restoreWorkspace cancels scheduled deletion and restores workspace to active", async () => {
    const job = await scheduleWorkspaceDeletion(workspaceIdA, orgId, userId);
    expect(job.status).toBe("scheduled");

    await restoreWorkspace(workspaceIdA, userId);

    const ws = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdA]
    );
    expect(ws!.status).toBe("active");

    // Deletion job should be marked as restored
    const jobRow = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.deletionJobs} WHERE id = ?`,
      [job.id]
    );
    expect(jobRow!.status).toBe("restored");
  });

  it("purgeWorkspace is idempotent — purging an already-purged workspace does not throw", async () => {
    await purgeWorkspace(workspaceIdA);

    const ws1 = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdA]
    );
    expect(ws1!.status).toBe("purged");

    // Purging again should not throw — sets status=purged, no error
    await expect(purgeWorkspace(workspaceIdA)).resolves.toBeUndefined();

    const ws2 = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdA]
    );
    expect(ws2!.status).toBe("purged");
  });
});

// ── OPS-06: Cross-Workspace Isolation ──

describe("OPS-06: Cross-Workspace Isolation", () => {
  it("archiveWorkspace only affects the target workspace", async () => {
    await archiveWorkspace(workspaceIdA, userId);

    const wsA = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdA]
    );
    expect(wsA!.status).toBe("archived");

    const wsB = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdB]
    );
    expect(wsB!.status).toBe("active");
  });

  it("restoreWorkspace only affects the target workspace", async () => {
    // Schedule deletion for both workspaces
    await scheduleWorkspaceDeletion(workspaceIdA, orgId, userId);
    await scheduleWorkspaceDeletion(workspaceIdB, orgId, userId);

    // Restore only A
    await restoreWorkspace(workspaceIdA, userId);

    const wsA = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdA]
    );
    expect(wsA!.status).toBe("active");

    const wsB = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdB]
    );
    expect(wsB!.status).toBe("pending_deletion");
  });

  it("scheduleWorkspaceDeletion only affects the target workspace", async () => {
    await scheduleWorkspaceDeletion(workspaceIdA, orgId, userId);

    const wsA = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdA]
    );
    expect(wsA!.status).toBe("pending_deletion");

    const wsB = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceIdB]
    );
    expect(wsB!.status).toBe("active");
  });

  it("purgeWorkspace only deletes target workspace data (objects, installations, audit logs)", async () => {
    const ts = now();
    await batch([
      { sql: `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'customer', 'Customer', NULL, 'module_owned', ?)`,
        args: [genId("objdef"), workspaceIdA, ts] },
      { sql: `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'customer', 'Customer', NULL, 'module_owned', ?)`,
        args: [genId("objdef"), workspaceIdB, ts] },
      { sql: `INSERT INTO ${TABLES.installations} (id, workspace_id, module_id, module_version, pack_id, status, installed_at) VALUES (?, ?, 'mod_a', '1.0.0', NULL, 'installed', ?)`,
        args: [genId("inst"), workspaceIdA, ts] },
      { sql: `INSERT INTO ${TABLES.installations} (id, workspace_id, module_id, module_version, pack_id, status, installed_at) VALUES (?, ?, 'mod_b', '1.0.0', NULL, 'installed', ?)`,
        args: [genId("inst"), workspaceIdB, ts] },
    ]);

    await writeAuditEvent({
      workspaceId: workspaceIdA, actorType: "user", actorId: userId,
      action: "record.create", entityType: "customer", entityId: "rec_a_1",
    });
    await writeAuditEvent({
      workspaceId: workspaceIdB, actorType: "user", actorId: userId,
      action: "record.create", entityType: "customer", entityId: "rec_b_1",
    });

    await purgeWorkspace(workspaceIdA);

    // A's data should be deleted
    const aObjs = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.objectDefinitions} WHERE workspace_id = ?`,
      [workspaceIdA]
    );
    expect(aObjs!.count).toBe(0);

    const aInst = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.installations} WHERE workspace_id = ?`,
      [workspaceIdA]
    );
    expect(aInst!.count).toBe(0);

    const aAudit = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.auditLogs} WHERE workspace_id = ?`,
      [workspaceIdA]
    );
    expect(aAudit!.count).toBe(0);

    // B's data should be intact
    const bObjs = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.objectDefinitions} WHERE workspace_id = ?`,
      [workspaceIdB]
    );
    expect(bObjs!.count).toBe(1);

    const bInst = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.installations} WHERE workspace_id = ?`,
      [workspaceIdB]
    );
    expect(bInst!.count).toBe(1);

    const bAudit = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.auditLogs} WHERE workspace_id = ?`,
      [workspaceIdB]
    );
    expect(bAudit!.count).toBe(1);
  });

  it("purgeWorkspace deletes target workspace's business records and preserves others", async () => {
    // Create customer business table
    await execute(
      `CREATE TABLE IF NOT EXISTS ${businessTable("customer")} (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT, created_at TEXT, updated_at TEXT)`
    );

    // Insert records into both workspaces
    const recordA = genId("rec");
    const recordB = genId("rec");
    const ts = now();
    await execute(
      `INSERT INTO ${businessTable("customer")} (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, 'Alice Corp', ?, ?)`,
      [recordA, workspaceIdA, ts, ts]
    );
    await execute(
      `INSERT INTO ${businessTable("customer")} (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, 'Bob Corp', ?, ?)`,
      [recordB, workspaceIdB, ts, ts]
    );

    await purgeWorkspace(workspaceIdA);

    // A's business records should be deleted (no data leak)
    const aRecord = await queryOne<{ name: string }>(
      `SELECT name FROM ${businessTable("customer")} WHERE workspace_id = ? AND id = ?`,
      [workspaceIdA, recordA]
    );
    expect(aRecord).toBeUndefined();

    // B's record should still exist
    const bRecord = await queryOne<{ name: string }>(
      `SELECT name FROM ${businessTable("customer")} WHERE workspace_id = ? AND id = ?`,
      [workspaceIdB, recordB]
    );
    expect(bRecord).toBeDefined();
    expect(bRecord!.name).toBe("Bob Corp");
  });

  it("purgeWorkspace preserves other workspaces' audit logs", async () => {
    await writeAuditEvent({
      workspaceId: workspaceIdA, actorType: "user", actorId: userId,
      action: "record.create", entityType: "customer", entityId: "rec_a_1",
    });
    await writeAuditEvent({
      workspaceId: workspaceIdB, actorType: "user", actorId: userId,
      action: "record.create", entityType: "customer", entityId: "rec_b_1",
    });

    await purgeWorkspace(workspaceIdA);

    const bAudit = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.auditLogs} WHERE workspace_id = ?`,
      [workspaceIdB]
    );
    expect(bAudit!.count).toBe(1);
  });

  it("purgeWorkspace preserves other workspaces' API keys", async () => {
    await createApiKey(workspaceIdA, userId, { name: "Key A", scopes: ["workspace:read"] });
    await createApiKey(workspaceIdB, userId, { name: "Key B", scopes: ["workspace:read"] });

    await purgeWorkspace(workspaceIdA);

    const aKeys = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.apiKeys} WHERE workspace_id = ?`,
      [workspaceIdA]
    );
    expect(aKeys!.count).toBe(0);

    const bKeys = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.apiKeys} WHERE workspace_id = ?`,
      [workspaceIdB]
    );
    expect(bKeys!.count).toBe(1);
  });
});
