import { NextRequest } from "next/server";
import { getAvailableTransitions } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  notFound,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, instanceId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const role = ctx.workspaceRole ?? "viewer";
    try {
      const transitions = await getAvailableTransitions(workspaceId, instanceId, role);
      return successResponse(transitions, 200, ctx.requestId);
    } catch (err) {
      if (err instanceof Error && err.name === "NotFoundError") {
        return notFound(`Workflow instance ${instanceId} not found`, ctx.requestId);
      }
      throw err;
    }
  } catch (e) {
    return handleError(e, requestId);
  }
}
