import { NextRequest } from "next/server";
import { installPack } from "@runory/platform-core";
import { requireWorkspaceAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, packId } = await params;
    const { workspaceId } = await requireWorkspaceAccess(request, id, "admin");
    const result = await installPack(workspaceId, packId);
    return successResponse(result, 201, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
