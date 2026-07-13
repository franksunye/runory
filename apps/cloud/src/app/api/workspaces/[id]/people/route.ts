import { NextRequest } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth";
import { listWorkspacePeople } from "@/lib/identity";
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
    const people = await listWorkspacePeople(workspaceId, ctx.organizationId);
    return successResponse(people, 200, ctx.requestId, "no-store");
  } catch (error) {
    return handleError(error, requestId);
  }
}
