/**
 * POST /api/push/test-local
 *
 * Spec: v0.9 PWA Notification Technical Spec §9, §10 (local display test)
 *
 * Returns a test notification payload for the client-side Service Worker to
 * display via `registration.showNotification()`. This is a client-side
 * capability diagnostic — it does not contact the push provider and does not
 * require authentication.
 *
 * The frontend should use this to verify that:
 *   - the Service Worker is registered and active
 *   - notification permission has been granted
 *   - the OS can display a notification from the PWA
 *
 * Response:
 *   { title, body, route }
 */

import { NextRequest } from "next/server";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    return successResponse(
      {
        title: "Runory push test",
        body: "If you can see this notification, local notifications are working correctly.",
        route: "/m",
      },
      200,
      requestId,
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
