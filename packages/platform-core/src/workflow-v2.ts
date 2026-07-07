// ── Workflow V2 Runtime (v0.5 Slice 1) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.4-5.5:
// Workflow definitions are versioned and immutable once published.
// Instances are pinned to a specific definition version.
// History is append-only events, not a mutable JSON column.
// Work items carry human tasks, approvals, and form bindings.
// Approval decisions are immutable and reference exactly one work_item.

import { genId, now, queryOne, queryAll, batch, execute } from "./db";
import { TABLES, businessTable } from "./contracts";
import { BusinessError, NotFoundError, InvalidInputError, ConflictError } from "./context";
import { ERROR_CODES } from "./errors";
import {
  checkOptimisticLock,
  executeCommand,
  type CommandActor,
  type CommandHandlerResult,
  type CommandResult,
} from "./command-runtime";
import { getUserPermissionGroups } from "./permission-groups";
import { writeAuditEvent } from "./audit-service";

// ── Types ──

export interface WorkflowStep {
  id: string;
  kind: "start" | "human_task" | "approval" | "system_command" | "wait" | "end";
  next?: string;
  command?: string;
  assigneeRule?: { permissionGroup?: string; userId?: string };
  formBindingId?: string;
  onApprove?: string;
  onReject?: string;
  policy?: { allowSelfApproval?: boolean };
  /** SLA duration for this step (e.g. "24h", "2d"). Triggers a workflow timer. */
  sla?: string;
  /** Explicit due-at ISO timestamp for this step. Triggers a workflow timer. */
  dueAt?: string;
}

export interface WorkflowDefinition {
  workflowKey: string;
  name: string;
  targetObject: string;
  initialState: string;
  steps: WorkflowStep[];
}

export interface WorkflowDefinitionVersionRow {
  id: string;
  workspace_id: string;
  workflow_definition_id: string;
  version_number: number;
  definition_json: string;
  schema_version: string;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
}

export interface WorkflowInstanceRow {
  id: string;
  workspace_id: string;
  workflow_definition_id: string;
  definition_version_id: string;
  object_type: string;
  record_id: string;
  status: string;
  current_step_id: string | null;
  version: number;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkItemRow {
  id: string;
  workspace_id: string;
  instance_id: string;
  step_id: string;
  kind: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
  assignee_type: string | null;
  assignee_id: string | null;
  candidate_rule_json: string | null;
  due_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  form_binding_id: string | null;
  input_snapshot_json: string | null;
  input_snapshot_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowEventRow {
  id: string;
  instance_id: string;
  sequence: number;
  event_type: string;
  step_id: string | null;
  actor_type: string | null;
  actor_id: string | null;
  payload_json: string;
  occurred_at: string;
}

// ── Publish Workflow Definition ──

export async function publishWorkflowDefinition(
  workspaceId: string,
  def: WorkflowDefinition,
  publishedBy: string | null
): Promise<{ definitionId: string; versionId: string; versionNumber: number }> {
  const ts = now();

  // Find or create the definition record
  let defRow = await queryOne<{ id: string; active_version_id: string | null }>(
    `SELECT id, active_version_id FROM ${TABLES.workflowDefinitionsV2}
     WHERE workspace_id = ? AND workflow_key = ?`,
    [workspaceId, def.workflowKey]
  );

  let definitionId: string;
  let versionNumber: number;

  if (!defRow) {
    definitionId = genId("wfd");
    versionNumber = 1;
    await batch([
      {
        sql: `INSERT INTO ${TABLES.workflowDefinitionsV2}
              (id, workspace_id, workflow_key, name, target_object, active_version_id, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, NULL, 'active', ?, ?)`,
        args: [definitionId, workspaceId, def.workflowKey, def.name, def.targetObject, ts, ts],
      },
    ]);
  } else {
    definitionId = defRow.id;
    // Get next version number
    const lastVer = await queryOne<{ version_number: number }>(
      `SELECT MAX(version_number) as version_number FROM ${TABLES.workflowDefinitionVersions}
       WHERE workflow_definition_id = ?`,
      [definitionId]
    );
    versionNumber = (lastVer?.version_number ?? 0) + 1;
  }

  // Create the immutable version
  const versionId = genId("wfv");
  const defJson = JSON.stringify(def);

  const statements: Array<{ sql: string; args?: unknown[] }> = [
    {
      sql: `INSERT INTO ${TABLES.workflowDefinitionVersions}
            (id, workspace_id, workflow_definition_id, version_number, definition_json, schema_version, published_by, published_at, created_at)
            VALUES (?, ?, ?, ?, ?, '2.0', ?, ?, ?)`,
      args: [versionId, workspaceId, definitionId, versionNumber, defJson, publishedBy, ts, ts],
    },
    {
      sql: `UPDATE ${TABLES.workflowDefinitionsV2}
            SET active_version_id = ?, updated_at = ?
            WHERE id = ?`,
      args: [versionId, ts, definitionId],
    },
  ];

  await batch(statements);

  return { definitionId, versionId, versionNumber };
}

// ── Start Workflow ──

/**
 * Resolve the due-at timestamp for a workflow step from its `dueAt` or `sla`
 * declaration. Returns null when neither is set.
 *
 * - `dueAt`: treated as an explicit ISO-8601 timestamp and used verbatim.
 * - `sla`: parsed as a simple duration string of the form `<n><unit>` where
 *   unit is `d` (days), `h` (hours), or `m` (minutes). The due-at is computed
 *   as baseTs + duration.
 */
function resolveStepDueAt(step: WorkflowStep, baseTs: string): string | null {
  if (step.dueAt) {
    return step.dueAt;
  }
  if (step.sla) {
    return computeSlaDueAt(step.sla, baseTs);
  }
  return null;
}

/**
 * Compute an ISO timestamp by adding a simple duration to `baseTs`.
 * Supported format: `<number><unit>` where unit is one of:
 *   `d` — days, `h` — hours, `m` — minutes.
 * Falls back to returning the raw string when it cannot be parsed (assumed ISO).
 */
function computeSlaDueAt(sla: string, baseTs: string): string {
  const match = sla.match(/^(\d+)\s*(d|h|m)$/i);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const ms =
      unit === "d" ? value * 24 * 60 * 60 * 1000
      : unit === "h" ? value * 60 * 60 * 1000
      : value * 60 * 1000;
    return new Date(new Date(baseTs).getTime() + ms).toISOString();
  }
  // Unable to parse as a duration; assume it is already an ISO timestamp.
  return sla;
}

export async function startWorkflowV2(
  workspaceId: string,
  workflowKey: string,
  objectType: string,
  recordId: string,
  actor: CommandActor
): Promise<{ instanceId: string }> {
  // Get the active version
  const def = await queryOne<{ id: string; active_version_id: string | null }>(
    `SELECT id, active_version_id FROM ${TABLES.workflowDefinitionsV2}
     WHERE workspace_id = ? AND workflow_key = ? AND status = 'active'`,
    [workspaceId, workflowKey]
  );

  if (!def || !def.active_version_id) {
    throw new NotFoundError(`No active workflow definition found for key: ${workflowKey}`);
  }

  const versionRow = await queryOne<{ id: string; definition_json: string }>(
    `SELECT id, definition_json FROM ${TABLES.workflowDefinitionVersions}
     WHERE id = ?`,
    [def.active_version_id]
  );

  if (!versionRow) {
    throw new NotFoundError(`Workflow definition version not found: ${def.active_version_id}`);
  }

  const wfDef = JSON.parse(versionRow.definition_json) as WorkflowDefinition;
  const startStep = wfDef.steps.find(s => s.kind === "start");
  if (!startStep) {
    throw new InvalidInputError(`Workflow definition has no start step`);
  }

  const instanceId = genId("wfi");
  const ts = now();
  const nextStepId = startStep.next;

  const statements: Array<{ sql: string; args?: unknown[] }> = [
    // Create instance
    {
      sql: `INSERT INTO ${TABLES.workflowInstancesV2}
            (id, workspace_id, workflow_definition_id, definition_version_id,
             object_type, record_id, status, current_step_id, version,
             started_by, started_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'running', ?, 1, ?, ?, ?, ?)`,
      args: [instanceId, workspaceId, def.id, versionRow.id, objectType, recordId,
             nextStepId, actor.id, ts, ts, ts],
    },
    // Write workflow.started event
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at)
            VALUES (?, ?, ?, 1, 'workflow.started', ?, ?, ?, ?, ?)`,
      args: [genId("wfe"), workspaceId, instanceId, "start", actor.type, actor.id,
             JSON.stringify({ workflowKey, objectType, recordId }), ts],
    },
  ];

  // If the next step is an approval or human_task, create a work item
  if (nextStepId) {
    const nextStep = wfDef.steps.find(s => s.id === nextStepId);
    if (nextStep && (nextStep.kind === "approval" || nextStep.kind === "human_task")) {
      const workItemId = genId("wi");
      const assigneeRule = nextStep.assigneeRule;
      const stepDueAt = resolveStepDueAt(nextStep, ts);
      statements.push({
        sql: `INSERT INTO ${TABLES.workItems}
              (id, workspace_id, instance_id, step_id, kind, status,
               subject_type, subject_id, assignee_type, assignee_id,
               candidate_rule_json, form_binding_id, due_at, version, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        args: [workItemId, workspaceId, instanceId, nextStepId, nextStep.kind,
               objectType, recordId,
               assigneeRule?.permissionGroup ? "permission_group" : (assigneeRule?.userId ? "user" : null),
               assigneeRule?.permissionGroup ?? assigneeRule?.userId ?? null,
               assigneeRule ? JSON.stringify(assigneeRule) : null,
               nextStep.formBindingId ?? null,
               stepDueAt,
               ts, ts],
      });

