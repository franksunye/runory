import { NextRequest } from "next/server";
import { resendInvitation, revokeInvitation } from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/organizations/:id/invitations/:invId/resend
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const p = await params;
    const { principal, membership } = await requireOrganizationAccess(
      request,
      p.id
    );

    const { invitation, token } = await resendInvitation(
      p.invId,
      principal.userId,
      membership.role
    );

    const devToken = process.env.NODE_ENV !== "production" ? token : undefined;

    return successResponse(
      {
        id: invitation.id,
        email: invitation.emailNormalized,
        role: invitation.organizationRole,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        workspaceGrants: invitation.workspaceGrants,
        devToken,
      },
      200,
      requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
