// ── Customer Access Security Test Matrix (v0.8 Tech Spec §14.2) ──
//
// Implements the full §14.2 security test matrix:
//   1. Raw token absence (DB, audit, commandResult, exchange result)
//   2. Indistinguishable failures (invalid / expired / revoked / malformed / mismatched)
//   3. Revocation blocks issued cookie
//   4. Cross-tenant isolation (workspace / customer / root / guessed / wrong-field)
//   5. Rate limit fingerprint determinism
//   6. DTO sanitization (no internal fields leak to the customer)

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryOne, queryAll, batch } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installModule } from "./installer";
import { repairWorkspaceCommandContracts } from "./command-contract-repair";
import {
  issueCustomerAccessGrant,
  revokeCustomerAccessGrant,
  generateAccessToken,
  hashAccessToken,
  type CustomerAccessGrantRecord,
} from "./customer-access-commands";
import {
  exchangeCustomerAccessToken,
  resolveCustomerAccessSession,
  createCustomerAccessSession,
  verifyCustomerAccessSession,
  CustomerAccessUnavailableError,
  CUSTOMER_ACCESS_COOKIE_NAME,
  CUSTOMER_ACCESS_RESPONSE_HEADERS,
  rateLimitFingerprint,
} from "./customer-access-session";
import { resolveCustomerAccessContext } from "./customer-access-context";
import { resolveCustomerQuoteAccept } from "./command-contracts/customer-authorization";
import { getAuditLogs } from "./audit";
import type { CommandActor } from "./command-runtime";

// ── Data directory ──

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Session secret management ──

const TEST_SECRET = "customer-access-test-secret-at-least-32-chars!!";
let originalSecret: string | undefined;

beforeAll(() => {
  originalSecret = process.env.CUSTOMER_ACCESS_SESSION_SECRET;
  process.env.CUSTOMER_ACCESS_SESSION_SECRET = TEST_SECRET;
});

afterAll(() => {
  if (originalSecret !== undefined) {
    process.env.CUSTOMER_ACCESS_SESSION_SECRET = originalSecret;
  } else {
    delete process.env.CUSTOMER_ACCESS_SESSION_SECRET;
  }
});

// ── Database reset (established pattern) ──

