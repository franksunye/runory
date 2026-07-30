// ── Data Integrity Tests ──
//
// This suite supplements the existing code-level E2E tests
// (v05-journey, workflow-concurrency, payment-flow, sales-quote-pack)
// with deep data-integrity assertions that validate the persistence layer
// rather than only the function return values.
//
// Coverage areas (all previously missing or weak):
//   §1  DB constraint enforcement (CHECK, UNIQUE, triggers)
//   §2  aggregate_version DB persistence (not just return values)
//   §3  audit_log chain completeness
//   §4  outbox message lifecycle
//   §5  timestamp auto-population and refresh
//   §6  cross-table reference chain integrity
//   §7  cascade behavior completeness
//   §8  idempotency at the DB row level
//
// Testing patterns follow v05-journey.test.ts:
//   - resetDatabase() pattern
//   - direct queryOne/queryAll for DB-level assertions
//   - installPack for setup

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryOne, queryAll } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installPack } from "./installer";
import {
  createRecord,
  getRecords,
  _clearSoftDeleteColumnCache,
} from "./metadata";
import {
  submitForApproval,
  approveQuote,
  markSent,
  acceptQuote,
  recalculateQuoteCommand,
  convertToWorkOrder,
} from "./quote-commands";
import {
  triageWorkOrder,
  createVisit,
  startWorkOrder,
  completeWorkOrder,
  startTravel,
  arriveOnSite,
  submitWork,
  completeVisit,
} from "./fsm-commands";
import {
  acceptAssignment,
} from "./assignment";
import { submitForm } from "./forms";
import { issueInvoiceFromWorkOrder } from "./invoice-commands";
import {
  applyProviderPaymentEvent,
  requestPayment,
  upsertPaymentProviderAccount,
} from "./payment-commands";
import {
  enqueueOutboxMessage,
  claimOutboxMessage,
  markOutboxDelivered,
  markOutboxFailed,
  retryOutboxMessage,
  getOutboxMessages,
} from "./outbox";
import type { CommandActor } from "./command-runtime";

// ── Database setup ──

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  _clearSoftDeleteColumnCache();

  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows as unknown as Array<{ name: string }>) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${row.name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createTestWorkspace(name = "DI Test WS"): Promise<string> {
  const ts = now();
  const wsId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [wsId, name, `di-${wsId}`, ts, ts],
  );
  return wsId;
}

const owner: CommandActor = { type: "user", id: "di-owner" };

/**
 * Submit the required service_visit_completion form for a visit so that
 * completeVisit() passes its delivery-requirement gate.
 *
 * createVisit() snapshots the active form binding into visit_execution_requirements.
 * We read that snapshot and submit against the exact immutable version.
 */
async function submitVisitCompletionForm(
  workspaceId: string,
  visitId: string,
  submittedBy: string,
): Promise<void> {
  const requirement = await queryOne<{
    form_definition_id: string;
    form_version_id: string;
    binding_id: string;
  }>(
    `SELECT form_definition_id, form_version_id, binding_id
     FROM ${TABLES.visitExecutionRequirements}
     WHERE workspace_id = ? AND visit_id = ?`,
    [workspaceId, visitId],
  );
  expect(requirement).toBeDefined();
  await submitForm(workspaceId, {
    formDefinitionId: requirement!.form_definition_id,
    formVersionId: requirement!.form_version_id,
    bindingId: requirement!.binding_id,
    subjectType: "service_visit",
    subjectId: visitId,
    answers: {
      work_performed: "Data integrity test work performed",
      system_status_after_service: "operational",
      "cl-pre-service": { "cl-1": "pass", "cl-2": "pass", "cl-3": "pass", "cl-4": "pass" },
      "evi-photos": { attachments: ["photo-di-001", "photo-di-002"] },
      "sig-customer": { acknowledged: true, signedBy: "DI Test Customer" },
    },
    submittedBy,
  });
}

// ════════════════════════════════════════════════════════════════════
// §1  DB Constraint Enforcement
// ════════════════════════════════════════════════════════════════════

