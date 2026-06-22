import { NextRequest } from "next/server";
import { listOrganizationMembers } from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/organizations/:id/members — list members
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const organizationId = (await params).id;
    const { membership } = await requireOrganizationAccess(request, organizationId);
    const members = await listOrganizationMembers(organizationId, membership.role);
    return successResponse(members, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
