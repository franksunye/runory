import { NextRequest } from "next/server";
import { getWorkItem } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; workItemId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, workItemId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const workItem = await getWorkItem(workspaceId, workItemId);
    return successResponse(workItem, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
