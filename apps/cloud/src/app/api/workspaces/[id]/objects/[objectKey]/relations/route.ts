import { NextRequest } from "next/server";
import { getRelations, getBacklinks } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const [relations, backlinks] = await Promise.all([
      getRelations(workspaceId, objectKey),
      getBacklinks(workspaceId, objectKey),
    ]);
    return successResponse({ relations, backlinks }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
