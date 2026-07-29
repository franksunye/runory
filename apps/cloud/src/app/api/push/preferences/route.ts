/**
 * PATCH /api/push/preferences
 *
 * Spec: v0.9 PWA Notification Technical Spec §6 (Preferences and consent), §9
 *
 * Update notification preferences for the authenticated principal. Only the
 * fields provided in the body are updated; omitted fields retain their value.
 * Defaults are enabled in product policy, but browser permission and
 * subscription creation remain explicit opt-in.
 *
 * Request body:
 *   PushPreferencesUpdate (all fields optional)
 */

import { NextRequest } from "next/server";
import { updatePushPreferences, type PushPreferencesUpdate } from "@runory/platform-core";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";
import { resolvePushPrincipal } from "../_principal";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await resolvePushPrincipal(request);

    let body: PushPreferencesUpdate;
    try {
      body = await request.json();
    } catch {
      return invalidInput("Invalid JSON body", principal.requestId);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidInput("Preferences body is required", principal.requestId);
    }

    const updated = await updatePushPreferences(
      principal.workspaceId,
      principal.principalType,
      principal.principalId,
      body,
    );

    return successResponse(updated, 200, principal.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
