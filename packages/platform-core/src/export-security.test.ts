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
import { exportWorkspace } from "./audit";
import { createApiKey } from "./api-keys";
import { writeAuditEvent } from "./audit-service";
import { provisionEntitlement } from "./entitlements";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Test fixture ──

let orgId: string;
let workspaceId: string;
let userId: string;
let apiKeyToken: string;

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

  // Create fixture: user, org, workspace
  const ts = now();
  orgId = genId("org");
  workspaceId = genId("ws");
  userId = genId("usr");

  await batch([
    { sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [userId, `ext_${userId}`, "test@export.local", "Test User", ts, ts] },
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

// ── Helper: seed authentication & billing secrets ──

async function seedSecrets(): Promise<void> {
  const ts = now();

  // Create API key (token stored as hash only, plaintext returned once)
  const apiKey = await createApiKey(workspaceId, userId, {
    name: "Export Test Key",
    scopes: ["workspace:read"],
  });
  apiKeyToken = apiKey.token;

  // Write audit event with sensitive fields (will be redacted by writeAuditEvent)
  await writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId: userId,
    action: "api_key.create",
    entityType: "api_key",
    entityId: "apik_123",
    after: {
      name: "Export Test Key",
      token: "rk_secret123",
      key_hash: "abc123hash",
      password: "pw_hash_123",
    },
  });

  // Create session (token_hash stored, never plaintext)
  await execute(
    `INSERT INTO ${TABLES.sessions} (id, user_id, token_hash, status, created_at, last_used_at, expires_at) VALUES (?, ?, ?, 'active', ?, ?, ?)`,
    [genId("sess"), userId, "session_token_hash_123", ts, ts, new Date(Date.now() + 86400000).toISOString()]
  );

  // Create auth identity
  await execute(
    `INSERT INTO ${TABLES.authIdentities} (id, user_id, method, email_normalized, email_display, verified, created_at, updated_at) VALUES (?, ?, 'email_otp', ?, ?, 1, ?, ?)`,
    [genId("auth"), userId, "test@export.local", "test@export.local", ts, ts]
  );

  // Create OTP challenge (code_hash stored, never plaintext)
  await execute(
    `INSERT INTO ${TABLES.authChallenges} (id, auth_identity_id, email_normalized, code_hash, purpose, status, attempts, max_attempts, expires_at, created_at) VALUES (?, NULL, ?, ?, 'login', 'pending', 0, 5, ?, ?)`,
    [genId("otp"), "test@export.local", "otp_code_hash_123", new Date(Date.now() + 600000).toISOString(), ts]
  );

  // Provision entitlement (billing data)
  await provisionEntitlement(orgId);
}

// ── OPS-07: Export Security ──

describe("OPS-07: Export Security", () => {
  beforeEach(async () => {
    await seedSecrets();
  });

  it("export does not include users table", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result).not.toHaveProperty("users");
  });

  it("export does not include sessions", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result).not.toHaveProperty("sessions");
  });

  it("export does not include auth_identities", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result).not.toHaveProperty("authIdentities");
  });

  it("export does not include OTP codes (auth_challenges)", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result).not.toHaveProperty("otpCodes");
    expect(result).not.toHaveProperty("authChallenges");
  });

  it("export does not include API keys", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result).not.toHaveProperty("apiKeys");
  });

  it("export does not include organization memberships", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result).not.toHaveProperty("organizationMemberships");
  });

  it("export does not include entitlements", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result).not.toHaveProperty("entitlements");
  });

  it("export does not include billing or usage data", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result).not.toHaveProperty("billing");
    expect(result).not.toHaveProperty("usage");
    expect(result).not.toHaveProperty("usageEvents");
    expect(result).not.toHaveProperty("usageRollups");
  });

  it("export does not include deletion jobs", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result).not.toHaveProperty("deletionJobs");
  });

  it("export includes audit logs but with sensitive fields redacted to [REDACTED]", async () => {
    const result = await exportWorkspace(workspaceId);
    expect(result.auditLogs).toBeDefined();
    expect(result.auditLogs.length).toBeGreaterThan(0);

    const log = result.auditLogs.find(
      (l) => l.action === "api_key.create" && l.entityId === "apik_123"
    );
    expect(log).toBeDefined();
    expect(log!.after).toEqual({
      name: "Export Test Key",
      token: "[REDACTED]",
      key_hash: "[REDACTED]",
      password: "[REDACTED]",
    });
  });

  it("export JSON string contains no secrets (API key tokens, session tokens, OTP codes, password hashes)", async () => {
    const result = await exportWorkspace(workspaceId);
    const json = JSON.stringify(result);

    // Must not contain the API key token (starts with rk_)
    expect(json).not.toContain(apiKeyToken);
    // Must not contain the rk_ prefix at all (no API key tokens leak)
    expect(json).not.toContain("rk_");
    // Must not contain session token hashes
    expect(json).not.toContain("session_token_hash_123");
    // Must not contain OTP code hashes
    expect(json).not.toContain("otp_code_hash_123");
    // Must not contain password hashes or key hashes from audit events
    expect(json).not.toContain("pw_hash_123");
    expect(json).not.toContain("abc123hash");
    expect(json).not.toContain("rk_secret123");
  });
});
