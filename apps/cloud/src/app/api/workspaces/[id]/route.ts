import { NextRequest } from "next/server";
import { getWorkspace, NotFoundError } from "@runory/platform-core";
import { requireWorkspaceAccess } from "@/lib/auth";
import { successResponse, handleError, notFound, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    await requireWorkspaceAccess(request, id);
    const workspace = await getWorkspace(id);
    if (!workspace) {
      return notFound(`Workspace ${id} not found`, requestId);
    }
    return successResponse(workspace, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
