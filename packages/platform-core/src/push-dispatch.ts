/**
 * v0.9.2 PWA Notification — Push dispatch.
 *
 * Spec: v0.9 PWA Notification Technical Spec §2 (P0 value and events),
 *   §4 (One notification model), §8 (Privacy and content rules)
 *
 * This module is the entry point for business events that should trigger
 * a push notification. It:
 *   1. Resolves the recipient set for the event
 *   2. Checks preferences
 *   3. Creates Notification → Message → MessageDelivery records
 *   4. Enqueues `message_delivery.web_push` outbox messages
 *
 * Privacy: titles and bodies contain no customer name, address, payment
 * amount, or sensitive business content.
 */

import { TABLES } from "./contracts";
import { genId, now, execute, queryAll, queryOne } from "./db";
import { enqueueOutboxMessage } from "./outbox";
import {
  getActiveSubscriptionsForPrincipal,
  type PushPrincipalType,
} from "./push-subscriptions";
import {
  getPushPreferences,
  isCategoryEnabled,
  type PushCategory,
} from "./push-preferences";
import type { WebPushOutboxPayload } from "./push-delivery";

export interface PushDispatchInput {
  workspaceId: string;
  category: PushCategory;
  principalType: PushPrincipalType;
  principalId: string;
  title: string;
  body: string;
  route: string;
  tag?: string;
  sourceType?: string;
  sourceId?: string;
}

export interface PushDispatchResult {
  dispatched: number;
  skipped: number;
  notificationId: string;
}

/**
 * Dispatch a push notification to all active devices for a principal.
 * Creates one Notification + one Message per dispatch, and one
 * MessageDelivery + Outbox message per active subscription.
 */
export async function dispatchPushNotification(
  input: PushDispatchInput,
): Promise<PushDispatchResult> {
  const notificationId = genId("ntf");
  const messageId = genId("msg");
  const ts = now();

  // 1. Check preferences
  const prefs = await getPushPreferences(input.workspaceId, input.principalType, input.principalId);
  if (!isCategoryEnabled(prefs, input.category)) {
    return { dispatched: 0, skipped: 1, notificationId };
  }

  // 2. Get active subscriptions for this principal
  const subscriptions = await getActiveSubscriptionsForPrincipal(
    input.workspaceId,
    input.principalType,
    input.principalId,
  );

  if (subscriptions.length === 0) {
    return { dispatched: 0, skipped: 1, notificationId };
  }

  // 3. Create Notification record
  await execute(
    `INSERT INTO ${TABLES.notifications}
       (id, workspace_id, notification_type, status, source_type, source_id,
        payload_json, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      notificationId,
      input.workspaceId,
      input.category,
      input.sourceType || null,
      input.sourceId || null,
      JSON.stringify({ title: input.title, body: input.body, route: input.route }),
      ts,
      ts,
    ],
  );

  // 4. Create Message record
  await execute(
    `INSERT INTO ${TABLES.messages}
       (id, workspace_id, direction, channel, author_type, notification_id,
        body_text, created_at)
     VALUES (?, ?, 'outbound', 'web', 'system', ?, ?, ?)`,
    [messageId, input.workspaceId, notificationId, input.body, ts],
  );

  // 5. Create one MessageDelivery + Outbox message per subscription
  let dispatched = 0;
  for (const sub of subscriptions) {
    const deliveryId = genId("dlv");

    await execute(
      `INSERT INTO ${TABLES.messageDeliveries}
         (id, message_id, channel, provider, recipient_address, status, attempts, created_at)
       VALUES (?, ?, 'web', 'web-push', ?, 'pending', 0, ?)`,
      [deliveryId, messageId, sub.id, ts],
    );

    const outboxPayload: WebPushOutboxPayload = {
      subscriptionId: sub.id,
      notificationId,
      messageId,
      deliveryId,
      title: input.title,
      body: input.body,
      route: input.route,
      tag: input.tag,
    };

    await enqueueOutboxMessage(
      input.workspaceId,
      "message_delivery.web_push",
      outboxPayload as unknown as Record<string, unknown>,
      { correlationId: notificationId },
    );

    dispatched++;
  }

  return { dispatched, skipped: 0, notificationId };
}

/**
 * Dispatch push notifications to multiple principals (e.g., all assignees of a work item).
 */
export async function dispatchPushToPrincipals(
  workspaceId: string,
  category: PushCategory,
  principals: Array<{ type: PushPrincipalType; id: string }>,
  title: string,
  body: string,
  route: string,
  tag?: string,
): Promise<{ totalDispatched: number; totalSkipped: number }> {
  let totalDispatched = 0;
  let totalSkipped = 0;

  for (const p of principals) {
    const result = await dispatchPushNotification({
      workspaceId,
      category,
      principalType: p.type,
      principalId: p.id,
      title,
      body,
      route,
      tag,
    });
    totalDispatched += result.dispatched;
    totalSkipped += result.skipped;
  }

  return { totalDispatched, totalSkipped };
}
