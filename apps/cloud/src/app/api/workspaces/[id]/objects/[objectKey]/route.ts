import { NextRequest } from "next/server";
import { getObject, getFields } from "@runory/platform-core";
import { requireWorkspaceAccess } from "@/lib/auth";
import { successResponse, handleError, notFound, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey } = await params;
    const { workspaceId } = await requireWorkspaceAccess(request, id);
    const object = await getObject(workspaceId, objectKey);
    if (!object) {
      return notFound(`Object ${objectKey} not found`, requestId);
    }
    const fields = await getFields(workspaceId, objectKey);
    return successResponse({ object, fields }, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
