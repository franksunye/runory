import { NextRequest } from "next/server";
import { releaseWorkItem, type CommandActor, InvalidInputError } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { checkIdempotency } from "@/lib/idempotency";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; workItemId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, workItemId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    const body = await request.json().catch(() => ({})) as {
      expectedVersion?: number;
      idempotencyKey?: string;
    };

    // Per v0.5.1: expectedVersion MUST be explicitly provided — no silent default.
    if (body.expectedVersion === undefined || body.expectedVersion === null) {
      throw new InvalidInputError(
        "expectedVersion is required. Provide the current work item version to enable optimistic locking."
      );
    }

    // Idempotency check
    if (body.idempotencyKey) {
      const existing = await checkIdempotency(workspaceId, body.idempotencyKey);
      if (existing && existing.status === "succeeded") {
        return successResponse({ success: true, idempotent: true }, 200, ctx.requestId);
      }
    }

    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    await releaseWorkItem(workspaceId, workItemId, actor, body.expectedVersion);
    return successResponse({ success: true }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
