import { NextRequest } from "next/server";
import { getEntitlement } from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { } = await requireOrganizationAccess(request, id);
    const entitlement = await getEntitlement(id);
    return successResponse(entitlement, 200, requestId);
  } catch (e) { return handleError(e, requestId); }
}
