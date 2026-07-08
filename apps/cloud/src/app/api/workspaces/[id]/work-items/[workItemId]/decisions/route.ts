import { NextRequest } from "next/server";
import { approvalDecide, returnWorkItem, type CommandActor, InvalidInputError } from "@runory/platform-core";
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
    const body = await request.json() as {
      outcome: "approved" | "rejected" | "returned";
      comment?: string | null;
      expectedVersion?: number;
    };
    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;

    if (!body?.outcome) {
      return handleError(new Error("outcome is required"), requestId);
    }

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

    // executeCommand() handles idempotency internally via commandId.
    let result;
    if (body.outcome === "returned") {
      result = await returnWorkItem(
        workspaceId,
        workItemId,
        actor,
        body.comment ?? null,
        body.expectedVersion,
        idempotencyKey,
        ctx.requestId,
      );
    } else {
      result = await approvalDecide(
        workspaceId,
        workItemId,
        actor,
        body.outcome,
        body.comment ?? null,
        body.expectedVersion,
        idempotencyKey,
        ctx.requestId,
      );
    }

    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
