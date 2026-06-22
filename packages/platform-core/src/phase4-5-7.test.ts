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
  revokeApiKey,
  rotateApiKey,
  resolveApiKey,
  hasScope,
  VALID_SCOPES,
  type ApiKeyScope,
} from "./api-keys";
import {
  writeAuditEvent,
  getAuditEvents,
  findAuditByRequestId,
  cleanupOldAuditEvents,
} from "./audit-service";
import {
  provisionEntitlement,
  getEntitlement,
  checkQuota,
  enforceQuota,
  recordUsageEvent,
  getUsageSummary,
  updateEntitlement,
  EARLY_ACCESS_QUOTAS,
  QuotaExceededError,
} from "./entitlements";
import {
  createExportJob,
  runExportJob,
  getExportJob,
  archiveWorkspace,
  scheduleWorkspaceDeletion,
  restoreWorkspace,
  purgeWorkspace,
  scheduleOrganizationDeletion,
  purgeOrganization,
  deleteUserAccount,
} from "./lifecycle";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Test fixture ──

let orgId: string;
let workspaceId: string;
let userId: string;

beforeAll(async () => {
  globalThis.__runorySchemaReady = undefined;
  globalThis.__runoryMigrationsRun = undefined;

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
    "runory_extension_field_values", "runory_audit_logs", "runory_navigation_items",
    "runory_view_definitions", "runory_field_definitions", "runory_object_definitions",
    "runory_installations", "runory_workspace_memberships", "runory_organization_memberships",
    "runory_workspace_tenants", "runory_workspaces", "runory_organizations", "runory_users",
    "runory_organization_invitations", "runory_invitation_workspace_grants",
    "runory_api_keys", "runory_organization_entitlements", "runory_usage_events",
    "runory_usage_rollups", "runory_export_jobs", "runory_deletion_jobs",
  ];
  for (const t of tables) {
    try { await db.execute({ sql: `DELETE FROM ${t}` }); } catch {}
  }

  // Drop business tables
  const bizTables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'runory_%'",
  });
  for (const row of bizTables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DROP TABLE IF EXISTS "${name}"` });
  }

  // Create fixture
  const ts = now();
  orgId = genId("org");
  workspaceId = genId("ws");
  userId = genId("usr");

  await batch([
    { sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [userId, `ext_${userId}`, "test@phase45.local", "Test User", ts, ts] },
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

// ── Phase 4: API Keys ──

describe("Phase 4: API Keys", () => {
  it("creates an API key with hash-only storage", async () => {
    const key = await createApiKey(workspaceId, userId, {
      name: "Test Key",
      scopes: ["workspace:read", "records:write"],
    });

    expect(key.id).toBeDefined();
    expect(key.token).toMatch(/^rk_/);
    expect(key.keyPrefix).toMatch(/^rk_/);
    expect(key.scopes).toEqual(["workspace:read", "records:write"]);
    expect(key.status).toBe("active");

    // Verify hash is stored, not the token
    const row = await queryOne<{ key_hash: string; name: string }>(
      `SELECT key_hash, name FROM ${TABLES.apiKeys} WHERE id = ?`,
      [key.id]
    );
    expect(row).not.toBeNull();
    expect(row!.key_hash).not.toContain(key.token);
    expect(row!.key_hash).toHaveLength(64); // SHA-256 hex
  });

  it("lists API keys for a workspace", async () => {
    await createApiKey(workspaceId, userId, { name: "Key 1", scopes: ["workspace:read"] });
    await createApiKey(workspaceId, userId, { name: "Key 2", scopes: ["records:write"] });

    const keys = await listApiKeys(workspaceId, userId);
    expect(keys).toHaveLength(2);
    const names = keys.map(k => k.name);
    expect(names).toContain("Key 1");
    expect(names).toContain("Key 2");
  });

  it("revokes an API key", async () => {
    const key = await createApiKey(workspaceId, userId, { name: "Test", scopes: ["workspace:read"] });
    await revokeApiKey(key.id, workspaceId, userId);

    const keys = await listApiKeys(workspaceId, userId);
    expect(keys).toHaveLength(0); // Revoked keys not listed

    const row = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.apiKeys} WHERE id = ?`,
      [key.id]
    );
    expect(row!.status).toBe("revoked");
  });

  it("rotates an API key (old revoked, new created)", async () => {
    const key = await createApiKey(workspaceId, userId, { name: "Rotate Me", scopes: ["workspace:read"] });
    const rotated = await rotateApiKey(key.id, workspaceId, userId);

    expect(rotated.id).not.toBe(key.id);
    expect(rotated.token).not.toBe(key.token);
    expect(rotated.rotatedFrom).toBe(key.id);
    expect(rotated.name).toBe("Rotate Me");
    expect(rotated.scopes).toEqual(["workspace:read"]);

    // Old key should be revoked
    const oldRow = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.apiKeys} WHERE id = ?`,
      [key.id]
    );
    expect(oldRow!.status).toBe("revoked");
  });

  it("resolves a valid API key token", async () => {
    const key = await createApiKey(workspaceId, userId, { name: "Resolve", scopes: ["workspace:read", "records:write"] });
    const result = await resolveApiKey(key.token, workspaceId);

    expect(result).not.toBeNull();
    expect(result!.principal.userId).toBe(userId);
    expect(result!.principal.authMethod).toBe("api_key");
    expect(result!.principal.apiKeyId).toBe(key.id);
    expect(result!.scopes).toEqual(["workspace:read", "records:write"]);
  });

  it("rejects invalid API key token", async () => {
    const result = await resolveApiKey("rk_invalid_token", workspaceId);
    expect(result).toBeNull();
  });

  it("invalidates API key when creator loses workspace access", async () => {
    const key = await createApiKey(workspaceId, userId, { name: "Invalidate", scopes: ["workspace:read"] });

    // Remove user's workspace AND org memberships (org owner inherits workspace admin)
    await execute(
      `DELETE FROM ${TABLES.workspaceMemberships} WHERE workspace_id = ? AND user_id = ?`,
      [workspaceId, userId]
    );
    await execute(
      `DELETE FROM ${TABLES.organizationMemberships} WHERE organization_id = ? AND user_id = ?`,
      [orgId, userId]
    );

    // API key should be invalidated
    const result = await resolveApiKey(key.token, workspaceId);
    expect(result).toBeNull();

    // Key should be revoked
    const row = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.apiKeys} WHERE id = ?`,
      [key.id]
    );
    expect(row!.status).toBe("revoked");
  });

  it("hasScope checks scope correctly", () => {
    expect(hasScope(["workspace:read"], "workspace:read")).toBe(true);
    expect(hasScope(["workspace:read"], "records:write")).toBe(false);
    expect(hasScope(["workspace:read", "records:write"], "records:write")).toBe(true);
  });
});