describe("§1 DB Constraint Enforcement", () => {
  let workspaceId: string;

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });
  });

  // ── schedule_entries CHECK(end_at > start_at) ──

  it("rejects schedule_entry with end_at <= start_at", async () => {
    const resourceId = genId("res");
    const ts = now();
    // Insert a minimal resource first (resources are in the runtime namespace)
    await execute(
      `INSERT INTO ${TABLES.resources} (id, workspace_id, display_name, active, created_at, updated_at)
       VALUES (?, ?, 'Test Resource', 1, ?, ?)`,
      [resourceId, workspaceId, ts, ts],
    );

    const sameTime = "2026-08-01T09:00:00.000Z";
    await expect(
      execute(
        `INSERT INTO ${TABLES.scheduleEntries}
         (id, workspace_id, subject_type, subject_id, resource_id,
          start_at, end_at, status, created_at, updated_at)
         VALUES (?, ?, 'service_visit', 'test-visit', ?, ?, ?, 'tentative', ?, ?)`,
        [genId("sch"), workspaceId, resourceId, sameTime, sameTime, ts, ts],
      ),
    ).rejects.toThrow(/end_at > start_at|CHECK/i);

    const endTime = "2026-08-01T08:59:59.000Z"; // before start
    await expect(
      execute(
        `INSERT INTO ${TABLES.scheduleEntries}
         (id, workspace_id, subject_type, subject_id, resource_id,
          start_at, end_at, status, created_at, updated_at)
         VALUES (?, ?, 'service_visit', 'test-visit', ?, ?, ?, 'tentative', ?, ?)`,
        [genId("sch"), workspaceId, resourceId, sameTime, endTime, ts, ts],
      ),
    ).rejects.toThrow(/end_at > start_at|CHECK/i);
  });

  // ── invoice CHECK constraints ──

  it("rejects invoice with total_minor <= 0", async () => {
    const ts = now();
    await expect(
      execute(
        `INSERT INTO ${businessTable("invoice")}
         (id, workspace_id, invoice_number, status, work_order_id, currency,
          total_minor, amount_paid_minor, balance_due_minor, issued_at,
          created_by, created_at, updated_at)
         VALUES (?, ?, 'INV-TEST-001', 'issued', 'test-wo', 'USD',
                 0, 0, 0, ?, ?, ?, ?)`,
        [genId("inv"), workspaceId, ts, ts, owner.id, ts, ts],
      ),
    ).rejects.toThrow(/total_minor > 0|CHECK/i);

    await expect(
      execute(
        `INSERT INTO ${businessTable("invoice")}
         (id, workspace_id, invoice_number, status, work_order_id, currency,
          total_minor, amount_paid_minor, balance_due_minor, issued_at,
          created_by, created_at, updated_at)
         VALUES (?, ?, 'INV-TEST-002', 'issued', 'test-wo2', 'USD',
                 -100, 0, -100, ?, ?, ?, ?)`,
        [genId("inv"), workspaceId, ts, ts, owner.id, ts, ts],
      ),
    ).rejects.toThrow(/total_minor > 0|CHECK/i);
  });

  it("rejects invoice with amount_paid_minor > total_minor", async () => {
    const ts = now();
    await expect(
      execute(
        `INSERT INTO ${businessTable("invoice")}
         (id, workspace_id, invoice_number, status, work_order_id, currency,
          total_minor, amount_paid_minor, balance_due_minor, issued_at,
          created_by, created_at, updated_at)
         VALUES (?, ?, 'INV-TEST-003', 'issued', 'test-wo3', 'USD',
                 10000, 20000, 0, ?, ?, ?, ?)`,
        [genId("inv"), workspaceId, ts, ts, owner.id, ts, ts],
      ),
    ).rejects.toThrow(/amount_paid_minor|CHECK/i);
  });

  it("rejects invoice with balance_due_minor > total_minor", async () => {
    const ts = now();
    await expect(
      execute(
        `INSERT INTO ${businessTable("invoice")}
         (id, workspace_id, invoice_number, status, work_order_id, currency,
          total_minor, amount_paid_minor, balance_due_minor, issued_at,
          created_by, created_at, updated_at)
         VALUES (?, ?, 'INV-TEST-004', 'issued', 'test-wo4', 'USD',
                 10000, 0, 20000, ?, ?, ?, ?)`,
        [genId("inv"), workspaceId, ts, ts, owner.id, ts, ts],
      ),
    ).rejects.toThrow(/balance_due_minor|CHECK/i);
  });

  it("rejects duplicate invoice_number for same workspace", async () => {
    const ts = now();
    const invNumber = "INV-DUP-001";
    // First insert succeeds
    await execute(
      `INSERT INTO ${businessTable("invoice")}
       (id, workspace_id, invoice_number, status, work_order_id, currency,
        total_minor, amount_paid_minor, balance_due_minor, issued_at,
        created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'issued', 'test-wo-dup1', 'USD',
               10000, 0, 10000, ?, ?, ?, ?)`,
      [genId("inv"), workspaceId, invNumber, ts, ts, owner.id, ts, ts],
    );
    // Second insert with same invoice_number fails
    await expect(
      execute(
        `INSERT INTO ${businessTable("invoice")}
         (id, workspace_id, invoice_number, status, work_order_id, currency,
          total_minor, amount_paid_minor, balance_due_minor, issued_at,
          created_by, created_at, updated_at)
         VALUES (?, ?, ?, 'issued', 'test-wo-dup2', 'USD',
                 20000, 0, 20000, ?, ?, ?, ?)`,
        [genId("inv"), workspaceId, invNumber, ts, ts, owner.id, ts, ts],
      ),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it("rejects duplicate invoice for same work_order_id", async () => {
    const ts = now();
    const woId = "test-wo-unique-inv";
    // First invoice for this work_order
    await execute(
      `INSERT INTO ${businessTable("invoice")}
       (id, workspace_id, invoice_number, status, work_order_id, currency,
        total_minor, amount_paid_minor, balance_due_minor, issued_at,
        created_by, created_at, updated_at)
       VALUES (?, ?, 'INV-WO-001', 'issued', ?, 'USD',
               10000, 0, 10000, ?, ?, ?, ?)`,
      [genId("inv"), workspaceId, woId, ts, ts, owner.id, ts, ts],
    );
    // Second invoice for same work_order fails
    await expect(
      execute(
        `INSERT INTO ${businessTable("invoice")}
         (id, workspace_id, invoice_number, status, work_order_id, currency,
          total_minor, amount_paid_minor, balance_due_minor, issued_at,
          created_by, created_at, updated_at)
         VALUES (?, ?, 'INV-WO-002', 'issued', ?, 'USD',
                 20000, 0, 20000, ?, ?, ?, ?)`,
        [genId("inv"), workspaceId, woId, ts, ts, owner.id, ts, ts],
      ),
    ).rejects.toThrow(/UNIQUE/i);
  });

  // ── payment UNIQUE constraint ──

  it("rejects duplicate payment with same provider/provider_payment_id", async () => {
    const ts = now();
    const providerPaymentId = "pi_test_dup_001";
    // Create a payment_request first (uses amount_due_minor and requires number)
    await execute(
      `INSERT INTO ${businessTable("payment_request")}
       (id, workspace_id, number, source_object_type, source_object_id, purpose,
        amount_due_minor, currency, provider_account_id, status,
        aggregate_version, created_at, updated_at)
       VALUES (?, ?, 'PREQ-DUP-001', 'invoice', 'test-inv-pay', 'final',
               10000, 'USD', 'test-acct', 'pending',
               1, ?, ?)`,
      [genId("preq"), workspaceId, ts, ts],
    );
    // First payment succeeds
    await execute(
      `INSERT INTO ${businessTable("payment")}
       (id, workspace_id, payment_request_id, status, amount_minor,
        refunded_amount_minor, currency, provider, provider_account_id,
        provider_payment_id, aggregate_version, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 10000, 0, 'USD', 'stripe',
               'test-acct', ?, 1, ?, ?)`,
      [genId("pay"), workspaceId, "test-preq-ref", providerPaymentId, ts, ts],
    );
    // Second payment with same provider_payment_id fails
    await expect(
      execute(
        `INSERT INTO ${businessTable("payment")}
         (id, workspace_id, payment_request_id, status, amount_minor,
          refunded_amount_minor, currency, provider, provider_account_id,
          provider_payment_id, aggregate_version, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', 5000, 0, 'USD', 'stripe',
                 'test-acct', ?, 1, ?, ?)`,
        [genId("pay"), workspaceId, "test-preq-ref2", providerPaymentId, ts, ts],
      ),
    ).rejects.toThrow(/UNIQUE/i);
  });
});

// ════════════════════════════════════════════════════════════════════
// §2  aggregate_version DB Persistence
// ════════════════════════════════════════════════════════════════════

describe("§2 aggregate_version DB Persistence", () => {
  let workspaceId: string;
  let companyId: string;
  let contactId: string;
  let quoteId: string;
  let technicianUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    // Create a user for the owner
    const ts = now();
    technicianUserId = genId("usr");
    await execute(
      `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at)
       VALUES (?, 'di-test-owner', 'DI Test Owner', 'active', ?, ?)`,
      [technicianUserId, ts, ts],
    );
    // Create a user matching the global `owner` actor and grant workspace access
    await execute(
      `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at)
       VALUES ('di-owner', 'di-owner', 'DI Owner', 'active', ?, ?)`,
      [ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaceMemberships}
       (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, 'di-owner', 'admin', 'active', ?, ?)`,
      [genId("wsmem"), workspaceId, ts, ts],
    );

    // Create company
    const company = await createRecord(workspaceId, "company", {
      name: "DI Test Company",
      status: "active",
    });
    companyId = company.id;

    // Create contact
    const contact = await createRecord(workspaceId, "contact", {
      name: "DI Contact",
      primary_company_id: companyId,
      status: "active",
    });
    contactId = contact.id;

    // Create quote with line items
    const quote = await createRecord(workspaceId, "quote", {
      quote_number: "Q-DI-002",
      company_id: companyId,
      contact_id: contactId,
      title: "DI Test Quote",
      status: "draft",
      currency: "USD",
      subtotal: 0,
      discount_total: 0,
      tax_total: 0,
      grand_total: 0,
    });
    quoteId = quote.id;

    await createRecord(workspaceId, "quote_line", {
      quote_id: quoteId,
      description: "DI Test Line",
      quantity: 2,
      unit_price: 4000,
      sort_order: 1,
    });
  });

  it("persists aggregate_version=1 after initial create (direct DB)", async () => {
    const row = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );
    expect(row?.aggregate_version).toBe(1);
  });

  it("increments aggregate_version in DB after recalculateQuoteCommand", async () => {
    const before = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );
    const result = await recalculateQuoteCommand(workspaceId, quoteId, owner, 1);
    expect(result.newVersion).toBe(before!.aggregate_version + 1);

    // Verify the DB value matches the return value
    const after = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );
    expect(after?.aggregate_version).toBe(result.newVersion);
    expect(after?.aggregate_version).toBe(before!.aggregate_version + 1);
  });

  it("increments aggregate_version in DB after each lifecycle command", async () => {
    const versionBefore = (
      await queryOne<{ aggregate_version: number }>(
        `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
        [quoteId],
      )
    )!.aggregate_version;

    // submit
    const submitResult = await submitForApproval(workspaceId, quoteId, owner, versionBefore);
    const dbAfterSubmit = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );
    expect(dbAfterSubmit?.aggregate_version).toBe(submitResult.newVersion);
    expect(dbAfterSubmit?.aggregate_version).toBe(versionBefore + 1);

    // approve
    const approveResult = await approveQuote(workspaceId, quoteId, owner, submitResult.newVersion);
    const dbAfterApprove = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );
    expect(dbAfterApprove?.aggregate_version).toBe(approveResult.newVersion);
    expect(dbAfterApprove?.aggregate_version).toBe(versionBefore + 2);

    // mark sent
    const sentResult = await markSent(workspaceId, quoteId, owner, approveResult.newVersion);
    const dbAfterSent = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );
    expect(dbAfterSent?.aggregate_version).toBe(sentResult.newVersion);
    expect(dbAfterSent?.aggregate_version).toBe(versionBefore + 3);

    // accept
    const acceptResult = await acceptQuote(workspaceId, quoteId, owner, sentResult.newVersion);
    const dbAfterAccept = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );
    expect(dbAfterAccept?.aggregate_version).toBe(acceptResult.newVersion);
    expect(dbAfterAccept?.aggregate_version).toBe(versionBefore + 4);
  });
});

