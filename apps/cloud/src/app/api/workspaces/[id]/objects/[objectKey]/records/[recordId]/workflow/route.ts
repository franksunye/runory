import { NextRequest } from "next/server";
import {
  TABLES,
  queryOne,
  queryAll,
  resolveWorkflowRunProjection,
  enrichWorkItemSubjects,
  lookupSubjectEnrichment,
  resolveActorDisplays,
  type WorkflowInstanceRow,
  type WorkItemRow,
  type WorkflowEventRow,
  type WorkflowDefinition,
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
 * object_type + record_id), together with its work items, event history, and
 * run projection (Tech Spec §11.2). Returns null when no V2 instance is bound
 * to the record.
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

    // Fetch the pinned definition version to resolve the run projection.
    const versionRow = await queryOne<{ definition_json: string }>(
      `SELECT definition_json FROM ${TABLES.workflowDefinitionVersions}
       WHERE id = ?`,
      [instance.definition_version_id]
    );

    let definition: WorkflowDefinition | null = null;
    if (versionRow) {
      try {
        definition = JSON.parse(versionRow.definition_json) as WorkflowDefinition;
      } catch {
        definition = null;
      }
    }

    // Resolve the run projection (Tech Spec §11.2)
    const runProjection = definition
      ? resolveWorkflowRunProjection(definition, instance, workItems, events)
      : null;

    const [subjectEnrichment, actorDisplays] = await Promise.all([
      enrichWorkItemSubjects(
        workspaceId,
        workItems.map((item) => ({
          subject_type: item.subject_type,
          subject_id: item.subject_id,
        }))
      ),
      resolveActorDisplays(events.map((event) => event.actor_id)),
    ]);

    // Event trails name the person or say nothing; a raw actor id is never a
    // usable answer to "who did this".
    const enrichedEvents = events.map((event) => ({
      ...event,
      actor_display: event.actor_id ? actorDisplays.get(event.actor_id)?.displayName ?? null : null,
    }));

    const enrichedWorkItems = workItems.map((item) => {
      const enrichment = lookupSubjectEnrichment(
        subjectEnrichment,
        item.subject_type,
        item.subject_id
      );
      return {
        ...item,
        title: enrichment?.title ?? null,
        company_name: enrichment?.company_name ?? null,
        site_name: enrichment?.site_name ?? null,
        quote_number: enrichment?.quote_number ?? null,
        amount_minor: enrichment?.amount_minor ?? null,
        currency: enrichment?.currency ?? null,
      };
    });

    return successResponse(
      {
        ...instance,
        workflowKey: definition?.workflowKey ?? null,
        work_items: enrichedWorkItems,
        events: enrichedEvents,
        definition,
        runProjection,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
