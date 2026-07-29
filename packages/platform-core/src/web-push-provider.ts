/**
 * v0.9.2 PWA Notification — Web Push provider adapter.
 *
 * Spec: v0.9 PWA Notification Technical Spec §4 (One notification model),
 *   §7.2 (Push behavior), §10 (Delivery, retry, and diagnostics)
 *
 * Uses the `web-push` npm package with VAPID authentication.
 * Provider 404/410 responses mark subscriptions expired.
 */

import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { getVapidKeys } from "./push-config";
import type { PushSubscriptionRecord } from "./push-subscriptions";

export interface PushPayload {
  version: number;
  notificationId: string;
  title: string;
  body: string;
  route: string;
  tag?: string;
}

export interface SendPushResult {
  accepted: boolean;
  statusCode: number;
  errorCode?: string;
  expired: boolean;
}

let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  const keys = getVapidKeys();
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  initialized = true;
}

function toWebPushSubscription(sub: PushSubscriptionRecord): WebPushSubscription {
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };
}

function validateRoute(route: string): boolean {
  // Route MUST be a relative same-origin path from an allowlisted Runory surface.
  // Reject absolute/cross-origin URLs.
  if (!route || typeof route !== "string") return false;
  if (route.includes("://") || route.startsWith("//")) return false;
  if (!route.startsWith("/")) return false;
  // Allowlisted prefixes — /m, /m/..., /access, /app
  const allowed = ["/m", "/access", "/app"];
  return allowed.some((p) => route === p || route.startsWith(p + "/"));
}

export function buildPushPayload(input: {
  notificationId: string;
  title: string;
  body: string;
  route: string;
  tag?: string;
}): PushPayload {
  return {
    version: 1,
    notificationId: input.notificationId,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 200),
    route: validateRoute(input.route) ? input.route : "/app",
    tag: input.tag?.slice(0, 80) || undefined,
  };
}

export async function sendPushNotification(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<SendPushResult> {
  ensureInitialized();

  const wpSubscription = toWebPushSubscription(subscription);
  const body = JSON.stringify(payload);

  try {
    const response = await webpush.sendNotification(wpSubscription, body, {
      TTL: 86400, // 24 hours
      urgency: "normal",
      topic: payload.tag,
    });

    return {
      accepted: true,
      statusCode: response.statusCode,
      expired: false,
    };
  } catch (err: unknown) {
    const error = err as { statusCode?: number; body?: string; code?: string };
    const statusCode = error.statusCode ?? 0;
    const bodyText = error.body ?? "";
    const code = error.code ?? String(statusCode);

    // 404/410 → subscription expired
    const expired = statusCode === 404 || statusCode === 410;

    // 400/401/403 → permanent failure (config/permission issue)
    // 429 → rate limited (transient, Outbox will retry)
    // 5xx → server error (transient, Outbox will retry)

    return {
      accepted: false,
      statusCode,
      errorCode: code,
      expired,
    };
  }
}

export { validateRoute as validatePushRoute };
