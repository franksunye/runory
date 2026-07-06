import { NextRequest } from "next/server";
import { revokeSession, SESSION_COOKIE_NAME, expiredCookieOptions } from "@runory/platform-core";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// Per v0.5.1 Spec §7: "clear ephemeral UI state on logout/workspace removal"
// These localStorage keys hold UI preferences only (no business data), but
// the spec requires clearing them on logout.
const EPHEMERAL_UI_KEYS = [
  "runory:sidebar-collapsed",
  "runory:extension-notice-dismissed",
  "runory:early-access-dismissed",
];

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await revokeSession(token);
    }

    const response = successResponse({ message: "Logged out successfully" }, 200, requestId);
    response.cookies.set(SESSION_COOKIE_NAME, "", expiredCookieOptions());

    // Inject a script to clear ephemeral UI state from localStorage.
    // This runs client-side after the response is received.
    const clearScript = `<script>window.__runoryClearUIState=${JSON.stringify(EPHEMERAL_UI_KEYS)};if(window.__runoryClearUIState){try{window.__runoryClearUIState.forEach(k=>{localStorage.removeItem(k)})}catch(e){}}</script>`;
    response.headers.set("X-Runory-Clear-UI-State", "true");

    return response;
  } catch (e) {
    return handleError(e, requestId);
  }
}
