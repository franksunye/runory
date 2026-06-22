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
import { TABLES } from "./contracts";
import {
  createApiKey,
  listApiKeys,
  rotateApiKey,
  resolveApiKey,
  VALID_SCOPES,
  type ApiKeyScope,
} from "./api-keys";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Test fixture ──

let orgId: string;
let workspaceId: string;
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
  userId = genId("usr");

  await batch([
    { sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [userId, `ext_${userId}`, "test@apikeys.local", "Test User", ts, ts] },
    { sql: `INSERT INTO ${TABLES.organizations} (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [orgId, "Test Org", "test-org", ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [workspaceId, "Test WS", "test-ws", ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      args: [workspaceId, orgId, ts] },
    { sql: `INSERT INTO ${TABLES.organizationMemberships} (id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?)`,
      args: [genId("orgmem"), orgId, userId, ts, ts] },
    { sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), workspaceId, userId, ts, ts] },
  ]);
});

// ── API Key Rotation Tests ──

describe("rotateApiKey", () => {
  it("rotates: old key revoked, new key active", async () => {
    const created = await createApiKey(workspaceId, userId, {
      name: "test-key",
      scopes: ["workspace:read"],
    });

    const rotated = await rotateApiKey(created.id, workspaceId, userId);

    // New key should have a different ID and token
    expect(rotated.id).not.toBe(created.id);
    expect(rotated.token).not.toBe(created.token);
    expect(rotated.rotatedFrom).toBe(created.id);
    expect(rotated.name).toBe("test-key");
    expect(rotated.scopes).toEqual(["workspace:read"]);
    expect(rotated.status).toBe("active");

    // Old key should be revoked
    const oldKey = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.apiKeys} WHERE id = ?`,
      [created.id]
    );
    expect(oldKey!.status).toBe("revoked");

    // New key should be active
    const newKey = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.apiKeys} WHERE id = ?`,
      [rotated.id]
    );
    expect(newKey!.status).toBe("active");
  });

  it("rotated key inherits scopes from original", async () => {
    const created = await createApiKey(workspaceId, userId, {
      name: "scoped-key",
      scopes: ["workspace:read", "records:write"],
    });

    const rotated = await rotateApiKey(created.id, workspaceId, userId);
    expect(rotated.scopes).toEqual(["workspace:read", "records:write"]);
  });

  it("rotated key is resolvable with new token", async () => {
    const created = await createApiKey(workspaceId, userId, {
      name: "resolve-key",
      scopes: ["workspace:read"],
    });

    const rotated = await rotateApiKey(created.id, workspaceId, userId);

    // New token should resolve
    const result = await resolveApiKey(rotated.token, workspaceId);
    expect(result).not.toBeNull();
    expect(result!.principal.apiKeyId).toBe(rotated.id);
    expect(result!.principal.userId).toBe(userId);
  });

  it("old token is invalid after rotation", async () => {
    const created = await createApiKey(workspaceId, userId, {
      name: "old-token-key",
      scopes: ["workspace:read"],
    });

    await rotateApiKey(created.id, workspaceId, userId);

    // Old token should no longer resolve (key is revoked)
    const result = await resolveApiKey(created.token, workspaceId);
    expect(result).toBeNull();
  });

  it("rotated key appears in listApiKeys", async () => {
    const created = await createApiKey(workspaceId, userId, {
      name: "list-key",
      scopes: ["workspace:read"],
    });

    await rotateApiKey(created.id, workspaceId, userId);

    // listApiKeys only returns active keys — should show the new key, not the old one
    const keys = await listApiKeys(workspaceId, userId);
    expect(keys).toHaveLength(1);
    expect(keys[0].name).toBe("list-key");
    expect(keys[0].status).toBe("active");
  });

  it("rotation preserves name", async () => {
    const created = await createApiKey(workspaceId, userId, {
      name: "preserved-name",
      scopes: ["workspace:read"],
    });

    const rotated = await rotateApiKey(created.id, workspaceId, userId);
    expect(rotated.name).toBe("preserved-name");
  });

  it("double rotation produces three keys (2 revoked, 1 active)", async () => {
    const first = await createApiKey(workspaceId, userId, {
      name: "double-rotate",
      scopes: ["workspace:read"],
    });

    const second = await rotateApiKey(first.id, workspaceId, userId);
    const third = await rotateApiKey(second.id, workspaceId, userId);

    // First and second should be revoked
    const firstRow = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.apiKeys} WHERE id = ?`,
      [first.id]
    );
    expect(firstRow!.status).toBe("revoked");

    const secondRow = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.apiKeys} WHERE id = ?`,
      [second.id]
    );
    expect(secondRow!.status).toBe("revoked");

    // Third should be active
    const thirdRow = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.apiKeys} WHERE id = ?`,
      [third.id]
    );
    expect(thirdRow!.status).toBe("active");

    // Only one active key in the list
    const keys = await listApiKeys(workspaceId, userId);
    expect(keys).toHaveLength(1);
    expect(keys[0].id).toBe(third.id);
  });
});
