/**
 * DELETE /api/push/unsubscribe
 *
 * Spec: v0.9 PWA Notification Technical Spec §5, §9
 *
 * Disable (soft-delete) a push subscription for the current device. Only
 * subscriptions belonging to the authenticated principal can be disabled —
 * cross-principal or cross-workspace subscription IDs are rejected.
 *
 * Request body:
 *   { subscriptionId }
 */

import { NextRequest } from "next/server";
import { disablePushSubscription, getPushSubscriptionById } from "@runory/platform-core";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";
import { resolvePushPrincipal } from "../_principal";

export const dynamic = "force-dynamic";

interface UnsubscribeBody {
  subscriptionId: string;
}

export async function DELETE(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await resolvePushPrincipal(request);

    let body: UnsubscribeBody;
    try {
      body = await request.json();
    } catch {
      return invalidInput("Invalid JSON body", principal.requestId);
    }

    if (!body.subscriptionId) {
      return invalidInput("subscriptionId is required", principal.requestId);
    }

    // Verify ownership before disabling — prevent cross-principal attacks.
    const subscription = await getPushSubscriptionById(body.subscriptionId);
    if (
      !subscription
      || subscription.workspaceId !== principal.workspaceId
      || subscription.principalType !== principal.principalType
      || subscription.principalId !== principal.principalId
    ) {
      return invalidInput("Subscription not found", principal.requestId);
    }

    await disablePushSubscription(body.subscriptionId);

    return successResponse(
      { disabled: true },
      200,
      principal.requestId,
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
