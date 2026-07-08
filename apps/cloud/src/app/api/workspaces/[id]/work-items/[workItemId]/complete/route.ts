import { NextRequest } from "next/server";
import { completeWorkItem, type CommandActor, InvalidInputError } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
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
      answers?: Record<string, unknown>;
      notes?: string;
      expectedVersion?: number;
    };
    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;

    // Per v0.5.1: expectedVersion MUST be explicitly provided — no silent default.
    if (body.expectedVersion === undefined || body.expectedVersion === null) {
      throw new InvalidInputError(
        "expectedVersion is required. Provide the current work item version to enable optimistic locking."
      );
    }

    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    const formData: Record<string, unknown> = {};
    if (body.answers !== undefined) formData.answers = body.answers;
    if (body.notes !== undefined) formData.notes = body.notes;

    // executeCommand() handles idempotency internally via commandId.
    const result = await completeWorkItem(
      workspaceId,
      workItemId,
      actor,
      body.expectedVersion,
      Object.keys(formData).length > 0 ? formData : undefined,
      idempotencyKey,
      ctx.requestId,
    );
    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
