// ── Workflow V2 Runtime (v0.5 Slice 1) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.4-5.5:
// Workflow definitions are versioned and immutable once published.
// Instances are pinned to a specific definition version.
// History is append-only events, not a mutable JSON column.
// Work items carry human tasks, approvals, and form bindings.
// Approval decisions are immutable and reference exactly one work_item.

import { genId, now, queryOne, queryAll, batch } from "./db";
import { TABLES, businessTable } from "./contracts";
import { BusinessError, NotFoundError, InvalidInputError, ConflictError } from "./context";
import { ERROR_CODES } from "./errors";
import { checkOptimisticLock, type CommandActor } from "./command-runtime";
import { getUserPermissionGroups } from "./permission-groups";

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
              VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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

export async function approvalDecide(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  outcome: "approved" | "rejected" | "returned",
  comment: string | null,
  expectedVersion: number
): Promise<{ instanceId: string; nextStepId: string | null }> {
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
  if (workItem.status !== "pending" && workItem.status !== "active") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} is in status '${workItem.status}', expected 'pending' or 'active'`,
      409
    );
  }

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
        const assigneeRule = nextStep.assigneeRule;
        statements.push({
          sql: `INSERT INTO ${TABLES.workItems}
                (id, workspace_id, instance_id, step_id, kind, status,
                 subject_type, subject_id, assignee_type, assignee_id,
                 candidate_rule_json, form_binding_id, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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

  await batch(statements);

  return { instanceId: workItem.instance_id, nextStepId };
}

// ── Return Work Item ──

export async function returnWorkItem(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  comment: string | null,
  expectedVersion: number
): Promise<void> {
  const ts = now();

  const workItem = await queryOne<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );

  if (!workItem) {
    throw new NotFoundError(`Work item not found: ${workItemId}`);
  }

  checkOptimisticLock(workItem.version, expectedVersion);

  const lastEvent = await queryOne<{ max_seq: number }>(
    `SELECT MAX(sequence) as max_seq FROM ${TABLES.workflowEvents}
     WHERE instance_id = ?`,
    [workItem.instance_id]
  );
  const nextSeq = (lastEvent?.max_seq ?? 0) + 1;

  await batch([
    // Mark work item as returned
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'returned', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, ts, workItemId, expectedVersion],
    },
    // Write workflow event
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (id, workspace_id, instance_id, sequence, event_type, step_id,
             actor_type, actor_id, payload_json, occurred_at)
            VALUES (?, ?, ?, ?, 'workflow.work_returned', ?, ?, ?, ?, ?)`,
      args: [genId("wfe"), workspaceId, workItem.instance_id, nextSeq, workItem.step_id,
             actor.type, actor.id, JSON.stringify({ comment }), ts],
    },
  ]);
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
    // Cancel all pending work items
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'cancelled', updated_at = ?
            WHERE instance_id = ? AND status IN ('pending', 'active')`,
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

export async function getMyWork(
  workspaceId: string,
  actorId: string,
  filters: {
    kind?: string;
    status?: string;
    subjectType?: string;
    dueBefore?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ items: WorkItemRow[]; total: number }> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const conditions: string[] = ["workspace_id = ?", "status IN ('pending', 'active')"];
  const args: unknown[] = [workspaceId];

  // Assignee filter: assigned to user directly OR in a permission group the user belongs to.
  // Work items store the permission group key (e.g. "sales_manager") in assignee_id
  // when assignee_type = 'permission_group', so we match against group keys.
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

  const where = conditions.join(" AND ");

  const rows = await queryAll<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE ${where}
     ORDER BY due_at ASC NULLS LAST, created_at ASC LIMIT ? OFFSET ?`,
    [...args, limit, offset]
  );

  const countRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.workItems} WHERE ${where}`,
    args
  );

  return { items: rows, total: countRow?.count ?? 0 };
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

// ── Claim Work Item ──

export async function claimWorkItem(
  workspaceId: string,
  workItemId: string,
  actor: CommandActor,
  expectedVersion: number
): Promise<void> {
  const ts = now();
  const result = await batch([
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'active', claimed_by = ?, claimed_at = ?,
                version = version + 1, updated_at = ?
            WHERE id = ? AND version = ? AND status = 'pending'`,
      args: [actor.id, ts, ts, workItemId, expectedVersion],
    },
  ]);

  // Check if the update affected any rows
  // (If not, either version mismatch or already claimed)
  const updated = await queryOne<WorkItemRow>(
    `SELECT * FROM ${TABLES.workItems} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );
  if (!updated || updated.version !== expectedVersion + 1) {
    throw new BusinessError(
      ERROR_CODES.VERSION_CONFLICT,
      `Failed to claim work item. It may have been claimed by another user or the version has changed.`,
      409
    );
  }
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
