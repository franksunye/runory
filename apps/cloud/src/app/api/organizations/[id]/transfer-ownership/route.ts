import { NextRequest } from "next/server";
import { transferOwnership } from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/organizations/:id/transfer-ownership — transfer ownership to another member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const organizationId = (await params).id;
    const { principal, membership } = await requireOrganizationAccess(
      request,
      organizationId
    );

    const body = (await request.json()) as { newOwnerUserId: string };
    if (!body.newOwnerUserId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "INVALID_INPUT", message: "newOwnerUserId is required", requestId },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await transferOwnership(
      organizationId,
      body.newOwnerUserId,
      principal.userId,
      membership.role
    );

    return successResponse({ success: true }, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
