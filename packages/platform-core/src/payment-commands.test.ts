import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyProviderPaymentEvent,
  attachProviderRefund,
  getGovernedPaymentRecord,
  listGovernedPaymentRecords,
  requestPayment,
  requestPaymentRefund,
  upsertPaymentProviderAccount,
} from "./payment-commands";
import { businessTable, TABLES } from "./contracts";
import { db, execute, genId, now, queryOne } from "./db";
import { installModule } from "./installer";
import { runMigrations } from "./migrations";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;
const providerAccountId = "provider_account_stripe_test";
const actor = { type: "user" as const, id: "user_finance" };

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

async function setupPaymentWorkspace() {
  const timestamp = now();
  workspaceId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, 'Payments', ?, ?, ?)`,
    [workspaceId, `payments-${workspaceId}`, timestamp, timestamp],
  );
  await execute(
    `INSERT INTO ${TABLES.users}
     (id, external_id, display_name, status, created_at, updated_at)
     VALUES (?, ?, 'Finance User', 'active', ?, ?)`,
    [actor.id, "user-finance", timestamp, timestamp],
  );
  await execute(
    `INSERT INTO ${TABLES.workspaceMemberships}
     (id, workspace_id, user_id, role, status, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
    [genId("wsmem"), workspaceId, actor.id, timestamp, timestamp],
  );
  await installModule(workspaceId, "runory.contact");
  await installModule(workspaceId, "runory.payment");
  await execute(
    `CREATE TABLE IF NOT EXISTS ${businessTable("quote")} (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT NOT NULL
    )`,
  );
  await execute(
    `INSERT INTO ${businessTable("quote")} (id, workspace_id, status)
     VALUES ('quote_accepted', ?, 'accepted'), ('quote_draft', ?, 'draft')`,
    [workspaceId, workspaceId],
  );
  await upsertPaymentProviderAccount({
    workspaceId,
    id: providerAccountId,
    provider: "stripe",
    mode: "test",
    providerAccountRef: "acct_test_runory",
  });
}

async function createRequest(commandId = "idem_payment_1") {
  return requestPayment(workspaceId, {
    sourceObjectType: "quote",
    sourceObjectId: "quote_accepted",
    purpose: "deposit",
    amountMinor: 12_500,
    currency: "usd",
    providerAccountId,
    customerEmail: "payer@example.com",
    description: "Accepted quote deposit",
    successUrl: "https://runory.example/success",
    cancelUrl: "https://runory.example/cancel",
  }, actor, commandId);
}

beforeEach(async () => {
  await resetDatabase();
  await setupPaymentWorkspace();
});

