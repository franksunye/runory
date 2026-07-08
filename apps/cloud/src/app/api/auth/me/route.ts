import { NextRequest } from "next/server";
import { resolveSession, listUserWorkspaces, execute, now, TABLES, SESSION_COOKIE_NAME } from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/auth/me — returns the current authenticated principal + workspaces
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
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
  } catch (e) {
    return handleError(e, requestId);
  }
}

// PATCH /api/auth/me — updates the current principal's display name
export async function PATCH(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await requirePrincipal(request);
    const body = await request.json().catch(() => ({}));
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

    if (!displayName) {
      return handleError(new Error("Display name is required"), requestId);
    }
    if (displayName.length > 64) {
      return handleError(new Error("Display name is too long"), requestId);
    }

    await execute(
      `UPDATE ${TABLES.users} SET display_name = ?, updated_at = ? WHERE id = ?`,
      [displayName, now(), principal.userId]
    );

    return successResponse({
      userId: principal.userId,
      email: principal.email,
      displayName,
    }, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
