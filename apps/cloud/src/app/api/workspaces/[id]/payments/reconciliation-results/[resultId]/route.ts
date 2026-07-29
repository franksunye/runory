import { NextRequest } from "next/server";
import {
  getReconciliationResult,
  requireBusinessPermission,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; resultId: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, resultId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    await requireBusinessPermission(ctx, "payment.view_diagnostics");

    const result = await getReconciliationResult(workspaceId, resultId);
    return successResponse(result, 200, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
