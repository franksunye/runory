// ── Customer Access Commands Test Matrix (v0.8 Tech Spec §14.3) ──
//
// Implements the full §14.3 customer commands test matrix:
//   1. Customer cannot execute a Contract that omits `customer` actor
//   2. Grant capability and aggregate/root checks are both required
//   3. Duplicate Quote acceptance returns the same outcome
//   4. Stale expected version returns conflict without state change
//   5. Checkout derives exact Invoice balance/currency and reuses an open request
//   6. Overpayment, void/paid Invoice, expired grant, provider mismatch, and wrong Invoice fail
//   7. Provider webhook still owns Payment success and Invoice allocation

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryOne, queryAll, batch } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installModule, loadModuleManifest } from "./installer";
import { repairWorkspaceCommandContracts } from "./command-contract-repair";
import {
  issueCustomerAccessGrant,
  revokeCustomerAccessGrant,
  type CustomerAccessGrantRecord,
} from "./customer-access-commands";
import {
  exchangeCustomerAccessToken,
  resolveCustomerAccessSession,
  createCustomerAccessSession,
} from "./customer-access-session";
import {
  resolveCustomerQuoteAccept,
  resolveCustomerInvoiceCheckout,
  authorizeCustomerCommandActor,
} from "./command-contracts/customer-authorization";
import {
  acceptQuote,
  submitForApproval,
  approveQuote,
} from "./quote-commands";
import {
  requestPayment,
  upsertPaymentProviderAccount,
  applyProviderPaymentEvent,
} from "./payment-commands";
import { executeCommand, type CommandActor } from "./command-runtime";
import { BusinessError } from "./context";
import type { CommandContract, CustomerAccessCapability } from "@runory/contracts";

// ── Data directory ──

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Session secret management ──

const TEST_SECRET = "customer-access-commands-test-secret-32+!";
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
  invoiceId: string;
  providerAccountId: string;
  expiresAt: string;
}

