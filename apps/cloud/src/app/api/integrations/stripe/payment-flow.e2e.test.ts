import { existsSync, rmSync } from "node:fs";
import Stripe from "stripe";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  TABLES,
  businessTable,
  createRecord,
  db,
  execute,
  genId,
  installPack,
  now,
  queryOne,
  runMigrations,
} from "@runory/platform-core";
import { mapStripeEvent } from "@/integrations/payments/stripe/mapper";

const TEST_DB = "/tmp/runory-stripe-payment-e2e.db";
const WEBHOOK_SECRET = "whsec_runory_payment_e2e";
const stripeForSignatures = new Stripe("sk_test_runory_e2e");
let workspaceId: string;
let quoteId: string;

process.env.LIBSQL_URL = `file:${TEST_DB}`;
process.env.LIBSQL_AUTH_TOKEN = "";
process.env.PLATFORM_DEV_BOOTSTRAP = "true";
process.env.STRIPE_SECRET_KEY = "sk_test_runory_e2e";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_PAYMENT_MODE = "test";
process.env.STRIPE_PAYMENT_CURRENCY = "USD";
process.env.STRIPE_PAYMENT_PROVIDER_ACCOUNT_ID = "provider_stripe_e2e";
process.env.STRIPE_ACCOUNT_ID = "acct_test_runory_e2e";

vi.mock("@/integrations/payments/registry", () => ({
  getPaymentProvider: () => ({
    createCheckout: vi.fn(async (input: {
      paymentRequestId: string;
      providerAccountId: string;
      expiresAt?: string;
    }) => ({
      provider: "stripe",
      providerAccountId: input.providerAccountId,
      providerCheckoutId: `cs_test_${input.paymentRequestId}`,
      checkoutUrl: `https://checkout.stripe.test/${input.paymentRequestId}`,
      expiresAt: input.expiresAt,
    })),
    createRefund: vi.fn(async (input: {
      paymentId: string;
      providerAccountId: string;
    }) => ({
      provider: "stripe",
      providerAccountId: input.providerAccountId,
      providerRefundId: `re_test_${input.paymentId}`,
      status: "processing",
    })),
    parseWebhook: vi.fn(async (input: {
      rawBody: Uint8Array;
      signature: string;
      webhookSecret: string;
    }) => {
      const event = stripeForSignatures.webhooks.constructEvent(
        input.rawBody,
        input.signature,
        input.webhookSecret,
      );
      return mapStripeEvent(event);
    }),
    retrievePayment: vi.fn(),
  }),
}));

import { POST as requestCheckout, GET as listSourcePayments } from "@/app/api/workspaces/[id]/payments/requests/route";
import { POST as requestRefund } from "@/app/api/workspaces/[id]/payments/[paymentId]/refunds/route";
import { POST as receiveStripeWebhook } from "./webhook/route";

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
  workspaceId = genId("ws");
  process.env.STRIPE_PAYMENT_WORKSPACE_ID = workspaceId;
  const timestamp = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, 'Stripe E2E', ?, ?, ?)`,
    [workspaceId, `stripe-e2e-${workspaceId.slice(-8)}`, timestamp, timestamp],
  );
  await installPack(workspaceId, "sales-quote-pack");

  // Migration 0048 (Connect columns) is tolerant and may have been skipped
  // because the payment_provider_account table didn't exist when migrations
  // ran. Ensure the Connect columns exist before inserting a Connect account.
  const ppaTable = businessTable("payment_provider_account");
  const ppaCols = await db.execute({ sql: `PRAGMA table_info(${ppaTable})` });
  const colNames = new Set(ppaCols.rows.map((r) => (r as unknown as { name: string }).name));
  const connectCols: Record<string, string> = {
    account_configuration_version: "TEXT",
    onboarding_status: "TEXT NOT NULL DEFAULT 'not_started'",
    details_submitted: "INTEGER NOT NULL DEFAULT 0",
    charges_enabled: "INTEGER NOT NULL DEFAULT 0",
    payouts_enabled: "INTEGER NOT NULL DEFAULT 0",
    requirements_status: "TEXT NOT NULL DEFAULT 'clear'",
    requirements_json: "TEXT",
    last_synced_at: "TEXT",
    disconnected_at: "TEXT",
    aggregate_version: "INTEGER NOT NULL DEFAULT 1",
  };
  for (const [col, def] of Object.entries(connectCols)) {
    if (!colNames.has(col)) {
      await execute(`ALTER TABLE ${ppaTable} ADD COLUMN ${col} ${def}`);
    }
  }

  // Create a Connect-ready Stripe provider account (Tech Spec §9).
  // The route resolves the Connect account and calls assertConnectReady,
  // so the account must be fully onboarded with a recent sync.
  await execute(
    `INSERT INTO ${ppaTable}
      (id, workspace_id, provider, mode, provider_account_ref, status,
       account_configuration_version, onboarding_status, details_submitted,
       charges_enabled, payouts_enabled, requirements_status, requirements_json,
       last_synced_at, disconnected_at, aggregate_version, created_at, updated_at)
     VALUES (?, ?, 'stripe', 'test', ?, 'active',
       1, 'complete', 1, 1, 1, 'clear', NULL,
       ?, NULL, 1, ?, ?)`,
    [
      process.env.STRIPE_PAYMENT_PROVIDER_ACCOUNT_ID!,
      workspaceId,
      process.env.STRIPE_ACCOUNT_ID!,
      timestamp,
      timestamp,
      timestamp,
    ],
  );

  const quote = await createRecord(workspaceId, "quote", {
    quote_number: "Q-E2E-STRIPE",
    title: "Stripe E2E accepted quote",
    status: "accepted",
    version: 1,
    currency: "USD",
    grand_total: 125,
  });
  quoteId = String(quote.id);
}

function signedWebhook(event: Record<string, unknown>, signatureOverride?: string) {
  const payload = JSON.stringify(event);
  const signature = signatureOverride ?? stripeForSignatures.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return new NextRequest("https://runory.example/api/integrations/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
}

function workspaceRequest(path: string, body?: unknown, idempotencyKey?: string) {
  return new NextRequest(`https://runory.example${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(() => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB);
});

