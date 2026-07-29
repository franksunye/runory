/**
 * POST /api/push/subscribe
 *
 * Spec: v0.9 PWA Notification Technical Spec §5 (Principal and subscription contract), §9
 *
 * Subscribe the current device for Web Push. The principal type and ID are
 * server-derived from the authenticated session (customer-access or workspace),
 * never from caller-supplied fields.
 *
 * Request body:
 *   { endpoint, p256dh, auth, userAgentSummary? }
 *
 * Returns a safe subscription view (no endpoint or key material).
 */

import { NextRequest } from "next/server";
import { createPushSubscription, toSafeSubscription } from "@runory/platform-core";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";
import { resolvePushPrincipal } from "../_principal";

export const dynamic = "force-dynamic";

interface SubscribeBody {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgentSummary?: string;
}

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await resolvePushPrincipal(request);

    let body: SubscribeBody;
    try {
      body = await request.json();
    } catch {
      return invalidInput("Invalid JSON body", principal.requestId);
    }

    if (!body.endpoint || !body.p256dh || !body.auth) {
      return invalidInput(
        "endpoint, p256dh, and auth are required",
        principal.requestId,
      );
    }

    const subscription = await createPushSubscription({
      workspaceId: principal.workspaceId,
      principalType: principal.principalType,
      principalId: principal.principalId,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      userAgentSummary: body.userAgentSummary,
    });

    return successResponse(
      toSafeSubscription(subscription),
      200,
      principal.requestId,
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
