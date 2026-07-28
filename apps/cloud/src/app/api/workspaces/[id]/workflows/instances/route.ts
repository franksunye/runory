import { NextRequest } from "next/server";
import {
  TABLES,
  queryAll,
  queryOne,
  getWorkflowHistory,
  resolveWorkflowRunProjection,
  type WorkflowInstanceRow,
  type WorkItemRow,
  type WorkflowEventRow,
  type WorkflowDefinition,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

interface DefinitionRow {
  id: string;
  workflow_id: string;
  name: string;
  target_object: string;
}

interface VersionRow {
  id: string;
  definition_json: string;
  version_number: number;
}

/**
 * GET /api/workspaces/[id]/workflows/instances
 *
 * Returns all workflow instances for the workspace, each with its
 * definition, work items, and run projection (Tech Spec §11.2).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);
    const status = url.searchParams.get("status");
    const definitionId = url.searchParams.get("definitionId");

    const conditions = ["workspace_id = ?"];
    const args: unknown[] = [workspaceId];
    if (status) {
      conditions.push("status = ?");
      args.push(status);
    }
    if (definitionId) {
      conditions.push("workflow_definition_id = ?");
      args.push(definitionId);
    }

    const instances = await queryAll<WorkflowInstanceRow>(
      `SELECT * FROM ${TABLES.workflowInstances}
       WHERE ${conditions.join(" AND ")}
       ORDER BY started_at DESC
       LIMIT ${limit}`,
      args
    );

    if (instances.length === 0) {
      return successResponse([], 200, ctx.requestId);
    }

    // Batch-fetch definition metadata
    const defIds = [...new Set(instances.map((i) => i.workflow_definition_id))];
    const defRows = await queryAll<DefinitionRow>(
      `SELECT id, workflow_id, name, target_object
       FROM ${TABLES.workflowDefinitions}
       WHERE id IN (${defIds.map(() => "?").join(",")})`,
      defIds
    );
    const defMap = new Map(defRows.map((d) => [d.id, d]));

    // Batch-fetch version JSON for all definition_version_ids
    const versionIds = [...new Set(instances.map((i) => i.definition_version_id))];
    const versionRows = await queryAll<VersionRow>(
      `SELECT id, definition_json, version_number
       FROM ${TABLES.workflowDefinitionVersions}
       WHERE id IN (${versionIds.map(() => "?").join(",")})`,
      versionIds
    );
    const versionMap = new Map(versionRows.map((v) => [v.id, v]));

    // Batch-fetch all work items for these instances
    const instanceIds = instances.map((i) => i.id);
    const allWorkItems = await queryAll<WorkItemRow>(
      `SELECT * FROM ${TABLES.workItems}
       WHERE workspace_id = ? AND instance_id IN (${instanceIds.map(() => "?").join(",")})
       ORDER BY created_at ASC`,
      [workspaceId, ...instanceIds]
    );
    const itemsByInstance = new Map<string, WorkItemRow[]>();
    for (const wi of allWorkItems) {
      const list = itemsByInstance.get(wi.instance_id) ?? [];
      list.push(wi);
      itemsByInstance.set(wi.instance_id, list);
    }

    const result = await Promise.all(
      instances.map(async (inst) => {
        const def = defMap.get(inst.workflow_definition_id);
        const version = versionMap.get(inst.definition_version_id);
        let definition: WorkflowDefinition | null = null;
        if (version) {
          try {
            definition = JSON.parse(version.definition_json) as WorkflowDefinition;
          } catch {
            definition = null;
          }
        }
        const workItems = itemsByInstance.get(inst.id) ?? [];
        const events = await getWorkflowHistory(workspaceId, inst.id);
        const runProjection = definition
          ? resolveWorkflowRunProjection(
              definition,
              inst,
              workItems,
              events as WorkflowEventRow[],
            )
          : null;
        return {
          ...inst,
          work_items: workItems,
          definition,
          runProjection,
          definitionName: def?.name ?? null,
          definitionWorkflowKey: def?.workflow_id ?? null,
        };
      })
    );

    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
