/**
 * POST /api/push/test-remote
 *
 * Spec: v0.9 PWA Notification Technical Spec §9, §10 (remote push test)
 *
 * Sends a real Web Push notification through the full dispatch path
 * (Notification -> Message -> MessageDelivery -> Outbox -> provider) to the
 * authenticated principal's active subscriptions. This is an end-to-end
 * diagnostic that verifies the server-to-device chain.
 *
 * Requires workspace or customer-access authentication. If the principal has
 * no active subscriptions, the response indicates that no notification was
 * dispatched.
 *
 * Response:
 *   { dispatched: boolean, notificationId: string | null }
 */

import { NextRequest } from "next/server";
import {
  dispatchPushNotification,
  getActiveSubscriptionsForPrincipal,
} from "@runory/platform-core";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";
import { resolvePushPrincipal } from "../_principal";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await resolvePushPrincipal(request);

    // Check for at least one active subscription before dispatching.
    const subscriptions = await getActiveSubscriptionsForPrincipal(
      principal.workspaceId,
      principal.principalType,
      principal.principalId,
    );

    if (subscriptions.length === 0) {
      return successResponse(
        { dispatched: false, notificationId: null },
        200,
        principal.requestId,
      );
    }

    const result = await dispatchPushNotification({
      workspaceId: principal.workspaceId,
      category: "approval_ready",
      principalType: principal.principalType,
      principalId: principal.principalId,
      title: "Runory push test",
      body: "This is a remote push notification test from the server.",
      route: "/m",
      tag: "push-test",
      sourceType: "push_test",
    });

    return successResponse(
      {
        dispatched: result.dispatched > 0,
        notificationId: result.notificationId,
      },
      200,
      principal.requestId,
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
