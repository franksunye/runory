import { NextRequest } from "next/server";
import { getPackPermissionGroups } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[id]/permission-groups — list all permission groups (v0.3.6)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const url = new URL(request.url);
    const packId = url.searchParams.get("packId") ?? undefined;
    const groups = await getPackPermissionGroups(workspaceId, packId);
    return successResponse(groups, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