async function resetDatabase() {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${String(row.name)}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

// ── Test fixture ──

interface TestFixture {
  workspaceId: string;
  userId: string;
  actor: CommandActor;
  companyId: string;
  contactId: string;
  quoteId: string;
  workOrderId: string;
  serviceReportId: string;
  invoiceId: string;
  expiresAt: string;
}

const PUBLIC_BASE_URL = "https://access.test.example.com";
const MODULES = [
  "runory.contact",
  "runory.company",
  "runory.quote",
  "runory.work-order",
  "runory.service-report",
  "runory.invoice",
  "runory.payment",
] as const;

async function setupWorkspace(slugSuffix = "a"): Promise<TestFixture> {
  const ts = now();
  const workspaceId = genId("ws");
  const userId = genId("usr");

  // Workspace
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, `Security Test WS ${slugSuffix.toUpperCase()}`, `sec-test-${slugSuffix}-${workspaceId.slice(-8)}`, ts, ts],
  );

  // User + workspace membership (admin so business permissions pass implicitly)
  await batch([
    {
      sql: `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [userId, `ext-${userId}`, `Test User ${slugSuffix.toUpperCase()}`, ts, ts],
    },
    {
      sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [genId("wsmem"), workspaceId, userId, ts, ts],
    },
  ]);

  // Install modules
  for (const moduleId of MODULES) {
    await installModule(workspaceId, moduleId);
  }

  // Provision command contract snapshots (customer_access.issue / revoke etc.)
  await repairWorkspaceCommandContracts(workspaceId);

  const actor: CommandActor = { type: "user", id: userId };

  // ── Business records ──

  const companyId = genId("cmp");
  const contactId = genId("ctc");
  const quoteId = genId("qt");
  const workOrderId = genId("wo");
  const serviceReportId = genId("sr");
  const invoiceId = genId("inv");
  const paymentRequestId = genId("preq");

  await batch([
    // Company
    {
      sql: `INSERT INTO ${businessTable("company")} (id, workspace_id, name, domain, website, phone, industry, size, source, owner, lifecycle_stage, address, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, 'lead', NULL, NULL, ?, ?)`,
      args: [companyId, workspaceId, `Acme Corp ${slugSuffix.toUpperCase()}`, `acme-${slugSuffix}.example.com`, userId, ts, ts],
    },
    // Contact
    {
      sql: `INSERT INTO ${businessTable("contact")} (id, workspace_id, name, email, phone, title, role, primary_company_id, source, owner, lifecycle_stage, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, NULL, NULL, ?, ?)`,
      args: [contactId, workspaceId, `John Doe ${slugSuffix.toUpperCase()}`, `john-${slugSuffix}@example.com`, companyId, userId, ts, ts],
    },
    // Work order
    {
      sql: `INSERT INTO ${businessTable("work_order")} (id, workspace_id, title, description, status, priority, company_id, contact_id, service_site_id, asset_id, assigned_to, requested_at, scheduled_start, scheduled_end, completed_at, sla_due_at, source, notes, work_order_number, aggregate_version, source_type, source_id, source_snapshot_hash, owner_resource_id, cancelled_at, reopened_at, completion_reason, cancellation_reason, reopen_reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'scheduled', 'medium', ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      args: [workOrderId, workspaceId, "Repair Visit", "Fix the widget", companyId, contactId, ts, `WO-${slugSuffix.toUpperCase()}-001`, ts, ts],
    },
    // Quote (status 'sent', linked to work order, contact, company)
    {
      sql: `INSERT INTO ${businessTable("quote")} (id, workspace_id, quote_number, title, status, version, company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id, currency, subtotal, discount_total, tax_total, grand_total, valid_until, owner, terms, notes, aggregate_version, root_quote_id, previous_version_id, revision_number, price_book_id, approved_at, accepted_at, rejected_reason, return_reason, withdrawn_at, snapshot_hash, locked_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'sent', 1, ?, ?, NULL, ?, NULL, NULL, 'USD', 100, 0, 10, 110, ?, NULL, NULL, NULL, 1, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      args: [quoteId, workspaceId, `Q-${slugSuffix.toUpperCase()}-001`, "Repair Quote", companyId, contactId, workOrderId, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), ts, ts],
    },
    // Service report
    {
      sql: `INSERT INTO ${businessTable("service_report")} (id, workspace_id, work_order_id, service_visit_id, summary, resolution, customer_signature, photos, created_by, completed_at, created_at, updated_at)
            VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
      args: [serviceReportId, workspaceId, workOrderId, "Repaired the widget", "Replaced faulty component", userId, ts, ts, ts],
    },
    // Invoice (total_minor > 0, balance = total - paid)
    {
      sql: `INSERT INTO ${businessTable("invoice")} (id, workspace_id, invoice_number, status, work_order_id, quote_id, company_id, contact_id, currency, total_minor, amount_paid_minor, balance_due_minor, issued_at, due_at, paid_at, voided_at, memo, source_snapshot_hash, created_by, aggregate_version, created_at, updated_at)
            VALUES (?, ?, ?, 'issued', ?, ?, ?, ?, 'USD', 11000, 0, 11000, ?, NULL, NULL, NULL, NULL, NULL, ?, 1, ?, ?)`,
      args: [invoiceId, workspaceId, `INV-${slugSuffix.toUpperCase()}-001`, workOrderId, quoteId, companyId, contactId, ts, userId, ts, ts],
    },
    // Payment request (linked to invoice)
    {
      sql: `INSERT INTO ${businessTable("payment_request")} (id, workspace_id, number, status, purpose, amount_due_minor, amount_paid_minor, currency, customer_contact_id, source_object_type, source_object_id, provider_account_id, provider_checkout_id, checkout_url, expires_at, created_by, aggregate_version, created_at, updated_at)
            VALUES (?, ?, ?, 'open', 'general', 11000, 0, 'USD', ?, 'invoice', ?, NULL, NULL, NULL, NULL, ?, 1, ?, ?)`,
      args: [paymentRequestId, workspaceId, `PR-${slugSuffix.toUpperCase()}-001`, contactId, invoiceId, userId, ts, ts],
    },
    // Payment (succeeded)
    {
      sql: `INSERT INTO ${businessTable("payment")} (id, workspace_id, payment_request_id, status, amount_minor, refunded_amount_minor, currency, provider, provider_account_id, provider_payment_id, failure_code, failure_message, succeeded_at, aggregate_version, created_at, updated_at)
            VALUES (?, ?, ?, 'succeeded', 11000, 0, 'USD', 'stripe', NULL, 'pi_test_001', NULL, NULL, ?, 1, ?, ?)`,
      args: [genId("pay"), workspaceId, paymentRequestId, ts, ts, ts],
    },
  ]);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    workspaceId,
    userId,
    actor,
    companyId,
    contactId,
    quoteId,
    workOrderId,
    serviceReportId,
    invoiceId,
    expiresAt,
  };
}

