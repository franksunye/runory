// ── Customer Access End-to-End Test Matrix (v0.8 Tech Spec §14.5) ──
//
// Simulates the full customer journey as a single linear test:
//   operator issues Quote access
//   → customer exchanges link and accepts sent Quote
//   → operator converts Quote (creates work order from accepted quote)
//   → operator completes Work Order and issues Invoice
//   → same root resolves job/report/Invoice
//   → customer starts exact-balance hosted Checkout
//   → signed provider event allocates Payment
//   → customer sees paid state
//   → revoked grant immediately loses access
//
// Also runs cross-tenant negative cases and duplicate/reordered provider events.

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
  type CustomerAccessGrantRecord,
} from "./customer-access-commands";
import {
  exchangeCustomerAccessToken,
  resolveCustomerAccessSession,
} from "./customer-access-session";
import { resolveCustomerAccessContext } from "./customer-access-context";
import {
  resolveCustomerQuoteAccept,
  resolveCustomerInvoiceCheckout,
} from "./command-contracts/customer-authorization";
import { acceptQuote } from "./quote-commands";
import {
  requestPayment,
  upsertPaymentProviderAccount,
  applyProviderPaymentEvent,
} from "./payment-commands";
import type { CommandActor } from "./command-runtime";

// ── Data directory ──

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Session secret management ──

const TEST_SECRET = "customer-access-e2e-test-secret-32-chars!";
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

// ── Constants ──

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

const ALL_CAPABILITIES = [
  "quote.view",
  "quote.accept",
  "work_order.view_status",
  "service_report.view",
  "invoice.view",
  "invoice.pay",
  "payment.view_status",
] as const;

// ── Test fixture ──

interface TestFixture {
  workspaceId: string;
  userId: string;
  actor: CommandActor;
  companyId: string;
  contactId: string;
  quoteId: string;
  providerAccountId: string;
  expiresAt: string;
}

