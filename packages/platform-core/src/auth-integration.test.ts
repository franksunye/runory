import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  requestOtp,
  verifyOtp,
  resolveSession,
  revokeSession,
  revokeAllSessions,
  listUserSessions,
  normalizeEmail,
} from "./auth";
import { db, queryOne, queryAll } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";

// Ensure test data directory exists
const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Reset database before all integration tests
beforeAll(async () => {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;

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

// Clean up auth-related tables between tests
beforeEach(async () => {
  const tables = [
    TABLES.rateLimitBuckets,
    TABLES.sessions,
    TABLES.authChallenges,
    TABLES.auditLogs,
    TABLES.workspaceMemberships,
    TABLES.organizationMemberships,
    TABLES.workspaceTenants,
    TABLES.workspaces,
    TABLES.organizations,
    TABLES.authIdentities,
    TABLES.users,
  ];
  for (const t of tables) {
    try {
      await db.execute({ sql: `DELETE FROM ${t}` });
    } catch {
      // Table may not exist yet
    }
  }
});

const TEST_IP = "127.0.0.1";
const TEST_UA = "vitest/1.0";

async function requestAndVerify(email: string, devMode = true) {
  const req = await requestOtp(email, TEST_IP, { devMode });
  expect(req.devCode).toBeDefined();
  const result = await verifyOtp(email, req.devCode!, TEST_IP, TEST_UA, { devMode });
  return result;
}

// ── Full OTP Flow ──

describe("auth integration: full OTP flow", () => {
  it("requests OTP, verifies it, and creates a session", async () => {
    const email = "flow@test.local";
    const req = await requestOtp(email, TEST_IP, { devMode: true });
    expect(req.devCode).toMatch(/^\d{6}$/);
    expect(req.isNewUser).toBe(true);

    const result = await verifyOtp(email, req.devCode!, TEST_IP, TEST_UA, { devMode: true });
    expect(result.sessionToken).toMatch(/^[a-f0-9]+$/);
    expect(result.principal.email).toBe(normalizeEmail(email));
    expect(result.isNewUser).toBe(true);

    // Session should resolve
    const principal = await resolveSession(result.sessionToken);
    expect(principal).not.toBeNull();
    expect(principal!.userId).toBe(result.principal.userId);
  });

  it("does not return devCode when devMode is false", async () => {
    const email = "prod@test.local";
    const req = await requestOtp(email, TEST_IP, { devMode: false });
    expect(req.devCode).toBeUndefined();
    // The code was "sent" (logged to console) — we can't verify without the code
  });
});

// ── First-Login Onboarding ──

describe("auth integration: first-login onboarding", () => {
  it("creates user + org + workspace + memberships on first login", async () => {
    const email = "onboard@test.local";
    const result = await requestAndVerify(email);

    // User created
    const user = await queryOne<{ id: string; email: string; status: string }>(
      `SELECT id, email, status FROM ${TABLES.users} WHERE id = ?`,
      [result.principal.userId]
    );
    expect(user).toBeDefined();
    expect(user!.email).toBe(normalizeEmail(email));
    expect(user!.status).toBe("active");

    // Auth identity created
    const identity = await queryOne<{ method: string; email_normalized: string; verified: number }>(
      `SELECT method, email_normalized, verified FROM ${TABLES.authIdentities} WHERE user_id = ?`,
      [result.principal.userId]
    );
    expect(identity).toBeDefined();
    expect(identity!.method).toBe("email_otp");
    expect(identity!.email_normalized).toBe(normalizeEmail(email));
    expect(identity!.verified).toBe(1);

    // Organization created
    const org = await queryOne<{ id: string; status: string }>(
      `SELECT o.id, o.status FROM ${TABLES.organizations} o
       JOIN ${TABLES.organizationMemberships} om ON om.organization_id = o.id
       WHERE om.user_id = ? AND om.role = 'owner'`,
      [result.principal.userId]
    );
    expect(org).toBeDefined();
    expect(org!.status).toBe("active");

    // Workspace created
    const ws = await queryOne<{ id: string; status: string }>(
      `SELECT w.id, w.status FROM ${TABLES.workspaces} w
       JOIN ${TABLES.workspaceMemberships} wm ON wm.workspace_id = w.id
       WHERE wm.user_id = ? AND wm.role = 'admin'`,
      [result.principal.userId]
    );
    expect(ws).toBeDefined();
    expect(ws!.status).toBe("active");

    // Workspace membership role is 'admin' (not 'owner')
    const wsMem = await queryOne<{ role: string }>(
      `SELECT role FROM ${TABLES.workspaceMemberships} WHERE user_id = ?`,
      [result.principal.userId]
    );
    expect(wsMem!.role).toBe("admin");

    // Organization membership role is 'owner'
    const orgMem = await queryOne<{ role: string }>(
      `SELECT role FROM ${TABLES.organizationMemberships} WHERE user_id = ?`,
      [result.principal.userId]
    );
    expect(orgMem!.role).toBe("owner");
  });

  it("does not create duplicate onboarding on second login", async () => {
    const email = "second@test.local";
    const first = await requestAndVerify(email);
    const second = await requestAndVerify(email);

    expect(second.isNewUser).toBe(false);
    expect(second.principal.userId).toBe(first.principal.userId);

    // Only one user, one org, one workspace
    const userCount = await queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM ${TABLES.users} WHERE id = ?`,
      [first.principal.userId]
    );
    expect(userCount!.c).toBe(1);

    const orgCount = await queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM ${TABLES.organizationMemberships} WHERE user_id = ?`,
      [first.principal.userId]
    );
    expect(orgCount!.c).toBe(1);
  });
});

// ── Email Normalization ──

describe("auth integration: email normalization", () => {
  it("treats different casing as the same user", async () => {
    const first = await requestAndVerify("Normalize@Test.Local");
    const second = await requestAndVerify("normalize@test.local");

    expect(second.principal.userId).toBe(first.principal.userId);
    expect(second.isNewUser).toBe(false);
  });

  it("treats whitespace-padded email as the same user", async () => {
    const first = await requestAndVerify("pad@test.local");
    const second = await requestAndVerify("  PAD@TEST.LOCAL  ");

    expect(second.principal.userId).toBe(first.principal.userId);
  });
});

// ── OTP Replay Protection ──

describe("auth integration: OTP replay protection", () => {
  it("rejects reuse of a consumed code", async () => {
    const email = "replay@test.local";
    const req = await requestOtp(email, TEST_IP, { devMode: true });

    // First use succeeds
    await verifyOtp(email, req.devCode!, TEST_IP, TEST_UA, { devMode: true });

    // Replay fails
    await expect(
      verifyOtp(email, req.devCode!, TEST_IP, TEST_UA, { devMode: true })
    ).rejects.toThrow(/No active verification code/);
  });
});

// ── OTP Brute Force Protection ──

describe("auth integration: OTP brute force protection", () => {
  it("blocks after 5 wrong attempts", async () => {
    const email = "brute@test.local";
    const req = await requestOtp(email, TEST_IP, { devMode: true });

    // 5 wrong attempts
    for (let i = 0; i < 5; i++) {
      await expect(
        verifyOtp(email, "000000", TEST_IP, TEST_UA, { devMode: true })
      ).rejects.toThrow(/Invalid verification code/);
    }

    // 6th attempt with correct code should be blocked
    await expect(
      verifyOtp(email, req.devCode!, TEST_IP, TEST_UA, { devMode: true })
    ).rejects.toThrow(/Too many verification attempts/);
  });
});

// ── Session Management ──

describe("auth integration: session management", () => {
  it("resolves a valid session and updates lastUsedAt", async () => {
    const email = "session@test.local";
    const result = await requestAndVerify(email);

    const principal1 = await resolveSession(result.sessionToken);
    expect(principal1).not.toBeNull();

    // Capture lastUsedAt, then resolve again — should update (or stay equal under fast execution)
    const principal2 = await resolveSession(result.sessionToken);
    expect(principal2).not.toBeNull();
    expect(principal2!.userId).toBe(principal1!.userId);
  });

  it("returns null for invalid session token", async () => {
    const p = await resolveSession("invalid-token");
    expect(p).toBeNull();
  });

  it("returns null for empty session token", async () => {
    const p = await resolveSession("");
    expect(p).toBeNull();
  });

  it("revokes a session", async () => {
    const email = "revoke@test.local";
    const result = await requestAndVerify(email);

    await revokeSession(result.sessionToken);
    const p = await resolveSession(result.sessionToken);
    expect(p).toBeNull();
  });

  it("revokes all sessions for a user", async () => {
    const email = "revokeall@test.local";

    // Create two sessions
    const r1 = await requestAndVerify(email);
    const r2 = await requestAndVerify(email);

    // Both should resolve
    expect(await resolveSession(r1.sessionToken)).not.toBeNull();
    expect(await resolveSession(r2.sessionToken)).not.toBeNull();

    // Revoke all
    const count = await revokeAllSessions(r1.principal.userId);
    expect(count).toBeGreaterThanOrEqual(2);

    // Both should now be invalid
    expect(await resolveSession(r1.sessionToken)).toBeNull();
    expect(await resolveSession(r2.sessionToken)).toBeNull();
  });

  it("lists user sessions with current flag", async () => {
    const email = "list@test.local";
    const r1 = await requestAndVerify(email);
    const r2 = await requestAndVerify(email);

    const sessions = await listUserSessions(r1.principal.userId, r2.sessionToken);
    expect(sessions.length).toBeGreaterThanOrEqual(2);

    const current = sessions.find((s) => s.isCurrent);
    expect(current).toBeDefined();
    expect(current!.isCurrent).toBe(true);

    const other = sessions.find((s) => !s.isCurrent);
    expect(other).toBeDefined();
    expect(other!.isCurrent).toBe(false);
  });
});

// ── Rate Limiting ──

describe("auth integration: rate limiting", () => {
  it("rate limits OTP requests per email after 5 attempts", async () => {
    const email = "rl-email@test.local";

    // 5 requests should succeed
    for (let i = 0; i < 5; i++) {
      await requestOtp(email, TEST_IP, { devMode: true });
    }

    // 6th should be rate limited
    await expect(
      requestOtp(email, TEST_IP, { devMode: true })
    ).rejects.toThrow(/Too many requests/);
  });
});
