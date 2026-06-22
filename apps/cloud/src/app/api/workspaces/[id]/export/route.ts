import { NextRequest } from "next/server";
import { exportWorkspace } from "@runory/platform-core";
import { requireWorkspaceAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { workspaceId } = await requireWorkspaceAccess(request, id, "admin");
    const exported = await exportWorkspace(workspaceId);
    return successResponse(exported, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