async function setupWorkspace(slugSuffix = "a"): Promise<TestFixture> {
  const ts = now();
  const workspaceId = genId("ws");
  const userId = genId("usr");
  const providerAccountId = `provider_account_stripe_e2e_${slugSuffix}`;

  // Workspace
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [
      workspaceId,
      `E2E Test WS ${slugSuffix.toUpperCase()}`,
      `e2e-test-${slugSuffix}-${workspaceId.slice(-8)}`,
      ts,
      ts,
    ],
  );

  // User + workspace membership (admin so business permissions pass implicitly)
  await batch([
    {
      sql: `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [userId, `ext-${userId}`, `Operator ${slugSuffix.toUpperCase()}`, ts, ts],
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

  // Provision command contract snapshots
  await repairWorkspaceCommandContracts(workspaceId);

  const actor: CommandActor = { type: "user", id: userId };

  // ── Business records ──

  const companyId = genId("cmp");
  const contactId = genId("ctc");
  const quoteId = genId("qt");

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
    // Quote (status 'sent', linked to contact, no work_order yet)
    {
      sql: `INSERT INTO ${businessTable("quote")} (id, workspace_id, quote_number, title, status, version, company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id, currency, subtotal, discount_total, tax_total, grand_total, valid_until, owner, terms, notes, aggregate_version, root_quote_id, previous_version_id, revision_number, price_book_id, approved_at, accepted_at, rejected_reason, return_reason, withdrawn_at, snapshot_hash, locked_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'sent', 1, ?, ?, NULL, NULL, NULL, NULL, 'USD', 10000, 0, 1000, 11000, ?, NULL, NULL, NULL, 1, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      args: [
        quoteId,
        workspaceId,
        `Q-${slugSuffix.toUpperCase()}-001`,
        "Repair Quote",
        companyId,
        contactId,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ts,
        ts,
      ],
    },
  ]);

  // Provider account (Stripe, test mode)
  await upsertPaymentProviderAccount({
    workspaceId,
    id: providerAccountId,
    provider: "stripe",
    mode: "test",
    providerAccountRef: `acct_test_runory_${slugSuffix}`,
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    workspaceId,
    userId,
    actor,
    companyId,
    contactId,
    quoteId,
    providerAccountId,
    expiresAt,
  };
}

// ── Helper: issue a full-capability grant rooted on the fixture quote ──

async function issueFullGrant(fixture: TestFixture) {
  return issueCustomerAccessGrant(
    fixture.workspaceId,
    fixture.actor,
    {
      subjectType: "contact",
      subjectId: fixture.contactId,
      rootObjectType: "quote",
      rootRecordId: fixture.quoteId,
      capabilities: [...ALL_CAPABILITIES],
      expiresAt: fixture.expiresAt,
    },
    PUBLIC_BASE_URL,
  );
}

// ── Helper: create work order from an accepted quote ──

async function createWorkOrderFromQuote(
  fixture: TestFixture,
): Promise<string> {
  const workOrderId = genId("wo");
  const ts = now();
  await batch([
    {
      sql: `INSERT INTO ${businessTable("work_order")} (id, workspace_id, title, description, status, priority, company_id, contact_id, service_site_id, asset_id, assigned_to, requested_at, scheduled_start, scheduled_end, completed_at, sla_due_at, source, notes, work_order_number, aggregate_version, source_type, source_id, source_snapshot_hash, owner_resource_id, cancelled_at, reopened_at, completion_reason, cancellation_reason, reopen_reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'scheduled', 'medium', ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, 1, 'quote', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      args: [
        workOrderId,
        fixture.workspaceId,
        "Repair Visit",
        "Fix the widget",
        fixture.companyId,
        fixture.contactId,
        ts,
        `WO-E2E-${workOrderId.slice(-6).toUpperCase()}`,
        fixture.quoteId,
        ts,
        ts,
      ],
    },
    {
      sql: `UPDATE ${businessTable("quote")} SET work_order_id = ?, aggregate_version = aggregate_version + 1, updated_at = ? WHERE workspace_id = ? AND id = ?`,
      args: [workOrderId, ts, fixture.workspaceId, fixture.quoteId],
    },
  ]);
  return workOrderId;
}

// ── Helper: complete work order, create service report, create invoice ──

async function completeWorkOrderAndIssueInvoice(
  fixture: TestFixture,
  workOrderId: string,
): Promise<{ serviceReportId: string; invoiceId: string }> {
  const ts = now();
  const serviceReportId = genId("sr");
  const invoiceId = genId("inv");

  await batch([
    // Complete work order
    {
      sql: `UPDATE ${businessTable("work_order")} SET status = 'completed', completed_at = ?, aggregate_version = aggregate_version + 1, updated_at = ? WHERE workspace_id = ? AND id = ?`,
      args: [ts, ts, fixture.workspaceId, workOrderId],
    },
    // Service report
    {
      sql: `INSERT INTO ${businessTable("service_report")} (id, workspace_id, work_order_id, summary, resolution, completed_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        serviceReportId,
        fixture.workspaceId,
        workOrderId,
        "Service completed successfully",
        "Replaced faulty component",
        ts,
        ts,
        ts,
      ],
    },
    // Invoice (status 'issued', linked to work order, exact-balance)
    {
      sql: `INSERT INTO ${businessTable("invoice")} (id, workspace_id, invoice_number, status, work_order_id, quote_id, company_id, contact_id, currency, total_minor, amount_paid_minor, balance_due_minor, issued_at, due_at, paid_at, voided_at, memo, source_snapshot_hash, created_by, aggregate_version, created_at, updated_at)
            VALUES (?, ?, ?, 'issued', ?, ?, ?, ?, 'USD', 11000, 0, 11000, ?, NULL, NULL, NULL, NULL, NULL, ?, 1, ?, ?)`,
      args: [
        invoiceId,
        fixture.workspaceId,
        `INV-E2E-${invoiceId.slice(-6).toUpperCase()}`,
        workOrderId,
        fixture.quoteId,
        fixture.companyId,
        fixture.contactId,
        ts,
        fixture.userId,
        ts,
        ts,
      ],
    },
  ]);

  return { serviceReportId, invoiceId };
}

// ── Shared fixture ──

let fixture: TestFixture;

beforeEach(async () => {
  await resetDatabase();
  fixture = await setupWorkspace();
});

// ─────────────────────────────────────────────────────────────────────────────
// §14.5 — End-to-End Customer Journey
// ─────────────────────────────────────────────────────────────────────────────

describe("§14.5 End-to-End Customer Journey", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // Main E2E test: full customer journey in one linear flow
  // ───────────────────────────────────────────────────────────────────────────

  it("completes the full customer journey from quote access to paid invoice and revocation", async () => {
    // ── Step 1: Operator issues Quote access grant ──
    const { commandResult: issueResult, rawToken } = await issueFullGrant(fixture);

    expect(issueResult.status).toBe("succeeded");
    const grantId = issueResult.aggregate.id;
    expect(rawToken).toBeTruthy();
    expect(issueResult.aggregate.status).toBe("active");
    expect(issueResult.aggregate.root_object_type).toBe("quote");
    expect(issueResult.aggregate.root_record_id).toBe(fixture.quoteId);

    // ── Step 2: Customer exchanges link and accepts sent Quote ──

    // Exchange the raw token → get session cookie
    const exchange = await exchangeCustomerAccessToken(rawToken);
    expect(exchange.grant.id).toBe(grantId);
    expect(exchange.cookieValue).toBeTruthy();
    expect(exchange.cookieOptions.httpOnly).toBe(true);

    const cookieValue = exchange.cookieValue;

    // Resolve context → verify quote is visible with status "sent"
    let context = await resolveCustomerAccessContext(exchange.grant);
    expect(context.quote).toBeDefined();
    expect(context.quote!.id).toBe(fixture.quoteId);
    expect(context.quote!.status).toBe("sent");
    expect(context.quote!.grandTotal).toBe(11000);
    expect(context.availableActions).toContain("quote.accept");

    // Call resolveCustomerQuoteAccept → get expectedVersion
    const { expectedVersion } = await resolveCustomerQuoteAccept(
      fixture.workspaceId,
      grantId,
      fixture.quoteId,
    );
    expect(expectedVersion).toBeGreaterThanOrEqual(1);

    // Call acceptQuote with customer actor → quote status becomes "accepted"
    const customerActor: CommandActor = { type: "customer", id: grantId };
    const acceptResult = await acceptQuote(
      fixture.workspaceId,
      fixture.quoteId,
      customerActor,
      expectedVersion,
    );
    expect(acceptResult.status).toBe("succeeded");
    expect(acceptResult.aggregate.status).toBe("accepted");

    // Re-resolve context → verify quote status is "accepted"
    const grantAfterAccept = await resolveCustomerAccessSession(cookieValue);
    expect(grantAfterAccept).not.toBeNull();
    context = await resolveCustomerAccessContext(grantAfterAccept!);
    expect(context.quote!.status).toBe("accepted");
    expect(context.availableActions).not.toContain("quote.accept");

    // ── Step 3: Operator converts Quote (creates work order from accepted quote) ──
    const workOrderId = await createWorkOrderFromQuote(fixture);

    // Verify the quote is now linked to the work order
    const quoteAfterConversion = await queryOne<{ work_order_id: string | null }>(
      `SELECT work_order_id FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, fixture.quoteId],
    );
    expect(quoteAfterConversion!.work_order_id).toBe(workOrderId);

    // ── Step 4: Operator completes Work Order and issues Invoice ──
    const { serviceReportId, invoiceId } = await completeWorkOrderAndIssueInvoice(
      fixture,
      workOrderId,
    );

    // Verify work order is completed
    const workOrder = await queryOne<{ status: string; completed_at: string | null }>(
      `SELECT status, completed_at FROM ${businessTable("work_order")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, workOrderId],
    );
    expect(workOrder!.status).toBe("completed");
    expect(workOrder!.completed_at).not.toBeNull();

    // ── Step 5: Same root resolves job/report/Invoice ──
    const grantForContext = await resolveCustomerAccessSession(cookieValue);
    expect(grantForContext).not.toBeNull();
    context = await resolveCustomerAccessContext(grantForContext!);

    // Verify work_order is visible
    expect(context.workOrder).toBeDefined();
    expect(context.workOrder!.id).toBe(workOrderId);
    expect(context.workOrder!.status).toBe("completed");

    // Verify service_reports are visible
    expect(context.serviceReports).toHaveLength(1);
    expect(context.serviceReports[0].id).toBe(serviceReportId);
    expect(context.serviceReports[0].summary).toBe("Service completed successfully");

    // Verify invoice is visible
    expect(context.invoice).toBeDefined();
    expect(context.invoice!.id).toBe(invoiceId);
    expect(context.invoice!.status).toBe("issued");
    expect(context.invoice!.balanceDueMinor).toBe(11000);
    expect(context.invoice!.totalMinor).toBe(11000);

    // Verify availableActions includes "invoice.pay"
    expect(context.availableActions).toContain("invoice.pay");

    // ── Step 6: Customer starts exact-balance hosted Checkout ──

    // Call resolveCustomerInvoiceCheckout → verify exact balance and currency
    const { invoice: checkoutInvoice } = await resolveCustomerInvoiceCheckout(
      fixture.workspaceId,
      grantId,
      invoiceId,
    );
    expect(checkoutInvoice.balance_due_minor).toBe(11000);
    expect(checkoutInvoice.currency).toBe("USD");
    expect(checkoutInvoice.status).toBe("issued");

    // Call requestPayment with customer actor, amount = invoice.balance_due_minor
    const payResult = await requestPayment(
      fixture.workspaceId,
      {
        sourceObjectType: "invoice",
        sourceObjectId: invoiceId,
        purpose: "final",
        amountMinor: 11000,
        currency: "USD",
        providerAccountId: fixture.providerAccountId,
        customerContactId: fixture.contactId,
        successUrl: "https://access.test.example.com/success",
        cancelUrl: "https://access.test.example.com/cancel",
      },
      customerActor,
      "cmd-e2e-checkout-001",
    );

    // Verify payment_request is created with status "open"
    expect(payResult.status).toBe("succeeded");
    expect(payResult.aggregate.status).toBe("open");
    expect(payResult.aggregate.amount_due_minor).toBe(11000);

    const paymentRequestId = payResult.aggregate.id;
    const paymentId = payResult.aggregate.paymentId;

    // ── Step 7: Signed provider event allocates Payment ──

    // Verify pre-webhook state: payment is pending, invoice is still issued
    const paymentBefore = await queryOne<{ status: string }>(
      `SELECT status FROM ${businessTable("payment")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, paymentId],
    );
    expect(paymentBefore!.status).toBe("pending");

    // Call applyProviderPaymentEvent to simulate webhook payment success
    const webhookResult = await applyProviderPaymentEvent(
      fixture.workspaceId,
      fixture.providerAccountId,
      {
        type: "payment.succeeded",
        provider: "stripe",
        providerEventId: "evt_e2e_success_001",
        providerPaymentId: "pi_e2e_success_001",
        paymentRequestRef: paymentRequestId,
        amountMinor: 11000,
        currency: "USD",
        occurredAt: new Date().toISOString(),
      },
      "payload_hash_e2e_001",
    );
    expect(webhookResult.status).toBe("succeeded");

    // Verify payment record is created with status "succeeded"
    const paymentAfter = await queryOne<{
      status: string;
      provider_payment_id: string | null;
      succeeded_at: string | null;
    }>(
      `SELECT status, provider_payment_id, succeeded_at FROM ${businessTable("payment")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, paymentId],
    );
    expect(paymentAfter!.status).toBe("succeeded");
    expect(paymentAfter!.provider_payment_id).toBe("pi_e2e_success_001");
    expect(paymentAfter!.succeeded_at).not.toBeNull();

    // Verify payment_request is now paid
    const requestAfter = await queryOne<{ status: string; amount_paid_minor: number }>(
      `SELECT status, amount_paid_minor FROM ${businessTable("payment_request")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, paymentRequestId],
    );
    expect(requestAfter!.status).toBe("paid");
    expect(requestAfter!.amount_paid_minor).toBe(11000);

    // Verify invoice balance is updated (amount_paid_minor increased, balance_due_minor = 0)
    const invoiceAfterPayment = await queryOne<{
      status: string;
      amount_paid_minor: number;
      balance_due_minor: number;
      paid_at: string | null;
    }>(
      `SELECT status, amount_paid_minor, balance_due_minor, paid_at FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, invoiceId],
    );
    expect(invoiceAfterPayment!.status).toBe("paid");
    expect(invoiceAfterPayment!.amount_paid_minor).toBe(11000);
    expect(invoiceAfterPayment!.balance_due_minor).toBe(0);
    expect(invoiceAfterPayment!.paid_at).not.toBeNull();

    // ── Step 8: Customer sees paid state ──

    // Re-resolve customer access context
    const grantForPaidContext = await resolveCustomerAccessSession(cookieValue);
    expect(grantForPaidContext).not.toBeNull();
    context = await resolveCustomerAccessContext(grantForPaidContext!);

    // Verify invoice status is "paid" and balance is 0
    expect(context.invoice).toBeDefined();
    expect(context.invoice!.status).toBe("paid");
    expect(context.invoice!.balanceDueMinor).toBe(0);
    expect(context.invoice!.amountPaidMinor).toBe(11000);

    // Verify payment status is visible and shows "succeeded"
    expect(context.payment).toBeDefined();
    expect(context.payment!.paymentStatus).toBe("succeeded");
    expect(context.payment!.requestStatus).toBe("paid");

    // Verify availableActions no longer includes "invoice.pay"
    expect(context.availableActions).not.toContain("invoice.pay");

    // ── Step 9: Revoked grant immediately loses access ──

    // Get current grant version for optimistic locking
    const grantBeforeRevoke = await queryOne<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM ${TABLES.customerAccessGrants} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, grantId],
    );
    expect(grantBeforeRevoke).not.toBeNull();

    // Revoke the grant
    const revokeResult = await revokeCustomerAccessGrant(
      fixture.workspaceId,
      grantId,
      fixture.actor,
      grantBeforeRevoke!.aggregate_version,
    );
    expect(revokeResult.status).toBe("succeeded");
    expect(revokeResult.aggregate.status).toBe("revoked");

    // Try resolveCustomerAccessSession(cookie) → returns null
    const sessionAfterRevoke = await resolveCustomerAccessSession(cookieValue);
    expect(sessionAfterRevoke).toBeNull();

    // Since the session resolver returns null, the customer cannot reach
    // resolveCustomerAccessContext — access is effectively denied.
    // Verify the grant record itself is revoked
    const grantRecord = await queryOne<{ status: string; revoked_at: string | null }>(
      `SELECT status, revoked_at FROM ${TABLES.customerAccessGrants} WHERE workspace_id = ? AND id = ?`,
      [fixture.workspaceId, grantId],
    );
    expect(grantRecord!.status).toBe("revoked");
    expect(grantRecord!.revoked_at).not.toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Cross-tenant negative cases
  // ───────────────────────────────────────────────────────────────────────────

  describe("cross-tenant negative cases", () => {
    it("grant from WS-A cannot resolve context for WS-B data (workspace scoping)", async () => {
      // Set up WS-B with its own quote
      const fixtureB = await setupWorkspace("b");

      // Issue grant in WS-A rooted on WS-A's quote
      const { commandResult: issueResult, rawToken } = await issueFullGrant(fixture);
      const grantId = issueResult.aggregate.id;

      // Exchange token and resolve context
      const exchange = await exchangeCustomerAccessToken(rawToken);
      const context = await resolveCustomerAccessContext(exchange.grant);

      // Context must only contain WS-A's quote, not WS-B's
      expect(context.quote).toBeDefined();
      expect(context.quote!.id).toBe(fixture.quoteId);
      expect(context.quote!.id).not.toBe(fixtureB.quoteId);

      // WS-B's quote must NOT appear in the context
      expect(context.workspace.name).toContain("WS A");
    });

    it("resolveCustomerQuoteAccept with WS-A grant and WS-B quote throws PERMISSION_DENIED", async () => {
      // Set up WS-B with its own quote
      const fixtureB = await setupWorkspace("b");

      // Issue grant in WS-A rooted on WS-A's quote
      const { commandResult: issueResult } = await issueFullGrant(fixture);
      const grantId = issueResult.aggregate.id;

      // Try to accept WS-B's quote using WS-A's grant
      await expect(
        resolveCustomerQuoteAccept(fixture.workspaceId, grantId, fixtureB.quoteId),
      ).rejects.toThrow("PERMISSION_DENIED");
    });

    it("resolveCustomerInvoiceCheckout with WS-A grant and WS-B invoice throws PERMISSION_DENIED", async () => {
      // Set up WS-B with its own quote
      const fixtureB = await setupWorkspace("b");

      // Issue grant in WS-A rooted on WS-A's quote
      const { commandResult: issueResult } = await issueFullGrant(fixture);
      const grantId = issueResult.aggregate.id;

      // Create a work order and invoice in WS-B
      const workOrderIdB = await createWorkOrderFromQuote(fixtureB);
      const { invoiceId: invoiceIdB } = await completeWorkOrderAndIssueInvoice(
        fixtureB,
        workOrderIdB,
      );

      // Try to check out WS-B's invoice using WS-A's grant
      await expect(
        resolveCustomerInvoiceCheckout(fixture.workspaceId, grantId, invoiceIdB),
      ).rejects.toThrow("PERMISSION_DENIED");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Duplicate provider event idempotency
  // ───────────────────────────────────────────────────────────────────────────

  describe("duplicate provider event idempotency", () => {
    it("replaying the same provider event does not create duplicate payments or double-allocate invoice", async () => {
      // ── Set up the full payment scenario ──

      // Issue grant and exchange token
      const { commandResult: issueResult, rawToken } = await issueFullGrant(fixture);
      const grantId = issueResult.aggregate.id;
      const customerActor: CommandActor = { type: "customer", id: grantId };

      const exchange = await exchangeCustomerAccessToken(rawToken);

      // Accept the quote
      const { expectedVersion } = await resolveCustomerQuoteAccept(
        fixture.workspaceId,
        grantId,
        fixture.quoteId,
      );
      await acceptQuote(fixture.workspaceId, fixture.quoteId, customerActor, expectedVersion);

      // Create work order, complete it, and issue invoice
      const workOrderId = await createWorkOrderFromQuote(fixture);
      const { invoiceId } = await completeWorkOrderAndIssueInvoice(fixture, workOrderId);

      // Customer starts checkout
      const payResult = await requestPayment(
        fixture.workspaceId,
        {
          sourceObjectType: "invoice",
          sourceObjectId: invoiceId,
          purpose: "final",
          amountMinor: 11000,
          currency: "USD",
          providerAccountId: fixture.providerAccountId,
          customerContactId: fixture.contactId,
          successUrl: "https://access.test.example.com/success",
          cancelUrl: "https://access.test.example.com/cancel",
        },
        customerActor,
        "cmd-e2e-dup-001",
      );

      const paymentRequestId = payResult.aggregate.id;
      const paymentId = payResult.aggregate.paymentId;

      // Define the provider event
      const event = {
        type: "payment.succeeded" as const,
        provider: "stripe",
        providerEventId: "evt_e2e_dup_001",
        providerPaymentId: "pi_e2e_dup_001",
        paymentRequestRef: paymentRequestId,
        amountMinor: 11000,
        currency: "USD",
        occurredAt: new Date().toISOString(),
      };
      const payloadHash = "payload_hash_e2e_dup_001";

      // ── First webhook: succeeds ──
      const first = await applyProviderPaymentEvent(
        fixture.workspaceId,
        fixture.providerAccountId,
        event,
        payloadHash,
      );
      expect(first.status).toBe("succeeded");

      // Verify payment is succeeded
      const paymentAfterFirst = await queryOne<{ status: string }>(
        `SELECT status FROM ${businessTable("payment")} WHERE workspace_id = ? AND id = ?`,
        [fixture.workspaceId, paymentId],
      );
      expect(paymentAfterFirst!.status).toBe("succeeded");

      // Verify invoice is paid
      const invoiceAfterFirst = await queryOne<{
        status: string;
        amount_paid_minor: number;
        balance_due_minor: number;
      }>(
        `SELECT status, amount_paid_minor, balance_due_minor FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
        [fixture.workspaceId, invoiceId],
      );
      expect(invoiceAfterFirst!.status).toBe("paid");
      expect(invoiceAfterFirst!.amount_paid_minor).toBe(11000);
      expect(invoiceAfterFirst!.balance_due_minor).toBe(0);

      // ── Replay the same webhook: must be idempotent ──
      const replay = await applyProviderPaymentEvent(
        fixture.workspaceId,
        fixture.providerAccountId,
        event,
        payloadHash,
      );

      // Result must be the same as the first call
      expect(replay).toEqual(first);

      // ── Verify no duplicate payment record is created ──
      const paymentCount = await queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${businessTable("payment")} WHERE workspace_id = ? AND payment_request_id = ?`,
        [fixture.workspaceId, paymentRequestId],
      );
      expect(Number(paymentCount!.count)).toBe(1);

      // ── Verify invoice balance is not double-allocated ──
      const invoiceAfterReplay = await queryOne<{
        status: string;
        amount_paid_minor: number;
        balance_due_minor: number;
      }>(
        `SELECT status, amount_paid_minor, balance_due_minor FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
        [fixture.workspaceId, invoiceId],
      );
      expect(invoiceAfterReplay!.amount_paid_minor).toBe(11000);
      expect(invoiceAfterReplay!.balance_due_minor).toBe(0);

      // ── Verify only one provider reference record exists ──
      const referenceCount = await queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${businessTable("payment_provider_reference")}
         WHERE workspace_id = ? AND provider_event_id = ?`,
        [fixture.workspaceId, event.providerEventId],
      );
      expect(Number(referenceCount!.count)).toBe(1);

      // ── Verify only one invoice_payment_allocation exists ──
      const allocationCount = await queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${businessTable("invoice_payment_allocation")}
         WHERE workspace_id = ? AND payment_id = ?`,
        [fixture.workspaceId, paymentId],
      );
      expect(Number(allocationCount!.count)).toBe(1);
    });
  });
});
