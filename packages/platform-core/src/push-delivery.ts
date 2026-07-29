/**
 * v0.9.2 PWA Notification — Web Push Outbox processing.
 *
 * Spec: v0.9 PWA Notification Technical Spec §4 (One notification model),
 *   §10 (Delivery, retry, and diagnostics)
 *
 * This module processes outbox messages of type `message_delivery.web_push`.
 * It follows the same pattern as `resend-outbox.ts` for email delivery:
 *   claim → send → mark delivered/failed → update subscription state
 */

import { TABLES } from "./contracts";
import { queryOne, queryAll } from "./db";
import {
  claimOutboxMessage,
  markOutboxDelivered,
  markOutboxFailed,
} from "./outbox";
import {
  markMessageDeliveryAccepted,
  markMessageDeliveryFailed,
} from "./messaging";
import {
  sendPushNotification,
  buildPushPayload,
  type PushPayload,
} from "./web-push-provider";
import {
  markPushSubscriptionAccepted,
  expirePushSubscription,
  type PushSubscriptionRecord,
} from "./push-subscriptions";
import { now } from "./db";

export interface WebPushOutboxPayload {
  subscriptionId: string;
  notificationId: string;
  messageId: string;
  deliveryId: string;
  title: string;
  body: string;
  route: string;
  tag?: string;
}

/**
 * Process one `message_delivery.web_push` outbox message.
 * Returns true if the message was processed (delivered or permanently failed),
 * false if it should be retried later.
 */
export async function deliverWebPushMessage(
  workspaceId: string,
  outboxMessageId: string,
): Promise<{ processed: boolean; expired: boolean; error?: string }> {
  // 1. Claim the outbox message
  const outboxMsg = await claimOutboxMessage(workspaceId, outboxMessageId);
  if (!outboxMsg) {
    return { processed: false, expired: false, error: "unable to claim" };
  }

  const payload = outboxMsg.payload as unknown as WebPushOutboxPayload;

  // 2. Load the subscription
  const sub = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.pushSubscriptions}
     WHERE id = ? AND workspace_id = ? AND status = 'active'`,
    [payload.subscriptionId, workspaceId],
  );

  if (!sub) {
    // Subscription no longer active — mark as delivered (no-op)
    await markOutboxDelivered(workspaceId, outboxMessageId);
    if (payload.deliveryId) {
      await markMessageDeliveryFailed(workspaceId, payload.deliveryId, "subscription_inactive");
    }
    return { processed: true, expired: true, error: "subscription_inactive" };
  }

  const subscription: PushSubscriptionRecord = {
    id: sub.id as string,
    workspaceId: sub.workspace_id as string,
    principalType: sub.principal_type as "workspace_membership" | "customer_access_grant",
    principalId: sub.principal_id as string,
    endpointHash: sub.endpoint_hash as string,
    endpoint: sub.endpoint as string,
    p256dh: sub.p256dh as string,
    auth: sub.auth as string,
    userAgentSummary: (sub.user_agent_summary as string) || null,
    status: sub.status as "active" | "disabled" | "expired" | "revoked",
    createdAt: sub.created_at as string,
    lastVerifiedAt: (sub.last_verified_at as string) || null,
    lastAcceptedAt: (sub.last_accepted_at as string) || null,
    lastErrorCode: (sub.last_error_code as string) || null,
  };

  // 3. Build and send the push notification
  const pushPayload = buildPushPayload({
    notificationId: payload.notificationId,
    title: payload.title,
    body: payload.body,
    route: payload.route,
    tag: payload.tag,
  });

  const result = await sendPushNotification(subscription, pushPayload);

  // 4. Handle result
  if (result.accepted) {
    await markOutboxDelivered(workspaceId, outboxMessageId);
    await markPushSubscriptionAccepted(subscription.id);
    if (payload.deliveryId) {
      await markMessageDeliveryAccepted(workspaceId, payload.deliveryId, subscription.id);
    }
    return { processed: true, expired: false };
  }

  // 5. Handle failure
  if (result.expired) {
    // 404/410 — expire subscription, don't retry
    await expirePushSubscription(subscription.id, result.errorCode || `${result.statusCode}`);
    await markOutboxDelivered(workspaceId, outboxMessageId);
    if (payload.deliveryId) {
      await markMessageDeliveryFailed(workspaceId, payload.deliveryId, `expired:${result.errorCode}`);
    }
    return { processed: true, expired: true, error: result.errorCode };
  }

  // Transient failure — mark outbox failed for retry
  const isPermanent = result.statusCode === 400 || result.statusCode === 401 || result.statusCode === 403;
  await markOutboxFailed(workspaceId, outboxMessageId, result.errorCode || `http_${result.statusCode}`);

  if (payload.deliveryId) {
    await markMessageDeliveryFailed(workspaceId, payload.deliveryId, result.errorCode || `http_${result.statusCode}`);
  }

  return {
    processed: isPermanent,
    expired: false,
    error: result.errorCode,
  };
}

/**
 * Process pending `message_delivery.web_push` outbox messages for a workspace.
 */
export async function processPendingWebPushMessages(
  workspaceId: string,
  limit = 10,
): Promise<{ processed: number; delivered: number; failed: number }> {
  const messages = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.outboxMessages}
     WHERE workspace_id = ? AND message_type = 'message_delivery.web_push'
       AND status IN ('pending', 'failed')
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [workspaceId, now(), limit],
  );

  let processed = 0;
  let delivered = 0;
  let failed = 0;

  for (const msg of messages) {
    const result = await deliverWebPushMessage(workspaceId, msg.id);
    processed++;
    if (result.expired) {
      failed++;
    } else if (result.processed && !result.error) {
      delivered++;
    } else if (result.error) {
      failed++;
    }
  }

  return { processed, delivered, failed };
}
