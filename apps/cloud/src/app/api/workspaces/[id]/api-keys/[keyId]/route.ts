import { NextRequest } from "next/server";
import { revokeApiKey, writeAuditEvent } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; keyId: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, keyId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    await revokeApiKey(keyId, workspaceId, ctx.principal!.userId);
    writeAuditEvent({
      workspaceId,
      actorType: "user",
      actorId: ctx.principal!.userId,
      action: "api_key.revoke",
      entityType: "api_key",
      entityId: keyId,
      before: { revoked: false },
      after: { revoked: true },
      requestId: ctx.requestId,
    }).catch(() => {});
    return successResponse({ success: true }, 200, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}
