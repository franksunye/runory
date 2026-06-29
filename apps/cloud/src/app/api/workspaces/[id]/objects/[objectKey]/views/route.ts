import { NextRequest } from "next/server";
import { getViews } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId, METADATA_CACHE } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const views = await getViews(workspaceId, objectKey);
    return successResponse(views, 200, ctx.requestId, METADATA_CACHE);
  } catch (e) {
    return handleError(e, requestId);
  }
}
