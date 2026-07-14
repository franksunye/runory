import { describe, expect, it } from "vitest";
import { mapStripeEvent } from "./mapper";

describe("mapStripeEvent", () => {
  it("maps a paid Checkout Session to payment.succeeded", () => {
    const result = mapStripeEvent({
      id: "evt_paid",
      type: "checkout.session.completed",
      created: 1_720_000_000,
      data: {
        object: {
          payment_status: "paid",
          payment_intent: "pi_123",
          amount_total: 12500,
          currency: "usd",
          metadata: { payment_request_id: "pr_123" },
        },
      },
    });

    expect(result).toMatchObject({
      type: "payment.succeeded",
      providerEventId: "evt_paid",
      providerPaymentId: "pi_123",
      paymentRequestRef: "pr_123",
      amountMinor: 12500,
      currency: "USD",
    });
  });

  it("ignores Checkout completion that is not paid", () => {
    expect(
      mapStripeEvent({
        id: "evt_unpaid",
        type: "checkout.session.completed",
        data: { object: { payment_status: "unpaid" } },
      }),
    ).toBeNull();
  });

  it("maps a payment failure without exposing raw error details", () => {
    expect(
      mapStripeEvent({
        id: "evt_failed",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_failed",
            metadata: { payment_request_id: "pr_failed" },
            last_payment_error: { code: "card_declined", message: "sensitive" },
          },
        },
      }),
    ).toMatchObject({
      type: "payment.failed",
      safeFailureCode: "card_declined",
      providerPaymentId: "pi_failed",
      paymentRequestRef: "pr_failed",
    });
  });

  it("maps successful refund updates", () => {
    expect(
      mapStripeEvent({
        id: "evt_refund",
        type: "refund.updated",
        data: {
          object: {
            id: "re_123",
            status: "succeeded",
            payment_intent: "pi_123",
            amount: 2500,
            currency: "usd",
          },
        },
      }),
    ).toMatchObject({
      type: "refund.succeeded",
      providerRefundId: "re_123",
      providerPaymentId: "pi_123",
      amountMinor: 2500,
      currency: "USD",
    });
  });

  it("returns null for unsupported Stripe events", () => {
    expect(
      mapStripeEvent({
        id: "evt_customer",
        type: "customer.created",
        data: { object: { id: "cus_123" } },
      }),
    ).toBeNull();
  });
});