describe("payment commands", () => {
  it("atomically creates one canonical request, pending payment, audit, events, and checkout outbox", async () => {
    const result = await createRequest();
    expect(result.aggregate).toMatchObject({
      status: "open",
      amount_due_minor: 12_500,
      currency: "USD",
      source_object_id: "quote_accepted",
    });

    const payment = await queryOne<{ status: string; amount_minor: number }>(
      `SELECT status, amount_minor FROM ${businessTable("payment")}
       WHERE workspace_id = ? AND payment_request_id = ?`,
      [workspaceId, result.aggregate.id],
    );
    expect(payment).toEqual({ status: "pending", amount_minor: 12_500 });

    const outbox = await queryOne<{ status: string; payload_json: string }>(
      `SELECT status, payload_json FROM ${TABLES.outboxMessages}
       WHERE workspace_id = ? AND message_type = 'payment.checkout.create'`,
      [workspaceId],
    );
    expect(outbox?.status).toBe("pending");
    expect(JSON.parse(outbox!.payload_json)).toMatchObject({
      paymentRequestId: result.aggregate.id,
      idempotencyKey: "idem_payment_1",
      amountMinor: 12_500,
      currency: "USD",
    });

    const replay = await createRequest();
    expect(replay).toEqual(result);
    const count = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${businessTable("payment_request")} WHERE workspace_id = ?`,
      [workspaceId],
    );
    expect(Number(count?.count)).toBe(1);
  });

  it("projects governed payment records into read-only object pages", async () => {
    const result = await createRequest();

    await expect(listGovernedPaymentRecords(workspaceId, "payment_request", {
      search: result.aggregate.number,
      sortBy: "created_at",
      sortOrder: "desc",
    })).resolves.toEqual([
      expect.objectContaining({
        id: result.aggregate.id,
        number: result.aggregate.number,
        status: "open",
      }),
    ]);

    await expect(getGovernedPaymentRecord(
      workspaceId,
      "payment",
      result.aggregate.paymentId,
    )).resolves.toEqual(expect.objectContaining({
      id: result.aggregate.paymentId,
      payment_request_id: result.aggregate.id,
      status: "pending",
    }));
  });

  it("fails closed for conflicting idempotency input and ineligible sources", async () => {
    await createRequest();
    await expect(requestPayment(workspaceId, {
      sourceObjectType: "quote",
      sourceObjectId: "quote_accepted",
      purpose: "deposit",
      amountMinor: 13_000,
      currency: "USD",
      providerAccountId,
      successUrl: "https://runory.example/success",
      cancelUrl: "https://runory.example/cancel",
    }, actor, "idem_payment_1")).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");

    await expect(requestPayment(workspaceId, {
      sourceObjectType: "quote",
      sourceObjectId: "quote_draft",
      purpose: "deposit",
      amountMinor: 100,
      currency: "USD",
      providerAccountId,
      successUrl: "https://runory.example/success",
      cancelUrl: "https://runory.example/cancel",
    }, actor, "idem_ineligible")).rejects.toThrow("PAYMENT_SOURCE_INELIGIBLE");
  });

  it("accepts only matching provider results and makes webhook replay harmless", async () => {
    const request = await createRequest();
    const event = {
      type: "payment.succeeded" as const,
      provider: "stripe",
      providerEventId: "evt_success_1",
      providerPaymentId: "pi_success_1",
      paymentRequestRef: request.aggregate.id,
      amountMinor: 12_500,
      currency: "usd",
      occurredAt: "2026-07-17T08:00:00.000Z",
    };
    const first = await applyProviderPaymentEvent(
      workspaceId,
      providerAccountId,
      event,
      "payload_hash",
    );
    const replay = await applyProviderPaymentEvent(
      workspaceId,
      providerAccountId,
      event,
      "payload_hash",
    );
    expect(replay).toEqual(first);

    const payment = await queryOne<{ status: string; provider_payment_id: string }>(
      `SELECT status, provider_payment_id FROM ${businessTable("payment")}
       WHERE workspace_id = ? AND payment_request_id = ?`,
      [workspaceId, request.aggregate.id],
    );
    expect(payment).toEqual({ status: "succeeded", provider_payment_id: "pi_success_1" });

    const referenceCount = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${businessTable("payment_provider_reference")}
       WHERE workspace_id = ? AND provider_event_id = 'evt_success_1'`,
      [workspaceId],
    );
    expect(Number(referenceCount?.count)).toBe(1);
  });

  it("rejects amount, currency, and provider-account mismatches without changing state", async () => {
    const request = await createRequest();
    const base = {
      type: "payment.succeeded" as const,
      provider: "stripe",
      providerPaymentId: "pi_mismatch",
      paymentRequestRef: request.aggregate.id,
      amountMinor: 12_500,
      currency: "USD",
      occurredAt: "2026-07-17T08:00:00.000Z",
    };
    await expect(applyProviderPaymentEvent(workspaceId, providerAccountId, {
      ...base,
      providerEventId: "evt_amount_mismatch",
      amountMinor: 12_499,
    })).rejects.toThrow("PAYMENT_AMOUNT_MISMATCH");
    await expect(applyProviderPaymentEvent(workspaceId, providerAccountId, {
      ...base,
      providerEventId: "evt_currency_mismatch",
      currency: "EUR",
    })).rejects.toThrow("PAYMENT_CURRENCY_MISMATCH");
    await expect(applyProviderPaymentEvent(workspaceId, providerAccountId, {
      ...base,
      providerEventId: "evt_account_mismatch",
      providerAccountId: "acct_live_other",
    })).rejects.toThrow("PAYMENT_PROVIDER_ACCOUNT_MISMATCH");

    const payment = await queryOne<{ status: string }>(
      `SELECT status FROM ${businessTable("payment")}
       WHERE workspace_id = ? AND payment_request_id = ?`,
      [workspaceId, request.aggregate.id],
    );
    expect(payment?.status).toBe("pending");
  });

  it("does not let an out-of-order failure overwrite a succeeded payment", async () => {
    const request = await createRequest();
    await applyProviderPaymentEvent(workspaceId, providerAccountId, {
      type: "payment.succeeded",
      provider: "stripe",
      providerEventId: "evt_success_before_failure",
      providerPaymentId: "pi_out_of_order",
      paymentRequestRef: request.aggregate.id,
      amountMinor: 12_500,
      currency: "USD",
      occurredAt: "2026-07-17T08:00:00.000Z",
    });
    await applyProviderPaymentEvent(workspaceId, providerAccountId, {
      type: "payment.failed",
      provider: "stripe",
      providerEventId: "evt_late_failure",
      providerPaymentId: "pi_out_of_order",
      paymentRequestRef: request.aggregate.id,
      safeFailureCode: "card_declined",
      occurredAt: "2026-07-17T07:59:00.000Z",
    });
    const payment = await queryOne<{ status: string; failure_code: string | null }>(
      `SELECT status, failure_code FROM ${businessTable("payment")}
       WHERE workspace_id = ? AND payment_request_id = ?`,
      [workspaceId, request.aggregate.id],
    );
    expect(payment).toEqual({ status: "succeeded", failure_code: null });
  });

  it("enforces cumulative refund limits and confirms partial then full refunds idempotently", async () => {
    const request = await createRequest();
    await applyProviderPaymentEvent(workspaceId, providerAccountId, {
      type: "payment.succeeded",
      provider: "stripe",
      providerEventId: "evt_paid_for_refund",
      providerPaymentId: "pi_refundable",
      paymentRequestRef: request.aggregate.id,
      amountMinor: 12_500,
      currency: "USD",
      occurredAt: "2026-07-17T08:00:00.000Z",
    });

    const first = await requestPaymentRefund(
      workspaceId,
      request.aggregate.paymentId,
      2_500,
      "Customer adjustment",
      actor,
      "refund_request_1",
    );
    await attachProviderRefund({
      workspaceId,
      refundId: first.aggregate.id,
      providerRefundId: "re_partial",
    });
    const partialEvent = {
      type: "refund.succeeded" as const,
      provider: "stripe",
      providerEventId: "evt_refund_partial",
      providerRefundId: "re_partial",
      providerPaymentId: "pi_refundable",
      amountMinor: 2_500,
      currency: "USD",
      occurredAt: "2026-07-17T09:00:00.000Z",
    };
    const partial = await applyProviderPaymentEvent(
      workspaceId,
      providerAccountId,
      partialEvent,
    );
    expect(await applyProviderPaymentEvent(
      workspaceId,
      providerAccountId,
      partialEvent,
    )).toEqual(partial);

    await expect(requestPaymentRefund(
      workspaceId,
      request.aggregate.paymentId,
      10_001,
      undefined,
      actor,
      "refund_too_large",
    )).rejects.toThrow("PAYMENT_REFUND_EXCEEDS_BALANCE");

    const second = await requestPaymentRefund(
      workspaceId,
      request.aggregate.paymentId,
      10_000,
      undefined,
      actor,
      "refund_request_2",
    );
    await attachProviderRefund({
      workspaceId,
      refundId: second.aggregate.id,
      providerRefundId: "re_final",
    });
    await applyProviderPaymentEvent(workspaceId, providerAccountId, {
      type: "refund.succeeded",
      provider: "stripe",
      providerEventId: "evt_refund_final",
      providerRefundId: "re_final",
      providerPaymentId: "pi_refundable",
      amountMinor: 10_000,
      currency: "USD",
      occurredAt: "2026-07-17T10:00:00.000Z",
    });

    const payment = await queryOne<{ status: string; refunded_amount_minor: number }>(
      `SELECT status, refunded_amount_minor FROM ${businessTable("payment")}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, request.aggregate.paymentId],
    );
    expect(payment).toEqual({ status: "refunded", refunded_amount_minor: 12_500 });
  });
});
