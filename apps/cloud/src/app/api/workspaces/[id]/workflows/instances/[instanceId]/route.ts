import { NextRequest } from "next/server";
import {
  TABLES,
  queryOne,
  queryAll,
  getWorkflowHistory,
  type WorkflowInstanceRow,
  type WorkItemRow,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspaces/[id]/workflows/instances/[instanceId]
 *
 * Returns a workflow instance with its definition, work items, and events.
 * This is the unified detail endpoint for the workflow runtime.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, instanceId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    // Fetch the instance
    const instance = await queryOne<WorkflowInstanceRow>(
      `SELECT * FROM ${TABLES.workflowInstances}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, instanceId]
    );

    if (!instance) {
      return successResponse(null, 200, ctx.requestId);
    }

    // Fetch the definition version to get the step-based definition
    const versionRow = await queryOne<{ definition_json: string; version_number: number }>(
      `SELECT definition_json, version_number FROM ${TABLES.workflowDefinitionVersions}
       WHERE id = ?`,
      [instance.definition_version_id]
    );

    let definition: Record<string, unknown> | null = null;
    if (versionRow) {
      try {
        definition = JSON.parse(versionRow.definition_json);
      } catch {
        definition = null;
      }
    }

    // Fetch work items for this instance
    const workItems = await queryAll<WorkItemRow>(
      `SELECT * FROM ${TABLES.workItems}
       WHERE workspace_id = ? AND instance_id = ?
       ORDER BY created_at ASC`,
      [workspaceId, instanceId]
    );

    // Fetch events for this instance
    const events = await getWorkflowHistory(workspaceId, instanceId);

    return successResponse(
      {
        ...instance,
        work_items: workItems,
        events,
        definition,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
