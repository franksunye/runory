import { NextRequest } from "next/server";
import { resolveSession, listUserWorkspaces, SESSION_COOKIE_NAME } from "@runory/platform-core";
import { successResponse, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/auth/me — returns the current authenticated principal + workspaces
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return successResponse({ authenticated: false }, 200, requestId);
  }

  const principal = await resolveSession(token);
  if (!principal) {
    return successResponse({ authenticated: false }, 200, requestId);
  }

  const workspaces = await listUserWorkspaces(principal.userId);

  return successResponse({
    authenticated: true,
    principal: {
      userId: principal.userId,
      email: principal.email,
      displayName: principal.displayName,
    },
    workspaces,
  }, 200, requestId);
}
