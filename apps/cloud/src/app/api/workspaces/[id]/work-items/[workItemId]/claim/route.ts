import { NextRequest } from "next/server";
import { claimWorkItem, type CommandActor, InvalidInputError } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

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
    // This prevents blind overwrites when the client omits the field.
    if (body.expectedVersion === undefined || body.expectedVersion === null) {
      throw new InvalidInputError(
        "expectedVersion is required. Provide the current work item version to enable optimistic locking."
      );
    }

    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    await claimWorkItem(workspaceId, workItemId, actor, body.expectedVersion);
    return successResponse({ success: true }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
