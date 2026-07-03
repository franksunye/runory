import { NextRequest } from "next/server";
import { getMyWork } from "@runory/platform-core";
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
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const url = new URL(request.url);
    const actorId = ctx.principal?.userId ?? "unknown";

    const result = await getMyWork(workspaceId, actorId, {
      kind: url.searchParams.get("kind") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      subjectType: url.searchParams.get("subjectType") ?? undefined,
      dueBefore: url.searchParams.get("dueBefore") ?? undefined,
      limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : undefined,
      offset: url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!) : undefined,
    });

    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
