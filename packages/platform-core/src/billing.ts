import { createHash } from "node:crypto";
import { batch, genId, now, queryAll, queryOne } from "./db";
import { TABLES } from "./contracts";
import { EARLY_ACCESS_QUOTAS, type QuotaMetric } from "./entitlements";

export type BillingPlan = "starter" | "pro" | "enterprise";
export type BillingSubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface BillingCustomer {
  id: string;
  organizationId: string;
  provider: "stripe";
  providerCustomerId: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingSubscription {
  id: string;
  organizationId: string;
  billingCustomerId: string;
  provider: "stripe";
  providerSubscriptionId: string;
  providerPriceId: string;
  plan: BillingPlan;
  status: BillingSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  latestInvoiceId: string | null;
  lastProviderEventCreated: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingSubscriptionEvent {
  providerEventId: string;
  eventType: string;
  eventCreated: number;
  payloadHash: string;
  organizationId: string;
  providerCustomerId: string;
  customerEmail?: string | null;
  providerSubscriptionId: string;
  providerPriceId: string;
  plan: BillingPlan;
  status: BillingSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  latestInvoiceId?: string | null;
}

const PRO_QUOTAS: Record<QuotaMetric, number> = {
  workspaces: 20,
  members: 50,
  records: 500_000,
  storage_bytes: 50 * 1024 * 1024 * 1024,
  api_requests: 1_000_000,
  agent_operations: 10_000,
};

function quotasForPlan(plan: BillingPlan | "early_access"): Record<QuotaMetric, number> {
  if (plan === "pro") return PRO_QUOTAS;
  return EARLY_ACCESS_QUOTAS;
}

function mapCustomer(row: {
  id: string;
  organization_id: string;
  provider: string;
  provider_customer_id: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}): BillingCustomer {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: "stripe",
    providerCustomerId: row.provider_customer_id,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubscription(row: {
  id: string;
  organization_id: string;
  billing_customer_id: string;
  provider: string;
  provider_subscription_id: string;
  provider_price_id: string;
  plan: string;
  status: string;
  cancel_at_period_end: number;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  latest_invoice_id: string | null;
  last_provider_event_created: number;
  created_at: string;
  updated_at: string;
}): BillingSubscription {
  return {
    id: row.id,
    organizationId: row.organization_id,
    billingCustomerId: row.billing_customer_id,
    provider: "stripe",
    providerSubscriptionId: row.provider_subscription_id,
    providerPriceId: row.provider_price_id,
    plan: row.plan as BillingPlan,
    status: row.status as BillingSubscriptionStatus,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    graceUntil: row.grace_until,
    latestInvoiceId: row.latest_invoice_id,
    lastProviderEventCreated: row.last_provider_event_created,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getBillingCustomer(organizationId: string): Promise<BillingCustomer | null> {
  const row = await queryOne<Parameters<typeof mapCustomer>[0]>(
    `SELECT * FROM ${TABLES.billingCustomers} WHERE organization_id = ?`,
    [organizationId],
  );
  return row ? mapCustomer(row) : null;
}

export async function upsertBillingCustomer(input: {
  organizationId: string;
  providerCustomerId: string;
  email?: string | null;
}): Promise<BillingCustomer> {
  const timestamp = now();
  const existing = await getBillingCustomer(input.organizationId);
  await batch([{
    sql: `INSERT INTO ${TABLES.billingCustomers}
      (id, organization_id, provider, provider_customer_id, email, created_at, updated_at)
      VALUES (?, ?, 'stripe', ?, ?, ?, ?)
      ON CONFLICT(organization_id) DO UPDATE SET
        provider_customer_id = excluded.provider_customer_id,
        email = COALESCE(excluded.email, ${TABLES.billingCustomers}.email),
        updated_at = excluded.updated_at`,
    args: [
      existing?.id ?? genId("bilcus"),
      input.organizationId,
      input.providerCustomerId,
      input.email?.trim() || null,
      existing?.createdAt ?? timestamp,
      timestamp,
    ],
  }]);
  return (await getBillingCustomer(input.organizationId))!;
}

export async function getBillingSubscription(
  organizationId: string,
): Promise<BillingSubscription | null> {
  const row = await queryOne<Parameters<typeof mapSubscription>[0]>(
    `SELECT * FROM ${TABLES.subscriptions} WHERE organization_id = ?`,
    [organizationId],
  );
  return row ? mapSubscription(row) : null;
}

export async function applyBillingSubscriptionEvent(
  event: BillingSubscriptionEvent,
): Promise<{ subscription: BillingSubscription; replayed: boolean; ignored: boolean }> {
  const priorEvent = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.billingWebhookEvents} WHERE provider_event_id = ?`,
    [event.providerEventId],
  );
  if (priorEvent) {
    const subscription = await getBillingSubscription(event.organizationId);
    if (!subscription) throw new Error("BILLING_REPLAY_WITHOUT_SUBSCRIPTION");
    return { subscription, replayed: true, ignored: false };
  }

  const timestamp = now();
  const customer = await getBillingCustomer(event.organizationId);
  const customerId = customer?.id ?? genId("bilcus");
  const existing = await getBillingSubscription(event.organizationId);
  const outOfOrder = Boolean(
    existing && event.eventCreated < existing.lastProviderEventCreated,
  );

  if (outOfOrder) {
    await batch([{
      sql: `INSERT INTO ${TABLES.billingWebhookEvents}
        (id, provider, provider_event_id, event_type, event_created, payload_hash,
         processed_status, error_code, processed_at, created_at)
        VALUES (?, 'stripe', ?, ?, ?, ?, 'ignored', 'OUT_OF_ORDER', ?, ?)`,
      args: [
        genId("bilevt"), event.providerEventId, event.eventType,
        event.eventCreated, event.payloadHash, timestamp, timestamp,
      ],
    }]);
    return { subscription: existing!, replayed: false, ignored: true };
  }

  const paidAccess = event.status === "active"
    || event.status === "trialing"
    || event.status === "past_due";
  const entitlementPlan = paidAccess ? event.plan : "early_access";
  const entitlementStatus = "active";
  const graceUntil = event.status === "past_due"
    ? existing?.graceUntil
      ?? new Date((event.eventCreated + 7 * 24 * 60 * 60) * 1000).toISOString()
    : null;
  const subscriptionId = existing?.id ?? genId("sub");
  const entitlementQuotas = quotasForPlan(entitlementPlan);

  await batch([
    {
      sql: `INSERT INTO ${TABLES.billingCustomers}
        (id, organization_id, provider, provider_customer_id, email, created_at, updated_at)
        VALUES (?, ?, 'stripe', ?, ?, ?, ?)
        ON CONFLICT(organization_id) DO UPDATE SET
          provider_customer_id = excluded.provider_customer_id,
          email = COALESCE(excluded.email, ${TABLES.billingCustomers}.email),
          updated_at = excluded.updated_at`,
      args: [
        customerId, event.organizationId, event.providerCustomerId,
        event.customerEmail?.trim() || null, customer?.createdAt ?? timestamp, timestamp,
      ],
    },
    {
      sql: `INSERT INTO ${TABLES.subscriptions}
        (id, organization_id, billing_customer_id, provider, provider_subscription_id,
         provider_price_id, plan, status, cancel_at_period_end, current_period_start,
         current_period_end, grace_until, latest_invoice_id, last_provider_event_created,
         created_at, updated_at)
        VALUES (?, ?, ?, 'stripe', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id) DO UPDATE SET
          billing_customer_id = excluded.billing_customer_id,
          provider_subscription_id = excluded.provider_subscription_id,
          provider_price_id = excluded.provider_price_id,
          plan = excluded.plan,
          status = excluded.status,
          cancel_at_period_end = excluded.cancel_at_period_end,
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          grace_until = excluded.grace_until,
          latest_invoice_id = COALESCE(excluded.latest_invoice_id, ${TABLES.subscriptions}.latest_invoice_id),
          last_provider_event_created = excluded.last_provider_event_created,
          updated_at = excluded.updated_at`,
      args: [
        subscriptionId, event.organizationId, customerId, event.providerSubscriptionId,
        event.providerPriceId, event.plan, event.status, event.cancelAtPeriodEnd ? 1 : 0,
        event.currentPeriodStart ?? null, event.currentPeriodEnd ?? null, graceUntil,
        event.latestInvoiceId ?? null, event.eventCreated, existing?.createdAt ?? timestamp,
        timestamp,
      ],
    },
    {
      sql: `INSERT INTO ${TABLES.organizationEntitlements}
        (id, organization_id, plan, status, quotas_json, overrides_json, effective_at,
         expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '{}', ?, NULL, ?, ?)
        ON CONFLICT(organization_id) DO UPDATE SET
          plan = excluded.plan,
          status = excluded.status,
          quotas_json = excluded.quotas_json,
          effective_at = excluded.effective_at,
          expires_at = NULL,
          updated_at = excluded.updated_at`,
      args: [
        genId("ent"), event.organizationId, entitlementPlan, entitlementStatus,
        JSON.stringify(entitlementQuotas), timestamp, timestamp, timestamp,
      ],
    },
    {
      sql: `INSERT INTO ${TABLES.billingWebhookEvents}
        (id, provider, provider_event_id, event_type, event_created, payload_hash,
         processed_status, error_code, processed_at, created_at)
        VALUES (?, 'stripe', ?, ?, ?, ?, 'processed', NULL, ?, ?)`,
      args: [
        genId("bilevt"), event.providerEventId, event.eventType,
        event.eventCreated, event.payloadHash, timestamp, timestamp,
      ],
    },
  ]);

  return {
    subscription: (await getBillingSubscription(event.organizationId))!,
    replayed: false,
    ignored: false,
  };
}

export async function listBillingWebhookEvents(
  providerEventId?: string,
): Promise<Array<Record<string, unknown>>> {
  return queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.billingWebhookEvents}
     ${providerEventId ? "WHERE provider_event_id = ?" : ""}
     ORDER BY event_created DESC`,
    providerEventId ? [providerEventId] : [],
  );
}

export function hashBillingPayload(rawBody: Uint8Array): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
