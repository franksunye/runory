import { NextRequest } from "next/server";
import { getAuditEvents } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    const url = new URL(request.url);
    const options: Record<string, unknown> = {};
    const action = url.searchParams.get("action");
    const actorId = url.searchParams.get("actorId");
    const entityType = url.searchParams.get("entityType");
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    if (action) options.action = action;
    if (actorId) options.actorId = actorId;
    if (entityType) options.entityType = entityType;
    if (limit) options.limit = parseInt(limit, 10);
    if (offset) options.offset = parseInt(offset, 10);
    const events = await getAuditEvents(workspaceId, options);
    return successResponse(events, 200, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}
