export type PaymentProviderName = "stripe" | (string & {});

export type PaymentProviderMode = "test" | "live";

export interface CreateCheckoutInput {
  workspaceId: string;
  paymentRequestId: string;
  providerAccountId: string;
  amountMinor: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt?: string;
  customerEmail?: string;
  idempotencyKey: string;
}

export interface CreateCheckoutResult {
  provider: PaymentProviderName;
  providerAccountId: string;
  providerCheckoutId: string;
  checkoutUrl: string;
  expiresAt?: string;
}

export interface CreateRefundInput {
  workspaceId: string;
  paymentId: string;
  providerAccountId: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  reason?: string;
  idempotencyKey: string;
}

export interface CreateRefundResult {
  provider: PaymentProviderName;
  providerAccountId: string;
  providerRefundId: string;
  status: "processing" | "succeeded";
}

export interface RawWebhookInput {
  rawBody: Uint8Array;
  signature: string;
  webhookSecret: string;
  providerAccountId?: string;
  mode: PaymentProviderMode;
}

export type NormalizedPaymentEvent =
  | {
      type: "payment.succeeded";
      provider: PaymentProviderName;
      providerEventId: string;
      providerAccountId?: string;
      providerPaymentId: string;
      paymentRequestRef: string;
      amountMinor: number;
      currency: string;
      occurredAt: string;
    }
  | {
      type: "payment.failed";
      provider: PaymentProviderName;
      providerEventId: string;
      providerAccountId?: string;
      providerPaymentId: string;
      paymentRequestRef?: string;
      safeFailureCode?: string;
      occurredAt: string;
    }
  | {
      type: "checkout.expired";
      provider: PaymentProviderName;
      providerEventId: string;
      providerAccountId?: string;
      checkoutId: string;
      paymentRequestRef: string;
      occurredAt: string;
    }
  | {
      type: "refund.succeeded";
      provider: PaymentProviderName;
      providerEventId: string;
      providerAccountId?: string;
      providerRefundId: string;
      providerPaymentId: string;
      amountMinor: number;
      currency: string;
      occurredAt: string;
    }
  | {
      type: "refund.failed";
      provider: PaymentProviderName;
      providerEventId: string;
      providerAccountId?: string;
      providerRefundId: string;
      providerPaymentId?: string;
      occurredAt: string;
    };

export interface ProviderPaymentSnapshot {
  provider: PaymentProviderName;
  providerAccountId: string;
  providerPaymentId: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "cancelled" | "refunded" | "partially_refunded";
  amountMinor: number;
  refundedAmountMinor: number;
  currency: string;
}

export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  createRefund(input: CreateRefundInput): Promise<CreateRefundResult>;
  parseWebhook(input: RawWebhookInput): Promise<NormalizedPaymentEvent | null>;
  retrievePayment(input: {
    providerAccountId: string;
    providerPaymentId: string;
  }): Promise<ProviderPaymentSnapshot>;
}

export function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("PAYMENT_INVALID_CURRENCY");
  }
  return normalized;
}

export function assertPositiveMinorAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("PAYMENT_INVALID_AMOUNT");
  }
}
