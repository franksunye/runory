import type Stripe from "stripe";
import {
  applyBillingSubscriptionEvent,
  type BillingSubscriptionEvent,
  type BillingSubscriptionStatus,
} from "@runory/platform-core";
import { resolveBillingPlan } from "./config";
import { getRunoryBillingStripeClient } from "./client";

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id: unknown }).id);
  }
  return null;
}

function isoFromSeconds(value: unknown): string | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
}

function subscriptionPeriod(subscription: Stripe.Subscription): {
  start: string | null;
  end: string | null;
} {
  const record = subscription as unknown as Record<string, unknown>;
  const firstItem = subscription.items.data[0] as unknown as Record<string, unknown> | undefined;
  return {
    start: isoFromSeconds(record.current_period_start ?? firstItem?.current_period_start),
    end: isoFromSeconds(record.current_period_end ?? firstItem?.current_period_end),
  };
}

function toSubscriptionEvent(
  event: Stripe.Event,
  subscription: Stripe.Subscription,
  latestInvoiceId?: string | null,
): BillingSubscriptionEvent {
  const organizationId = subscription.metadata.organization_id?.trim();
  if (!organizationId) throw new Error("BILLING_ORGANIZATION_METADATA_MISSING");
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) throw new Error("BILLING_SUBSCRIPTION_PRICE_MISSING");
  const customerId = idOf(subscription.customer);
  if (!customerId) throw new Error("BILLING_CUSTOMER_MISSING");
  const period = subscriptionPeriod(subscription);

  return {
    providerEventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    payloadHash: "",
    organizationId,
    providerCustomerId: customerId,
    providerSubscriptionId: subscription.id,
    providerPriceId: priceId,
    plan: resolveBillingPlan(priceId),
    status: subscription.status as BillingSubscriptionStatus,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    latestInvoiceId: latestInvoiceId ?? idOf(subscription.latest_invoice),
  };
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const record = invoice as unknown as Record<string, unknown>;
  const parent = record.parent as Record<string, unknown> | null | undefined;
  const details = parent?.subscription_details as Record<string, unknown> | null | undefined;
  return idOf(record.subscription) ?? idOf(details?.subscription);
}

export async function applyRunoryBillingStripeEvent(
  event: Stripe.Event,
  payloadHash: string,
) {
  let snapshot: BillingSubscriptionEvent | null = null;
  if (
    event.type === "customer.subscription.created"
    || event.type === "customer.subscription.updated"
    || event.type === "customer.subscription.deleted"
  ) {
    snapshot = toSubscriptionEvent(event, event.data.object as Stripe.Subscription);
  } else if (
    event.type === "checkout.session.completed"
    || event.type === "invoice.paid"
    || event.type === "invoice.payment_failed"
  ) {
    const object = event.data.object;
    const subscriptionId = event.type === "checkout.session.completed"
      ? idOf((object as Stripe.Checkout.Session).subscription)
      : invoiceSubscriptionId(object as Stripe.Invoice);
    if (!subscriptionId) return { ignored: true };
    const subscription = await getRunoryBillingStripeClient().subscriptions.retrieve(subscriptionId);
    snapshot = toSubscriptionEvent(
      event,
      subscription,
      event.type.startsWith("invoice.") ? (object as Stripe.Invoice).id : null,
    );
  } else {
    return { ignored: true };
  }

  return applyBillingSubscriptionEvent({ ...snapshot, payloadHash });
}