beforeEach(async () => {
  await resetDatabase();
  await setupWorkspace();
});

describe("Stripe payment route E2E", () => {
  it("closes request → Checkout → signed success → replay → refund through HTTP boundaries", async () => {
    const checkoutResponse = await requestCheckout(
      workspaceRequest(`/api/workspaces/${workspaceId}/payments/requests`, {
        sourceObjectType: "quote",
        sourceObjectId: quoteId,
        purpose: "deposit",
        amountMinor: 12_500,
        currency: "USD",
        description: "E2E quote deposit",
      }, "e2e_checkout_1"),
      { params: Promise.resolve({ id: workspaceId }) },
    );
    expect(checkoutResponse.status).toBe(201);
    const checkoutBody = await checkoutResponse.json() as {
      data: { paymentRequest: { id: string }; paymentId: string; checkoutUrl: string };
    };
    expect(checkoutBody.data.checkoutUrl).toContain("checkout.stripe.test");

    const paidEvent = {
      id: "evt_e2e_paid",
      object: "event",
      created: 1_721_203_200,
      account: "acct_test_runory_e2e",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_e2e",
          payment_status: "paid",
          payment_intent: "pi_e2e_paid",
          amount_total: 12_500,
          currency: "usd",
          metadata: { payment_request_id: checkoutBody.data.paymentRequest.id },
        },
      },
    };
    const firstWebhook = await receiveStripeWebhook(signedWebhook(paidEvent));
    expect(firstWebhook.status).toBe(200);
    const replayWebhook = await receiveStripeWebhook(signedWebhook(paidEvent));
    expect(replayWebhook.status).toBe(200);

    const paymentAfterReplay = await queryOne<{ status: string }>(
      `SELECT status FROM ${businessTable("payment")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, checkoutBody.data.paymentId],
    );
    expect(paymentAfterReplay?.status).toBe("succeeded");
    const reference = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${businessTable("payment_provider_reference")}
       WHERE workspace_id = ? AND provider_event_id = 'evt_e2e_paid'`,
      [workspaceId],
    );
    expect(Number(reference?.count)).toBe(1);

    const listResponse = await listSourcePayments(
      workspaceRequest(`/api/workspaces/${workspaceId}/payments/requests?sourceObjectType=quote&sourceObjectId=${quoteId}`),
      { params: Promise.resolve({ id: workspaceId }) },
    );
    await expect(listResponse.json()).resolves.toMatchObject({
      data: [expect.objectContaining({
        id: checkoutBody.data.paymentRequest.id,
        status: "paid",
        payment: expect.objectContaining({ status: "succeeded" }),
      })],
    });

    const invalidWebhook = await receiveStripeWebhook(signedWebhook({
      ...paidEvent,
      id: "evt_e2e_invalid_signature",
    }, "t=1,v1=invalid"));
    expect(invalidWebhook.status).toBe(400);

    const refundResponse = await requestRefund(
      workspaceRequest(`/api/workspaces/${workspaceId}/payments/${checkoutBody.data.paymentId}/refunds`, {
        amountMinor: 12_500,
        reason: "E2E full refund",
      }, "e2e_refund_1"),
      { params: Promise.resolve({ id: workspaceId, paymentId: checkoutBody.data.paymentId }) },
    );
    expect(refundResponse.status).toBe(202);
    const refundBody = await refundResponse.json() as {
      data: { refund: { id: string; provider_refund_id: string } };
    };

    const refundWebhook = await receiveStripeWebhook(signedWebhook({
      id: "evt_e2e_refunded",
      object: "event",
      created: 1_721_206_800,
      account: "acct_test_runory_e2e",
      type: "refund.updated",
      data: {
        object: {
          id: refundBody.data.refund.provider_refund_id,
          status: "succeeded",
          payment_intent: "pi_e2e_paid",
          amount: 12_500,
          currency: "usd",
        },
      },
    }));
    expect(refundWebhook.status).toBe(200);

    const finalPayment = await queryOne<{ status: string; refunded_amount_minor: number }>(
      `SELECT status, refunded_amount_minor FROM ${businessTable("payment")}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, checkoutBody.data.paymentId],
    );
    expect(finalPayment).toEqual({ status: "refunded", refunded_amount_minor: 12_500 });
  });
});