// ════════════════════════════════════════════════════════════════════
// §3  Audit Log Chain Completeness
// ════════════════════════════════════════════════════════════════════

describe("§3 Audit Log Chain Completeness", () => {
  let workspaceId: string;
  let companyId: string;
  let quoteId: string;

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const ts = now();
    const userId = genId("usr");
    await execute(
      `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at)
       VALUES (?, 'di-audit-owner', 'DI Audit Owner', 'active', ?, ?)`,
      [userId, ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaceMemberships}
       (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      [genId("wsmem"), workspaceId, userId, ts, ts],
    );

    const company3 = await createRecord(workspaceId, "company", {
      name: "DI Audit Company",
      status: "active",
    });
    companyId = company3.id;

    const quote3 = await createRecord(workspaceId, "quote", {
      quote_number: "Q-DI-003",
      company_id: companyId,
      title: "DI Audit Quote",
      status: "draft",
      currency: "USD",
      subtotal: 0,
      discount_total: 0,
      tax_total: 0,
      grand_total: 0,
    });
    quoteId = quote3.id;

    await createRecord(workspaceId, "quote_line", {
      quote_id: quoteId,
      description: "Audit Line",
      quantity: 1,
      unit_price: 5000,
      sort_order: 1,
    });

    const actor: CommandActor = { type: "user", id: userId };
    await recalculateQuoteCommand(workspaceId, quoteId, actor, 1);
    await submitForApproval(workspaceId, quoteId, actor, 2);
    await approveQuote(workspaceId, quoteId, actor, 3);
  });

  it("creates an audit_log entry for each business command", async () => {
    const auditEntries = await queryAll<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      actor_type: string;
      actor_id: string;
    }>(
      `SELECT id, action, entity_type, entity_id, actor_type, actor_id
       FROM ${TABLES.auditLogs}
       WHERE workspace_id = ? AND entity_type = 'quote' AND entity_id = ?
       ORDER BY created_at ASC`,
      [workspaceId, quoteId],
    );

    expect(auditEntries.length).toBeGreaterThanOrEqual(3);

    const actions = auditEntries.map((e) => e.action);
    expect(actions).toContain("quote.recalculate");
    expect(actions).toContain("quote.submit_for_approval");
    expect(actions).toContain("quote.approve");

    // Every audit entry must identify the actor
    for (const entry of auditEntries) {
      expect(entry.actor_type).toBe("user");
      expect(entry.actor_id).toBeTruthy();
    }
  });

  it("audit_log entries have valid timestamps", async () => {
    const entries = await queryAll<{ created_at: string; action: string }>(
      `SELECT created_at, action FROM ${TABLES.auditLogs}
       WHERE workspace_id = ? AND entity_type = 'quote' AND entity_id = ?
       ORDER BY created_at ASC`,
      [workspaceId, quoteId],
    );

    expect(entries.length).toBeGreaterThanOrEqual(3);

    // Timestamps must be parseable and non-empty
    for (const entry of entries) {
      const parsed = new Date(entry.created_at);
      expect(isNaN(parsed.getTime())).toBe(false);
      expect(entry.created_at).toBeTruthy();
    }

    // Timestamps must be non-decreasing
    for (let i = 1; i < entries.length; i++) {
      const prev = new Date(entries[i - 1].created_at).getTime();
      const curr = new Date(entries[i].created_at).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// §4  Outbox Message Lifecycle
// ════════════════════════════════════════════════════════════════════

describe("§4 Outbox Message Lifecycle", () => {
  let workspaceId: string;

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
  });

  it("enqueues a message with status=pending and attempts=0", async () => {
    const msgId = await enqueueOutboxMessage(
      workspaceId,
      "test.di.created",
      { test: true, value: 42 },
    );

    const row = await queryOne<{
      status: string;
      attempts: number;
      message_type: string;
      payload_json: string;
      delivered_at: string | null;
      next_attempt_at: string | null;
    }>(
      `SELECT status, attempts, message_type, payload_json,
              delivered_at, next_attempt_at
       FROM ${TABLES.outboxMessages} WHERE id = ?`,
      [msgId],
    );

    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
    expect(row?.message_type).toBe("test.di.created");
    expect(JSON.parse(row!.payload_json)).toEqual({ test: true, value: 42 });
    expect(row?.delivered_at).toBeNull();
    expect(row?.next_attempt_at).toBeTruthy(); // set to created_at
  });

  it("transitions pending → processing → delivered through claim and mark", async () => {
    const msgId = await enqueueOutboxMessage(workspaceId, "test.di.deliver", {});

    // Claim
    const claimed = await claimOutboxMessage(workspaceId, msgId);
    expect(claimed).not.toBeNull();
    expect(claimed!.status).toBe("processing");

    // Verify DB state
    const processingRow = await queryOne<{ status: string; locked_at: string }>(
      `SELECT status, locked_at FROM ${TABLES.outboxMessages} WHERE id = ?`,
      [msgId],
    );
    expect(processingRow?.status).toBe("processing");
    expect(processingRow?.locked_at).toBeTruthy();

    // Mark delivered
    await markOutboxDelivered(workspaceId, msgId);

    const deliveredRow = await queryOne<{
      status: string;
      delivered_at: string;
      locked_at: string | null;
      next_attempt_at: string | null;
      last_error: string | null;
    }>(
      `SELECT status, delivered_at, locked_at, next_attempt_at, last_error
       FROM ${TABLES.outboxMessages} WHERE id = ?`,
      [msgId],
    );

    expect(deliveredRow?.status).toBe("delivered");
    expect(deliveredRow?.delivered_at).toBeTruthy();
    expect(deliveredRow?.locked_at).toBeNull();
    expect(deliveredRow?.next_attempt_at).toBeNull();
    expect(deliveredRow?.last_error).toBeNull();
  });

  it("transitions to failed with exponential backoff after failure", async () => {
    const msgId = await enqueueOutboxMessage(workspaceId, "test.di.fail", {});

    // Claim and fail first attempt
    await claimOutboxMessage(workspaceId, msgId);
    await markOutboxFailed(workspaceId, msgId, "TRANSIENT_ERROR");

    const failedRow = await queryOne<{
      status: string;
      attempts: number;
      last_error: string;
      next_attempt_at: string;
    }>(
      `SELECT status, attempts, last_error, next_attempt_at
       FROM ${TABLES.outboxMessages} WHERE id = ?`,
      [msgId],
    );

    expect(failedRow?.status).toBe("failed");
    expect(failedRow?.attempts).toBe(1);
    expect(failedRow?.last_error).toBe("TRANSIENT_ERROR");
    expect(failedRow?.next_attempt_at).toBeTruthy();
  });

  it("escalates to dead_letter after maxAttempts failures", async () => {
    const msgId = await enqueueOutboxMessage(workspaceId, "test.di.deadletter", {});

    // Fail 5 times to trigger dead_letter.
    // Use a future claimedAt to bypass exponential backoff (next_attempt_at
    // is set to failedAt + 2^(attempts-1) * 30s on each failure, so each
    // subsequent claim must use a timestamp well past that delay).
    // Using 600s (10 min) per iteration ensures the claim timestamp always
    // exceeds the accumulated backoff (max 240s after attempt 4).
    for (let i = 0; i < 5; i++) {
      const futureClaimedAt = new Date(
        Date.now() + (i + 1) * 600_000,
      ).toISOString();
      await claimOutboxMessage(workspaceId, msgId, futureClaimedAt);
      await markOutboxFailed(workspaceId, msgId, `ERROR_${i}`, {
        maxAttempts: 5,
        failedAt: futureClaimedAt,
      });
    }

    const deadRow = await queryOne<{
      status: string;
      attempts: number;
      next_attempt_at: string | null;
    }>(
      `SELECT status, attempts, next_attempt_at
       FROM ${TABLES.outboxMessages} WHERE id = ?`,
      [msgId],
    );

    expect(deadRow?.status).toBe("dead_letter");
    expect(deadRow?.attempts).toBe(5);
    expect(deadRow?.next_attempt_at).toBeNull();
  });

  it("retries a failed message back to pending", async () => {
    const msgId = await enqueueOutboxMessage(workspaceId, "test.di.retry", {});

    await claimOutboxMessage(workspaceId, msgId);
    await markOutboxFailed(workspaceId, msgId, "RETRYABLE_ERROR");

    const ok = await retryOutboxMessage(workspaceId, msgId);
    expect(ok).toBe(true);

    const retriedRow = await queryOne<{
      status: string;
      last_error: string | null;
      locked_at: string | null;
    }>(
      `SELECT status, last_error, locked_at
       FROM ${TABLES.outboxMessages} WHERE id = ?`,
      [msgId],
    );

    expect(retriedRow?.status).toBe("pending");
    expect(retriedRow?.last_error).toBeNull();
    expect(retriedRow?.locked_at).toBeNull();
  });

  it("does not claim an already-delivered message", async () => {
    const msgId = await enqueueOutboxMessage(workspaceId, "test.di.nodouble", {});

    await claimOutboxMessage(workspaceId, msgId);
    await markOutboxDelivered(workspaceId, msgId);

    // Attempt to claim again — should return null
    const reClaimed = await claimOutboxMessage(workspaceId, msgId);
    expect(reClaimed).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// §5  Timestamp Auto-population and Refresh
// ════════════════════════════════════════════════════════════════════

describe("§5 Timestamp Auto-population and Refresh", () => {
  let workspaceId: string;
  let companyId: string;
  let quoteId: string;

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const ts = now();
    const userId = genId("usr");
    await execute(
      `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at)
       VALUES (?, 'di-ts-owner', 'DI Timestamp Owner', 'active', ?, ?)`,
      [userId, ts, ts],
    );
    // Create a user matching the global `owner` actor and grant workspace access
    await execute(
      `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at)
       VALUES ('di-owner', 'di-owner', 'DI Owner', 'active', ?, ?)`,
      [ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaceMemberships}
       (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, 'di-owner', 'admin', 'active', ?, ?)`,
      [genId("wsmem"), workspaceId, ts, ts],
    );

    const company5 = await createRecord(workspaceId, "company", {
      name: "DI Timestamp Company",
      status: "active",
    });
    companyId = company5.id;

    const quote5 = await createRecord(workspaceId, "quote", {
      quote_number: "Q-DI-005",
      company_id: companyId,
      title: "DI Timestamp Quote",
      status: "draft",
      currency: "USD",
      subtotal: 0,
      discount_total: 0,
      tax_total: 0,
      grand_total: 0,
    });
    quoteId = quote5.id;
  });

  it("sets created_at and updated_at on record creation", async () => {
    const row = await queryOne<{ created_at: string; updated_at: string }>(
      `SELECT created_at, updated_at FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );

    expect(row?.created_at).toBeTruthy();
    expect(row?.updated_at).toBeTruthy();

    // Both must be valid ISO timestamps
    expect(isNaN(new Date(row!.created_at).getTime())).toBe(false);
    expect(isNaN(new Date(row!.updated_at).getTime())).toBe(false);

    // updated_at should be >= created_at
    expect(new Date(row!.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(row!.created_at).getTime(),
    );
  });

  it("refreshes updated_at after a command modifies the record", async () => {
    const beforeRow = await queryOne<{ updated_at: string; created_at: string }>(
      `SELECT updated_at, created_at FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );

    // Small delay to ensure timestamp can differ
    await new Promise((resolve) => setTimeout(resolve, 10));

    await recalculateQuoteCommand(workspaceId, quoteId, owner, 1);

    const afterRow = await queryOne<{ updated_at: string; created_at: string }>(
      `SELECT updated_at, created_at FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );

    expect(new Date(afterRow!.updated_at).getTime()).toBeGreaterThan(
      new Date(beforeRow!.updated_at).getTime(),
    );

    // created_at must not change
    const createdRow = await queryOne<{ created_at: string }>(
      `SELECT created_at FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );
    expect(createdRow?.created_at).toBe(beforeRow?.created_at ?? createdRow?.created_at);
  });
});

// ════════════════════════════════════════════════════════════════════
// §6  Cross-Table Reference Chain Integrity
// ════════════════════════════════════════════════════════════════════

describe("§6 Cross-Table Reference Chain Integrity", () => {
  let workspaceId: string;
  let companyId: string;
  let quoteId: string;
  let workOrderId: string;
  let invoiceId: string;

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const ts = now();
    const userId = genId("usr");
    await execute(
      `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at)
       VALUES (?, 'di-ref-owner', 'DI Ref Owner', 'active', ?, ?)`,
      [userId, ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaceMemberships}
       (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      [genId("wsmem"), workspaceId, userId, ts, ts],
    );

    const actor: CommandActor = { type: "user", id: userId };

    // Get a dispatchable technician from demo data
    const dispatchableTech = await queryOne<{ id: string; resource_id: string }>(
      `SELECT id, resource_id FROM ${businessTable("technician")}
       WHERE workspace_id = ? AND resource_id IS NOT NULL
       LIMIT 1`,
      [workspaceId],
    );

    const company6 = await createRecord(workspaceId, "company", {
      name: "DI Ref Company",
      status: "active",
    });
    companyId = company6.id;

    const contact6 = await createRecord(workspaceId, "contact", {
      name: "DI RefContact",
      primary_company_id: companyId,
      status: "active",
    });
    const contactId = contact6.id;

    const quote6 = await createRecord(workspaceId, "quote", {
      quote_number: "Q-DI-006",
      company_id: companyId,
      contact_id: contactId,
      title: "DI Ref Quote",
      status: "draft",
      currency: "USD",
      subtotal: 0,
      discount_total: 0,
      tax_total: 0,
      grand_total: 0,
    });
    quoteId = quote6.id;

    await createRecord(workspaceId, "quote_line", {
      quote_id: quoteId,
      description: "Ref Line",
      quantity: 1,
      unit_price: 10000,
      sort_order: 1,
    });

    await recalculateQuoteCommand(workspaceId, quoteId, actor, 1);
    await submitForApproval(workspaceId, quoteId, actor, 2);
    await approveQuote(workspaceId, quoteId, actor, 3);
    await markSent(workspaceId, quoteId, actor, 4);
    await acceptQuote(workspaceId, quoteId, actor, 5);
    const convertResult = await convertToWorkOrder(workspaceId, quoteId, actor, 6);
    workOrderId = convertResult.aggregate.work_order_id!;

    // Complete the work order through the lifecycle
    await triageWorkOrder(workspaceId, workOrderId, actor, 1);
    // For a minimal completion, we need to get the work order to completed
    // We'll use the visit lifecycle
    await createVisit(workspaceId, workOrderId, actor, 2, {
      technicianId: dispatchableTech!.id,
      scheduledStart: "2026-08-01T09:00:00Z",
      scheduledEnd: "2026-08-01T11:00:00Z",
    });
    await startWorkOrder(workspaceId, workOrderId, actor, 3);
    // createVisit returns the work order as aggregate, not the visit.
    // Query the service_visit table to get the visit ID.
    const visit6 = await queryOne<{ id: string }>(
      `SELECT id FROM ${businessTable("service_visit")} WHERE workspace_id = ? AND work_order_id = ?`,
      [workspaceId, workOrderId],
    );
    expect(visit6).toBeDefined();
    const visitId6 = visit6!.id;
    await startTravel(workspaceId, visitId6, actor, 1);
    await arriveOnSite(workspaceId, visitId6, actor, 2);
    await submitWork(workspaceId, visitId6, actor, 3);
    // submitWork does not increment the visit version (stays at 3).
    // completeVisit requires a submitted form matching the visit execution
    // requirement snapshot — submit it before completion.
    await submitVisitCompletionForm(workspaceId, visitId6, actor.id);
    await completeVisit(workspaceId, visitId6, actor, 3);
    await completeWorkOrder(workspaceId, workOrderId, actor, 4, "DI ref test completed");

    // Issue invoice
    const invoiceResult = await issueInvoiceFromWorkOrder(
      workspaceId, workOrderId, actor,
      { dueAt: "2026-12-31T00:00:00.000Z" },
      "di-ref-invoice",
    );
    invoiceId = invoiceResult.aggregate.id;
  });

  it("Quote → Work Order: work_order.source_id references quote.id", async () => {
    const wo = await queryOne<{ source_type: string; source_id: string }>(
      `SELECT source_type, source_id FROM ${businessTable("work_order")} WHERE id = ?`,
      [workOrderId],
    );
    expect(wo?.source_type).toBe("quote");
    expect(wo?.source_id).toBe(quoteId);
  });

  it("Invoice → Work Order → Quote: full chain resolves via DB JOIN", async () => {
    const chain = await queryOne<{
      invoice_id: string;
      work_order_id: string;
      quote_id: string;
      company_id: string;
    }>(
      `SELECT i.id AS invoice_id, i.work_order_id, wo.source_id AS quote_id, wo.company_id
       FROM ${businessTable("invoice")} i
       JOIN ${businessTable("work_order")} wo ON i.work_order_id = wo.id
       WHERE i.id = ? AND i.workspace_id = ?`,
      [invoiceId, workspaceId],
    );

    expect(chain).toBeDefined();
    expect(chain?.work_order_id).toBe(workOrderId);
    expect(chain?.quote_id).toBe(quoteId);
    expect(chain?.company_id).toBe(companyId);
  });

  it("Invoice amount breakdown is stored and consistent", async () => {
    const inv = await queryOne<{
      total_minor: number;
      amount_paid_minor: number;
      balance_due_minor: number;
    }>(
      `SELECT total_minor, amount_paid_minor, balance_due_minor
       FROM ${businessTable("invoice")} WHERE id = ?`,
      [invoiceId],
    );

    expect(inv).toBeDefined();
    // balance_due = total - amount_paid
    expect(inv!.balance_due_minor).toBe(inv!.total_minor - inv!.amount_paid_minor);
    // For an unpaid invoice
    expect(inv!.amount_paid_minor).toBe(0);
    expect(inv!.balance_due_minor).toBe(inv!.total_minor);
  });
});

// ════════════════════════════════════════════════════════════════════
// §7  Cascade Behavior Completeness
// ════════════════════════════════════════════════════════════════════

describe("§7 Cascade Behavior Completeness", () => {
  let workspaceId: string;
  let companyId: string;
  let quoteId: string;
  let workOrderId: string;
  let visitId: string;
  let scheduleEntryId: string;
  let assignmentId: string;

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const ts = now();
    const userId = genId("usr");
    await execute(
      `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at)
       VALUES (?, 'di-cascade-owner', 'DI Cascade Owner', 'active', ?, ?)`,
      [userId, ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaceMemberships}
       (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      [genId("wsmem"), workspaceId, userId, ts, ts],
    );

    const actor: CommandActor = { type: "user", id: userId };

    // Get a dispatchable technician from demo data
    const dispatchableTech7 = await queryOne<{ id: string; resource_id: string }>(
      `SELECT id, resource_id FROM ${businessTable("technician")}
       WHERE workspace_id = ? AND resource_id IS NOT NULL
       LIMIT 1`,
      [workspaceId],
    );

    const company7 = await createRecord(workspaceId, "company", {
      name: "DI Cascade Company",
      status: "active",
    });
    companyId = company7.id;

    const contact7 = await createRecord(workspaceId, "contact", {
      name: "DI Cascade",
      primary_company_id: companyId,
      status: "active",
    });
    const contactId = contact7.id;

    const quote7 = await createRecord(workspaceId, "quote", {
      quote_number: "Q-DI-007",
      company_id: companyId,
      contact_id: contactId,
      title: "DI Cascade Quote",
      status: "draft",
      currency: "USD",
      subtotal: 0,
      discount_total: 0,
      tax_total: 0,
      grand_total: 0,
    });
    quoteId = quote7.id;

    await createRecord(workspaceId, "quote_line", {
      quote_id: quoteId,
      description: "Cascade Line",
      quantity: 1,
      unit_price: 8000,
      sort_order: 1,
    });

    await recalculateQuoteCommand(workspaceId, quoteId, actor, 1);
    await submitForApproval(workspaceId, quoteId, actor, 2);
    await approveQuote(workspaceId, quoteId, actor, 3);
    await markSent(workspaceId, quoteId, actor, 4);
    await acceptQuote(workspaceId, quoteId, actor, 5);
    const convertResult = await convertToWorkOrder(workspaceId, quoteId, actor, 6);
    workOrderId = convertResult.aggregate.work_order_id!;

    await triageWorkOrder(workspaceId, workOrderId, actor, 1);
    await createVisit(workspaceId, workOrderId, actor, 2, {
      technicianId: dispatchableTech7!.id,
      scheduledStart: "2026-08-01T09:00:00Z",
      scheduledEnd: "2026-08-01T11:00:00Z",
    });

    // createVisit returns the work order as aggregate, not the visit.
    // Query the service_visit table to get the visit ID and linked records.
    const visit7 = await queryOne<{
      id: string;
      assignment_id: string;
      schedule_entry_id: string;
    }>(
      `SELECT id, assignment_id, schedule_entry_id FROM ${businessTable("service_visit")} WHERE workspace_id = ? AND work_order_id = ?`,
      [workspaceId, workOrderId],
    );
    expect(visit7).toBeDefined();
    visitId = visit7!.id;
    assignmentId = visit7!.assignment_id ?? "";
    scheduleEntryId = visit7!.schedule_entry_id ?? "";

    await startWorkOrder(workspaceId, workOrderId, actor, 3);
    await startTravel(workspaceId, visitId, actor, 1);
    await arriveOnSite(workspaceId, visitId, actor, 2);
    await submitWork(workspaceId, visitId, actor, 3);
    // submitWork does not increment the visit version (stays at 3).
    // completeVisit requires a submitted form matching the visit execution
    // requirement snapshot — submit it before completion.
    await submitVisitCompletionForm(workspaceId, visitId, actor.id);
    await completeVisit(workspaceId, visitId, actor, 3);
    await completeWorkOrder(workspaceId, workOrderId, actor, 4, "DI cascade test");
  });

  it("Visit completion cascades to schedule_entry status=completed", async () => {
    const schedule = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.scheduleEntries} WHERE id = ?`,
      [scheduleEntryId],
    );
    expect(schedule?.status).toBe("completed");
  });

  it("all schedule_entries linked to the work order's visits are completed", async () => {
    // completeWorkOrder does not directly cascade to schedule_entries, but
    // completeVisit (which runs first) does. Verify that every schedule entry
    // linked to any service_visit belonging to this work order is completed.
    const visitSchedules = await queryAll<{ status: string }>(
      `SELECT se.status
       FROM ${TABLES.scheduleEntries} se
       JOIN ${businessTable("service_visit")} sv
         ON se.subject_id = sv.id AND se.subject_type = 'service_visit'
       WHERE se.workspace_id = ? AND sv.work_order_id = ?`,
      [workspaceId, workOrderId],
    );

    expect(visitSchedules.length).toBeGreaterThan(0);
    for (const sch of visitSchedules) {
      expect(sch.status).toBe("completed");
    }
  });

  it("assignment record remains intact and references the correct resource", async () => {
    // The assignment lifecycle is independent of work_order.completion — the
    // assignment is not automatically closed. Data integrity means the record
    // is still valid and internally consistent.
    const assignment = await queryOne<{ status: string; resource_id: string }>(
      `SELECT status, resource_id FROM ${TABLES.assignments} WHERE id = ?`,
      [assignmentId],
    );
    expect(assignment).toBeDefined();
    expect(assignment!.status).toBe("assigned");
    expect(assignment!.resource_id).toBeTruthy();
  });

  it("Visit status is completed after Work Order completion", async () => {
    const visit = await queryOne<{ status: string }>(
      `SELECT status FROM ${businessTable("service_visit")} WHERE id = ?`,
      [visitId],
    );
    expect(visit?.status).toBe("completed");
  });

  it("Work Order status is completed with completion reason recorded", async () => {
    const wo = await queryOne<{
      status: string;
      completion_reason: string | null;
    }>(
      `SELECT status, completion_reason FROM ${businessTable("work_order")} WHERE id = ?`,
      [workOrderId],
    );
    expect(wo?.status).toBe("completed");
    expect(wo?.completion_reason).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════
// §8  Idempotency at the DB Row Level
// ════════════════════════════════════════════════════════════════════

describe("§8 Idempotency at the DB Row Level", () => {
  let workspaceId: string;
  let companyId: string;
  let quoteId: string;

  beforeAll(async () => {
    await resetDatabase();
    workspaceId = await createTestWorkspace();
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const ts = now();
    const userId = genId("usr");
    await execute(
      `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at)
       VALUES (?, 'di-idem-owner', 'DI Idempotency Owner', 'active', ?, ?)`,
      [userId, ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaceMemberships}
       (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      [genId("wsmem"), workspaceId, userId, ts, ts],
    );

    const actor: CommandActor = { type: "user", id: userId };

    const company8 = await createRecord(workspaceId, "company", {
      name: "DI Idempotency Company",
      status: "active",
    });
    companyId = company8.id;

    const quote8 = await createRecord(workspaceId, "quote", {
      quote_number: "Q-DI-008",
      company_id: companyId,
      title: "DI Idempotency Quote",
      status: "draft",
      currency: "USD",
      subtotal: 0,
      discount_total: 0,
      tax_total: 0,
      grand_total: 0,
    });
    quoteId = quote8.id;

    await createRecord(workspaceId, "quote_line", {
      quote_id: quoteId,
      description: "Idem Line",
      quantity: 1,
      unit_price: 10000,
      sort_order: 1,
    });

    await recalculateQuoteCommand(workspaceId, quoteId, actor, 1);
    await submitForApproval(workspaceId, quoteId, actor, 2);
    await approveQuote(workspaceId, quoteId, actor, 3);
    await markSent(workspaceId, quoteId, actor, 4);
    await acceptQuote(workspaceId, quoteId, actor, 5);
  });

  it("convertToWorkOrder with same commandId does not create duplicate rows", async () => {
    const actor: CommandActor = { type: "user", id: "di-idem-owner" };
    const commandId = "di-idem-convert-001";

    const firstResult = await convertToWorkOrder(
      workspaceId, quoteId, actor, 6, commandId,
    );
    const firstWoId = firstResult.aggregate.work_order_id!;

    // Retry with same commandId
    const secondResult = await convertToWorkOrder(
      workspaceId, quoteId, actor, 6, commandId,
    );

    // Should return the same work order ID
    expect(secondResult.aggregate.work_order_id).toBe(firstWoId);

    // Verify DB has exactly one work_order row for this quote
    const count = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM ${businessTable("work_order")}
       WHERE workspace_id = ? AND source_id = ? AND source_type = 'quote'`,
      [workspaceId, quoteId],
    );
    expect(count?.cnt).toBe(1);
  });

  it("quote aggregate_version does not increment on idempotent retry", async () => {
    const actor: CommandActor = { type: "user", id: "di-idem-owner" };
    const commandId = "di-idem-convert-002";

    // First conversion (quote version is 7 after the previous test incremented it)
    const firstResult = await convertToWorkOrder(
      workspaceId, quoteId, actor, 7, commandId,
    );

    // Get quote version after first conversion
    const quoteAfterFirst = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );

    // Retry with same commandId
    await convertToWorkOrder(workspaceId, quoteId, actor, 7, commandId);

    // Get quote version after retry
    const quoteAfterRetry = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${businessTable("quote")} WHERE id = ?`,
      [quoteId],
    );

    // Version must not have changed
    expect(quoteAfterRetry?.aggregate_version).toBe(quoteAfterFirst?.aggregate_version);
  });
});
