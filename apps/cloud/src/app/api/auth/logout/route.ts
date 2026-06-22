import { NextRequest } from "next/server";
import { revokeSession, SESSION_COOKIE_NAME, expiredCookieOptions } from "@runory/platform-core";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await revokeSession(token);
    }

    const response = successResponse({ message: "Logged out successfully" }, 200, requestId);
    response.cookies.set(SESSION_COOKIE_NAME, "", expiredCookieOptions());
    return response;
  } catch (e) {
    return handleError(e, requestId);
  }
}
