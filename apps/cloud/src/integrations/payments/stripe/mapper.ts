import type { NormalizedPaymentEvent } from "../contracts";

interface StripeEventLike {
  id: string;
  type: string;
  created?: number;
  account?: string;
  data?: { object?: unknown };
}

interface StripeRequirements {
  disabled_reason?: string | null;
  currently_due?: string[];
  past_due?: string[];
  eventually_due?: string[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function requiredString(value: unknown, code: string): string {
  const result = asString(value);
  if (!result) throw new Error(code);
  return result;
}

function requiredInteger(value: unknown, code: string): number {
  const result = asInteger(value);
  if (result === undefined) throw new Error(code);
  return result;
}

function occurredAt(event: StripeEventLike): string {
  return new Date((event.created ?? 0) * 1000).toISOString();
}

function metadata(object: Record<string, unknown>): Record<string, unknown> {
  const value = object.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveRequirementsStatus(requirements: StripeRequirements | undefined): string {
  if (!requirements) return "clear";
  if (requirements.disabled_reason) return "disabled";
  if (requirements.past_due && requirements.past_due.length > 0) return "past_due";
  if (requirements.currently_due && requirements.currently_due.length > 0) return "due";
  if (requirements.eventually_due && requirements.eventually_due.length > 0) return "due";
  return "clear";
}

export function mapStripeEvent(event: StripeEventLike): NormalizedPaymentEvent | null {
  const candidate = event.data?.object;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("STRIPE_EVENT_OBJECT_MISSING");
  }
  const object = candidate as Record<string, unknown>;

  const providerAccountId = asString(event.account);
  const eventTime = occurredAt(event);
  const meta = metadata(object);

  switch (event.type) {
    case "checkout.session.completed": {
      const paymentStatus = asString(object.payment_status);
      if (paymentStatus !== "paid") return null;

      return {
        type: "payment.succeeded",
        provider: "stripe",
        providerEventId: event.id,
        providerAccountId,
        providerPaymentId: requiredString(object.payment_intent, "STRIPE_PAYMENT_INTENT_MISSING"),
        paymentRequestRef: requiredString(meta.payment_request_id, "STRIPE_PAYMENT_REQUEST_REF_MISSING"),
        amountMinor: requiredInteger(object.amount_total, "STRIPE_AMOUNT_MISSING"),
        currency: requiredString(object.currency, "STRIPE_CURRENCY_MISSING").toUpperCase(),
        occurredAt: eventTime,
      };
    }

    case "payment_intent.succeeded": {
      // Async payment success path — provides an alternative to
      // checkout.session.completed for payments that settle asynchronously.
      return {
        type: "payment.succeeded",
        provider: "stripe",
        providerEventId: event.id,
        providerAccountId,
        providerPaymentId: requiredString(object.id, "STRIPE_PAYMENT_INTENT_MISSING"),
        paymentRequestRef: asString(meta.payment_request_id) ?? "",
        amountMinor: requiredInteger(object.amount_received || object.amount, "STRIPE_AMOUNT_MISSING"),
        currency: requiredString(object.currency, "STRIPE_CURRENCY_MISSING").toUpperCase(),
        occurredAt: eventTime,
      };
    }

    case "payment_intent.processing": {
      return {
        type: "payment.processing",
        provider: "stripe",
        providerEventId: event.id,
        providerAccountId,
        providerPaymentId: requiredString(object.id, "STRIPE_PAYMENT_INTENT_MISSING"),
        paymentRequestRef: asString(meta.payment_request_id),
        occurredAt: eventTime,
      };
    }

    case "payment_intent.payment_failed":
      return {
        type: "payment.failed",
        provider: "stripe",
        providerEventId: event.id,
        providerAccountId,
        providerPaymentId: requiredString(object.id, "STRIPE_PAYMENT_INTENT_MISSING"),
        paymentRequestRef: asString(meta.payment_request_id),
        safeFailureCode: asString(
          (object.last_payment_error as Record<string, unknown> | undefined)?.code,
        ),
        occurredAt: eventTime,
      };

    case "checkout.session.expired":
      return {
        type: "checkout.expired",
        provider: "stripe",
        providerEventId: event.id,
        providerAccountId,
        checkoutId: requiredString(object.id, "STRIPE_CHECKOUT_ID_MISSING"),
        paymentRequestRef: requiredString(meta.payment_request_id, "STRIPE_PAYMENT_REQUEST_REF_MISSING"),
        occurredAt: eventTime,
      };

    case "refund.updated": {
      const status = asString(object.status);
      if (status !== "succeeded" && status !== "failed") return null;

      const common = {
        provider: "stripe" as const,
        providerEventId: event.id,
        providerAccountId,
        providerRefundId: requiredString(object.id, "STRIPE_REFUND_ID_MISSING"),
        providerPaymentId: asString(object.payment_intent),
        occurredAt: eventTime,
      };

      if (status === "failed") {
        return { type: "refund.failed", ...common };
      }

      return {
        type: "refund.succeeded",
        ...common,
        providerPaymentId: requiredString(object.payment_intent, "STRIPE_PAYMENT_INTENT_MISSING"),
        amountMinor: requiredInteger(object.amount, "STRIPE_REFUND_AMOUNT_MISSING"),
        currency: requiredString(object.currency, "STRIPE_CURRENCY_MISSING").toUpperCase(),
      };
    }

    case "charge.refunded": {
      // Alternative path for refund confirmation via charge object.
      const charge = object;
      const refundedAmount = requiredInteger(charge.amount_refunded, "STRIPE_REFUND_AMOUNT_MISSING");
      if (refundedAmount === 0) return null;

      const refundList = charge.refunds as { data?: Array<Record<string, unknown>> } | undefined;
      const latestRefund = refundList?.data?.[0];
      const refundId = latestRefund
        ? requiredString(latestRefund.id, "STRIPE_REFUND_ID_MISSING")
        : `re_from_charge_${requiredString(charge.id, "STRIPE_CHARGE_ID_MISSING")}`;

      return {
        type: "refund.succeeded",
        provider: "stripe",
        providerEventId: event.id,
        providerAccountId,
        providerRefundId: refundId,
        providerPaymentId: asString(charge.payment_intent) ?? "",
        amountMinor: refundedAmount,
        currency: requiredString(charge.currency, "STRIPE_CURRENCY_MISSING").toUpperCase(),
        occurredAt: eventTime,
      };
    }

    case "account.updated": {
      const requirements = object.requirements as StripeRequirements | undefined;
      return {
        type: "account.updated",
        provider: "stripe",
        providerEventId: event.id,
        providerAccountId,
        detailsSubmitted: asBoolean(object.details_submitted),
        chargesEnabled: asBoolean(object.charges_enabled),
        payoutsEnabled: asBoolean(object.payouts_enabled),
        requirementsStatus: resolveRequirementsStatus(requirements),
        requirementsJson: requirements ? JSON.stringify(requirements) : null,
        occurredAt: eventTime,
      };
    }

    case "charge.dispute.created":
      return {
        type: "dispute.created",
        provider: "stripe",
        providerEventId: event.id,
        providerAccountId,
        providerPaymentId: asString(object.payment_intent) ?? requiredString(object.charge, "STRIPE_DISPUTE_CHARGE_MISSING"),
        disputeId: requiredString(object.id, "STRIPE_DISPUTE_ID_MISSING"),
        amountMinor: requiredInteger(object.amount, "STRIPE_DISPUTE_AMOUNT_MISSING"),
        currency: requiredString(object.currency, "STRIPE_CURRENCY_MISSING").toUpperCase(),
        reason: asString(object.reason) ?? "unspecified",
        occurredAt: eventTime,
      };

    case "charge.dispute.closed":
      return {
        type: "dispute.closed",
        provider: "stripe",
        providerEventId: event.id,
        providerAccountId,
        providerPaymentId: asString(object.payment_intent) ?? requiredString(object.charge, "STRIPE_DISPUTE_CHARGE_MISSING"),
        disputeId: requiredString(object.id, "STRIPE_DISPUTE_ID_MISSING"),
        status: asString(object.status) ?? "unknown",
        occurredAt: eventTime,
      };

    default:
      return null;
  }
}
