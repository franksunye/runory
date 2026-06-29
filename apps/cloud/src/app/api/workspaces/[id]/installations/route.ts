import { NextRequest } from "next/server";
import { getInstallations } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId, METADATA_CACHE } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const installations = await getInstallations(workspaceId);
    return successResponse(installations, 200, ctx.requestId, METADATA_CACHE);
  } catch (e) {
    return handleError(e, requestId);
  }
}
