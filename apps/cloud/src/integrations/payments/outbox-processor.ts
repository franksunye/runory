import {
  attachCheckoutToPaymentRequest,
  attachProviderRefund,
  getOutboxMessages,
  markOutboxDelivered,
  markOutboxFailed,
} from "@runory/platform-core";
import type { CreateCheckoutInput, CreateRefundInput } from "./contracts";
import { getPaymentProvider } from "./registry";

function safeProviderError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return code && /^[A-Z0-9_-]{1,80}$/i.test(code)
    ? `PAYMENT_PROVIDER_ERROR:${code}`
    : "PAYMENT_PROVIDER_ERROR";
}

export async function processPaymentOutboxForAggregate(
  workspaceId: string,
  messageType: "payment.checkout.create" | "payment.refund.create",
  aggregateId: string,
) {
  const messages = await getOutboxMessages(workspaceId, { limit: 100 });
  const message = messages.find((candidate) => {
    if (candidate.messageType !== messageType || candidate.status === "delivered") return false;
    const payload = candidate.payload as Record<string, unknown>;
    return messageType === "payment.checkout.create"
      ? payload.paymentRequestId === aggregateId
      : payload.refundId === aggregateId;
  });
  if (!message) throw new Error("PAYMENT_OUTBOX_MESSAGE_NOT_FOUND");

  try {
    const payload = message.payload as unknown as Record<string, unknown>;
    const provider = getPaymentProvider(String(payload.provider));
    if (messageType === "payment.checkout.create") {
      const checkout = await provider.createCheckout(payload as unknown as CreateCheckoutInput);
      const request = await attachCheckoutToPaymentRequest({
        workspaceId,
        paymentRequestId: String(payload.paymentRequestId),
        providerAccountId: checkout.providerAccountId,
        providerCheckoutId: checkout.providerCheckoutId,
        checkoutUrl: checkout.checkoutUrl,
        expiresAt: checkout.expiresAt,
      });
      await markOutboxDelivered(String(message.id));
      return request;
    }

    const refund = await provider.createRefund(payload as unknown as CreateRefundInput);
    const record = await attachProviderRefund({
      workspaceId,
      refundId: String(payload.refundId),
      providerRefundId: refund.providerRefundId,
    });
    await markOutboxDelivered(String(message.id));
    return record;
  } catch (error) {
    await markOutboxFailed(String(message.id), safeProviderError(error));
    throw error;
  }
}