// ── Shared fixture ──

let fixture: TestFixture;

beforeEach(async () => {
  await resetDatabase();
  fixture = await setupWorkspace();
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.2.1 — Raw Token Absence
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.2.1 Raw token absence", () => {
  it("DB stores token_hash but never the raw token in any column", async () => {
    const { commandResult, rawToken } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view", "quote.accept"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    const grantId = commandResult.aggregate.id;

    // Query every column of the grant row
    const grantRow = await queryOne<CustomerAccessGrantRecord>(
      `SELECT * FROM ${TABLES.customerAccessGrants} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, grantId],
    );
    expect(grantRow).toBeDefined();

    // The token_hash column must be populated and be the SHA-256 hex of the raw token
    expect(grantRow!.token_hash).toBe(hashAccessToken(rawToken));
    expect(grantRow!.token_hash).toHaveLength(64);

    // No column value in the grant row may contain the raw token
    const allValues = Object.values(grantRow!);
    for (const value of allValues) {
      if (typeof value === "string") {
        expect(value).not.toContain(rawToken);
      }
    }
  });

  it("audit logs do not contain the raw token in any field", async () => {
    const { commandResult, rawToken } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    // There must be at least one audit entry for customer_access.issue
    const logs = await getAuditLogs(fixture.workspaceId);
    const issueLogs = logs.filter((l) => l.action === "customer_access.issue");
    expect(issueLogs.length).toBeGreaterThanOrEqual(1);

    // The raw token must not appear anywhere in the entire audit log payload
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(rawToken);
  });

  it("accessUrl contains the token in the fragment but commandResult does not", async () => {
    const { commandResult, rawToken, accessUrl } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    // accessUrl must contain the token in the fragment
    expect(accessUrl).toContain(`#token=${rawToken}`);
    expect(accessUrl.startsWith(PUBLIC_BASE_URL + "/access#token=")).toBe(true);

    // commandResult must NOT contain the raw token anywhere
    const serialized = JSON.stringify(commandResult);
    expect(serialized).not.toContain(rawToken);
  });

  it("token exchange result does not contain the raw token", async () => {
    const { rawToken } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    const exchangeResult = await exchangeCustomerAccessToken(rawToken);

    // The exchange result must not contain the raw token
    const serialized = JSON.stringify(exchangeResult);
    expect(serialized).not.toContain(rawToken);

    // The grant inside the result must have a token_hash (not the raw token)
    expect(exchangeResult.grant.token_hash).toBe(hashAccessToken(rawToken));
    expect(exchangeResult.grant.token_hash).not.toBe(rawToken);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.2.2 — Indistinguishable Failures
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.2.2 Indistinguishable failures", () => {
  it("throws CustomerAccessUnavailableError for an invalid (random) token", async () => {
    const randomToken = generateAccessToken();
    await expect(exchangeCustomerAccessToken(randomToken)).rejects.toThrow(
      CustomerAccessUnavailableError,
    );
  });

  it("throws CustomerAccessUnavailableError for an expired grant", async () => {
    const { rawToken, commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    // Force-expire the grant by setting expires_at to the past
    await execute(
      `UPDATE ${TABLES.customerAccessGrants} SET expires_at = ? WHERE workspace_id = ? AND id = ?`,
      [new Date(Date.now() - 1000).toISOString(), fixture.workspaceId, commandResult.aggregate.id],
    );

    await expect(exchangeCustomerAccessToken(rawToken)).rejects.toThrow(
      CustomerAccessUnavailableError,
    );
  });

  it("throws CustomerAccessUnavailableError for a revoked grant", async () => {
    const { rawToken, commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    await revokeCustomerAccessGrant(
      fixture.workspaceId,
      commandResult.aggregate.id,
      fixture.actor,
      commandResult.newVersion,
    );

    await expect(exchangeCustomerAccessToken(rawToken)).rejects.toThrow(
      CustomerAccessUnavailableError,
    );
  });

  it("throws CustomerAccessUnavailableError for a malformed (too short) token", async () => {
    await expect(exchangeCustomerAccessToken("short")).rejects.toThrow(
      CustomerAccessUnavailableError,
    );
  });

  it("throws CustomerAccessUnavailableError for an empty token", async () => {
    await expect(exchangeCustomerAccessToken("")).rejects.toThrow(
      CustomerAccessUnavailableError,
    );
  });

  it("throws CustomerAccessUnavailableError for a mismatched token (hash matches no grant)", async () => {
    // A well-formed but non-matching token
    const mismatchedToken = generateAccessToken();
    await expect(exchangeCustomerAccessToken(mismatchedToken)).rejects.toThrow(
      CustomerAccessUnavailableError,
    );
  });

  it("all failure cases produce the exact same error message with no distinguishing info", async () => {
    // Issue a valid grant to test expired and revoked cases
    const { rawToken, commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );
    const grantId = commandResult.aggregate.id;

    // Expired
    await execute(
      `UPDATE ${TABLES.customerAccessGrants} SET expires_at = ? WHERE workspace_id = ? AND id = ?`,
      [new Date(Date.now() - 1000).toISOString(), fixture.workspaceId, grantId],
    );
    const expiredError = await exchangeCustomerAccessToken(rawToken).catch((e) => e);

    // Reset to active + future expiry for the revoked case
    await execute(
      `UPDATE ${TABLES.customerAccessGrants} SET expires_at = ?, status = 'active', revoked_at = NULL, revoked_by = NULL WHERE workspace_id = ? AND id = ?`,
      [fixture.expiresAt, fixture.workspaceId, grantId],
    );

    // Revoke
    await revokeCustomerAccessGrant(
      fixture.workspaceId,
      grantId,
      fixture.actor,
      1, // version is still 1 after manual reset
    );
    const revokedError = await exchangeCustomerAccessToken(rawToken).catch((e) => e);

    // Invalid token
    const invalidError = await exchangeCustomerAccessToken(generateAccessToken()).catch((e) => e);

    // Malformed (short)
    const malformedError = await exchangeCustomerAccessToken("short").catch((e) => e);

    // Empty
    const emptyError = await exchangeCustomerAccessToken("").catch((e) => e);

    // Mismatched
    const mismatchedError = await exchangeCustomerAccessToken(generateAccessToken()).catch((e) => e);

    // All must be CustomerAccessUnavailableError
    for (const err of [expiredError, revokedError, invalidError, malformedError, emptyError, mismatchedError]) {
      expect(err).toBeInstanceOf(CustomerAccessUnavailableError);
    }

    // All must produce the exact same message — no distinguishing info
    const messages = [expiredError, revokedError, invalidError, malformedError, emptyError, mismatchedError].map(
      (e) => (e as Error).message,
    );
    const firstMessage = messages[0];
    for (const msg of messages) {
      expect(msg).toBe(firstMessage);
    }
    expect(firstMessage).toContain("UNAVAILABLE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.2.3 — Revocation Blocks Issued Cookie
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.2.3 Revocation blocks issued cookie", () => {
  it("resolveCustomerAccessSession returns null after revocation even with a valid cookie signature", async () => {
    const { rawToken, commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    // Exchange the token to obtain a signed session cookie
    const exchangeResult = await exchangeCustomerAccessToken(rawToken);
    const cookieValue = exchangeResult.cookieValue;

    // The cookie signature should be valid before revocation
    const payloadBefore = verifyCustomerAccessSession(cookieValue);
    expect(payloadBefore).not.toBeNull();

    // The session should resolve before revocation
    const grantBefore = await resolveCustomerAccessSession(cookieValue);
    expect(grantBefore).not.toBeNull();
    expect(grantBefore!.id).toBe(commandResult.aggregate.id);

    // Revoke the grant
    await revokeCustomerAccessGrant(
      fixture.workspaceId,
      commandResult.aggregate.id,
      fixture.actor,
      commandResult.newVersion,
    );

    // The cookie signature is STILL valid (the secret hasn't changed)
    const payloadAfter = verifyCustomerAccessSession(cookieValue);
    expect(payloadAfter).not.toBeNull();
    expect(payloadAfter!.grantId).toBe(commandResult.aggregate.id);

    // But the session must NOT resolve — revocation is checked on every request
    const grantAfter = await resolveCustomerAccessSession(cookieValue);
    expect(grantAfter).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.2.4 — Cross-Tenant Isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.2.4 Cross-tenant isolation", () => {
  it("cross-workspace: a grant in WS-A cannot resolve context for records in WS-B", async () => {
    // Set up a second workspace with its own data
    const wsB = await setupWorkspace("b");

    // Issue a grant in WS-A
    const { commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    const grant = commandResult.aggregate;
    const ctx = await resolveCustomerAccessContext(grant);

    // Context must show WS-A's workspace name, not WS-B's
    expect(ctx.workspace.name).toBe("Security Test WS A");
    expect(ctx.workspace.name).not.toBe("Security Test WS B");

    // Context must include WS-A's quote, not WS-B's
    expect(ctx.quote).toBeDefined();
    expect(ctx.quote!.id).toBe(fixture.quoteId);
    expect(ctx.quote!.id).not.toBe(wsB.quoteId);
  });

  it("cross-customer: grant for contact-A, but quote belongs to contact-B — context excludes the quote", async () => {
    const ts = now();
    // Create a second contact (contact-B) in the same workspace
    const contactBId = genId("ctc");
    await execute(
      `INSERT INTO ${businessTable("contact")} (id, workspace_id, name, email, phone, title, role, primary_company_id, source, owner, lifecycle_stage, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, NULL, NULL, ?, ?)`,
      [contactBId, fixture.workspaceId, "Jane Smith", "jane@example.com", fixture.companyId, fixture.userId, ts, ts],
    );

    // Create a quote that belongs to contact-B (not contact-A)
    const quoteBId = genId("qt");
    await execute(
      `INSERT INTO ${businessTable("quote")} (id, workspace_id, quote_number, title, status, version, company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id, currency, subtotal, discount_total, tax_total, grand_total, valid_until, owner, terms, notes, aggregate_version, root_quote_id, previous_version_id, revision_number, price_book_id, approved_at, accepted_at, rejected_reason, return_reason, withdrawn_at, snapshot_hash, locked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'sent', 1, ?, ?, NULL, NULL, NULL, NULL, 'USD', 200, 0, 20, 220, NULL, ?, NULL, NULL, 1, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      [quoteBId, fixture.workspaceId, "Q-B-001", "Other Quote", fixture.companyId, contactBId, fixture.userId, ts, ts],
    );

    // Issue a grant for contact-A, but root it at quote-B (which belongs to contact-B)
    const { commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId, // contact-A
        rootObjectType: "quote",
        rootRecordId: quoteBId, // quote belongs to contact-B
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    const ctx = await resolveCustomerAccessContext(commandResult.aggregate);

    // The quote must NOT be included — subject mismatch
    expect(ctx.quote).toBeUndefined();
  });

  it("cross-root: grant root is quote-A, but resolving quote-B via resolveCustomerQuoteAccept fails", async () => {
    const ts = now();
    // Create a second quote (quote-B) belonging to the same contact-A
    const quoteBId = genId("qt");
    await execute(
      `INSERT INTO ${businessTable("quote")} (id, workspace_id, quote_number, title, status, version, company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id, currency, subtotal, discount_total, tax_total, grand_total, valid_until, owner, terms, notes, aggregate_version, root_quote_id, previous_version_id, revision_number, price_book_id, approved_at, accepted_at, rejected_reason, return_reason, withdrawn_at, snapshot_hash, locked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'sent', 1, ?, ?, NULL, NULL, NULL, NULL, 'USD', 200, 0, 20, 220, NULL, ?, NULL, NULL, 1, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      [quoteBId, fixture.workspaceId, "Q-B-002", "Second Quote", fixture.companyId, fixture.contactId, fixture.userId, ts, ts],
    );

    // Issue a grant rooted at quote-A with quote.accept capability
    const { commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId, // quote-A
        capabilities: ["quote.view", "quote.accept"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    // Attempting to accept quote-B through a grant rooted at quote-A must fail
    await expect(
      resolveCustomerQuoteAccept(fixture.workspaceId, commandResult.aggregate.id, quoteBId),
    ).rejects.toThrow(/not reachable/i);
  });

  it("guessed-record: a random (non-existent) quote ID as root yields a context with no quote", async () => {
    const fakeQuoteId = genId("qt");

    const { commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fakeQuoteId, // does not exist
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    const ctx = await resolveCustomerAccessContext(commandResult.aggregate);

    // No quote data should be surfaced
    expect(ctx.quote).toBeUndefined();
  });

  it("wrong-field: contact grant but record has company_id instead of contact_id — context excludes the quote", async () => {
    const ts = now();
    // Create a quote with contact_id = NULL (only company_id set)
    const quoteCId = genId("qt");
    await execute(
      `INSERT INTO ${businessTable("quote")} (id, workspace_id, quote_number, title, status, version, company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id, currency, subtotal, discount_total, tax_total, grand_total, valid_until, owner, terms, notes, aggregate_version, root_quote_id, previous_version_id, revision_number, price_book_id, approved_at, accepted_at, rejected_reason, return_reason, withdrawn_at, snapshot_hash, locked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'sent', 1, ?, NULL, NULL, NULL, NULL, NULL, 'USD', 300, 0, 30, 330, NULL, ?, NULL, NULL, 1, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      [quoteCId, fixture.workspaceId, "Q-C-001", "Company-only Quote", fixture.companyId, fixture.userId, ts, ts],
    );

    // Issue a contact-scoped grant rooted at this company-only quote
    const { commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: quoteCId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    const ctx = await resolveCustomerAccessContext(commandResult.aggregate);

    // The quote must NOT be included — contact_id is NULL, subject does not match
    expect(ctx.quote).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.2.5 — Rate Limit Fingerprint
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.2.5 Rate limit fingerprint", () => {
  it("produces a deterministic 32-char hex fingerprint", () => {
    const fp = rateLimitFingerprint("203.0.113.42", "cag_test_123");
    expect(fp).toHaveLength(32);
    expect(fp).toMatch(/^[0-9a-f]{32}$/);

    // Deterministic — same inputs produce the same output
    const fp2 = rateLimitFingerprint("203.0.113.42", "cag_test_123");
    expect(fp2).toBe(fp);
  });

  it("different IP addresses produce different fingerprints for the same grant ID", () => {
    const fp1 = rateLimitFingerprint("203.0.113.1", "cag_same");
    const fp2 = rateLimitFingerprint("203.0.113.2", "cag_same");
    expect(fp1).not.toBe(fp2);
  });

  it("different grant IDs produce different fingerprints for the same IP", () => {
    const fp1 = rateLimitFingerprint("203.0.113.42", "cag_a");
    const fp2 = rateLimitFingerprint("203.0.113.42", "cag_b");
    expect(fp1).not.toBe(fp2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.2.6 — DTO Sanitization
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.2.6 DTO sanitization", () => {
  it("resolveCustomerAccessContext result excludes all internal/sensitive fields", async () => {
    // Issue a grant with the full capability set for a quote root
    const { commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: [
          "quote.view",
          "quote.accept",
          "service_report.view",
          "invoice.view",
          "invoice.pay",
          "payment.view_status",
        ],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    const ctx = await resolveCustomerAccessContext(commandResult.aggregate);
    const serialized = JSON.stringify(ctx);

    // The DTO must contain customer-safe data
    expect(ctx.grant.id).toBe(commandResult.aggregate.id);
    expect(ctx.workspace.name).toBe("Security Test WS A");
    expect(ctx.customer.displayName).toContain("John Doe");
    expect(ctx.quote).toBeDefined();
    expect(ctx.quote!.id).toBe(fixture.quoteId);
    expect(ctx.serviceReports).toHaveLength(1);
    expect(ctx.invoice).toBeDefined();
    expect(ctx.invoice!.id).toBe(fixture.invoiceId);
    expect(ctx.payment).toBeDefined();
    expect(ctx.availableActions).toContain("quote.accept");

    // ── Forbidden fields: token hashes ──
    expect(serialized).not.toContain("token_hash");
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain(hashAccessToken("anything"));

    // ── Forbidden fields: actor/audit internals ──
    expect(serialized).not.toContain("created_by");
    expect(serialized).not.toContain("createdBy");
    expect(serialized).not.toContain("revoked_by");
    expect(serialized).not.toContain("revokedBy");

    // ── Forbidden fields: aggregate versioning ──
    expect(serialized).not.toContain("aggregate_version");
    expect(serialized).not.toContain("aggregateVersion");

    // ── Forbidden fields: workspace_id (only workspace.name is exposed) ──
    expect(serialized).not.toContain("workspace_id");
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain(fixture.workspaceId);

    // ── Forbidden fields: provider references ──
    expect(serialized).not.toContain("provider_account_id");
    expect(serialized).not.toContain("providerAccountId");
    expect(serialized).not.toContain("provider_checkout_id");
    expect(serialized).not.toContain("providerCheckoutId");
    expect(serialized).not.toContain("provider_account_ref");
    expect(serialized).not.toContain("providerAccountRef");

    // ── No raw database column names (snake_case) should leak ──
    // The DTO uses camelCase; any snake_case key is a leak.
    const snakeCasePattern = /"[a-z]+_[a-z]+"/g;
    const snakeCaseMatches = serialized.match(snakeCasePattern);
    if (snakeCaseMatches) {
      // Filter out known-safe occurrences in line item descriptions etc.
      // There should be no snake_case JSON keys in the DTO.
      expect(snakeCaseMatches).toEqual([]);
    }
  });

  it("grant.id in the DTO is an opaque identifier, not a database column name", async () => {
    const { commandResult } = await issueCustomerAccessGrant(
      fixture.workspaceId,
      fixture.actor,
      {
        subjectType: "contact",
        subjectId: fixture.contactId,
        rootObjectType: "quote",
        rootRecordId: fixture.quoteId,
        capabilities: ["quote.view"],
        expiresAt: fixture.expiresAt,
      },
      PUBLIC_BASE_URL,
    );

    const ctx = await resolveCustomerAccessContext(commandResult.aggregate);

    // The grant object should only have id, expiresAt, and capabilities
    const grantKeys = Object.keys(ctx.grant).sort();
    expect(grantKeys).toEqual(["capabilities", "expiresAt", "id"]);

    // The workspace object should only have name
    const workspaceKeys = Object.keys(ctx.workspace).sort();
    expect(workspaceKeys).toEqual(["name"]);

    // The customer object should only have displayName
    const customerKeys = Object.keys(ctx.customer).sort();
    expect(customerKeys).toEqual(["displayName"]);
  });
});
