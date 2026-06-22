import { NextRequest } from "next/server";
import {
  revokeAllSessions,
  resolveSession,
  listUserSessions,
  SESSION_COOKIE_NAME,
  expiredCookieOptions,
} from "@runory/platform-core";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/auth/logout-all — revoke all sessions for the current user
export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return successResponse({ message: "No active session", revokedCount: 0 }, 200, requestId);
    }

    const principal = await resolveSession(token);
    if (!principal) {
      const response = successResponse({ message: "No active session", revokedCount: 0 }, 200, requestId);
      response.cookies.set(SESSION_COOKIE_NAME, "", expiredCookieOptions());
      return response;
    }

    const count = await revokeAllSessions(principal.userId);
    const response = successResponse({
      message: "All sessions revoked",
      revokedCount: count,
    }, 200, requestId);
    response.cookies.set(SESSION_COOKIE_NAME, "", expiredCookieOptions());
    return response;
  } catch (e) {
    return handleError(e, requestId);
  }
}

// GET /api/auth/sessions — list active sessions for the current user
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return successResponse([], 200, requestId);
    }

    const principal = await resolveSession(token);
    if (!principal) {
      return successResponse([], 200, requestId);
    }

    const sessions = await listUserSessions(principal.userId, token);
    return successResponse(sessions, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
