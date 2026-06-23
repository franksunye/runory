import { NextRequest } from "next/server";
import { getWorkspace, NotFoundError } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, notFound, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx } = await requireWorkspaceContext(request, id, "viewer");
    const workspace = await getWorkspace(id);
    if (!workspace) {
      return notFound(`Workspace ${id} not found`, ctx.requestId);
    }
    return successResponse(
      {
        ...workspace,
        organizationId: ctx.organizationId,
        organizationRole: ctx.organizationRole,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
