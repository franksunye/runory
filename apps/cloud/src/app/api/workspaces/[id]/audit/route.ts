import { NextRequest } from "next/server";
import { getAuditEventsWithSummaries } from "@runory/platform-core";
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

    // Server-side filtering (v0.3.6)
    const sp = request.nextUrl.searchParams;
    const limit = sp.get("limit") ? Math.min(parseInt(sp.get("limit")!, 10), 500) : 200;
    const offset = sp.get("offset") ? parseInt(sp.get("offset")!, 10) : 0;

    // Date range filter
    const endDate = sp.get("endDate") ?? undefined;
    let startDate: string | undefined;
    const range = sp.get("range");
    if (range === "24h") startDate = new Date(Date.now() - 24 * 3600_000).toISOString();
    else if (range === "7d") startDate = new Date(Date.now() - 7 * 86_400_000).toISOString();
    else if (range === "30d") startDate = new Date(Date.now() - 30 * 86_400_000).toISOString();
    else startDate = sp.get("startDate") ?? undefined;

    const events = await getAuditEventsWithSummaries(workspaceId, {
      limit,
      offset,
      startDate,
      endDate,
    });

    return successResponse(events, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