// ── Phase 4: Audit Service ──

describe("Phase 4: Audit Service", () => {
  it("writes an audit event", async () => {
    const id = await writeAuditEvent({
      workspaceId,
      actorType: "user",
      actorId: userId,
      action: "record.create",
      entityType: "customer",
      entityId: "rec_123",
      after: { name: "Acme Corp" },
      requestId: "req_abc",
    });

    expect(id).toBeDefined();

    const events = await getAuditEvents(workspaceId);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("record.create");
    expect(events[0].entityId).toBe("rec_123");
    expect(events[0].requestId).toBe("req_abc");
  });

  it("redacts sensitive fields in before/after", async () => {
    await writeAuditEvent({
      workspaceId,
      actorType: "user",
      actorId: userId,
      action: "api_key.create",
      entityType: "api_key",
      entityId: "apik_123",
      after: { name: "My Key", token: "rk_secret123", key_hash: "abc123" },
    });

    const events = await getAuditEvents(workspaceId);
    expect(events[0].after).toEqual({
      name: "My Key",
      token: "[REDACTED]",
      key_hash: "[REDACTED]",
    });
  });

  it("finds audit events by request ID", async () => {
    await writeAuditEvent({
      workspaceId, actorType: "user", actorId: userId,
      action: "record.create", entityType: "customer", entityId: "rec_1",
      requestId: "req_find_me",
    });
    await writeAuditEvent({
      workspaceId, actorType: "user", actorId: userId,
      action: "record.update", entityType: "customer", entityId: "rec_1",
      requestId: "req_find_me",
    });
    await writeAuditEvent({
      workspaceId, actorType: "user", actorId: userId,
      action: "record.create", entityType: "customer", entityId: "rec_2",
      requestId: "req_other",
    });

    const events = await findAuditByRequestId("req_find_me", workspaceId);
    expect(events).toHaveLength(2);
    expect(events.every(e => e.requestId === "req_find_me")).toBe(true);
  });

  it("filters audit events by action", async () => {
    await writeAuditEvent({
      workspaceId, actorType: "user", actorId: userId,
      action: "record.create", entityType: "customer", entityId: "rec_1",
    });
    await writeAuditEvent({
      workspaceId, actorType: "user", actorId: userId,
      action: "record.update", entityType: "customer", entityId: "rec_1",
    });

    const creates = await getAuditEvents(workspaceId, { action: "record.create" });
    expect(creates).toHaveLength(1);
    expect(creates[0].action).toBe("record.create");
  });
});

