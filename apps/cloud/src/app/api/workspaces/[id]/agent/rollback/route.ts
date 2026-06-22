import { NextRequest } from "next/server";
import { rollbackExtension } from "@runory/platform-core";
import { requireWorkspaceAccess } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { workspaceId, actor } = await requireWorkspaceAccess(request, id, "admin");
    const body = await request.json() as { extensionId?: string; rolledBy?: string };
    if (!body.extensionId || !body.rolledBy) {
      return invalidInput("extensionId and rolledBy are required", requestId);
    }
    const version = await rollbackExtension(workspaceId, body.extensionId, actor.externalId);
    return successResponse(version, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
