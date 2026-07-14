import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// The delivery checklist shown to a field user is the immutable Visit snapshot,
// not the workspace's currently editable form-binding configuration.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; visitId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, visitId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const requirements = await queryAll<{
      id: string;
      label: string;
      binding_id: string;
      form_definition_id: string;
      form_version_id: string;
      form_key: string;
      form_name: string;
      requirement_policy: string;
      timing_json: string | null;
      work_item_id: string | null;
      work_item_status: string | null;
      submission_id: string | null;
      submission_status: string | null;
      submission_revision: number | null;
      submitted_at: string | null;
    }>(
      `SELECT requirement.id, requirement.label, requirement.binding_id,
              requirement.form_definition_id, requirement.form_version_id,
              definition.form_key, definition.name AS form_name,
              requirement.requirement_policy, binding.timing_json,
              item.id AS work_item_id, item.status AS work_item_status,
              submission.id AS submission_id,
              submission.status AS submission_status,
              submission.revision_number AS submission_revision,
              submission.submitted_at
       FROM ${TABLES.visitExecutionRequirements} requirement
       JOIN ${TABLES.formDefinitions} definition
         ON definition.workspace_id = requirement.workspace_id
        AND definition.id = requirement.form_definition_id
       JOIN ${TABLES.formBindings} binding
         ON binding.workspace_id = requirement.workspace_id
        AND binding.id = requirement.binding_id
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
       WHERE requirement.workspace_id = ? AND requirement.visit_id = ?
       ORDER BY requirement.created_at ASC`,
      [workspaceId, visitId]
    );
    const enriched = requirements.map((requirement) => {
      let postSubmissionPolicy = "reason_required";
      if (requirement.timing_json) {
        try {
          const timing = JSON.parse(requirement.timing_json) as { postSubmissionPolicy?: string };
          if (["editable_after_submission", "reason_required", "approval_required"].includes(timing.postSubmissionPolicy ?? "")) {
            postSubmissionPolicy = timing.postSubmissionPolicy as string;
          }
        } catch {
          // Legacy timing metadata uses the safe FSM default.
        }
      }
      const { timing_json: _timingJson, ...publicRequirement } = requirement;
      return { ...publicRequirement, post_submission_policy: postSubmissionPolicy };
    });
    return successResponse({ requirements: enriched }, 200, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
