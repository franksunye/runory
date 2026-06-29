import { NextRequest } from "next/server";
import { getObject, getFields } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, notFound, getOrCreateRequestId, METADATA_CACHE } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const object = await getObject(workspaceId, objectKey);
    if (!object) {
      return notFound(`Object ${objectKey} not found`, ctx.requestId);
    }
    const fields = await getFields(workspaceId, objectKey);
    return successResponse({ object, fields }, 200, ctx.requestId, METADATA_CACHE);
  } catch (e) {
    return handleError(e, requestId);
  }
}
