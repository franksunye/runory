import Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  db,
  execute,
  genId,
  getBillingSubscription,
  getEntitlement,
  now,
  provisionEntitlement,
  runMigrations,
  TABLES,
} from "@runory/platform-core";
import { POST } from "./billing-webhook/route";
import { resetRunoryBillingStripeClientForTests } from "@/integrations/billing/stripe/client";
import { resetRunoryBillingStripeConfigForTests } from "@/integrations/billing/stripe/config";

const secret = "whsec_runory_billing_unit";
const stripe = new Stripe("sk_test_unit");
let organizationId: string;

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

function payload(input: {
  eventId: string;
  created: number;
  status: string;
}): string {
  return JSON.stringify({
    id: input.eventId,
    object: "event",
    created: input.created,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_runory_http",
        object: "subscription",
        customer: "cus_runory_http",
        status: input.status,
        cancel_at_period_end: false,
        current_period_start: 1_800_000_000,
        current_period_end: 1_802_678_400,
        latest_invoice: "in_runory_http",
        metadata: {
          organization_id: organizationId,
          plan_id: "pro",
        },
        items: {
          object: "list",
          data: [{
            id: "si_runory_http",
            object: "subscription_item",
            price: { id: "price_runory_pro_test", object: "price" },
          }],
        },
      },
    },
  });
}

function signedRequest(body: string, signature?: string): NextRequest {
  return new NextRequest("http://localhost/api/integrations/stripe/billing-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature
        ?? stripe.webhooks.generateTestHeaderString({ payload: body, secret }),
    },
    body,
  });
}

beforeEach(async () => {
  process.env.RUNORY_BILLING_STRIPE_SECRET_KEY = "sk_test_unit";
  process.env.RUNORY_BILLING_STRIPE_WEBHOOK_SECRET = secret;
  process.env.RUNORY_BILLING_STRIPE_MODE = "test";
  process.env.RUNORY_BILLING_PRO_PRICE_ID = "price_runory_pro_test";
  resetRunoryBillingStripeConfigForTests();
  resetRunoryBillingStripeClientForTests();
  await resetDatabase();
  organizationId = genId("org");
  const timestamp = now();
  await execute(
    `INSERT INTO ${TABLES.organizations} (id, name, slug, created_at, updated_at)
     VALUES (?, 'Billing HTTP', ?, ?, ?)`,
    [organizationId, `billing-http-${organizationId}`, timestamp, timestamp],
  );
  await provisionEntitlement(organizationId);
});

describe("Stripe Billing webhook HTTP boundary", () => {
  it("projects signed subscription state and rejects replay/order/signature attacks", async () => {
    const activePayload = payload({
      eventId: "evt_billing_active_http",
      created: 1_800_000_000,
      status: "active",
    });
    expect((await POST(signedRequest(activePayload))).status).toBe(200);
    await expect(getEntitlement(organizationId)).resolves.toMatchObject({ plan: "pro" });

    expect((await POST(signedRequest(activePayload))).status).toBe(200);
    const oldCancelled = payload({
      eventId: "evt_billing_old_cancelled_http",
      created: 1_700_000_000,
      status: "canceled",
    });
    expect((await POST(signedRequest(oldCancelled))).status).toBe(200);
    await expect(getBillingSubscription(organizationId)).resolves.toMatchObject({
      status: "active",
      lastProviderEventCreated: 1_800_000_000,
    });

    expect((await POST(signedRequest(activePayload, "t=1,v1=invalid"))).status).toBe(400);
  });
});
