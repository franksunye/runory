import { NextRequest } from "next/server";
import { getExtensionVersions } from "@runory/platform-core";
import { requireWorkspaceAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; extId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, extId } = await params;
    const { workspaceId } = await requireWorkspaceAccess(request, id);
    const versions = await getExtensionVersions(workspaceId, extId);
    return successResponse(versions, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
