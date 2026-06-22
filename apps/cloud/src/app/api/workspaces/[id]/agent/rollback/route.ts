import { NextRequest } from "next/server";
import { rollbackExtension, writeAuditEvent } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as { extensionId?: string; rolledBy?: string };
    if (!body.extensionId || !body.rolledBy) {
      return invalidInput("extensionId and rolledBy are required", ctx.requestId);
    }
    const version = await rollbackExtension(workspaceId, body.extensionId, ctx.principal!.userId);
    if (version) {
      writeAuditEvent({
        workspaceId,
        actorType: "agent",
        actorId: ctx.principal!.userId,
        action: "extension.rollback",
        entityType: "extension",
        entityId: body.extensionId,
        after: {
          version: version.version,
          rollbackOfVersion: version.rollbackOfVersion,
        },
        extensionVersionId: version.id,
        requestId: ctx.requestId,
      }).catch((err) => {
        console.error("[audit] Failed to write audit event:", err);
      });
    }
    return successResponse(version, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
