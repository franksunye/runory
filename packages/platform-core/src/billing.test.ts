import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyBillingSubscriptionEvent,
  getBillingSubscription,
  listBillingWebhookEvents,
  upsertBillingCustomer,
  type BillingSubscriptionEvent,
} from "./billing";
import { db, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import { getEntitlement, provisionEntitlement } from "./entitlements";
import { runMigrations } from "./migrations";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

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

function event(overrides: Partial<BillingSubscriptionEvent> = {}): BillingSubscriptionEvent {
  return {
    providerEventId: "evt_subscription_active",
    eventType: "customer.subscription.updated",
    eventCreated: 1_800_000_000,
    payloadHash: "payload_hash",
    organizationId,
    providerCustomerId: "cus_runory_test",
    providerSubscriptionId: "sub_runory_test",
    providerPriceId: "price_runory_pro",
    plan: "pro",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodStart: "2027-01-01T00:00:00.000Z",
    currentPeriodEnd: "2027-02-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
  organizationId = genId("org");
  const timestamp = now();
  await execute(
    `INSERT INTO ${TABLES.organizations} (id, name, slug, created_at, updated_at)
     VALUES (?, 'Billing Test', ?, ?, ?)`,
    [organizationId, `billing-${organizationId}`, timestamp, timestamp],
  );
  await provisionEntitlement(organizationId);
});

describe("Runory subscription billing projection", () => {
  it("maps a paid Stripe subscription to the Organization entitlement", async () => {
    const result = await applyBillingSubscriptionEvent(event());

    expect(result.subscription).toMatchObject({
      organizationId,
      plan: "pro",
      status: "active",
      providerSubscriptionId: "sub_runory_test",
    });
    await expect(getEntitlement(organizationId)).resolves.toMatchObject({
      plan: "pro",
      status: "active",
      quotas: { workspaces: 20, members: 50 },
    });
  });

  it("makes duplicate and out-of-order provider events harmless", async () => {
    const first = await applyBillingSubscriptionEvent(event());
    const replay = await applyBillingSubscriptionEvent(event());
    const old = await applyBillingSubscriptionEvent(event({
      providerEventId: "evt_old_cancel",
      eventCreated: 1_700_000_000,
      status: "canceled",
    }));

    expect(replay).toMatchObject({ replayed: true });
    expect(old).toMatchObject({ ignored: true });
    expect(await getBillingSubscription(organizationId)).toEqual(first.subscription);
    expect(await listBillingWebhookEvents()).toHaveLength(2);
  });

  it("keeps paid access during payment-failure grace and downgrades after cancellation", async () => {
    await applyBillingSubscriptionEvent(event());
    const pastDue = await applyBillingSubscriptionEvent(event({
      providerEventId: "evt_past_due",
      eventCreated: 1_800_000_100,
      status: "past_due",
    }));
    expect(pastDue.subscription.graceUntil).toBeTruthy();
    await expect(getEntitlement(organizationId)).resolves.toMatchObject({ plan: "pro" });

    await applyBillingSubscriptionEvent(event({
      providerEventId: "evt_cancelled",
      eventCreated: 1_800_000_200,
      status: "canceled",
    }));
    await expect(getEntitlement(organizationId)).resolves.toMatchObject({
      plan: "early_access",
      status: "active",
    });
  });

  it("keeps exactly one Stripe Customer per Organization", async () => {
    await upsertBillingCustomer({
      organizationId,
      providerCustomerId: "cus_first",
      email: "owner@example.com",
    });
    const updated = await upsertBillingCustomer({
      organizationId,
      providerCustomerId: "cus_first",
      email: "new-owner@example.com",
    });
    expect(updated).toMatchObject({
      providerCustomerId: "cus_first",
      email: "new-owner@example.com",
    });
  });
});
