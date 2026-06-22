import { NextRequest } from "next/server";
import { getViews } from "@runory/platform-core";
import { requireWorkspaceAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey } = await params;
    const { workspaceId } = await requireWorkspaceAccess(request, id);
    const views = await getViews(workspaceId, objectKey);
    return successResponse(views, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
