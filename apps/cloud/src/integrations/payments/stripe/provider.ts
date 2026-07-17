import type Stripe from "stripe";
import {
  assertPositiveMinorAmount,
  normalizeCurrency,
  type CreateCheckoutInput,
  type CreateRefundInput,
  type PaymentProvider,
  type ProviderPaymentSnapshot,
  type RawWebhookInput,
} from "../contracts";
import { getStripeClient } from "./client";
import { mapStripeEvent } from "./mapper";

type StripeClient = ReturnType<typeof getStripeClient>;

function unixSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isSafeInteger(seconds)) throw new Error("PAYMENT_INVALID_EXPIRATION");
  return seconds;
}

function paymentStatus(intent: Stripe.PaymentIntent): ProviderPaymentSnapshot["status"] {
  if (intent.status === "succeeded") {
    return intent.amount_received > 0 && intent.amount_received === intent.amount
      ? "succeeded"
      : "processing";
  }
  if (intent.status === "processing") return "processing";
  if (intent.status === "canceled") return "cancelled";
  if (intent.status === "requires_payment_method") return "failed";
  return "pending";
}

export class StripePaymentProvider implements PaymentProvider {
  constructor(private readonly client: StripeClient = getStripeClient()) {}

  async createCheckout(input: CreateCheckoutInput) {
    assertPositiveMinorAmount(input.amountMinor);
    const currency = normalizeCurrency(input.currency);
    const customerEmail = input.customerEmail?.trim() || undefined;
    const metadata = {
      payment_request_id: input.paymentRequestId,
      workspace_id: input.workspaceId,
      provider_account_id: input.providerAccountId,
    };
    const session = await this.client.checkout.sessions.create({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: customerEmail,
      expires_at: unixSeconds(input.expiresAt),
      metadata,
      payment_intent_data: {
        description: input.description.slice(0, 500),
        metadata,
      },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: input.amountMinor,
          product_data: {
            name: input.description.slice(0, 120) || "Runory payment",
          },
        },
      }],
    }, { idempotencyKey: input.idempotencyKey });

    if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
    return {
      provider: "stripe" as const,
      providerAccountId: input.providerAccountId,
      providerCheckoutId: session.id,
      checkoutUrl: session.url,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : input.expiresAt,
    };
  }

  async createRefund(input: CreateRefundInput) {
    assertPositiveMinorAmount(input.amountMinor);
    normalizeCurrency(input.currency);
    const refund = await this.client.refunds.create({
      payment_intent: input.providerPaymentId,
      amount: input.amountMinor,
      metadata: {
        payment_id: input.paymentId,
        workspace_id: input.workspaceId,
        provider_account_id: input.providerAccountId,
      },
    }, { idempotencyKey: input.idempotencyKey });

    if (refund.status !== "pending" && refund.status !== "succeeded") {
      throw new Error("STRIPE_REFUND_NOT_ACCEPTED");
    }
    return {
      provider: "stripe" as const,
      providerAccountId: input.providerAccountId,
      providerRefundId: refund.id,
      status: refund.status === "succeeded" ? "succeeded" as const : "processing" as const,
    };
  }

  async parseWebhook(input: RawWebhookInput) {
    const event = this.client.webhooks.constructEvent(
      input.rawBody,
      input.signature,
      input.webhookSecret,
    );
    return mapStripeEvent(event);
  }

  async retrievePayment(input: { providerAccountId: string; providerPaymentId: string }) {
    const intent = await this.client.paymentIntents.retrieve(
      input.providerPaymentId,
      { expand: ["latest_charge"] },
    );
    const latestCharge = typeof intent.latest_charge === "object"
      ? intent.latest_charge
      : null;
    return {
      provider: "stripe" as const,
      providerAccountId: input.providerAccountId,
      providerPaymentId: intent.id,
      status: paymentStatus(intent),
      amountMinor: intent.amount,
      refundedAmountMinor: latestCharge?.amount_refunded ?? 0,
      currency: intent.currency.toUpperCase(),
    };
  }
}
