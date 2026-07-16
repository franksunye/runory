import { TABLES } from "./contracts";
import { execute, genId, now, queryOne } from "./db";

export type MessageChannel = "email" | "sms" | "voice" | "web" | "internal";

export async function addConversationParticipant(workspaceId: string, input: { conversationId: string; participantType: "contact" | "user" | "agent" | "system" | "external"; participantId?: string; address?: string; displayName?: string; role?: "sender" | "recipient" | "observer" }) {
  const existing = await queryOne<Record<string, unknown>>(`SELECT id FROM ${TABLES.conversationParticipants} WHERE workspace_id = ? AND conversation_id = ? AND participant_type = ? AND COALESCE(participant_id, '') = ? AND COALESCE(address, '') = ? LIMIT 1`, [workspaceId, input.conversationId, input.participantType, input.participantId ?? "", input.address ?? ""]);
  if (existing) return existing;
  const id = genId("cpt");
  await execute(`INSERT INTO ${TABLES.conversationParticipants} (id, workspace_id, conversation_id, participant_type, participant_id, address, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, workspaceId, input.conversationId, input.participantType, input.participantId ?? null, input.address ?? null, input.displayName ?? null, input.role ?? "recipient", now()]);
  return { id, workspaceId, ...input };
}

export async function createConversation(workspaceId: string, input: { contactId?: string; workOrderId?: string; serviceSiteId?: string; voiceCallId?: string; subject?: string }) {
  if (input.workOrderId) {
    const existing = await queryOne<Record<string, unknown>>(`SELECT * FROM ${TABLES.conversations} WHERE workspace_id = ? AND work_order_id = ? AND status != 'archived' LIMIT 1`, [workspaceId, input.workOrderId]);
    if (existing) return existing;
  }
  const id = genId("conv"); const timestamp = now();
  await execute(`INSERT INTO ${TABLES.conversations} (id, workspace_id, contact_id, work_order_id, service_site_id, voice_call_id, subject, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, workspaceId, input.contactId ?? null, input.workOrderId ?? null, input.serviceSiteId ?? null, input.voiceCallId ?? null, input.subject ?? null, timestamp, timestamp]);
  const conversation = { id, workspaceId, ...input, status: "open", createdAt: timestamp };
  if (input.contactId) await addConversationParticipant(workspaceId, { conversationId: id, participantType: "contact", participantId: input.contactId, role: "recipient" });
  await addConversationParticipant(workspaceId, { conversationId: id, participantType: "system", displayName: "Runory", role: "sender" });
  return conversation;
}

export async function createNotificationMessage(workspaceId: string, input: { conversationId: string; contactId?: string; workOrderId?: string; notificationType: string; channel: MessageChannel; recipientAddress: string; subject?: string; bodyText: string; bodyHtml?: string; provider: string; payload?: Record<string, unknown> }) {
  const timestamp = now(); const notificationId = genId("ntf"); const messageId = genId("msg"); const deliveryId = genId("dlv");
  await addConversationParticipant(workspaceId, { conversationId: input.conversationId, participantType: "external", address: input.recipientAddress, role: "recipient" });
  await execute(`INSERT INTO ${TABLES.notifications} (id, workspace_id, notification_type, conversation_id, contact_id, work_order_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [notificationId, workspaceId, input.notificationType, input.conversationId, input.contactId ?? null, input.workOrderId ?? null, JSON.stringify(input.payload ?? {}), timestamp, timestamp]);
  await execute(`INSERT INTO ${TABLES.messages} (id, workspace_id, conversation_id, notification_id, direction, channel, author_type, subject, body_text, body_html, provider, created_at) VALUES (?, ?, ?, ?, 'outbound', ?, 'system', ?, ?, ?, ?, ?)`, [messageId, workspaceId, input.conversationId, notificationId, input.channel, input.subject ?? null, input.bodyText, input.bodyHtml ?? null, input.provider, timestamp]);
  await execute(`INSERT INTO ${TABLES.messageDeliveries} (id, workspace_id, message_id, channel, provider, recipient_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [deliveryId, workspaceId, messageId, input.channel, input.provider, input.recipientAddress, timestamp, timestamp]);
  await execute(`UPDATE ${TABLES.conversations} SET last_message_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`, [timestamp, timestamp, input.conversationId, workspaceId]);
  return { notificationId, messageId, deliveryId };
}

export async function createVoiceMessage(workspaceId: string, input: { conversationId: string; contactId?: string; voiceCallId: string; transcript?: string; summary?: string; createdAt?: string }) {
  const bodyText = input.transcript?.trim() || input.summary?.trim();
  if (!bodyText) return null;
  const id = genId("msg"); const timestamp = input.createdAt ?? now();
  await execute(`INSERT INTO ${TABLES.messages} (id, workspace_id, conversation_id, direction, channel, author_type, author_id, body_text, provider, external_id, created_at) VALUES (?, ?, ?, 'inbound', 'voice', ?, ?, ?, 'retell', ?, ?)`, [id, workspaceId, input.conversationId, input.contactId ? "contact" : "agent", input.contactId ?? null, bodyText, input.voiceCallId, timestamp]);
  await execute(`UPDATE ${TABLES.conversations} SET last_message_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`, [timestamp, timestamp, input.conversationId, workspaceId]);
  return { id, channel: "voice" as const, bodyText, createdAt: timestamp };
}

export async function markMessageDeliveryAccepted(workspaceId: string, deliveryId: string): Promise<void> {
  const timestamp = now();
  await execute(`UPDATE ${TABLES.messageDeliveries} SET status = 'accepted', accepted_at = ?, last_error = NULL, updated_at = ? WHERE id = ? AND workspace_id = ?`, [timestamp, timestamp, deliveryId, workspaceId]);
  await execute(`UPDATE ${TABLES.notifications} SET status = 'sent', updated_at = ? WHERE workspace_id = ? AND id = (SELECT notification_id FROM ${TABLES.messages} WHERE workspace_id = ? AND id = (SELECT message_id FROM ${TABLES.messageDeliveries} WHERE workspace_id = ? AND id = ?))`, [timestamp, workspaceId, workspaceId, workspaceId, deliveryId]);
}

export async function markMessageDeliveryFailed(workspaceId: string, deliveryId: string, error: string): Promise<void> {
  await execute(`UPDATE ${TABLES.messageDeliveries} SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`, [error, now(), deliveryId, workspaceId]);
}
