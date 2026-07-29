import { NextRequest } from "next/server";
import {
  listReconciliationResults,
  requireBusinessPermission,
  type ReconciliationStatus,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    await requireBusinessPermission(ctx, "payment.view_diagnostics");

    const url = new URL(request.url);
    const paymentId = url.searchParams.get("paymentId") ?? undefined;
    const statusParam = url.searchParams.get("status");
    const limit = url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)
      : undefined;
    const offset = url.searchParams.get("offset")
      ? parseInt(url.searchParams.get("offset")!, 10)
      : undefined;

    // Validate status filter if provided
    let status: ReconciliationStatus | undefined;
    if (statusParam) {
      if (statusParam !== "consistent" && statusParam !== "divergent" && statusParam !== "unknown") {
        return handleError(
          new Error("INVALID_INPUT: status must be one of: consistent, divergent, unknown"),
          requestId,
        );
      }
      status = statusParam;
    }

    const results = await listReconciliationResults(workspaceId, {
      paymentId,
      status,
      limit,
      offset,
    });

    return successResponse(results, 200, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
