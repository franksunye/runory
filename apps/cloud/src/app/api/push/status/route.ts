/**
 * GET /api/push/status
 *
 * Spec: v0.9 PWA Notification Technical Spec §9 (API boundary)
 *
 * Returns the current device's active push subscriptions and notification
 * preferences. Subscriptions are returned in a safe view (no endpoint or key
 * material). Preferences are auto-created with defaults on first access.
 *
 * Response:
 *   { subscriptions: PushSubscriptionSafe[], preferences: PushPreferencesRecord }
 */

import { NextRequest } from "next/server";
import {
  getActiveSubscriptionsForPrincipal,
  getPushPreferences,
  toSafeSubscription,
} from "@runory/platform-core";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";
import { resolvePushPrincipal } from "../_principal";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await resolvePushPrincipal(request);

    const [subscriptions, preferences] = await Promise.all([
      getActiveSubscriptionsForPrincipal(
        principal.workspaceId,
        principal.principalType,
        principal.principalId,
      ),
      getPushPreferences(
        principal.workspaceId,
        principal.principalType,
        principal.principalId,
      ),
    ]);

    return successResponse(
      {
        subscriptions: subscriptions.map(toSafeSubscription),
        preferences,
      },
      200,
      principal.requestId,
      "no-store",
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
