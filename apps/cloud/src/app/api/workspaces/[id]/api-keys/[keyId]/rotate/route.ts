import { NextRequest } from "next/server";
import { rotateApiKey } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; keyId: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, keyId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const key = await rotateApiKey(keyId, workspaceId, ctx.principal!.userId);
    return successResponse(key, 200, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}