const PUBLIC_BASE_URL = "https://access.test.example.com";
const PROVIDER_ACCOUNT_ID = "provider_account_stripe_test";
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
    [
      workspaceId,
      `Commands Test WS ${slugSuffix.toUpperCase()}`,
      `cmd-test-${slugSuffix}-${workspaceId.slice(-8)}`,
      ts,
      ts,
    ],
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
  const invoiceId = genId("inv");

  await batch([
    // Company
    {
      sql: `INSERT INTO ${businessTable("company")} (id, workspace_id, name, domain, website, phone, industry, size, source, owner, lifecycle_stage, address, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, 'lead', NULL, NULL, ?, ?)`,
      args: [
        companyId,
        workspaceId,
        `Acme Corp ${slugSuffix.toUpperCase()}`,
        `acme-${slugSuffix}.example.com`,
        userId,
        ts,
        ts,
      ],
    },
    // Contact
    {
      sql: `INSERT INTO ${businessTable("contact")} (id, workspace_id, name, email, phone, title, role, primary_company_id, source, owner, lifecycle_stage, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, NULL, NULL, ?, ?)`,
      args: [
        contactId,
        workspaceId,
        `John Doe ${slugSuffix.toUpperCase()}`,
        `john-${slugSuffix}@example.com`,
        companyId,
        userId,
        ts,
        ts,
      ],
    },
    // Work order
    {
      sql: `INSERT INTO ${businessTable("work_order")} (id, workspace_id, title, description, status, priority, company_id, contact_id, service_site_id, asset_id, assigned_to, requested_at, scheduled_start, scheduled_end, completed_at, sla_due_at, source, notes, work_order_number, aggregate_version, source_type, source_id, source_snapshot_hash, owner_resource_id, cancelled_at, reopened_at, completion_reason, cancellation_reason, reopen_reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'scheduled', 'medium', ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      args: [
        workOrderId,
        workspaceId,
        "Repair Visit",
        "Fix the widget",
        companyId,
        contactId,
        ts,
        `WO-${slugSuffix.toUpperCase()}-001`,
        ts,
        ts,
      ],
    },
    // Quote (status 'sent', linked to work order, contact, company)
    {
      sql: `INSERT INTO ${businessTable("quote")} (id, workspace_id, quote_number, title, status, version, company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id, currency, subtotal, discount_total, tax_total, grand_total, valid_until, owner, terms, notes, aggregate_version, root_quote_id, previous_version_id, revision_number, price_book_id, approved_at, accepted_at, rejected_reason, return_reason, withdrawn_at, snapshot_hash, locked_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'sent', 1, ?, ?, NULL, ?, NULL, NULL, 'USD', 100, 0, 10, 110, ?, NULL, NULL, NULL, 1, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      args: [
        quoteId,
        workspaceId,
        `Q-${slugSuffix.toUpperCase()}-001`,
        "Repair Quote",
        companyId,
        contactId,
        workOrderId,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ts,
        ts,
      ],
    },
    // Invoice (status 'issued', linked to work order and quote, with balance)
    {
      sql: `INSERT INTO ${businessTable("invoice")} (id, workspace_id, invoice_number, status, work_order_id, quote_id, company_id, contact_id, currency, total_minor, amount_paid_minor, balance_due_minor, issued_at, due_at, paid_at, voided_at, memo, source_snapshot_hash, created_by, aggregate_version, created_at, updated_at)
            VALUES (?, ?, ?, 'issued', ?, ?, ?, ?, 'USD', 10000, 0, 10000, ?, NULL, NULL, NULL, NULL, NULL, ?, 1, ?, ?)`,
      args: [invoiceId, workspaceId, `INV-${slugSuffix.toUpperCase()}-001`, workOrderId, quoteId, companyId, contactId, ts, userId, ts, ts],
    },
  ]);

  // Provider account (Stripe, test mode)
  await upsertPaymentProviderAccount({
    workspaceId,
    id: PROVIDER_ACCOUNT_ID,
    provider: "stripe",
    mode: "test",
    providerAccountRef: "acct_test_runory",
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    workspaceId,
    userId,
    actor,
    companyId,
    contactId,
    quoteId,
    workOrderId,
    invoiceId,
    providerAccountId: PROVIDER_ACCOUNT_ID,
    expiresAt,
  };
}

// ── Helper: issue a grant with specific capabilities ──

async function issueGrant(
  fixture: TestFixture,
  capabilities: CustomerAccessCapability[],
  rootObjectType: "quote" | "work_order" = "quote",
  rootRecordId?: string,
) {
  return issueCustomerAccessGrant(
    fixture.workspaceId,
    fixture.actor,
    {
      subjectType: "contact",
      subjectId: fixture.contactId,
      rootObjectType,
      rootRecordId: rootRecordId ?? fixture.quoteId,
      capabilities,
      expiresAt: fixture.expiresAt,
    },
    PUBLIC_BASE_URL,
  );
}

// ── Shared fixture ──

let fixture: TestFixture;

beforeEach(async () => {
  await resetDatabase();
  fixture = await setupWorkspace();
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.3.1 — Customer cannot execute a Contract that omits `customer` actor
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.3.1 Customer cannot execute a Contract that omits customer actor", () => {
  it("loadModuleManifest reveals quote commands that do not allow customer actors", () => {
    const manifest = loadModuleManifest("runory.quote");
    expect(manifest.domain).toBeDefined();
    const commands = manifest.domain!.commands;

    // quote.accept MUST allow customer
    const acceptCmd = commands.find((c) => c.key === "quote.accept");
    expect(acceptCmd).toBeDefined();
    expect(acceptCmd!.allowedActorTypes).toContain("customer");

    // quote.submit_for_approval MUST NOT allow customer
    const submitCmd = commands.find((c) => c.key === "quote.submit_for_approval");
    expect(submitCmd).toBeDefined();
    expect(submitCmd!.allowedActorTypes).not.toContain("customer");

    // quote.approve MUST NOT allow customer
    const approveCmd = commands.find((c) => c.key === "quote.approve");
    expect(approveCmd).toBeDefined();
    expect(approveCmd!.allowedActorTypes).not.toContain("customer");
  });

  it("loadModuleManifest reveals payment.request allows customer actors", () => {
    const manifest = loadModuleManifest("runory.payment");
    expect(manifest.domain).toBeDefined();
    const commands = manifest.domain!.commands;

    const requestCmd = commands.find((c) => c.key === "payment.request");
    expect(requestCmd).toBeDefined();
    expect(requestCmd!.allowedActorTypes).toContain("customer");
  });

  it("rejects customer actor for quote.submit_for_approval with PERMISSION_DENIED", async () => {
    const { commandResult } = await issueGrant(fixture, ["quote.view", "quote.accept"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    await expect(
      submitForApproval(
        fixture.workspaceId,
        fixture.quoteId,
        customerActor,
        1,
      ),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("rejects customer actor for quote.approve with PERMISSION_DENIED", async () => {
    const { commandResult } = await issueGrant(fixture, ["quote.view", "quote.accept"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    await expect(
      approveQuote(
        fixture.workspaceId,
        fixture.quoteId,
        customerActor,
        1,
      ),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("allows customer actor for quote.accept (quote.accept admits customer)", async () => {
    const { commandResult } = await issueGrant(fixture, ["quote.view", "quote.accept"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    const result = await acceptQuote(
      fixture.workspaceId,
      fixture.quoteId,
      customerActor,
      1,
    );

    expect(result.status).toBe("succeeded");
    expect(result.aggregate.status).toBe("accepted");
    expect(result.newVersion).toBe(2);
  });

  it("allows customer actor for payment.request (payment.request admits customer)", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    const result = await requestPayment(
      fixture.workspaceId,
      {
        sourceObjectType: "invoice",
        sourceObjectId: fixture.invoiceId,
        purpose: "final",
        amountMinor: 10000,
        currency: "USD",
        providerAccountId: fixture.providerAccountId,
        customerContactId: fixture.contactId,
        successUrl: "https://access.test.example.com/success",
        cancelUrl: "https://access.test.example.com/cancel",
      },
      customerActor,
    );

    expect(result.status).toBe("succeeded");
    expect(result.aggregate.status).toBe("open");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.3.2 — Grant capability and aggregate/root checks are both required
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.3.2 Grant capability and aggregate/root checks are both required", () => {
  it("grant with quote.view only (no quote.accept) fails resolveCustomerQuoteAccept", async () => {
    const { commandResult } = await issueGrant(fixture, ["quote.view"]);

    await expect(
      resolveCustomerQuoteAccept(fixture.workspaceId, commandResult.aggregate.id, fixture.quoteId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("grant with quote.accept but quote status is draft fails resolveCustomerQuoteAccept", async () => {
    // Create a draft quote
    const draftQuoteId = genId("qt");
    const ts = now();
    await execute(
      `INSERT INTO ${businessTable("quote")} (id, workspace_id, quote_number, title, status, version, company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id, currency, subtotal, discount_total, tax_total, grand_total, valid_until, owner, terms, notes, aggregate_version, root_quote_id, previous_version_id, revision_number, price_book_id, approved_at, accepted_at, rejected_reason, return_reason, withdrawn_at, snapshot_hash, locked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', 1, ?, ?, NULL, ?, NULL, NULL, 'USD', 100, 0, 10, 110, ?, NULL, NULL, NULL, 1, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      [
        draftQuoteId, fixture.workspaceId, `Q-DRAFT-001`, "Draft Quote",
        fixture.companyId, fixture.contactId, fixture.workOrderId,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ts, ts,
      ],
    );

    const { commandResult } = await issueGrant(fixture, ["quote.accept"], "quote", draftQuoteId);

    await expect(
      resolveCustomerQuoteAccept(fixture.workspaceId, commandResult.aggregate.id, draftQuoteId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("grant with invoice.view only (no invoice.pay) fails resolveCustomerInvoiceCheckout", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view"]);

    await expect(
      resolveCustomerInvoiceCheckout(fixture.workspaceId, commandResult.aggregate.id, fixture.invoiceId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("grant with invoice.pay but invoice status is void fails resolveCustomerInvoiceCheckout", async () => {
    // Void the invoice
    await execute(
      `UPDATE ${businessTable("invoice")} SET status = 'void', voided_at = ? WHERE workspace_id = ? AND id = ?`,
      [now(), fixture.workspaceId, fixture.invoiceId],
    );

    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);

    await expect(
      resolveCustomerInvoiceCheckout(fixture.workspaceId, commandResult.aggregate.id, fixture.invoiceId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("grant root is quote-A but trying to accept quote-B fails (cross-root)", async () => {
    // Create a second sent quote (quote-B)
    const quoteBId = genId("qt");
    const ts = now();
    await execute(
      `INSERT INTO ${businessTable("quote")} (id, workspace_id, quote_number, title, status, version, company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id, currency, subtotal, discount_total, tax_total, grand_total, valid_until, owner, terms, notes, aggregate_version, root_quote_id, previous_version_id, revision_number, price_book_id, approved_at, accepted_at, rejected_reason, return_reason, withdrawn_at, snapshot_hash, locked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'sent', 1, ?, ?, NULL, ?, NULL, NULL, 'USD', 200, 0, 20, 220, ?, NULL, NULL, NULL, 1, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      [
        quoteBId, fixture.workspaceId, `Q-B-001`, "Second Quote",
        fixture.companyId, fixture.contactId, fixture.workOrderId,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ts, ts,
      ],
    );

    // Grant rooted on quote-A (the fixture quote)
    const { commandResult } = await issueGrant(fixture, ["quote.view", "quote.accept"], "quote", fixture.quoteId);

    // Try to accept quote-B with a grant rooted on quote-A
    await expect(
      resolveCustomerQuoteAccept(fixture.workspaceId, commandResult.aggregate.id, quoteBId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("authorizeCustomerCommandActor rejects commands not in the customer-admissible set", async () => {
    const { commandResult } = await issueGrant(fixture, ["quote.view", "quote.accept"]);

    // Construct a contract that does not allow customer (simulating quote.approve)
    const nonCustomerContract: CommandContract = {
      key: "quote.approve",
      contractVersion: "1.0.0",
      aggregate: "quote",
      operation: "transition",
      transition: { from: ["in_review"], to: "approved" },
      permission: "quote.approve",
      requiresReason: false,
      availableWhen: [],
      allowedActorTypes: ["user", "api_key", "system"],
      idempotent: true,
      requiresExpectedVersion: true,
      requiresModules: [],
      requiredEffects: [],
      emits: ["quote.approved"],
      auditRequired: true,
      resultAssertions: [],
      postconditions: ["quote.status == approved"],
    };

    await expect(
      authorizeCustomerCommandActor(fixture.workspaceId, commandResult.aggregate.id, nonCustomerContract),
    ).rejects.toThrow("PERMISSION_DENIED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.3.3 — Duplicate Quote acceptance returns the same outcome
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.3.3 Duplicate Quote acceptance returns the same outcome", () => {
  it("accepting twice with the same commandId returns the same result (idempotent)", async () => {
    const { commandResult } = await issueGrant(fixture, ["quote.view", "quote.accept"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };
    const commandId = "cmd-dup-accept-001";

    // First acceptance
    const first = await acceptQuote(
      fixture.workspaceId,
      fixture.quoteId,
      customerActor,
      1,
      commandId,
    );

    expect(first.status).toBe("succeeded");
    expect(first.aggregate.status).toBe("accepted");
    expect(first.newVersion).toBe(2);

    // Verify quote is accepted after first call
    const quoteAfterFirst = await queryOne<{ status: string; aggregate_version: number }>(
      `SELECT status, aggregate_version FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, fixture.quoteId],
    );
    expect(quoteAfterFirst!.status).toBe("accepted");
    expect(quoteAfterFirst!.aggregate_version).toBe(2);

    // Second acceptance with the SAME commandId — should return the same result
    const second = await acceptQuote(
      fixture.workspaceId,
      fixture.quoteId,
      customerActor,
      1,
      commandId,
    );

    // Result must be identical (idempotent)
    expect(second).toEqual(first);

    // Aggregate version must NOT have changed from the second call
    const quoteAfterSecond = await queryOne<{ status: string; aggregate_version: number }>(
      `SELECT status, aggregate_version FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, fixture.quoteId],
    );
    expect(quoteAfterSecond!.aggregate_version).toBe(2);

    // Only one command execution record should exist
    const execCount = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.commandExecutions} WHERE workspace_id = ? AND command_id = ?`,
      [fixture.workspaceId, commandId],
    );
    expect(Number(execCount!.count)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.3.4 — Stale expected version returns conflict without state change
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.3.4 Stale expected version returns conflict without state change", () => {
  it("accepting with a stale expectedVersion throws VERSION_CONFLICT and does not change state", async () => {
    const { commandResult } = await issueGrant(fixture, ["quote.view", "quote.accept"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    // First acceptance with correct expectedVersion (1) — succeeds
    const first = await acceptQuote(
      fixture.workspaceId,
      fixture.quoteId,
      customerActor,
      1,
      "cmd-stale-001",
    );

    expect(first.status).toBe("succeeded");
    expect(first.newVersion).toBe(2);

    // Verify aggregate_version is now 2
    const quoteAfterFirst = await queryOne<{ status: string; aggregate_version: number }>(
      `SELECT status, aggregate_version FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, fixture.quoteId],
    );
    expect(quoteAfterFirst!.aggregate_version).toBe(2);

    // Second acceptance with a STALE expectedVersion (1) and a NEW commandId — should throw
    await expect(
      acceptQuote(
        fixture.workspaceId,
        fixture.quoteId,
        customerActor,
        1, // stale — current version is 2
        "cmd-stale-002",
      ),
    ).rejects.toThrow("VERSION_CONFLICT");

    // Verify aggregate_version did NOT change from the failed attempt
    const quoteAfterFailed = await queryOne<{ status: string; aggregate_version: number }>(
      `SELECT status, aggregate_version FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, fixture.quoteId],
    );
    expect(quoteAfterFailed!.aggregate_version).toBe(2);
    expect(quoteAfterFailed!.status).toBe("accepted");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.3.5 — Checkout derives exact Invoice balance/currency and reuses an open request
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.3.5 Checkout derives exact Invoice balance/currency and reuses an open request", () => {
  it("resolveCustomerInvoiceCheckout returns exact balance_due_minor and currency", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);

    const { grant, invoice } = await resolveCustomerInvoiceCheckout(
      fixture.workspaceId,
      commandResult.aggregate.id,
      fixture.invoiceId,
    );

    expect(invoice.balance_due_minor).toBe(10000);
    expect(invoice.currency).toBe("USD");
    expect(invoice.status).toBe("issued");
    expect(grant.id).toBe(commandResult.aggregate.id);
  });

  it("creating a payment request and then querying finds the existing open request", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    // Create a payment request for the invoice
    const payResult = await requestPayment(
      fixture.workspaceId,
      {
        sourceObjectType: "invoice",
        sourceObjectId: fixture.invoiceId,
        purpose: "final",
        amountMinor: 10000,
        currency: "USD",
        providerAccountId: fixture.providerAccountId,
        customerContactId: fixture.contactId,
        successUrl: "https://access.test.example.com/success",
        cancelUrl: "https://access.test.example.com/cancel",
      },
      customerActor,
      "cmd-checkout-reuse-001",
    );

    expect(payResult.aggregate.status).toBe("open");

    // Query for existing open payment requests for this invoice
    const openRequest = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM ${businessTable("payment_request")}
       WHERE workspace_id = ? AND source_object_type = 'invoice' AND source_object_id = ?
         AND status = 'open'
       LIMIT 1`,
      [fixture.workspaceId, fixture.invoiceId],
    );

    expect(openRequest).toBeDefined();
    expect(openRequest!.id).toBe(payResult.aggregate.id);
    expect(openRequest!.status).toBe("open");
  });

  it("requestPayment rejects a second open request for the same invoice (PAYMENT_REQUEST_ALREADY_OPEN)", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    // First payment request — succeeds
    await requestPayment(
      fixture.workspaceId,
      {
        sourceObjectType: "invoice",
        sourceObjectId: fixture.invoiceId,
        purpose: "final",
        amountMinor: 10000,
        currency: "USD",
        providerAccountId: fixture.providerAccountId,
        customerContactId: fixture.contactId,
        successUrl: "https://access.test.example.com/success",
        cancelUrl: "https://access.test.example.com/cancel",
      },
      customerActor,
      "cmd-checkout-first-001",
    );

    // Second payment request for the same invoice — should fail
    await expect(
      requestPayment(
        fixture.workspaceId,
        {
          sourceObjectType: "invoice",
          sourceObjectId: fixture.invoiceId,
          purpose: "final",
          amountMinor: 10000,
          currency: "USD",
          providerAccountId: fixture.providerAccountId,
          customerContactId: fixture.contactId,
          successUrl: "https://access.test.example.com/success",
          cancelUrl: "https://access.test.example.com/cancel",
        },
        customerActor,
        "cmd-checkout-second-001",
      ),
    ).rejects.toThrow("PAYMENT_REQUEST_ALREADY_OPEN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.3.6 — Overpayment, void/paid Invoice, expired grant, provider mismatch, and wrong Invoice fail
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.3.6 Overpayment, void/paid Invoice, expired grant, provider mismatch, and wrong Invoice fail", () => {
  it("void invoice fails resolveCustomerInvoiceCheckout", async () => {
    await execute(
      `UPDATE ${businessTable("invoice")} SET status = 'void', voided_at = ? WHERE workspace_id = ? AND id = ?`,
      [now(), fixture.workspaceId, fixture.invoiceId],
    );

    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);

    await expect(
      resolveCustomerInvoiceCheckout(fixture.workspaceId, commandResult.aggregate.id, fixture.invoiceId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("paid invoice (balance_due_minor=0) fails resolveCustomerInvoiceCheckout", async () => {
    await execute(
      `UPDATE ${businessTable("invoice")} SET status = 'paid', balance_due_minor = 0, amount_paid_minor = 10000, paid_at = ? WHERE workspace_id = ? AND id = ?`,
      [now(), fixture.workspaceId, fixture.invoiceId],
    );

    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);

    await expect(
      resolveCustomerInvoiceCheckout(fixture.workspaceId, commandResult.aggregate.id, fixture.invoiceId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("expired grant fails resolveCustomerInvoiceCheckout", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);

    // Force-expire the grant
    await execute(
      `UPDATE ${TABLES.customerAccessGrants} SET expires_at = ? WHERE workspace_id = ? AND id = ?`,
      [new Date(Date.now() - 1000).toISOString(), fixture.workspaceId, commandResult.aggregate.id],
    );

    await expect(
      resolveCustomerInvoiceCheckout(fixture.workspaceId, commandResult.aggregate.id, fixture.invoiceId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("wrong invoice (from a different work order) fails resolveCustomerInvoiceCheckout", async () => {
    // Create a second work order + invoice belonging to a different work order
    const ts = now();
    const workOrderBId = genId("wo");
    const invoiceBId = genId("inv");

    await batch([
      {
        sql: `INSERT INTO ${businessTable("work_order")} (id, workspace_id, title, description, status, priority, company_id, contact_id, service_site_id, asset_id, assigned_to, requested_at, scheduled_start, scheduled_end, completed_at, sla_due_at, source, notes, work_order_number, aggregate_version, source_type, source_id, source_snapshot_hash, owner_resource_id, cancelled_at, reopened_at, completion_reason, cancellation_reason, reopen_reason, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'scheduled', 'medium', ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
        args: [workOrderBId, fixture.workspaceId, "Other Visit", "Other fix", fixture.companyId, fixture.contactId, ts, "WO-B-001", ts, ts],
      },
      {
        sql: `INSERT INTO ${businessTable("invoice")} (id, workspace_id, invoice_number, status, work_order_id, quote_id, company_id, contact_id, currency, total_minor, amount_paid_minor, balance_due_minor, issued_at, due_at, paid_at, voided_at, memo, source_snapshot_hash, created_by, aggregate_version, created_at, updated_at)
              VALUES (?, ?, ?, 'issued', ?, NULL, ?, ?, 'USD', 5000, 0, 5000, ?, NULL, NULL, NULL, NULL, NULL, ?, 1, ?, ?)`,
        args: [invoiceBId, fixture.workspaceId, "INV-B-001", workOrderBId, fixture.companyId, fixture.contactId, ts, fixture.userId, ts, ts],
      },
    ]);

    // Grant rooted on the fixture quote (whose work_order_id is fixture.workOrderId)
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);

    // Invoice B belongs to workOrderB, not the fixture work order — not reachable
    await expect(
      resolveCustomerInvoiceCheckout(fixture.workspaceId, commandResult.aggregate.id, invoiceBId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("invoice with balance_due_minor=0 fails resolveCustomerInvoiceCheckout", async () => {
    // Set balance to 0 but keep status as "issued"
    await execute(
      `UPDATE ${businessTable("invoice")} SET balance_due_minor = 0, amount_paid_minor = 10000 WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, fixture.invoiceId],
    );

    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);

    await expect(
      resolveCustomerInvoiceCheckout(fixture.workspaceId, commandResult.aggregate.id, fixture.invoiceId),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("overpayment (amountMinor > balance) fails requestPayment with PAYMENT_AMOUNT_EXCEEDS_BALANCE", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    await expect(
      requestPayment(
        fixture.workspaceId,
        {
          sourceObjectType: "invoice",
          sourceObjectId: fixture.invoiceId,
          purpose: "final",
          amountMinor: 10001, // exceeds balance of 10000
          currency: "USD",
          providerAccountId: fixture.providerAccountId,
          customerContactId: fixture.contactId,
          successUrl: "https://access.test.example.com/success",
          cancelUrl: "https://access.test.example.com/cancel",
        },
        customerActor,
        "cmd-overpay-001",
      ),
    ).rejects.toThrow("PAYMENT_AMOUNT_EXCEEDS_BALANCE");
  });

  it("provider mismatch fails applyProviderPaymentEvent with PAYMENT_PROVIDER_ACCOUNT_MISMATCH", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    // Create a payment request
    const payResult = await requestPayment(
      fixture.workspaceId,
      {
        sourceObjectType: "invoice",
        sourceObjectId: fixture.invoiceId,
        purpose: "final",
        amountMinor: 10000,
        currency: "USD",
        providerAccountId: fixture.providerAccountId,
        customerContactId: fixture.contactId,
        successUrl: "https://access.test.example.com/success",
        cancelUrl: "https://access.test.example.com/cancel",
      },
      customerActor,
      "cmd-provider-mismatch-001",
    );

    // Simulate a webhook from a different provider
    await expect(
      applyProviderPaymentEvent(fixture.workspaceId, fixture.providerAccountId, {
        type: "payment.succeeded",
        provider: "paypal", // wrong provider
        providerEventId: "evt_mismatch_001",
        providerPaymentId: "pi_mismatch_001",
        paymentRequestRef: payResult.aggregate.id,
        amountMinor: 10000,
        currency: "USD",
        occurredAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("PAYMENT_PROVIDER_ACCOUNT_MISMATCH");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.3.7 — Provider webhook still owns Payment success and Invoice allocation
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.3.7 Provider webhook still owns Payment success and Invoice allocation", () => {
  it("customer-actor payment.request creates an open (not succeeded) payment request", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    const payResult = await requestPayment(
      fixture.workspaceId,
      {
        sourceObjectType: "invoice",
        sourceObjectId: fixture.invoiceId,
        purpose: "final",
        amountMinor: 10000,
        currency: "USD",
        providerAccountId: fixture.providerAccountId,
        customerContactId: fixture.contactId,
        successUrl: "https://access.test.example.com/success",
        cancelUrl: "https://access.test.example.com/cancel",
      },
      customerActor,
      "cmd-webhook-prereq-001",
    );

    // payment_request must be "open", NOT "paid" or "succeeded"
    expect(payResult.aggregate.status).toBe("open");

    // payment must be "pending", NOT "succeeded"
    const payment = await queryOne<{ status: string }>(
      `SELECT status FROM ${businessTable("payment")} WHERE workspace_id = ? AND payment_request_id = ?`,
      [fixture.workspaceId, payResult.aggregate.id],
    );
    expect(payment!.status).toBe("pending");

    // Invoice must still have the original balance
    const invoice = await queryOne<{ status: string; balance_due_minor: number; amount_paid_minor: number }>(
      `SELECT status, balance_due_minor, amount_paid_minor FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, fixture.invoiceId],
    );
    expect(invoice!.status).toBe("issued");
    expect(invoice!.balance_due_minor).toBe(10000);
    expect(invoice!.amount_paid_minor).toBe(0);
  });

  it("provider webhook (applyProviderPaymentEvent) succeeds the payment and allocates to the invoice", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    // Step 1: Customer creates a payment request
    const payResult = await requestPayment(
      fixture.workspaceId,
      {
        sourceObjectType: "invoice",
        sourceObjectId: fixture.invoiceId,
        purpose: "final",
        amountMinor: 10000,
        currency: "USD",
        providerAccountId: fixture.providerAccountId,
        customerContactId: fixture.contactId,
        successUrl: "https://access.test.example.com/success",
        cancelUrl: "https://access.test.example.com/cancel",
      },
      customerActor,
      "cmd-webhook-full-001",
    );

    const paymentRequestId = payResult.aggregate.id;
    const paymentId = payResult.aggregate.paymentId;

    // Verify pre-webhook state
    const paymentBefore = await queryOne<{ status: string }>(
      `SELECT status FROM ${businessTable("payment")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, paymentId],
    );
    expect(paymentBefore!.status).toBe("pending");

    // Step 2: Provider webhook simulates payment success
    const webhookResult = await applyProviderPaymentEvent(
      fixture.workspaceId,
      fixture.providerAccountId,
      {
        type: "payment.succeeded",
        provider: "stripe",
        providerEventId: "evt_webhook_success_001",
        providerPaymentId: "pi_webhook_success_001",
        paymentRequestRef: paymentRequestId,
        amountMinor: 10000,
        currency: "USD",
        occurredAt: new Date().toISOString(),
      },
      "payload_hash_webhook_001",
    );

    expect(webhookResult.status).toBe("succeeded");

    // Step 3: Verify payment is now succeeded
    const paymentAfter = await queryOne<{ status: string; provider_payment_id: string }>(
      `SELECT status, provider_payment_id FROM ${businessTable("payment")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, paymentId],
    );
    expect(paymentAfter!.status).toBe("succeeded");
    expect(paymentAfter!.provider_payment_id).toBe("pi_webhook_success_001");

    // Step 4: Verify payment_request is now paid
    const requestAfter = await queryOne<{ status: string; amount_paid_minor: number }>(
      `SELECT status, amount_paid_minor FROM ${businessTable("payment_request")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, paymentRequestId],
    );
    expect(requestAfter!.status).toBe("paid");
    expect(requestAfter!.amount_paid_minor).toBe(10000);

    // Step 5: Verify invoice balance is allocated
    const invoiceAfter = await queryOne<{
      status: string;
      balance_due_minor: number;
      amount_paid_minor: number;
      paid_at: string | null;
    }>(
      `SELECT status, balance_due_minor, amount_paid_minor, paid_at FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, fixture.invoiceId],
    );
    expect(invoiceAfter!.status).toBe("paid");
    expect(invoiceAfter!.balance_due_minor).toBe(0);
    expect(invoiceAfter!.amount_paid_minor).toBe(10000);
    expect(invoiceAfter!.paid_at).not.toBeNull();
  });

  it("webhook replay is idempotent and does not double-allocate the invoice", async () => {
    const { commandResult } = await issueGrant(fixture, ["invoice.view", "invoice.pay"]);
    const customerActor: CommandActor = { type: "customer", id: commandResult.aggregate.id };

    // Customer creates a payment request
    const payResult = await requestPayment(
      fixture.workspaceId,
      {
        sourceObjectType: "invoice",
        sourceObjectId: fixture.invoiceId,
        purpose: "final",
        amountMinor: 10000,
        currency: "USD",
        providerAccountId: fixture.providerAccountId,
        customerContactId: fixture.contactId,
        successUrl: "https://access.test.example.com/success",
        cancelUrl: "https://access.test.example.com/cancel",
      },
      customerActor,
      "cmd-webhook-replay-001",
    );

    const event = {
      type: "payment.succeeded" as const,
      provider: "stripe",
      providerEventId: "evt_replay_001",
      providerPaymentId: "pi_replay_001",
      paymentRequestRef: payResult.aggregate.id,
      amountMinor: 10000,
      currency: "USD",
      occurredAt: new Date().toISOString(),
    };

    // First webhook — succeeds
    const first = await applyProviderPaymentEvent(
      fixture.workspaceId,
      fixture.providerAccountId,
      event,
      "payload_hash_replay",
    );

    // Replay the same webhook — should return the same result
    const replay = await applyProviderPaymentEvent(
      fixture.workspaceId,
      fixture.providerAccountId,
      event,
      "payload_hash_replay",
    );

    expect(replay).toEqual(first);

    // Invoice must not be double-allocated
    const invoice = await queryOne<{ amount_paid_minor: number; balance_due_minor: number }>(
      `SELECT amount_paid_minor, balance_due_minor FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, fixture.invoiceId],
    );
    expect(invoice!.amount_paid_minor).toBe(10000);
    expect(invoice!.balance_due_minor).toBe(0);
  });
});
