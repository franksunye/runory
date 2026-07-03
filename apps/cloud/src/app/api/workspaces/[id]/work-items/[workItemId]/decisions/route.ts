import { NextRequest } from "next/server";
import { approvalDecide, returnWorkItem, type CommandActor } from "@runory/platform-core";
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

    if (!body?.outcome) {
      return handleError(new Error("outcome is required"), requestId);
    }

    const expectedVersion = body.expectedVersion ?? 1;
    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    if (body.outcome === "returned") {
      await returnWorkItem(workspaceId, workItemId, actor, body.comment ?? null, expectedVersion);
    } else {
      await approvalDecide(
        workspaceId,
        workItemId,
        actor,
        body.outcome,
        body.comment ?? null,
        expectedVersion
      );
    }

    return successResponse({ success: true }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