// ── Phase 5: Entitlements & Quotas ──

describe("Phase 5: Entitlements & Quotas", () => {
  it("provisions early_access entitlement for new org", async () => {
    const ent = await provisionEntitlement(orgId);
    expect(ent.plan).toBe("early_access");
    expect(ent.status).toBe("active");
    expect(ent.quotas.workspaces).toBe(3);
    expect(ent.quotas.members).toBe(10);
    expect(ent.quotas.records).toBe(50_000);
  });

  it("retrieves active entitlement", async () => {
    await provisionEntitlement(orgId);
    const ent = await getEntitlement(orgId);
    expect(ent).not.toBeNull();
    expect(ent!.plan).toBe("early_access");
  });

  it("checkQuota returns allowed for under-limit usage", async () => {
    await provisionEntitlement(orgId);
    const result = await checkQuota(orgId, "workspaces", 1);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1); // 1 workspace in fixture
    expect(result.limit).toBe(3);
    expect(result.remaining).toBe(2);
  });

  it("enforceQuota throws on hard limit exceeded", async () => {
    await provisionEntitlement(orgId);
    // Workspaces is a hard limit, current=1, limit=3
    await expect(enforceQuota(orgId, "workspaces", 3)).rejects.toThrow(QuotaExceededError);
  });

  it("recordUsageEvent is idempotent", async () => {
    await provisionEntitlement(orgId);

    await recordUsageEvent({
      organizationId: orgId,
      workspaceId,
      metric: "api_requests",
      delta: 1,
      idempotencyKey: "idem_123",
    });

    // Same idempotency key should not be counted again
    await recordUsageEvent({
      organizationId: orgId,
      workspaceId,
      metric: "api_requests",
      delta: 1,
      idempotencyKey: "idem_123",
    });

    const events = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.usageEvents} WHERE idempotency_key = ?`,
      ["idem_123"]
    );
    expect(events!.count).toBe(1);
  });

  it("getUsageSummary returns all metrics", async () => {
    await provisionEntitlement(orgId);
    const summary = await getUsageSummary(orgId);
    expect(summary).toHaveLength(6);
    const metrics = summary.map(s => s.metric);
    expect(metrics).toContain("workspaces");
    expect(metrics).toContain("members");
    expect(metrics).toContain("records");
    expect(metrics).toContain("storage_bytes");
    expect(metrics).toContain("api_requests");
    expect(metrics).toContain("agent_operations");
  });

  it("updateEntitlement overrides quotas", async () => {
    await provisionEntitlement(orgId);
    const updated = await updateEntitlement(orgId, { quotas: { workspaces: 10 } });
    expect(updated!.quotas.workspaces).toBe(10);
    expect(updated!.quotas.members).toBe(10); // Unchanged
  });
});

// ── Phase 7: Export, Deletion, Recovery ──

describe("Phase 7: Export", () => {
  it("creates and runs an export job", async () => {
    const job = await createExportJob(workspaceId, orgId, userId);
    expect(job.status).toBe("pending");

    const completed = await runExportJob(job.id);
    expect(completed.status).toBe("completed");
    expect(completed.checksum).toBeDefined();
    expect(completed.downloadUrl).toContain(job.id);
    expect(completed.downloadExpiresAt).toBeDefined();
  });

  it("retrieves an export job by ID", async () => {
    const job = await createExportJob(workspaceId, orgId, userId);
    await runExportJob(job.id);

    const retrieved = await getExportJob(job.id, workspaceId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.status).toBe("completed");
  });
});

describe("Phase 7: Workspace Lifecycle", () => {
  it("archives a workspace", async () => {
    await archiveWorkspace(workspaceId, userId);
    const ws = await queryOne<{ status: string; archived_at: string }>(
      `SELECT status, archived_at FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceId]
    );
    expect(ws!.status).toBe("archived");
    expect(ws!.archived_at).not.toBeNull();
  });

  it("schedules workspace deletion with 30-day purge window", async () => {
    const job = await scheduleWorkspaceDeletion(workspaceId, orgId, userId);
    expect(job.status).toBe("scheduled");
    expect(job.purgeAfter).toBeDefined();

    const purgeDate = new Date(job.purgeAfter);
    const expectedDate = new Date(Date.now() + 30 * 86400000);
    expect(Math.abs(purgeDate.getTime() - expectedDate.getTime())).toBeLessThan(60000); // Within 1 minute

    const ws = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceId]
    );
    expect(ws!.status).toBe("pending_deletion");
  });

  it("restores a workspace from pending deletion", async () => {
    await scheduleWorkspaceDeletion(workspaceId, orgId, userId);
    await restoreWorkspace(workspaceId, userId);

    const ws = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceId]
    );
    expect(ws!.status).toBe("active");
  });

  it("purges a workspace permanently", async () => {
    // Add some data to verify it gets deleted
    await execute(
      `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at) VALUES (?, ?, 'customer', 'Customer', NULL, 'module_owned', ?)`,
      [genId("objdef"), workspaceId, now()]
    );

    await purgeWorkspace(workspaceId);

    const ws = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceId]
    );
    expect(ws!.status).toBe("purged");

    // Verify workspace data is deleted
    const objs = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.objectDefinitions} WHERE workspace_id = ?`,
      [workspaceId]
    );
    expect(objs!.count).toBe(0);
  });
});

describe("Phase 7: Organization Deletion", () => {
  it("schedules org deletion with owner confirmation", async () => {
    const job = await scheduleOrganizationDeletion(orgId, userId, "123456");
    expect(job.status).toBe("scheduled");
    expect(job.confirmationCodeHash).toBeDefined();

    const org = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.organizations} WHERE id = ?`,
      [orgId]
    );
    expect(org!.status).toBe("pending_deletion");
  });

  it("purges organization and all its workspaces", async () => {
    await scheduleOrganizationDeletion(orgId, userId, "123456");
    await purgeOrganization(orgId);

    const org = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.organizations} WHERE id = ?`,
      [orgId]
    );
    expect(org!.status).toBe("purged");

    const ws = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.workspaces} WHERE id = ?`,
      [workspaceId]
    );
    expect(ws!.status).toBe("purged");
  });
});

describe("Phase 7: User Account Deletion", () => {
  it("deletes user account and anonymizes audit trail", async () => {
    // Create some audit events for the user
    await writeAuditEvent({
      workspaceId, actorType: "user", actorId: userId,
      action: "record.create", entityType: "customer", entityId: "rec_1",
    });

    await deleteUserAccount(userId);

    const user = await queryOne<{ status: string; display_name: string; email: string | null }>(
      `SELECT status, display_name, email FROM ${TABLES.users} WHERE id = ?`,
      [userId]
    );
    expect(user!.status).toBe("deleted");
    expect(user!.display_name).toBe("[deleted]");
    expect(user!.email).toBeNull();

    // Audit events should be anonymized
    const audit = await queryOne<{ actor_id: string }>(
      `SELECT actor_id FROM ${TABLES.auditLogs} WHERE actor_type = 'user' AND entity_id = 'rec_1'`,
      []
    );
    if (audit) {
      expect(audit.actor_id).toBe("anonymized");
    }

    // Sessions and API keys should be revoked
    const sessions = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.sessions} WHERE user_id = ?`,
      [userId]
    );
    expect(sessions!.count).toBe(0);
  });
});
