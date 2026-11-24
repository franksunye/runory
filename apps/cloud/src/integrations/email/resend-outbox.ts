import {
  claimOutboxMessage, getOutboxMessage, markMessageDeliveryAccepted,
  markMessageDeliveryFailed, markOutboxDelivered, markOutboxFailed,
  queryOne, runWithDatabaseTransaction, TABLES,
} from "@runory/platform-core";

export const CONFIRMATION_EMAIL_TYPE = "message_delivery.email";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}
function stringField(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : fallback;
}
export function isConfirmationEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY?.trim() && process.env.RUNORY_EMAIL_FROM?.trim());
}

export async function deliverWorkOrderConfirmation(workspaceId: string, messageId: string) {
  // Exact lookup, never the first 100 historical records or another queue type.
  const message = await getOutboxMessage(workspaceId, messageId);
  const skipped = { delivered: false, skipped: true };
  if (!message || message.messageType !== CONFIRMATION_EMAIL_TYPE || message.status === "delivered") return skipped;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RUNORY_EMAIL_FROM?.trim();
  if (!apiKey || !from) return skipped;
  const claimed = await claimOutboxMessage(workspaceId, messageId);
  if (!claimed?.lockedAt) return skipped;
  const lockedAt = claimed.lockedAt;
  const payload = claimed.payload && typeof claimed.payload === "object" ? claimed.payload : {};
  const to = stringField(payload, "to");
  const deliveryId = stringField(payload, "deliveryId");
  const conversationId = stringField(payload, "conversationId");

  // Validate the persisted tenant-scoped delivery intent before any send.
  const delivery = deliveryId ? await queryOne<{ recipient_address: string; provider: string; channel: string; status: string }>(
    `SELECT recipient_address, provider, channel, status FROM ${TABLES.messageDeliveries}
      WHERE workspace_id = ? AND id = ?`, [workspaceId, deliveryId],
  ) : undefined;
  const matchingIntent = !!delivery && typeof delivery.recipient_address === "string" &&
    delivery.recipient_address.trim().toLowerCase() === to.toLowerCase() &&
    delivery.provider === "resend" && delivery.channel === "email";
  const finalize = async (result: { acceptedId: string } | { errorCode: string; terminal?: boolean }) =>
    runWithDatabaseTransaction(async () => {
      // A late worker cannot settle someone else's reclaimed lease. Commit
      // the queue and its user-facing delivery projection together.
      if ("acceptedId" in result) {
        if (!await markOutboxDelivered(workspaceId, messageId, lockedAt)) return skipped;
        await markMessageDeliveryAccepted(workspaceId, deliveryId, result.acceptedId);
        return { delivered: true, skipped: false };
      }
      if (!await markOutboxFailed(workspaceId, messageId, result.errorCode, {
        claimLockedAt: lockedAt, ...(result.terminal ? { maxAttempts: 1 } : {}),
      })) return skipped;
      if (matchingIntent && delivery && ["pending", "failed"].includes(delivery.status)) {
        await markMessageDeliveryFailed(workspaceId, deliveryId, result.errorCode);
      }
      return { delivered: false, skipped: false };
    });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !delivery || !matchingIntent ||
      !["pending", "failed"].includes(delivery.status)) {
    return finalize({ errorCode: "INVALID_OR_RESOLVED_EMAIL_INTENT", terminal: true });
  }
  const contactName = stringField(payload, "contactName", "Customer");
  const title = stringField(payload, "title", "your service request");
  const confirmationCode = stringField(payload, "confirmationCode");
  const replyDomain = process.env.RUNORY_REPLY_TO_DOMAIN?.trim().replace(/^@/, "");
  const replyTo = replyDomain && conversationId && /^[a-z0-9.-]+$/i.test(replyDomain)
    ? `conversation+${conversationId}@${replyDomain}` : undefined;
  const body = `<p>Hi ${escapeHtml(contactName)},</p><p>We received your service request and created work order <strong>${escapeHtml(confirmationCode)}</strong>.</p><p><strong>${escapeHtml(title)}</strong></p><p>Our team will follow up with scheduling details. Thank you.</p>`;

  // Catch only the provider operation. A DB failure after acknowledgement
  // leaves a recoverable claim with the same provider idempotency key.
  let result: { acceptedId: string } | { errorCode: string; terminal?: boolean };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `work-order-confirmation-${messageId}`,
      },
      body: JSON.stringify({ from, to: [to], subject: `Service request received — ${confirmationCode}`, html: body, ...(replyTo ? { reply_to: replyTo } : {}) }),
      redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      result = { errorCode: "RESEND_" + response.status,
        terminal: [400, 401, 403, 404, 422].includes(response.status) };
    } else {
      const accepted = await response.json() as { id?: unknown };
      result = typeof accepted.id === "string" && accepted.id.trim()
        ? { acceptedId: accepted.id } : { errorCode: "RESEND_ACK_MISSING" };
    }
  } catch {
    result = { errorCode: "RESEND_TRANSPORT_ERROR" };
  }
  return finalize(result);
}