      // If the step defines an SLA / dueAt, create a workflow timer
      if (stepDueAt) {
        statements.push({
          sql: `INSERT INTO ${TABLES.workflowTimers}
                (id, workspace_id, instance_id, work_item_id, timer_type,
                 due_at, status, payload_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'sla', ?, 'active', NULL, ?, ?)`,
          args: [genId("wft"), workspaceId, instanceId, workItemId, stepDueAt, ts, ts],
        });
      }
    }
  }

  await batch(statements);

  return { instanceId };
}

// ── Approval Decide ──

export interface ApprovalDecideAggregate {
  instanceId: string;
  nextStepId: string | null;
}

export async function approvalDecideHandler(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  outcome: "approved" | "rejected" | "returned",
  comment: string | null,
  expectedVersion: number
): Promise<CommandHandlerResult<ApprovalDecideAggregate>> {
  const ts = now();

  // Read the work item
  const workItem = await queryOne<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );

  if (!workItem) {
    throw new NotFoundError(`Work item not found: ${workItemId}`);
  }

  // Optimistic lock check
  checkOptimisticLock(workItem.version, expectedVersion);

  // Validate it's an approval work item
  if (workItem.kind !== "approval") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} is of kind '${workItem.kind}', not 'approval'`,
      409
    );
  }

  // Check status
  if (workItem.status !== "ready" && workItem.status !== "active") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} is in status '${workItem.status}', expected 'ready' or 'active'`,
      409
    );
  }

  // ── Candidate eligibility check (v0.5.1 P0) ──
  // Beyond the self-approval check, the actor must be in the candidate
  // permission group (if one is assigned) to make an approval decision.
  await checkCandidateEligibility(workspaceId, workItem, actor);

  // Self-approval check
  const candidateRule = workItem.candidate_rule_json
    ? JSON.parse(workItem.candidate_rule_json)
    : null;
  if (actor.id === workItem.assignee_id && candidateRule?.policy?.allowSelfApproval !== true) {
    throw new BusinessError(
      ERROR_CODES.SELF_APPROVAL_NOT_ALLOWED,
      `SELF_APPROVAL_NOT_ALLOWED: The assignee cannot approve their own work item unless the step policy explicitly allows it`,
      403
    );
  }

  // Read the instance to get definition version
  const instance = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstancesV2} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItem.instance_id]
  );

  if (!instance) {
    throw new NotFoundError(`Workflow instance not found: ${workItem.instance_id}`);
  }

  // Read definition version to find next step
  const versionRow = await queryOne<{ definition_json: string }>(
    `SELECT definition_json FROM ${TABLES.workflowDefinitionVersions} WHERE id = ?`,
    [instance.definition_version_id]
  );

  if (!versionRow) {
    throw new NotFoundError(`Workflow definition version not found`);
  }

  const wfDef = JSON.parse(versionRow.definition_json) as WorkflowDefinition;
  const currentStep = wfDef.steps.find(s => s.id === workItem.step_id);

  if (!currentStep) {
    throw new InvalidInputError(`Step ${workItem.step_id} not found in workflow definition`);
  }

  // Determine next step based on outcome
  let nextStepId: string | null = null;
  if (outcome === "approved" && currentStep.onApprove) {
    nextStepId = currentStep.onApprove;
  } else if (outcome === "rejected" && currentStep.onReject) {
    nextStepId = currentStep.onReject;
  } else if (outcome === "returned") {
    nextStepId = null; // Return to previous step (will be handled by returnWorkItem)
  }

  // Get current event sequence
  const lastEvent = await queryOne<{ max_seq: number }>(
    `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
     WHERE instance_id = ?`,
    [workItem.instance_id]
  );
  const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

  const statements: Array<{ sql: string; args?: unknown[] }> = [
    // Create immutable approval decision
    {
      sql: `INSERT INTO ${TABLES.approvalDecisions}
            (id, workspace_id, work_item_id, outcome, decided_by, comment,
             decision_payload_json, input_snapshot_hash, decided_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      args: [genId("apd"), workspaceId, workItemId, outcome, actor.id, comment,
             workItem.input_snapshot_hash ?? "", ts, ts],
    },
    // Update work item to completed
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, ts, workItemId, expectedVersion],
    },
    // Write workflow event
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at)
            VALUES (?, ?, ?, ?, 'workflow.approval_decided', ?, ?, ?, ?, ?)`,
      args: [genId("wfe"), workspaceId, workItem.instance_id, nextSeq, workItem.step_id,
             actor.type, actor.id, JSON.stringify({ outcome, comment }), ts],
    },
  ];

  // Track IDs of created work items for the next step
  const workItemIds: string[] = [];

  // If there's a next step, update instance and create work item for it
  if (nextStepId) {
    const nextStep = wfDef.steps.find(s => s.id === nextStepId);
    if (nextStep) {
      statements.push({
        sql: `UPDATE ${TABLES.workflowInstancesV2}
              SET current_step_id = ?, version = version + 1, updated_at = ?
              WHERE id = ?`,
        args: [nextStepId, ts, instance.id],
      });

      // Create work item for next step if it's an approval or human_task
      if (nextStep.kind === "approval" || nextStep.kind === "human_task") {
        const newWorkItemId = genId("wi");
        workItemIds.push(newWorkItemId);
        const assigneeRule = nextStep.assigneeRule;
        statements.push({
          sql: `INSERT INTO ${TABLES.workItems}
                (id, workspace_id, instance_id, step_id, kind, status,
                 subject_type, subject_id, assignee_type, assignee_id,
                 candidate_rule_json, form_binding_id, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          args: [newWorkItemId, workspaceId, workItem.instance_id, nextStepId, nextStep.kind,
                 workItem.subject_type, workItem.subject_id,
                 assigneeRule?.permissionGroup ? "permission_group" : (assigneeRule?.userId ? "user" : null),
                 assigneeRule?.permissionGroup ?? assigneeRule?.userId ?? null,
                 assigneeRule ? JSON.stringify(assigneeRule) : null,
                 nextStep.formBindingId ?? null,
                 ts, ts],
        });
      }

      // If next step is 'end', complete the instance
      if (nextStep.kind === "end") {
        statements.push({
          sql: `UPDATE ${TABLES.workflowInstancesV2}
                SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
                WHERE id = ?`,
          args: [ts, ts, instance.id],
        });
      }
    }
  }

  return {
    statements,
    audit: {
      action: "work_item.approval_decide",
      entityType: "work_item",
      entityId: workItemId,
      before: { status: workItem.status, kind: workItem.kind },
      after: { status: "completed", outcome, comment },
    },
    aggregate: { instanceId: workItem.instance_id, nextStepId },
    newVersion: expectedVersion + 1,
    workItemIds,
  };
}

export async function approvalDecide(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  outcome: "approved" | "rejected" | "returned",
  comment: string | null,
  expectedVersion: number,
  commandId?: string,
  requestId?: string | null
): Promise<CommandResult<ApprovalDecideAggregate>> {
  return executeCommand<ApprovalDecideAggregate>(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "approval.decide",
      aggregateType: "work_item",
      aggregateId: workItemId,
      expectedVersion,
      actor,
      input: { workItemId, outcome, comment, expectedVersion },
      occurredAt: now(),
      requestId: requestId ?? null,
    },
    async () => approvalDecideHandler(workspaceId, workItemId, actor, outcome, comment, expectedVersion)
  );
}

// ── Return Work Item ──

export async function returnWorkItemHandler(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  comment: string | null,
  expectedVersion: number
): Promise<CommandHandlerResult<Partial<WorkItemRow>>> {
  const ts = now();

  const workItem = await queryOne<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );

  if (!workItem) {
    throw new NotFoundError(`Work item not found: ${workItemId}`);
  }

  checkOptimisticLock(workItem.version, expectedVersion);

  // Per v0.5.1 Spec §4.3: "Return creates a new work item and submission
  // revision; it does not edit prior evidence."
  // We create a new work item for the same step, so the technician can
  // re-execute with the prior context and return reason.

  const instance = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstancesV2} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItem.instance_id]
  );
  if (!instance) {
    throw new NotFoundError(`Workflow instance not found: ${workItem.instance_id}`);
  }

  // Read the workflow definition version (fixed: was querying formDefinitionVersions)
  const wfDefVersion = await queryOne<WorkflowDefinitionVersionRow>(
    `SELECT * FROM ${TABLES.workflowDefinitionVersions}
     WHERE id = ?`,
    [instance.definition_version_id]
  );
  if (!wfDefVersion) {
    throw new NotFoundError(
      `Workflow definition version not found: ${instance.definition_version_id}`
    );
  }
  const definition = JSON.parse(wfDefVersion.definition_json) as WorkflowDefinition;

  // Find the current step definition to create a new work item for it
  const stepDef = definition.steps.find((s) => s.id === workItem.step_id);
  if (!stepDef) {
    throw new BusinessError(
      ERROR_CODES.INTERNAL_ERROR,
      `Step definition not found for step_id: ${workItem.step_id}`,
      500
    );
  }

  const lastEvent = await queryOne<{ max_seq: number }>(
    `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
     WHERE instance_id = ?`,
    [workItem.instance_id]
  );
  const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

  const newWorkItemId = genId("wi");
  const assigneeRule = stepDef.assigneeRule;

  const statements: Array<{ sql: string; args?: unknown[] }> = [
    // Mark current work item as returned
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'returned', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, ts, workItemId, expectedVersion],
    },
    // Write workflow event for the return
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at)
            VALUES (?, ?, ?, ?, 'workflow.work_returned', ?, ?, ?, ?, ?)`,
      args: [genId("wfe"), workspaceId, workItem.instance_id, nextSeq, workItem.step_id,
             actor.type, actor.id, JSON.stringify({ comment, new_work_item_id: newWorkItemId }), ts],
    },
    // Create a new work item for the same step (ready for the technician)
    {
      sql: `INSERT INTO ${TABLES.workItems}
            (id, workspace_id, instance_id, step_id, kind, status,
             subject_type, subject_id, assignee_type, assignee_id,
             candidate_rule_json, form_binding_id, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [newWorkItemId, workspaceId, workItem.instance_id, workItem.step_id, workItem.kind,
             workItem.subject_type, workItem.subject_id,
             assigneeRule?.permissionGroup ? "permission_group" : (assigneeRule?.userId ? "user" : null),
             assigneeRule?.permissionGroup ?? assigneeRule?.userId ?? null,
             assigneeRule ? JSON.stringify(assigneeRule) : workItem.candidate_rule_json,
             workItem.form_binding_id,
             ts, ts],
    },
  ];

  const aggregate: Partial<WorkItemRow> = {
    ...workItem,
    status: "returned",
    completed_at: ts,
    version: expectedVersion + 1,
    updated_at: ts,
  };

  return {
    statements,
    audit: {
      action: "work_item.return",
      entityType: "work_item",
      entityId: workItemId,
      before: { status: workItem.status, version: workItem.version },
      after: { status: "returned", comment, new_work_item_id: newWorkItemId },
    },
    aggregate,
    newVersion: expectedVersion + 1,
    workItemIds: [newWorkItemId],
  };
}

export async function returnWorkItem(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  comment: string | null,
  expectedVersion: number,
  commandId?: string,
  requestId?: string | null
): Promise<CommandResult<Partial<WorkItemRow>>> {
  return executeCommand<Partial<WorkItemRow>>(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_item.return",
      aggregateType: "work_item",
      aggregateId: workItemId,
      expectedVersion,
      actor,
      input: { workItemId, comment, expectedVersion },
      occurredAt: now(),
      requestId: requestId ?? null,
    },
    async () => returnWorkItemHandler(workspaceId, workItemId, actor, comment, expectedVersion)
  );
}

// ── Cancel Workflow ──

export async function cancelWorkflow(
  workspaceId: string,
  instanceId: string,
  actor: CommandActor,
  reason: string
): Promise<void> {
  const ts = now();

  const instance = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstancesV2} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, instanceId]
  );

  if (!instance) {
    throw new NotFoundError(`Workflow instance not found: ${instanceId}`);
  }

  if (instance.status !== "running") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `Workflow instance ${instanceId} is not running (status: ${instance.status})`,
      409
    );
  }

  const lastEvent = await queryOne<{ max_seq: number }>(
    `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
     WHERE instance_id = ?`,
    [instanceId]
  );
  const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

  await batch([
    // Cancel instance
    {
      sql: `UPDATE ${TABLES.workflowInstancesV2}
            SET status = 'cancelled', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ?`,
      args: [ts, ts, instanceId],
    },
    // Cancel all open work items
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'cancelled', updated_at = ?
            WHERE instance_id = ? AND status IN ('ready', 'active')`,
      args: [ts, instanceId],
    },
    // Write workflow event
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at)
            VALUES (?, ?, ?, ?, 'workflow.cancelled', NULL, ?, ?, ?, ?)`,
      args: [genId("wfe"), workspaceId, instanceId, nextSeq,
             actor.type, actor.id, JSON.stringify({ reason }), ts],
    },
  ]);
}

// ── Get My Work ──
//
// Per v0.5.1 Spec §6 API contract:
//   GET /api/workspaces/{workspaceId}/my-work?assignee=me&from=...&to=...&cursor=...
//
// Cursor-based pagination uses (due_at, created_at, id) as a stable composite
// cursor. The caller passes the `cursor` value returned by the previous page.

export async function getMyWork(
  workspaceId: string,
  actorId: string,
  filters: {
    kind?: string;
    status?: string;
    subjectType?: string;
    dueBefore?: string;
    from?: string;   // ISO timestamp — only items with due_at >= from
    to?: string;     // ISO timestamp — only items with due_at <= to
    cursor?: string; // composite cursor "{due_at}|{created_at}|{id}"
    limit?: number;
    offset?: number; // kept for backward compatibility
  } = {}
): Promise<{ items: WorkItemRow[]; total: number; nextCursor: string | null }> {
  const limit = Math.min(filters.limit ?? 50, 100);
  const conditions: string[] = ["workspace_id = ?", "status IN ('ready', 'active')"];
  const args: unknown[] = [workspaceId];

  // Assignee filter: assigned to user directly OR in a permission group the user belongs to.
  const groups = await getUserPermissionGroups(workspaceId, actorId);
  const groupKeys = groups.map(g => g.groupKey);

  if (groupKeys.length > 0) {
    const placeholders = groupKeys.map(() => "?").join(", ");
    conditions.push(
      `((assignee_type = 'user' AND assignee_id = ?) OR (assignee_type = 'permission_group' AND assignee_id IN (${placeholders})))`
    );
    args.push(actorId, ...groupKeys);
  } else {
    conditions.push("(assignee_type = 'user' AND assignee_id = ?)");
    args.push(actorId);
  }

  if (filters.kind) {
    conditions.push("kind = ?");
    args.push(filters.kind);
  }
  if (filters.status && filters.status !== "ready") {
    conditions.push("status = ?");
    args.push(filters.status);
  }
  if (filters.subjectType) {
    conditions.push("subject_type = ?");
    args.push(filters.subjectType);
  }
  if (filters.dueBefore) {
    conditions.push("(due_at IS NULL OR due_at <= ?)");
    args.push(filters.dueBefore);
  }
  // Time window filters (spec §6: from/to)
  if (filters.from) {
    conditions.push("(due_at IS NOT NULL AND due_at >= ?)");
    args.push(filters.from);
  }
  if (filters.to) {
    conditions.push("(due_at IS NULL OR due_at <= ?)");
    args.push(filters.to);
  }

  // Cursor pagination: if cursor is provided, decode it and add a WHERE clause
  // that fetches items strictly after the cursor position.
  // Cursor format: "{due_at_iso}|{created_at_iso}|{id}"
  if (filters.cursor) {
    const parts = filters.cursor.split("|");
    if (parts.length === 3) {
      const [cursorDueAt, cursorCreatedAt, cursorId] = parts;
      // Composite ordering: (due_at ASC NULLS LAST, created_at ASC, id ASC)
      // For cursor-based "after", we need: due_at > cursorDue_at OR (due_at = cursorDue_at AND created_at > cursorCreatedAt) OR (due_at = cursorDue_at AND created_at = cursorCreatedAt AND id > cursorId)
      conditions.push(`(
        (due_at IS NOT NULL AND due_at > ?) OR
        (due_at = ? AND created_at > ?) OR
        (due_at = ? AND created_at = ? AND id > ?) OR
        (due_at IS NULL AND ? IS NOT NULL)
      )`);
      args.push(cursorDueAt, cursorDueAt, cursorCreatedAt, cursorDueAt, cursorCreatedAt, cursorId, cursorDueAt);
    }
  }

  const where = conditions.join(" AND ");

  const rows = await queryAll<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE ${where}
     ORDER BY due_at ASC NULLS LAST, created_at ASC, id ASC LIMIT ?`,
    [...args, limit + 1] // fetch one extra to determine if there's a next page
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.workItems} WHERE ${where}`,
    args
  );

  // If we fetched more than `limit` rows, there's a next page
  let nextCursor: string | null = null;
  let items = rows;
  if (rows.length > limit) {
    items = rows.slice(0, limit);
    const last = items[items.length - 1];
    nextCursor = `${last.due_at ?? "null"}|${last.created_at}|${last.id}`;
  }

  return { items, total: countRow?.count ?? 0, nextCursor };
}

// ── Get Workflow History ──

export async function getWorkflowHistory(
  workspaceId: string,
  instanceId: string
): Promise<WorkflowEventRow[]> {
  return queryAll<WorkflowEventRow>(
    `SELECT id, instance_id, sequence, event_type, step_id,
            actor_type, actor_id, payload_json, occurred_at
     FROM ${TABLES.workflowEvents}
     WHERE workspace_id = ? AND instance_id = ?
     ORDER BY sequence ASC`,
    [workspaceId, instanceId]
  );
}

// ── Get Work Item by ID ──

export async function getWorkItem(
  workspaceId: string,
  workItemId: string
): Promise<WorkItemRow> {
  const row = await queryOne<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );
  if (!row) {
    throw new NotFoundError(`Work item not found: ${workItemId}`);
  }
  return row;
}

// ── Candidate Eligibility Check ──
//
// Per v0.5.1 acceptance gate §9.10: "Mobile and desktop actions produce the
// same command, permission, audit, and idempotency outcomes."
// The actor must be eligible to act on the work item:
//   - Direct user assignment: actor.id must match assignee_id
//   - Permission group assignment: actor must be a member of the group
//   - No assignment constraint: any workspace member is eligible

async function checkCandidateEligibility(
  workspaceId: string,
  workItem: WorkItemRow,
  actor: CommandActor
): Promise<void> {
  if (!workItem.assignee_type || !workItem.assignee_id) {
    // No assignment constraint — any workspace member is eligible
    return;
  }

  if (workItem.assignee_type === "user") {
    if (actor.id !== workItem.assignee_id) {
      throw new BusinessError(
        ERROR_CODES.ASSIGNEE_NOT_ELIGIBLE,
        `ASSIGNEE_NOT_ELIGIBLE: Work item is assigned to user '${workItem.assignee_id}', but actor is '${actor.id}'`,
        403
      );
    }
    return;
  }

  if (workItem.assignee_type === "permission_group") {
    // The candidate_rule_json stores the assigneeRule with permissionGroup key
    const candidateRule = workItem.candidate_rule_json
      ? JSON.parse(workItem.candidate_rule_json)
      : null;
    const groupKey = candidateRule?.permissionGroup ?? workItem.assignee_id;

    const userGroups = await getUserPermissionGroups(workspaceId, actor.id);
    const isMember = userGroups.some((g) => g.groupKey === groupKey || g.groupId === workItem.assignee_id);

    if (!isMember) {
      throw new BusinessError(
        ERROR_CODES.ASSIGNEE_NOT_ELIGIBLE,
        `ASSIGNEE_NOT_ELIGIBLE: Actor '${actor.id}' is not a member of permission group '${groupKey}'`,
        403
      );
    }
  }
}

// ── Claim Work Item ──

export async function claimWorkItemHandler(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  expectedVersion: number
): Promise<CommandHandlerResult<Partial<WorkItemRow>>> {
  // ── Candidate eligibility check (v0.5.1 P0) ──
  const workItem = await queryOne<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );
  if (!workItem) {
    throw new NotFoundError(`Work item not found: ${workItemId}`);
  }
  checkOptimisticLock(workItem.version, expectedVersion);
  await checkCandidateEligibility(workspaceId, workItem, actor);

  const ts = now();
  const lastEvent = await queryOne<{ max_seq: number }>(
    `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
     WHERE instance_id = ?`,
    [workItem.instance_id]
  );
  const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

  const statements: Array<{ sql: string; args?: unknown[] }> = [
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'active', claimed_by = ?, claimed_at = ?,
                version = version + 1, updated_at = ?
            WHERE id = ? AND version = ? AND status = 'ready'`,
      args: [actor.id, ts, ts, workItemId, expectedVersion],
    },
    // Write workflow event
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at)
            VALUES (?, ?, ?, ?, 'workflow.work_claimed', ?, ?, ?, ?, ?)`,
      args: [genId("wfe"), workspaceId, workItem.instance_id, nextSeq, workItem.step_id,
             actor.type, actor.id, JSON.stringify({}), ts],
    },
  ];

  const aggregate: Partial<WorkItemRow> = {
    ...workItem,
    status: "active",
    claimed_by: actor.id,
    claimed_at: ts,
    version: expectedVersion + 1,
    updated_at: ts,
  };

  return {
    statements,
    audit: {
      action: "work_item.claim",
      entityType: "work_item",
      entityId: workItemId,
      before: { status: "ready" },
      after: { status: "active", claimed_by: actor.id },
    },
    aggregate,
    newVersion: expectedVersion + 1,
  };
}

export async function claimWorkItem(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string,
  requestId?: string | null
): Promise<CommandResult<Partial<WorkItemRow>>> {
  return executeCommand<Partial<WorkItemRow>>(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_item.claim",
      aggregateType: "work_item",
      aggregateId: workItemId,
      expectedVersion,
      actor,
      input: { workItemId, expectedVersion },
      occurredAt: now(),
      requestId: requestId ?? null,
    },
    async () => claimWorkItemHandler(workspaceId, workItemId, actor, expectedVersion)
  );
}

// ── Release Work Item ──

/**
 * Release a claimed (active) work item back to the 'ready' pool so that
 * another actor may claim it. Clears claimed_by / claimed_at.
 *
 * Per v0.5 Spec §6.3 work_item.release: the work item must currently be in
 * the 'active' (claimed) state.
 */
export async function releaseWorkItemHandler(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  expectedVersion: number
): Promise<CommandHandlerResult<Partial<WorkItemRow>>> {
  const ts = now();

  const workItem = await queryOne<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );

  if (!workItem) {
    throw new NotFoundError(`Work item not found: ${workItemId}`);
  }

  checkOptimisticLock(workItem.version, expectedVersion);

  if (workItem.status !== "active") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} is in status '${workItem.status}', expected 'active' (claimed)`,
      409
    );
  }

  const lastEvent = await queryOne<{ max_seq: number }>(
    `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
     WHERE instance_id = ?`,
    [workItem.instance_id]
  );
  const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

  const statements: Array<{ sql: string; args?: unknown[] }> = [
    // Release back to ready, clear claim metadata
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'ready', claimed_by = NULL, claimed_at = NULL,
                version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, workItemId, expectedVersion],
    },
    // Write workflow event
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at)
            VALUES (?, ?, ?, ?, 'workflow.work_released', ?, ?, ?, ?, ?)`,
      args: [genId("wfe"), workspaceId, workItem.instance_id, nextSeq, workItem.step_id,
             actor.type, actor.id, JSON.stringify({}), ts],
    },
  ];

  const aggregate: Partial<WorkItemRow> = {
    ...workItem,
    status: "ready",
    claimed_by: null,
    claimed_at: null,
    version: expectedVersion + 1,
    updated_at: ts,
  };

  return {
    statements,
    audit: {
      action: "work_item.release",
      entityType: "work_item",
      entityId: workItemId,
      before: { status: "active", claimed_by: workItem.claimed_by },
      after: { status: "ready" },
    },
    aggregate,
    newVersion: expectedVersion + 1,
  };
}

export async function releaseWorkItem(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string,
  requestId?: string | null
): Promise<CommandResult<Partial<WorkItemRow>>> {
  return executeCommand<Partial<WorkItemRow>>(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_item.release",
      aggregateType: "work_item",
      aggregateId: workItemId,
      expectedVersion,
      actor,
      input: { workItemId, expectedVersion },
      occurredAt: now(),
      requestId: requestId ?? null,
    },
    async () => releaseWorkItemHandler(workspaceId, workItemId, actor, expectedVersion)
  );
}

// ── Complete Work Item ──

/**
 * Complete a non-approval work item (kind 'human_task') and advance the
 * workflow to the next step.
 *
 * Per v0.5 Spec §6.3 work_item.complete: the work item must be in 'active'
 * (claimed) or 'ready' status. Approval work items must use approvalDecide
 * instead. Optional `formData` is recorded on the completion event.
 */
export async function completeWorkItemHandler(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  expectedVersion: number,
  formData?: Record<string, unknown>
): Promise<CommandHandlerResult<Partial<WorkItemRow>>> {
  const ts = now();

  const workItem = await queryOne<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );

  if (!workItem) {
    throw new NotFoundError(`Work item not found: ${workItemId}`);
  }

  checkOptimisticLock(workItem.version, expectedVersion);

  // ── Candidate eligibility check (v0.5.1 P0) ──
  await checkCandidateEligibility(workspaceId, workItem, actor);

  // Approval work items are completed via approvalDecide, not here
  if (workItem.kind === "approval") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} is of kind 'approval'; use approval.decide instead`,
      409
    );
  }

  if (workItem.status !== "active" && workItem.status !== "ready") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} is in status '${workItem.status}', expected 'active' or 'ready'`,
      409
    );
  }

  // ── Form submission validation gate (v0.5.1 P0, acceptance gate §9.4) ──
  // "Required fields/evidence block completion on the server, not only in the UI."
  // If the work item has a form_binding_id, verify a submitted form exists.
  if (workItem.form_binding_id) {
    const submission = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM ${TABLES.formSubmissions}
       WHERE workspace_id = ? AND work_item_id = ?
       AND status IN ('submitted', 'accepted')
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, workItemId]
    );
    if (!submission) {
      throw new BusinessError(
        ERROR_CODES.REQUIRED_INPUT_MISSING,
        `REQUIRED_INPUT_MISSING: Work item ${workItemId} requires a form submission (form_binding_id: ${workItem.form_binding_id}) before completion. No submitted or accepted form was found.`,
        400
      );
    }
  }

  // Read the instance to get the definition version
  const instance = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstancesV2} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItem.instance_id]
  );

  if (!instance) {
    throw new NotFoundError(`Workflow instance not found: ${workItem.instance_id}`);
  }

  const versionRow = await queryOne<{ definition_json: string }>(
    `SELECT definition_json FROM ${TABLES.workflowDefinitionVersions} WHERE id = ?`,
    [instance.definition_version_id]
  );

  if (!versionRow) {
    throw new NotFoundError(`Workflow definition version not found`);
  }

  const wfDef = JSON.parse(versionRow.definition_json) as WorkflowDefinition;
  const currentStep = wfDef.steps.find(s => s.id === workItem.step_id);

  if (!currentStep) {
    throw new InvalidInputError(`Step ${workItem.step_id} not found in workflow definition`);
  }

  // Determine next step
  const nextStepId = currentStep.next ?? null;

  // Get current event sequence
  const lastEvent = await queryOne<{ max_seq: number }>(
    `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
     WHERE instance_id = ?`,
    [workItem.instance_id]
  );
  const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

  const statements: Array<{ sql: string; args?: unknown[] }> = [
    // Mark work item as completed
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, ts, workItemId, expectedVersion],
    },
    // Write workflow event
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at)
            VALUES (?, ?, ?, ?, 'workflow.work_completed', ?, ?, ?, ?, ?)`,
      args: [genId("wfe"), workspaceId, workItem.instance_id, nextSeq, workItem.step_id,
             actor.type, actor.id, JSON.stringify({ formData: formData ?? null }), ts],
    },
  ];

  // Track IDs of created work items for the next step
  const workItemIds: string[] = [];

  // Advance the workflow to the next step
  if (nextStepId) {
    const nextStep = wfDef.steps.find(s => s.id === nextStepId);
    if (nextStep) {
      statements.push({
        sql: `UPDATE ${TABLES.workflowInstancesV2}
              SET current_step_id = ?, version = version + 1, updated_at = ?
              WHERE id = ?`,
        args: [nextStepId, ts, instance.id],
      });

      // Create work item for next step if it's an approval or human_task
      if (nextStep.kind === "approval" || nextStep.kind === "human_task") {
        const newWorkItemId = genId("wi");
        workItemIds.push(newWorkItemId);
        const assigneeRule = nextStep.assigneeRule;
        const stepDueAt = resolveStepDueAt(nextStep, ts);
        statements.push({
          sql: `INSERT INTO ${TABLES.workItems}
                (id, workspace_id, instance_id, step_id, kind, status,
                 subject_type, subject_id, assignee_type, assignee_id,
                 candidate_rule_json, form_binding_id, due_at, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          args: [newWorkItemId, workspaceId, workItem.instance_id, nextStepId, nextStep.kind,
                 workItem.subject_type, workItem.subject_id,
                 assigneeRule?.permissionGroup ? "permission_group" : (assigneeRule?.userId ? "user" : null),
                 assigneeRule?.permissionGroup ?? assigneeRule?.userId ?? null,
                 assigneeRule ? JSON.stringify(assigneeRule) : null,
                 nextStep.formBindingId ?? null,
                 stepDueAt,
                 ts, ts],
        });

        // Create SLA timer if the next step declares a due_at / sla
        if (stepDueAt) {
          statements.push({
            sql: `INSERT INTO ${TABLES.workflowTimers}
                  (id, workspace_id, instance_id, work_item_id, timer_type,
                   due_at, status, payload_json, created_at, updated_at)
                  VALUES (?, ?, ?, ?, 'sla', ?, 'active', NULL, ?, ?)`,
            args: [genId("wft"), workspaceId, workItem.instance_id, newWorkItemId, stepDueAt, ts, ts],
          });
        }
      }

      // If next step is 'end', complete the instance
      if (nextStep.kind === "end") {
        statements.push({
          sql: `UPDATE ${TABLES.workflowInstancesV2}
                SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
                WHERE id = ?`,
          args: [ts, ts, instance.id],
        });
      }
    }
  } else if (currentStep.kind === "end") {
    // No next step and current step is end — complete the instance
    statements.push({
      sql: `UPDATE ${TABLES.workflowInstancesV2}
            SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ?`,
      args: [ts, ts, instance.id],
    });
  }

  const aggregate: Partial<WorkItemRow> = {
    ...workItem,
    status: "completed",
    completed_at: ts,
    version: expectedVersion + 1,
    updated_at: ts,
  };

  return {
    statements,
    audit: {
      action: "work_item.complete",
      entityType: "work_item",
      entityId: workItemId,
      before: { status: workItem.status, version: workItem.version },
      after: { status: "completed", formData: formData ?? null },
    },
    aggregate,
    newVersion: expectedVersion + 1,
    workItemIds,
  };
}

export async function completeWorkItem(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  expectedVersion: number,
  formData?: Record<string, unknown>,
  commandId?: string,
  requestId?: string | null
): Promise<CommandResult<Partial<WorkItemRow>>> {
  return executeCommand<Partial<WorkItemRow>>(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_item.complete",
      aggregateType: "work_item",
      aggregateId: workItemId,
      expectedVersion,
      actor,
      input: { workItemId, formData: formData ?? null, expectedVersion },
      occurredAt: now(),
      requestId: requestId ?? null,
    },
    async () => completeWorkItemHandler(workspaceId, workItemId, actor, expectedVersion, formData)
  );
}

// ── Cancel Work Item ──

/**
 * Cancel a work item that is not yet in a terminal state.
 *
 * Per v0.5 Spec §6.3 work_item.cancel: only actionable work items (those in
 * 'ready', 'active', or 'returned' status) may be cancelled. An optional
 * reason may be recorded on the workflow event.
 */
export async function cancelWorkItemHandler(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  expectedVersion: number,
  reason?: string
): Promise<CommandHandlerResult<Partial<WorkItemRow>>> {
  const ts = now();

  const workItem = await queryOne<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );

  if (!workItem) {
    throw new NotFoundError(`Work item not found: ${workItemId}`);
  }

  checkOptimisticLock(workItem.version, expectedVersion);

  if (workItem.status === "completed" || workItem.status === "cancelled") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} is in status '${workItem.status}' and cannot be cancelled`,
      409
    );
  }

  const lastEvent = await queryOne<{ max_seq: number }>(
    `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
     WHERE instance_id = ?`,
    [workItem.instance_id]
  );
  const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

  const statements: Array<{ sql: string; args?: unknown[] }> = [
    // Mark work item as cancelled
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'cancelled', version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, workItemId, expectedVersion],
    },
    // Write workflow event
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at)
            VALUES (?, ?, ?, ?, 'workflow.work_cancelled', ?, ?, ?, ?, ?)`,
      args: [genId("wfe"), workspaceId, workItem.instance_id, nextSeq, workItem.step_id,
             actor.type, actor.id, JSON.stringify({ reason: reason ?? null }), ts],
    },
  ];

  const aggregate: Partial<WorkItemRow> = {
    ...workItem,
    status: "cancelled",
    version: expectedVersion + 1,
    updated_at: ts,
  };

  return {
    statements,
    audit: {
      action: "work_item.cancel",
      entityType: "work_item",
      entityId: workItemId,
      before: { status: workItem.status, version: workItem.version },
      after: { status: "cancelled", reason: reason ?? null },
    },
    aggregate,
    newVersion: expectedVersion + 1,
  };
}

export async function cancelWorkItem(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  expectedVersion: number,
  reason?: string,
  commandId?: string,
  requestId?: string | null
): Promise<CommandResult<Partial<WorkItemRow>>> {
  return executeCommand<Partial<WorkItemRow>>(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_item.cancel",
      aggregateType: "work_item",
      aggregateId: workItemId,
      expectedVersion,
      actor,
      input: { workItemId, reason: reason ?? null, expectedVersion },
      occurredAt: now(),
      requestId: requestId ?? null,
    },
    async () => cancelWorkItemHandler(workspaceId, workItemId, actor, expectedVersion, reason)
  );
}

// ── SLA Timers (v0.5 Phase 5) ──
//
// Per v0.5 Commercial FSM Technical Specification: work items may carry an SLA
// deadline (due_at). When set, a workflow timer is created so that a scheduled
// job can fire overdue events without polling the work items themselves.

export interface WorkflowTimerRow {
  id: string;
  workspace_id: string;
  instance_id: string;
  work_item_id: string | null;
  timer_type: string;
  due_at: string;
  status: string;
  payload_json: string | null;
  fired_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Create a timer for a work item (called when a work item has a due_at).
 * The timer starts in `active` status and will be fired by `fireOverdueTimers`
 * once its `due_at` has passed.
 */
export async function createWorkflowTimer(
  workspaceId: string,
  workItemId: string,
  dueAt: string,
  timerType: string = "sla"
): Promise<{ timerId: string }> {
  const ts = now();

  // Look up the instance_id from the work item
  const workItem = await queryOne<{ instance_id: string }>(
    `SELECT instance_id FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );

  if (!workItem) {
    throw new NotFoundError(`Work item not found: ${workItemId}`);
  }

  const timerId = genId("wft");

  await batch([
    {
      sql: `INSERT INTO ${TABLES.workflowTimers}
            (id, workspace_id, instance_id, work_item_id, timer_type,
             due_at, status, payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)`,
      args: [timerId, workspaceId, workItem.instance_id, workItemId, timerType, dueAt, ts, ts],
    },
  ]);

  return { timerId };
}

