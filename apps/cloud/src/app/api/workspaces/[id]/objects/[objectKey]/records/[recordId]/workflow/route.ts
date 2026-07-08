import { NextRequest } from "next/server";
import {
  TABLES,
  queryOne,
  queryAll,
  type WorkflowInstanceRow,
  type WorkItemRow,
  type WorkflowEventRow,
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
 * V2-only: returns the V2 workflow instance bound to this record (matched by
 * object_type + record_id), together with its work items and event history.
 * Returns null when no V2 instance is bound to the record.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey, recordId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    // Find the V2 instance bound to this record.
    const instance = await queryOne<WorkflowInstanceRow>(
      `SELECT * FROM ${TABLES.workflowInstances}
       WHERE workspace_id = ? AND object_type = ? AND record_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [workspaceId, objectKey, recordId]
    );

    if (!instance) {
      return successResponse(null, 200, ctx.requestId);
    }

    // Fetch work items for this instance.
    const workItems = await queryAll<WorkItemRow>(
      `SELECT * FROM ${TABLES.workItems}
       WHERE workspace_id = ? AND instance_id = ?
       ORDER BY created_at ASC`,
      [workspaceId, instance.id]
    );

    // Fetch events for this instance.
    const events = await queryAll<WorkflowEventRow>(
      `SELECT id, instance_id, sequence, event_type, step_id,
              actor_type, actor_id, payload_json, occurred_at
       FROM ${TABLES.workflowEvents}
       WHERE workspace_id = ? AND instance_id = ?
       ORDER BY sequence ASC`,
      [workspaceId, instance.id]
    );

    return successResponse(
      {
        ...instance,
        work_items: workItems,
        events,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
