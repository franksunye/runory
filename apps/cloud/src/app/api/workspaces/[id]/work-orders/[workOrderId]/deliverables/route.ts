import { NextRequest } from "next/server";
import {
  businessTable,
  getRecord,
  queryAll,
  TABLES,
  type VisibilityScope,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
  notFound,
} from "@/lib/http";

export const dynamic = "force-dynamic";

interface DeliverableRow {
  visit_id: string;
  visit_title: string;
  visit_status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  technician_name: string | null;
  requirement_id: string | null;
  requirement_label: string | null;
  requirement_policy: string | null;
  form_key: string | null;
  form_name: string | null;
  work_item_id: string | null;
  work_item_status: string | null;
  submission_id: string | null;
  submission_status: string | null;
  submission_revision: number | null;
}

function visibilityScopeFor(ctx: {
  principal: { userId: string } | null;
  workspaceRole: string | null;
  organizationRole: string | null;
}): VisibilityScope | undefined {
  return ctx.principal
    ? {
        userId: ctx.principal.userId,
        role: ctx.workspaceRole,
        organizationRole: ctx.organizationRole,
      }
    : undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; workOrderId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, workOrderId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const workOrder = await getRecord(workspaceId, "work_order", workOrderId, {
      visibilityScope: visibilityScopeFor(ctx),
    });
    if (!workOrder) {
      return notFound(`Work Order ${workOrderId} not found`, ctx.requestId);
    }

    const rows = await queryAll<DeliverableRow>(
      `SELECT visit.id AS visit_id,
              visit.title AS visit_title,
              visit.status AS visit_status,
              visit.scheduled_start,
              visit.scheduled_end,
              technician.name AS technician_name,
              requirement.id AS requirement_id,
              requirement.label AS requirement_label,
              requirement.requirement_policy,
              definition.form_key,
              definition.name AS form_name,
              item.id AS work_item_id,
              item.status AS work_item_status,
              submission.id AS submission_id,
              submission.status AS submission_status,
              submission.revision_number AS submission_revision
       FROM ${businessTable("service_visit")} visit
       LEFT JOIN ${businessTable("technician")} technician
         ON technician.workspace_id = visit.workspace_id
        AND technician.id = visit.technician_id
       LEFT JOIN ${TABLES.visitExecutionRequirements} requirement
         ON requirement.workspace_id = visit.workspace_id
        AND requirement.visit_id = visit.id
       LEFT JOIN ${TABLES.formDefinitions} definition
         ON definition.workspace_id = requirement.workspace_id
        AND definition.id = requirement.form_definition_id
       LEFT JOIN ${TABLES.workItems} item
         ON item.workspace_id = requirement.workspace_id
        AND item.instance_id = 'visit_execution:' || requirement.visit_id
        AND item.step_id = requirement.id
       LEFT JOIN ${TABLES.formSubmissions} submission
         ON submission.id = (
           SELECT candidate.id
           FROM ${TABLES.formSubmissions} candidate
           WHERE candidate.workspace_id = requirement.workspace_id
             AND candidate.subject_type = 'service_visit'
             AND candidate.subject_id = requirement.visit_id
             AND candidate.binding_id = requirement.binding_id
             AND candidate.form_definition_id = requirement.form_definition_id
             AND candidate.form_version_id = requirement.form_version_id
             AND candidate.status != 'void'
           ORDER BY candidate.revision_number DESC, candidate.created_at DESC
           LIMIT 1
         )
       WHERE visit.workspace_id = ? AND visit.work_order_id = ?
       ORDER BY visit.scheduled_start ASC, visit.id ASC, requirement.created_at ASC`,
      [workspaceId, workOrderId]
    );

    const visits = new Map<string, {
      id: string;
      title: string;
      status: string;
      scheduledStart: string | null;
      scheduledEnd: string | null;
      technicianName: string | null;
      requirements: Array<{
        id: string;
        label: string;
        policy: string;
        formKey: string | null;
        formName: string | null;
        workItemId: string | null;
        workItemStatus: string | null;
        submissionId: string | null;
        submissionStatus: string | null;
        submissionRevision: number | null;
      }>;
    }>();

    for (const row of rows) {
      let visit = visits.get(row.visit_id);
      if (!visit) {
        visit = {
          id: row.visit_id,
          title: row.visit_title,
          status: row.visit_status,
          scheduledStart: row.scheduled_start,
          scheduledEnd: row.scheduled_end,
          technicianName: row.technician_name,
          requirements: [],
        };
        visits.set(row.visit_id, visit);
      }
      if (row.requirement_id) {
        visit.requirements.push({
          id: row.requirement_id,
          label: row.requirement_label ?? row.form_name ?? "Required form",
          policy: row.requirement_policy ?? "required",
          formKey: row.form_key,
          formName: row.form_name,
          workItemId: row.work_item_id,
          workItemStatus: row.work_item_status,
          submissionId: row.submission_id,
          submissionStatus: row.submission_status,
          submissionRevision: row.submission_revision,
        });
      }
    }

    const result = [...visits.values()];
    const total = result.reduce((count, visit) => count + visit.requirements.length, 0);
    const completed = result.reduce(
      (count, visit) => count + visit.requirements.filter(
        (requirement) => requirement.workItemStatus === "completed"
      ).length,
      0
    );

    return successResponse({ visits: result, summary: { total, completed } }, 200, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}

