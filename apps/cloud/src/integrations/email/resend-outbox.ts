import { getOutboxMessages, markOutboxDelivered, markOutboxFailed } from "@runory/platform-core";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function stringField(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : fallback;
}

export async function deliverWorkOrderConfirmation(workspaceId: string, messageId: string) {
  const message = (await getOutboxMessages(workspaceId, { limit: 100 })).find(item => item.id === messageId);
  if (!message || message.status === "delivered") return { delivered: false, skipped: true };
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RUNORY_EMAIL_FROM;
  if (!apiKey || !from) return { delivered: false, skipped: true };
  const payload = message.payload && typeof message.payload === "object"
    ? message.payload as Record<string, unknown>
    : {};
  const to = stringField(payload, "to");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    await markOutboxFailed(messageId, "INVALID_RECIPIENT_EMAIL");
    return { delivered: false, skipped: false };
  }
  const contactName = stringField(payload, "contactName", "Customer");
  const title = stringField(payload, "title", "your service request");
  const confirmationCode = stringField(payload, "confirmationCode");
  const body = `<p>Hi ${escapeHtml(contactName)},</p><p>We received your service request and created work order <strong>${escapeHtml(confirmationCode)}</strong>.</p><p><strong>${escapeHtml(title)}</strong></p><p>Our team will follow up with scheduling details. Thank you.</p>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `work-order-confirmation-${messageId}`,
      },
      body: JSON.stringify({ from, to: [to], subject: `Service request received — ${confirmationCode}`, html: body }),
    });
    if (!response.ok) throw new Error(`RESEND_${response.status}`);
    await markOutboxDelivered(messageId);
    return { delivered: true, skipped: false };
  } catch (error) {
    await markOutboxFailed(messageId, error instanceof Error ? error.message : "RESEND_SEND_FAILED");
    return { delivered: false, skipped: false };
  }
}
