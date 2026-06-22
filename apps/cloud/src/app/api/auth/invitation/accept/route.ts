import { NextRequest } from "next/server";
import { acceptInvitation } from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/auth/invitation/accept — accept an invitation by token
// Acceptance requires an authenticated user (the user must already be logged in via OTP).
// The accepting user's email must match the invitation email.
export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const body = (await request.json()) as { token: string };
    if (!body.token) {
      return invalidInput("Token is required", requestId);
    }

    const principal = await requirePrincipal(request);

    const invitation = await acceptInvitation(
      body.token,
      principal.userId,
      principal.email ?? ""
    );

    return successResponse(
      {
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
        organizationRole: invitation.organizationRole,
        workspaceGrants: invitation.workspaceGrants,
      },
      200,
      requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
