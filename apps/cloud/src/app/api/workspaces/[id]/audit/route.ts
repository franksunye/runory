import { NextRequest } from "next/server";
import { getAuditLogs } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    const logs = await getAuditLogs(workspaceId);
    return successResponse(logs, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
