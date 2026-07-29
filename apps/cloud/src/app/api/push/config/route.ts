/**
 * GET /api/push/config
 *
 * Spec: v0.9 PWA Notification Technical Spec §9 (API boundary)
 *
 * Returns VAPID public key and push configuration status. This is a public
 * endpoint — the VAPID public key is not sensitive and may be exposed to the
 * client so the Service Worker can subscribe via PushManager.
 */

import { NextRequest } from "next/server";
import { getPushConfig } from "@runory/platform-core";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const config = getPushConfig();
    return successResponse(
      {
        configured: config.configured,
        publicKey: config.publicKey,
      },
      200,
      requestId,
      "no-store",
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
