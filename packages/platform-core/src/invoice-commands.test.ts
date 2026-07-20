import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { businessTable, TABLES } from "./contracts";
import { db, execute, genId, now, queryAll, queryOne } from "./db";
import { installPack } from "./installer";
import { issueInvoiceFromWorkOrder, voidInvoice, type InvoiceRecord } from "./invoice-commands";
import {
  applyProviderPaymentEvent,
  attachProviderRefund,
  requestPayment,
  requestPaymentRefund,
  upsertPaymentProviderAccount,
} from "./payment-commands";
import { runMigrations } from "./migrations";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const actor = { type: "system" as const, id: "v07-acceptance" };
const providerAccountId = "provider_invoice_test";
let workspaceId: string;

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

async function setupWorkspace() {
  const timestamp = now();
  workspaceId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, 'v0.7 Commercial Completion', ?, ?, ?)`,
    [workspaceId, `v07-${workspaceId}`, timestamp, timestamp],
  );
  await installPack(workspaceId, "sales-quote-pack");
  await installPack(workspaceId, "fsm-pack");
  await upsertPaymentProviderAccount({
    workspaceId,
    id: providerAccountId,
    provider: "stripe",
    mode: "test",
    providerAccountRef: "acct_invoice_test",
  });

  await execute(
    `INSERT INTO ${businessTable("quote")}
      (id, workspace_id, quote_number, title, status, version, currency,
       subtotal, discount_total, tax_total, grand_total, aggregate_version,
       revision_number, snapshot_hash, locked_at, created_at, updated_at)
     VALUES ('quote_v07', ?, 'Q-V07', 'Emergency compressor repair', 'accepted',
       1, 'USD', 100, 0, 0, 100, 1, 0, 'quote_snapshot_v07', ?, ?, ?)`,
    [workspaceId, timestamp, timestamp, timestamp],
  );
  await execute(
    `INSERT INTO ${businessTable("quote_line")}
      (id, workspace_id, quote_id, description, quantity, unit, unit_price,
       discount_amount, tax_amount, line_total, sort_order, created_at, updated_at)
     VALUES ('quote_line_v07', ?, 'quote_v07', 'Compressor repair', 1, 'service',
       100, 0, 0, 100, 0, ?, ?)`,
    [workspaceId, timestamp, timestamp],
  );
  await execute(
    `INSERT INTO ${businessTable("work_order")}
      (id, workspace_id, title, status, company_id, contact_id, completed_at,
       work_order_number, aggregate_version, source_type, source_id,
       source_snapshot_hash, created_at, updated_at)
     VALUES ('wo_v07', ?, 'Emergency compressor repair', 'completed',
       NULL, NULL, ?, 'WO-V07', 1, 'quote', 'quote_v07',
       'quote_snapshot_v07', ?, ?)`,
    [workspaceId, timestamp, timestamp, timestamp],
  );
}

async function collectPayment(invoiceId: string, amountMinor: number, suffix: string) {
  const request = await requestPayment(workspaceId, {
    sourceObjectType: "invoice",
    sourceObjectId: invoiceId,
    purpose: "final",
    amountMinor,
    currency: "USD",
    providerAccountId,
    description: "Invoice payment",
    successUrl: "https://runory.example/success",
    cancelUrl: "https://runory.example/cancel",
  }, actor, `payment-request-${suffix}`);
  await applyProviderPaymentEvent(workspaceId, providerAccountId, {
    type: "payment.succeeded",
    provider: "stripe",
    providerEventId: `evt-payment-${suffix}`,
    providerAccountId: "acct_invoice_test",
    providerPaymentId: `pi-${suffix}`,
    paymentRequestRef: request.aggregate.id,
    amountMinor,
    currency: "USD",
    occurredAt: now(),
  });
  return request.aggregate.paymentId;
}

async function refundPayment(paymentId: string, amountMinor: number, suffix: string) {
  const refund = await requestPaymentRefund(
    workspaceId,
    paymentId,
    amountMinor,
    "Customer refund",
    actor,
    `refund-request-${suffix}`,
  );
  await attachProviderRefund({
    workspaceId,
    refundId: refund.aggregate.id,
    providerRefundId: `re-${suffix}`,
  });
  await applyProviderPaymentEvent(workspaceId, providerAccountId, {
    type: "refund.succeeded",
    provider: "stripe",
    providerEventId: `evt-refund-${suffix}`,
    providerAccountId: "acct_invoice_test",
    providerRefundId: `re-${suffix}`,
    providerPaymentId: `pi-${suffix}`,
    amountMinor,
    currency: "USD",
    occurredAt: now(),
  });
}

beforeEach(async () => {
  await resetDatabase();
  await setupWorkspace();
});

describe("v0.7 Invoice commercial completion", () => {
  it("issues an immutable Invoice snapshot from a completed Quote-origin Work Order", async () => {
    const result = await issueInvoiceFromWorkOrder(
      workspaceId,
      "wo_v07",
      actor,
      { dueAt: "2030-01-31T00:00:00.000Z" },
      "issue-v07",
    );
    expect(result.aggregate).toMatchObject({
      status: "issued",
      quote_id: "quote_v07",
      work_order_id: "wo_v07",
      total_minor: 10_000,
      balance_due_minor: 10_000,
      currency: "USD",
      source_snapshot_hash: "quote_snapshot_v07",
    });
    const lines = await queryAll<{ description: string; line_total_minor: number }>(
      `SELECT description, line_total_minor FROM ${businessTable("invoice_line")}
       WHERE workspace_id = ? AND invoice_id = ?`,
      [workspaceId, result.aggregate.id],
    );
    expect(lines).toEqual([{ description: "Compressor repair", line_total_minor: 10_000 }]);
    await expect(issueInvoiceFromWorkOrder(
      workspaceId,
      "wo_v07",
      actor,
      {},
      "issue-v07-again",
    )).rejects.toThrow("INVOICE_ALREADY_EXISTS");
  });

  it("allocates partial and final provider-confirmed payments without overpayment", async () => {
    const issued = await issueInvoiceFromWorkOrder(workspaceId, "wo_v07", actor);
    await collectPayment(issued.aggregate.id, 4_000, "partial");
    expect(await queryOne<InvoiceRecord>(
      `SELECT * FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, issued.aggregate.id],
    )).toMatchObject({
      status: "partially_paid",
      amount_paid_minor: 4_000,
      balance_due_minor: 6_000,
    });

    await expect(requestPayment(workspaceId, {
      sourceObjectType: "invoice",
      sourceObjectId: issued.aggregate.id,
      purpose: "final",
      amountMinor: 6_001,
      currency: "USD",
      providerAccountId,
      successUrl: "https://runory.example/success",
      cancelUrl: "https://runory.example/cancel",
    }, actor, "overpay")).rejects.toThrow("PAYMENT_AMOUNT_EXCEEDS_BALANCE");

    await collectPayment(issued.aggregate.id, 6_000, "final");
    expect(await queryOne<InvoiceRecord>(
      `SELECT * FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, issued.aggregate.id],
    )).toMatchObject({
      status: "paid",
      amount_paid_minor: 10_000,
      balance_due_minor: 0,
    });
  });

  it("reopens the receivable as trusted refunds reverse allocations", async () => {
    const issued = await issueInvoiceFromWorkOrder(workspaceId, "wo_v07", actor);
    const partialPaymentId = await collectPayment(issued.aggregate.id, 4_000, "partial");
    const finalPaymentId = await collectPayment(issued.aggregate.id, 6_000, "final");

    await refundPayment(finalPaymentId, 6_000, "final");
    expect(await queryOne<InvoiceRecord>(
      `SELECT * FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, issued.aggregate.id],
    )).toMatchObject({
      status: "partially_paid",
      amount_paid_minor: 4_000,
      balance_due_minor: 6_000,
      paid_at: null,
    });

    await refundPayment(partialPaymentId, 4_000, "partial");
    expect(await queryOne<InvoiceRecord>(
      `SELECT * FROM ${businessTable("invoice")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, issued.aggregate.id],
    )).toMatchObject({
      status: "issued",
      amount_paid_minor: 0,
      balance_due_minor: 10_000,
    });
  });

  it("voids only unpaid issued Invoices with optimistic locking", async () => {
    const issued = await issueInvoiceFromWorkOrder(workspaceId, "wo_v07", actor);
    const voided = await voidInvoice(
      workspaceId,
      issued.aggregate.id,
      actor,
      1,
      "Customer cancelled",
      "void-v07",
    );
    expect(voided.aggregate).toMatchObject({
      status: "void",
      aggregate_version: 2,
      memo: "Customer cancelled",
    });
    await expect(requestPayment(workspaceId, {
      sourceObjectType: "invoice",
      sourceObjectId: issued.aggregate.id,
      purpose: "final",
      amountMinor: 10_000,
      currency: "USD",
      providerAccountId,
      successUrl: "https://runory.example/success",
      cancelUrl: "https://runory.example/cancel",
    }, actor, "voided-payment")).rejects.toThrow("PAYMENT_SOURCE_INELIGIBLE");
  });
});
