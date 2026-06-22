import { NextRequest } from "next/server";
import { getNavigation } from "@runory/platform-core";
import { requireWorkspaceAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { workspaceId } = await requireWorkspaceAccess(request, id);
    const navigation = await getNavigation(workspaceId);
    return successResponse(navigation, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