/**
 * Fire overdue timers (called by a cron job or scheduled task).
 *
 * For each timer in `active` status whose `due_at` has passed:
 *   1. Check whether a `timer.overdue` event already exists for the work item
 *      (idempotency — firing twice creates only one event).
 *   2. If no event exists yet, create a `timer.overdue` workflow event.
 *   3. Mark the timer as `fired`.
 *
 * Returns the count of timers that were fired (new events created). Timers that
 * were already fired (event exists) are silently marked `fired` and do not
 * increment the count.
 */
export async function fireOverdueTimers(
  workspaceId: string
): Promise<{ fired: number }> {
  const ts = now();

  // Query all overdue active timers
  const overdueTimers = await queryAll<{
    id: string;
    instance_id: string;
    work_item_id: string | null;
    timer_type: string;
    due_at: string;
  }>(
    `SELECT id, instance_id, work_item_id, timer_type, due_at
     FROM ${TABLES.workflowTimers}
     WHERE workspace_id = ? AND status = 'active' AND due_at <= ?`,
    [workspaceId, ts]
  );

  let fired = 0;

  for (const timer of overdueTimers) {
    // Idempotency: check if a timer.overdue event already exists for this work item
    let alreadyFired = false;
    if (timer.work_item_id) {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.workflowEvents}
         WHERE instance_id = ? AND event_type = 'timer.overdue'
         AND payload_json LIKE ?`,
        [timer.instance_id, `%"workItemId":"${timer.work_item_id}"%`]
      );
      if (existing) {
        alreadyFired = true;
      }
    }

    if (alreadyFired) {
      // Event already exists — just mark the timer as fired without creating a duplicate
      await batch([
        {
          sql: `UPDATE ${TABLES.workflowTimers}
                SET status = 'fired', fired_at = ?, updated_at = ?
                WHERE id = ?`,
          args: [ts, ts, timer.id],
        },
      ]);
      continue;
    }

    // Get next event sequence for the instance
    const lastEvent = await queryOne<{ max_seq: number }>(
      `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
       WHERE instance_id = ?`,
      [timer.instance_id]
    );
    const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

    await batch([
      // Create the overdue workflow event
      {
        sql: `INSERT INTO ${TABLES.workflowEvents}
              (id, workspace_id, instance_id, sequence, event_type, step_id,
               actor_type, actor_id, payload_json, occurred_at)
              VALUES (?, ?, ?, ?, 'timer.overdue', NULL, 'system', NULL, ?, ?)`,
        args: [
          genId("wfe"), workspaceId, timer.instance_id, nextSeq,
          JSON.stringify({
            timerId: timer.id,
            workItemId: timer.work_item_id,
            timerType: timer.timer_type,
            dueAt: timer.due_at,
          }),
          ts,
        ],
      },
      // Mark timer as fired
      {
        sql: `UPDATE ${TABLES.workflowTimers}
              SET status = 'fired', fired_at = ?, updated_at = ?
              WHERE id = ?`,
        args: [ts, ts, timer.id],
      },
    ]);

    fired++;
  }

  return { fired };
}

// ── Fire SLA Warning Events ──
//
// Per v0.5.1 Spec §4.6: SLA timers fire a warning event before the deadline.
// The warning threshold is computed from the step's `sla` duration:
//   - If sla ≤ 4h: warn at 50% of the duration
//   - If sla > 4h: warn at 4h before deadline
//
// This function is idempotent — it checks whether a `timer.sla_warning` event
// already exists for each timer before creating a new one.

export async function fireSlaWarnings(
  workspaceId: string
): Promise<{ warned: number }> {
  const ts = now();

  // Find active SLA timers that haven't been warned yet
  const activeTimers = await queryAll<{
    id: string;
    instance_id: string;
    work_item_id: string | null;
    due_at: string;
    created_at: string;
  }>(
    `SELECT id, instance_id, work_item_id, due_at, created_at
     FROM ${TABLES.workflowTimers}
     WHERE workspace_id = ? AND status = 'active' AND timer_type = 'sla'`,
    [workspaceId]
  );

  let warned = 0;

  for (const timer of activeTimers) {
    const dueAt = new Date(timer.due_at).getTime();
    const createdAt = new Date(timer.created_at).getTime();
    const totalDuration = dueAt - createdAt;
    const remaining = dueAt - new Date(ts).getTime();

    // Compute warning threshold
    let warnAt: number;
    if (totalDuration <= 4 * 60 * 60 * 1000) {
      // ≤ 4h: warn at 50% elapsed
      warnAt = dueAt - totalDuration * 0.5;
    } else {
      // > 4h: warn 4h before deadline
      warnAt = dueAt - 4 * 60 * 60 * 1000;
    }

    // Only warn if we've passed the warning threshold but haven't reached overdue
    if (new Date(ts).getTime() < warnAt || remaining <= 0) {
      continue;
    }

    // Idempotency: check if warning already fired
    if (timer.work_item_id) {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.workflowEvents}
         WHERE instance_id = ? AND event_type = 'timer.sla_warning'
         AND payload_json LIKE ?`,
        [timer.instance_id, `%"timerId":"${timer.id}"%`]
      );
      if (existing) continue;
    }

    const lastEvent = await queryOne<{ max_seq: number }>(
      `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
       WHERE instance_id = ?`,
      [timer.instance_id]
    );
    const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

    await batch([
      {
        sql: `INSERT INTO ${TABLES.workflowEvents}
              (id, workspace_id, instance_id, sequence, event_type, step_id,
               actor_type, actor_id, payload_json, occurred_at)
              VALUES (?, ?, ?, ?, 'timer.sla_warning', NULL, 'system', NULL, ?, ?)`,
        args: [
          genId("wfe"), workspaceId, timer.instance_id, nextSeq,
          JSON.stringify({
            timerId: timer.id,
            workItemId: timer.work_item_id,
            timerType: "sla",
            dueAt: timer.due_at,
            remainingMs: remaining,
            totalDurationMs: totalDuration,
          }),
          ts,
        ],
      },
      // Audit event for SLA warning (atomic with workflow event — §11.4)
      {
        sql: `INSERT INTO ${TABLES.auditLogs}
              (id, workspace_id, actor_type, actor_id, action, entity_type,
               entity_id, before_json, after_json, extension_version_id,
               request_id, created_at)
              VALUES (?, ?, 'system', 'system', 'work_item.sla_warning', 'work_item',
                      ?, NULL, ?, NULL, ?, ?)`,
        args: [
          genId("aud"),
          workspaceId,
          timer.work_item_id ?? timer.id,
          JSON.stringify({ due_at: timer.due_at, remaining_ms: remaining }),
          `sla-warning-${timer.id}-${ts}`,
          ts,
        ],
      },
    ]);

    warned++;
  }

  return { warned };
}

/**
 * Get all timers for a work item, ordered by creation time.
 */
export async function getWorkflowTimers(
  workspaceId: string,
  workItemId: string
): Promise<Record<string, unknown>[]> {
  return queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.workflowTimers}
     WHERE workspace_id = ? AND work_item_id = ?
     ORDER BY created_at ASC`,
    [workspaceId, workItemId]
  );
}
