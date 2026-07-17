import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { StripePaymentProvider } from "./provider";

describe("StripePaymentProvider", () => {
  it("creates hosted Checkout with canonical metadata and Stripe idempotency", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      expires_at: 1_800_000_000,
    });
    const provider = new StripePaymentProvider({
      checkout: { sessions: { create } },
    } as never);
    const result = await provider.createCheckout({
      workspaceId: "ws_123",
      paymentRequestId: "payreq_123",
      providerAccountId: "provider_123",
      amountMinor: 12_500,
      currency: "usd",
      description: "Quote deposit",
      successUrl: "https://runory.example/success",
      cancelUrl: "https://runory.example/cancel",
      customerEmail: "payer@example.com",
      idempotencyKey: "idem_checkout_123",
    });

    expect(result).toMatchObject({
      provider: "stripe",
      providerCheckoutId: "cs_test_123",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        metadata: expect.objectContaining({ payment_request_id: "payreq_123" }),
        payment_intent_data: expect.objectContaining({
          metadata: expect.objectContaining({ payment_request_id: "payreq_123" }),
        }),
        line_items: [{
          quantity: 1,
          price_data: expect.objectContaining({ currency: "usd", unit_amount: 12_500 }),
        }],
      }),
      { idempotencyKey: "idem_checkout_123" },
    );
  });

  it("omits a blank customer email from Checkout", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "cs_test_blank_email",
      url: "https://checkout.stripe.com/c/pay/cs_test_blank_email",
    });
    const provider = new StripePaymentProvider({
      checkout: { sessions: { create } },
    } as never);

    await provider.createCheckout({
      workspaceId: "ws_123",
      paymentRequestId: "payreq_blank_email",
      providerAccountId: "provider_123",
      amountMinor: 100,
      currency: "CNY",
      description: "Quote deposit",
      successUrl: "https://runory.example/success",
      cancelUrl: "https://runory.example/cancel",
      customerEmail: "   ",
      idempotencyKey: "idem_checkout_blank_email",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customer_email: undefined }),
      { idempotencyKey: "idem_checkout_blank_email" },
    );
  });

  it("verifies a raw signed webhook before mapping it", async () => {
    const client = new Stripe("sk_test_unit");
    const provider = new StripePaymentProvider(client);
    const payload = JSON.stringify({
      id: "evt_signed",
      object: "event",
      created: 1_720_000_000,
      type: "checkout.session.completed",
      data: {
        object: {
          payment_status: "paid",
          payment_intent: "pi_signed",
          amount_total: 12_500,
          currency: "usd",
          metadata: { payment_request_id: "payreq_signed" },
        },
      },
    });
    const secret = "whsec_unit_test";
    const signature = client.webhooks.generateTestHeaderString({ payload, secret });
    await expect(provider.parseWebhook({
      rawBody: new TextEncoder().encode(payload),
      signature,
      webhookSecret: secret,
      mode: "test",
    })).resolves.toMatchObject({
      type: "payment.succeeded",
      providerEventId: "evt_signed",
      paymentRequestRef: "payreq_signed",
    });

    await expect(provider.parseWebhook({
      rawBody: new TextEncoder().encode(payload),
      signature: "t=1,v1=invalid",
      webhookSecret: secret,
      mode: "test",
    })).rejects.toThrow();
  });

  it("uses Stripe idempotency for refund creation", async () => {
    const create = vi.fn().mockResolvedValue({ id: "re_123", status: "pending" });
    const provider = new StripePaymentProvider({ refunds: { create } } as never);
    await expect(provider.createRefund({
      workspaceId: "ws_123",
      paymentId: "pay_123",
      providerAccountId: "provider_123",
      providerPaymentId: "pi_123",
      amountMinor: 2_500,
      currency: "USD",
      idempotencyKey: "idem_refund_123",
    })).resolves.toMatchObject({
      providerRefundId: "re_123",
      status: "processing",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_123", amount: 2_500 }),
      { idempotencyKey: "idem_refund_123" },
    );
  });

  it("retrieves expanded refund state for reconciliation", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "pi_123",
      status: "succeeded",
      amount: 12_500,
      amount_received: 12_500,
      currency: "usd",
      latest_charge: { amount_refunded: 2_500 },
    });
    const provider = new StripePaymentProvider({
      paymentIntents: { retrieve },
    } as never);

    await expect(provider.retrievePayment({
      providerAccountId: "provider_123",
      providerPaymentId: "pi_123",
    })).resolves.toMatchObject({
      status: "succeeded",
      amountMinor: 12_500,
      refundedAmountMinor: 2_500,
      currency: "USD",
    });
    expect(retrieve).toHaveBeenCalledWith("pi_123", { expand: ["latest_charge"] });
  });
});
