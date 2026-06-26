import { NextRequest } from "next/server";
import type { WorkflowTransition } from "@runory/contracts";
import {
  getRecordWorkflow,
  getAvailableTransitions,
  isTerminalState,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspaces/[id]/objects/[objectKey]/records/[recordId]/workflow
 *
 * Returns the workflow instance bound to this record, along with the
 * definition and available transitions. Returns null if no workflow
 * instance is bound.
 *
 * Response shape:
 *   { instance, definition, availableTransitions, isTerminal }
 *   or null
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey, recordId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const rw = await getRecordWorkflow(workspaceId, objectKey, recordId);
    if (!rw) {
      return successResponse(null, 200, ctx.requestId);
    }

    const { instance, definition } = rw;
    const terminal = isTerminalState(definition, instance.currentState);

    let availableTransitions: WorkflowTransition[] = [];
    if (!terminal) {
      availableTransitions = await getAvailableTransitions(
        workspaceId,
        instance.id,
        ctx.workspaceRole ?? "viewer"
      );
    }

    return successResponse(
      {
        instance,
        definition,
        availableTransitions,
        isTerminal: terminal,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
