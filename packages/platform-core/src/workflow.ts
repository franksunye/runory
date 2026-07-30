// ── Workflow V2 Runtime (v0.5 Slice 1) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.4-5.5:
// Workflow definitions are versioned and immutable once published.
// Instances are pinned to a specific definition version.
// History is append-only events, not a mutable JSON column.
// Work items carry human tasks, approvals, and form bindings.
// Approval decisions are immutable and reference exactly one work_item.

import { genId, now, queryOne, queryAll, batch, execute, runInTransaction, executeStatementsInTransaction, type BatchStatement, type Transaction } from "./db";
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
  /** Step to return to when an approval is "returned". If absent, the
   *  approval cannot be returned — the caller must use outcome "rejected". */
  onReturn?: string;
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
  next_event_sequence: number;
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
  dedupe_key: string | null;
}

// ── Publish Workflow Definition ──

export async function publishWorkflowDefinition(
  workspaceId: string,
  def: WorkflowDefinition,
  publishedBy: string | null
): Promise<{ definitionId: string; versionId: string; versionNumber: number }> {
  const ts = now();
  const defJson = JSON.stringify(def);

  // Find or create the definition record
  let defRow = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.workflowDefinitions}
     WHERE workspace_id = ? AND workflow_id = ?`,
    [workspaceId, def.workflowKey]
  );

  let definitionId: string;
  let versionNumber: number;

  if (!defRow) {
    definitionId = genId("wfd");
    versionNumber = 1;
    await batch([
      {
        sql: `INSERT INTO ${TABLES.workflowDefinitions}
              (id, workspace_id, workflow_id, name, target_object, definition_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [definitionId, workspaceId, def.workflowKey, def.name, def.targetObject, defJson, ts, ts],
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

  const statements: BatchStatement[] = [
    {
      sql: `INSERT INTO ${TABLES.workflowDefinitionVersions}
            (id, workspace_id, workflow_definition_id, version_number, definition_json, schema_version, published_by, published_at, created_at)
            VALUES (?, ?, ?, ?, ?, '2.0', ?, ?, ?)`,
      args: [versionId, workspaceId, definitionId, versionNumber, defJson, publishedBy, ts, ts],
    },
    {
      sql: `UPDATE ${TABLES.workflowDefinitions}
            SET name = ?, target_object = ?, definition_json = ?, updated_at = ?
            WHERE id = ?`,
      args: [def.name, def.targetObject, defJson, ts, definitionId],
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

// ── Workflow Event Appender ──
//
// The single entry point for writing workflow events. Replaces the old
// SELECT MAX(sequence)+1 pattern with a per-instance counter
// (next_event_sequence) that is atomically read and incremented within
// the same write transaction.
//
// How it works:
//   1. The INSERT uses a subquery to read the current next_event_sequence
//      from workflow_instances.
//   2. The UPDATE increments next_event_sequence by 1.
//   Both statements are in the same batch/transaction, so SQLite's
//   serialized write transactions guarantee no two concurrent writes
//   can observe the same sequence value.
//
// The UNIQUE(instance_id, sequence) constraint remains as a last-resort
// guard. The counter increment does NOT modify the instance's business
// `version` — it is an internal sequencing concern, not a domain event.

export interface WorkflowEventInput {
  eventType: string;
  stepId: string | null;
  actorType: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  /** Optional deduplication key for idempotent event writes (e.g. timer events). */
  dedupeKey?: string | null;
}

/**
 * Produce the batch statements needed to append a workflow event.
 *
 * Returns [INSERT event, UPDATE counter]. The INSERT uses a subquery to read
 * the current `next_event_sequence`, and the UPDATE increments it.
 *
 * The UPDATE carries `expectedRowsAffected: 1` to force the `batch()` function
 * to use the sequential transaction loop (not `db.batch()`), ensuring the
 * INSERT's subquery sees the correct counter value and the UPDATE executes
 * in order.
 *
 * Must be executed within the same transaction as the caller's other writes.
 */
function makeWorkflowEventStatements(
  workspaceId: string,
  instanceId: string,
  event: WorkflowEventInput,
): BatchStatement[] {
  const eventId = genId("wfe");
  const hasDedupeKey = Boolean(event.dedupeKey);

  const columns = [
    "id", "workspace_id", "instance_id", "sequence", "event_type",
    "step_id", "actor_type", "actor_id", "payload_json", "occurred_at",
  ];
  if (hasDedupeKey) columns.push("dedupe_key");

  const placeholders = [
    "?", "?", "?",
    `(SELECT next_event_sequence FROM ${TABLES.workflowInstances} WHERE id = ?)`,
    "?", "?", "?", "?", "?", "?",
  ];
  if (hasDedupeKey) placeholders.push("?");

  const args: unknown[] = [
    eventId, workspaceId, instanceId,
    instanceId, // subquery parameter
    event.eventType, event.stepId, event.actorType, event.actorId,
    JSON.stringify(event.payload), event.occurredAt,
  ];
  if (hasDedupeKey) args.push(event.dedupeKey);

  return [
    {
      sql: `INSERT INTO ${TABLES.workflowEvents}
            (${columns.join(", ")})
            VALUES (${placeholders.join(", ")})`,
      args,
    },
    {
      sql: `UPDATE ${TABLES.workflowInstances}
            SET next_event_sequence = next_event_sequence + 1
            WHERE id = ?`,
      args: [instanceId],
      expectedRowsAffected: 1,
    },
  ];
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

export async function startWorkflow(
  workspaceId: string,
  workflowKey: string,
  objectType: string,
  recordId: string,
  actor: CommandActor,
  options?: { skipFirstSystemCommand?: boolean }
): Promise<{ instanceId: string }> {
  // Get the active version
  const def = await queryOne<{ id: string; definition_json: string }>(
    `SELECT id, definition_json FROM ${TABLES.workflowDefinitions}
     WHERE workspace_id = ? AND workflow_id = ?`,
    [workspaceId, workflowKey]
  );

  if (!def) {
    throw new NotFoundError(`No active workflow definition found for key: ${workflowKey}`);
  }

  const versionRow = await queryOne<{ id: string; definition_json: string }>(
    `SELECT id, definition_json FROM ${TABLES.workflowDefinitionVersions}
     WHERE workflow_definition_id = ?
     ORDER BY version_number DESC LIMIT 1`,
    [def.id]
  );

  if (!versionRow) {
    throw new NotFoundError(`Workflow definition version not found for definition: ${def.id}`);
  }

  const wfDef = JSON.parse(versionRow.definition_json) as WorkflowDefinition;
  const startStep = wfDef.steps.find(s => s.kind === "start");
  if (!startStep) {
    throw new InvalidInputError(`Workflow definition has no start step`);
  }

  // Determine the initial actionable step.
  // When skipFirstSystemCommand is true (e.g., demo data where the triggering
  // command has already been applied), skip the system_command step that
  // follows start and land directly at the next actionable step — mirroring
  // the workflow.start_process effect provider's semantics.
  let nextStepId = startStep.next;
  if (nextStepId && options?.skipFirstSystemCommand) {
    const firstStep = wfDef.steps.find(s => s.id === nextStepId);
    if (firstStep?.kind === "system_command" && firstStep.next) {
      nextStepId = firstStep.next;
    }
  }

  const instanceId = genId("wfi");
  const ts = now();

  const statements: BatchStatement[] = [
    // Create instance (next_event_sequence defaults to 1)
    {
      sql: `INSERT INTO ${TABLES.workflowInstances}
            (id, workspace_id, workflow_definition_id, definition_version_id,
             object_type, record_id, status, current_step_id, version,
             started_by, started_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'running', ?, 1, ?, ?, ?, ?)`,
      args: [instanceId, workspaceId, def.id, versionRow.id, objectType, recordId,
             nextStepId, actor.id, ts, ts, ts],
    },
    // Write workflow.started event — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, instanceId, {
      eventType: "workflow.started",
      stepId: "start",
      actorType: actor.type,
      actorId: actor.id,
      payload: { workflowKey, objectType, recordId },
      occurredAt: ts,
    }),
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
                VALUES (?, ?, ?, ?, 'sla', ?, 'active', ?, ?, ?)`,
          args: [genId("wft"), workspaceId, instanceId, workItemId, stepDueAt,
                 JSON.stringify({ stepId: nextStepId, sla: nextStep.sla ?? null }), ts, ts],
        });
      }
    }
  }

  await batch(statements);

  // If the next step is a system_command, execute it automatically.
  // This mirrors the post-commit advancement in approvalDecide() and
  // completeWorkItem(). The workflow.start_process effect provider
  // handles this for command-triggered workflows by skipping the
  // triggering command's own system_command step; this path covers
  // manual workflow starts via the workflow.start API.
  //
  // Post-commit errors (e.g., DB failure in advanceSystemCommandStep's
  // batch) are caught and logged — the instance is already committed,
  // and advanceSystemCommandStep has its own error marking for executor
  // failures. Propagating the error would make the API caller think the
  // workflow start failed when it actually succeeded.
  if (nextStepId) {
    const nextStep = wfDef.steps.find(s => s.id === nextStepId);
    if (nextStep?.kind === "system_command") {
      try {
        await advanceSystemCommandStep(workspaceId, instanceId, nextStepId);
      } catch (err) {
        console.error(
          `[workflow] startWorkflow: post-commit advanceSystemCommandStep failed for instance ${instanceId}: ` +
          `${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

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
    `SELECT * FROM ${TABLES.workflowInstances} WHERE workspace_id = ? AND id = ?`,
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
    // "Returned" means the approver sends the work back to a prior step.
    // The return target is defined by `onReturn` on the step definition.
    // Without onReturn, "returned" is not valid — the caller should use
    // "rejected" instead. This was previously broken: the work item was
    // marked as `completed` (not `returned`), nextStepId was null, and no
    // new work item was created — leaving the workflow stuck with no
    // actionable items.
    if (!currentStep.onReturn) {
      throw new BusinessError(
        ERROR_CODES.INVALID_TRANSITION,
        `INVALID_TRANSITION: Step '${workItem.step_id}' does not define an onReturn target; cannot use outcome 'returned'. Use 'rejected' instead.`,
        409
      );
    }
    nextStepId = currentStep.onReturn;
  }

  const statements: BatchStatement[] = [
    // Create immutable approval decision
    {
      sql: `INSERT INTO ${TABLES.approvalDecisions}
            (id, workspace_id, work_item_id, outcome, decided_by, comment,
             decision_payload_json, input_snapshot_hash, decided_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      args: [genId("apd"), workspaceId, workItemId, outcome, actor.id, comment,
             workItem.input_snapshot_hash ?? "", ts, ts],
    },
    // Update work item status based on outcome.
    // "approved" and "rejected" are terminal → completed.
    // "returned" is non-terminal → returned (a new work item will be
    // created for the onReturn target step).
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = ?, completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [outcome === "returned" ? "returned" : "completed", ts, ts, workItemId, expectedVersion],
      expectedRowsAffected: 1,
    },
    // Cancel the SLA timer for this work item — it is no longer actionable.
    // Without this, the cron coordinator would continue firing SLA warnings
    // and overdue events for a completed/returned work item.
    {
      sql: `UPDATE ${TABLES.workflowTimers}
            SET status = 'cancelled', updated_at = ?
            WHERE work_item_id = ? AND status = 'active'`,
      args: [ts, workItemId],
    },
    // Write workflow event — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, workItem.instance_id, {
      eventType: "workflow.approval_decided",
      stepId: workItem.step_id,
      actorType: actor.type,
      actorId: actor.id,
      payload: { outcome, comment },
      occurredAt: ts,
    }),
  ];

  // Track IDs of created work items for the next step
  const workItemIds: string[] = [];

  // If there's a next step, update instance and create work item for it
  if (nextStepId) {
    const nextStep = wfDef.steps.find(s => s.id === nextStepId);
    if (!nextStep) {
      console.warn(
        `[workflow] approvalDecide: next step "${nextStepId}" not found in definition. ` +
        `Instance ${workItem.instance_id} may be stuck.`
      );
    } else {
      statements.push({
        sql: `UPDATE ${TABLES.workflowInstances}
              SET current_step_id = ?, version = version + 1, updated_at = ?
              WHERE id = ? AND status = 'running'`,
        args: [nextStepId, ts, instance.id],
        expectedRowsAffected: 1,
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
                 stepDueAt, ts, ts],
        });

        if (stepDueAt) {
          statements.push({
            sql: `INSERT INTO ${TABLES.workflowTimers}
                  (id, workspace_id, instance_id, work_item_id, timer_type,
                   due_at, status, payload_json, created_at, updated_at)
                  VALUES (?, ?, ?, ?, 'sla', ?, 'active', ?, ?, ?)`,
            args: [genId("wft"), workspaceId, workItem.instance_id, newWorkItemId, stepDueAt,
                   JSON.stringify({ stepId: nextStepId, sla: nextStep.sla ?? null }), ts, ts],
          });
        }
      }

      // If next step is 'end', complete the instance
      if (nextStep.kind === "end") {
        statements.push({
          sql: `UPDATE ${TABLES.workflowInstances}
                SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
                WHERE id = ? AND status = 'running'`,
          args: [ts, ts, instance.id],
          expectedRowsAffected: 1,
        });
      }
    }
  }

  return {
    statements,
    events: [{
      aggregateType: "work_item",
      aggregateId: workItemId,
      eventType: "approval.decided",
      payload: { workItemId, outcome, comment },
    }],
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

// ── System Command Execution ──

/**
 * Executor function for a system_command workflow step.
 * Receives the workspace ID and the workflow subject's record ID.
 * The executor is responsible for reading the current aggregate version
 * and calling the appropriate command function with a system actor.
 */
type SystemCommandExecutor = (
  workspaceId: string,
  subjectId: string
) => Promise<void>;

/**
 * Registry mapping command type strings to their executor functions.
 * Business modules register their executors at load time via
 * registerSystemCommandExecutor(), following the same composition pattern
 * as command-contracts/providers. The workflow engine itself remains
 * domain-agnostic and knows nothing about specific command implementations.
 */
const systemCommandExecutors = new Map<string, SystemCommandExecutor>();

/**
 * Register a system_command executor at runtime.
 * Allows business modules to register their own command executors without
 * modifying the workflow engine directly. This follows the same registration
 * pattern as registerCommandEffectProvider() in command-contracts/.
 */
export function registerSystemCommandExecutor(
  commandType: string,
  executor: SystemCommandExecutor
): void {
  systemCommandExecutors.set(commandType, executor);
}

/**
 * Mark a workflow instance as 'error' due to a system_command execution
 * failure. Writes a failure event and updates the instance status so it
 * can be diagnosed and retried without losing prior committed state.
 *
 * This is the error-recovery counterpart to advanceSystemCommandStep:
 * the approval decision (or work item completion) has already been
 * committed atomically; the system_command executor runs post-commit and
 * may fail independently. Marking the instance as 'error' makes the
 * failure visible and actionable rather than silently stuck.
 */
async function markInstanceError(
  workspaceId: string,
  instanceId: string,
  stepId: string,
  command: string,
  errorMessage: string
): Promise<void> {
  const ts = now();

  await batch([
    // Write failure event — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, instanceId, {
      eventType: "workflow.system_command_failed",
      stepId,
      actorType: "system",
      actorId: "system",
      payload: { command, error: errorMessage, stepId },
      occurredAt: ts,
    }),
    // Mark instance as error — only if still running. If the instance was
    // concurrently cancelled or completed, we must not overwrite its status.
    {
      sql: `UPDATE ${TABLES.workflowInstances}
            SET status = 'error', version = version + 1, updated_at = ?
            WHERE id = ? AND status = 'running'`,
      args: [ts, instanceId],
    },
  ]);
}

/**
 * After a workflow step transition (approval.decide or work_item.complete),
 * check if the new current step is a system_command. If so, execute the bound
 * command automatically and advance the workflow to the next step.
 *
 * This closes the gap where the workflow engine advanced current_step_id to
 * a system_command step but never executed the bound command, leaving the
 * workflow stuck and the subject record in an inconsistent state.
 *
 * Handles consecutive system_command steps (e.g., command → command → end)
 * by looping until a non-system_command step is reached.
 *
 * Error handling: if the executor fails or no executor is registered, the
 * instance is marked as 'error' with a workflow.system_command_failed event.
 * The prior committed state (approval decision, work item completion) is
 * preserved; the instance can be retried via retryWorkflowSystemCommand().
 */
async function advanceSystemCommandStep(
  workspaceId: string,
  instanceId: string,
  stepId: string | null
): Promise<void> {
  if (!stepId) return;

  // Read the workflow instance to get the definition version
  const instance = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstances} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, instanceId]
  );
  if (!instance) return;

  // Read the definition version
  const versionRow = await queryOne<{ definition_json: string }>(
    `SELECT definition_json FROM ${TABLES.workflowDefinitionVersions} WHERE id = ?`,
    [instance.definition_version_id]
  );
  if (!versionRow) return;

  const wfDef = JSON.parse(versionRow.definition_json) as WorkflowDefinition;
  let currentStepId: string | null = stepId;

  while (currentStepId) {
    const step = wfDef.steps.find(s => s.id === currentStepId);
    if (!step) {
      console.warn(
        `[workflow] advanceSystemCommandStep: step "${currentStepId}" not found in definition. ` +
        `Workflow instance ${instanceId} may be stuck.`
      );
      break;
    }
    if (step.kind !== "system_command" || !step.command) break;

    const executor = systemCommandExecutors.get(step.command);
    if (!executor) {
      console.warn(
        `[workflow] No executor registered for system_command "${step.command}". ` +
        `Workflow instance ${instanceId} is stuck at step "${currentStepId}".`
      );
      // Mark the instance as error so it can be diagnosed and retried.
      await markInstanceError(workspaceId, instanceId, currentStepId, step.command,
        `No executor registered for system_command "${step.command}"`);
      break;
    }

    // Execute the bound command with a system actor.
    // This is a post-commit operation — the executor calls executeCommand()
    // which runs in its own atomic transaction. If the executor fails, we
    // mark the workflow instance as 'error' and write a failure event so
    // the system can diagnose and retry without losing the approval decision.
    try {
      await executor(workspaceId, instance.record_id);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[workflow] system_command "${step.command}" failed for instance ${instanceId} ` +
        `at step "${currentStepId}": ${errMsg}`
      );
      await markInstanceError(workspaceId, instanceId, currentStepId, step.command, errMsg);
      break;
    }

    // Advance to the next step
    const ts = now();
    const afterStepId = step.next ?? null;
    const afterStep = afterStepId ? wfDef.steps.find(s => s.id === afterStepId) : null;

    const statements: BatchStatement[] = [
      // Write workflow event for system_command execution — sequence from counter
      ...makeWorkflowEventStatements(workspaceId, instanceId, {
        eventType: "workflow.system_command_executed",
        stepId: currentStepId,
        actorType: "system",
        actorId: "system",
        payload: { command: step.command, nextStepId: afterStepId },
        occurredAt: ts,
      }),
    ];

    if (afterStep) {
      // Update current_step_id — guard with status='running' to prevent
      // advancing a concurrently cancelled/completed instance.
      statements.push({
        sql: `UPDATE ${TABLES.workflowInstances}
              SET current_step_id = ?, version = version + 1, updated_at = ?
              WHERE id = ? AND status = 'running'`,
        args: [afterStepId, ts, instanceId],
      });

      if (afterStep.kind === "end") {
        // Complete the instance
        statements.push({
          sql: `UPDATE ${TABLES.workflowInstances}
                SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
                WHERE id = ? AND status = 'running'`,
          args: [ts, ts, instanceId],
        });
      } else if (afterStep.kind === "approval" || afterStep.kind === "human_task") {
        // Create work item for the next step
        const newWorkItemId = genId("wi");
        const assigneeRule = afterStep.assigneeRule;
        const stepDueAt = resolveStepDueAt(afterStep, ts);
        statements.push({
          sql: `INSERT INTO ${TABLES.workItems}
                (id, workspace_id, instance_id, step_id, kind, status,
                 subject_type, subject_id, assignee_type, assignee_id,
                 candidate_rule_json, form_binding_id, due_at, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          args: [newWorkItemId, workspaceId, instanceId, afterStepId, afterStep.kind,
                 instance.object_type, instance.record_id,
                 assigneeRule?.permissionGroup ? "permission_group" : (assigneeRule?.userId ? "user" : null),
                 assigneeRule?.permissionGroup ?? assigneeRule?.userId ?? null,
                 assigneeRule ? JSON.stringify(assigneeRule) : null,
                 afterStep.formBindingId ?? null,
                 stepDueAt, ts, ts],
        });

        if (stepDueAt) {
          statements.push({
            sql: `INSERT INTO ${TABLES.workflowTimers}
                  (id, workspace_id, instance_id, work_item_id, timer_type,
                   due_at, status, payload_json, created_at, updated_at)
                  VALUES (?, ?, ?, ?, 'sla', ?, 'active', ?, ?, ?)`,
            args: [genId("wft"), workspaceId, instanceId, newWorkItemId, stepDueAt,
                   JSON.stringify({ stepId: afterStepId, sla: afterStep.sla ?? null }), ts, ts],
          });
        }
      }
    } else {
      // No next step — complete the instance
      statements.push({
        sql: `UPDATE ${TABLES.workflowInstances}
              SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
              WHERE id = ? AND status = 'running'`,
        args: [ts, ts, instanceId],
      });
    }

    await batch(statements);

    // Continue if the next step is also a system_command
    currentStepId = afterStep?.kind === "system_command" ? afterStepId : null;
  }
}

/**
 * Retry a failed system_command step on a workflow instance that was marked
 * as 'error'. Resets the instance to 'running' and re-invokes
 * advanceSystemCommandStep from the current step.
 *
 * This is the recovery path for post-commit executor failures: the original
 * approval decision is preserved, and the system_command is re-attempted.
 * If the executor succeeds this time, the workflow advances normally.
 */
export async function retryWorkflowSystemCommand(
  workspaceId: string,
  instanceId: string,
  actor: CommandActor
): Promise<void> {
  const instance = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstances} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, instanceId]
  );
  if (!instance) {
    throw new NotFoundError(`Workflow instance not found: ${instanceId}`);
  }
  if (instance.status !== "error") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Workflow instance ${instanceId} is in status '${instance.status}', expected 'error'`,
      409
    );
  }

  const ts = now();

  // Reset instance to running and write retry event
  await batch([
    {
      sql: `UPDATE ${TABLES.workflowInstances}
            SET status = 'running', version = version + 1, updated_at = ?
            WHERE id = ? AND status = 'error'`,
      args: [ts, instanceId],
      expectedRowsAffected: 1,
    },
    // Write retry event — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, instanceId, {
      eventType: "workflow.system_command_retry",
      stepId: instance.current_step_id,
      actorType: actor.type,
      actorId: actor.id,
      payload: { stepId: instance.current_step_id },
      occurredAt: ts,
    }),
  ]);

  // Re-attempt system_command execution from the current step
  await advanceSystemCommandStep(workspaceId, instanceId, instance.current_step_id);
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
  const result = await executeCommand<ApprovalDecideAggregate>(
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

  // Post-commit: if the workflow advanced to a system_command step (e.g.,
  // quote.approve after approval.decide), execute the bound command
  // automatically and advance the workflow to the next step.
  //
  // Errors are caught and logged — the approval decision is already
  // committed atomically. advanceSystemCommandStep has its own error
  // marking (markInstanceError) for executor failures; this catch covers
  // DB-level failures in markInstanceError itself or in the step
  // advancement batch.
  if (result.aggregate?.nextStepId) {
    try {
      await advanceSystemCommandStep(
        workspaceId,
        result.aggregate.instanceId,
        result.aggregate.nextStepId
      );
    } catch (err) {
      console.error(
        `[workflow] approvalDecide: post-commit advanceSystemCommandStep failed for instance ${result.aggregate.instanceId}: ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
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

  if (workItem.status !== "ready" && workItem.status !== "active") {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} is in status '${workItem.status}', expected 'ready' or 'active'`,
      409,
    );
  }

  // Per v0.5.1 Spec §4.3: "Return creates a new work item and submission
  // revision; it does not edit prior evidence."
  // We create a new work item for the same step, so the technician can
  // re-execute with the prior context and return reason.

  const instance = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstances} WHERE workspace_id = ? AND id = ?`,
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

  const newWorkItemId = genId("wi");
  const assigneeRule = stepDef.assigneeRule;
  const stepDueAt = resolveStepDueAt(stepDef, ts);

  const statements: BatchStatement[] = [
    // Mark current work item as returned
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'returned', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, ts, workItemId, expectedVersion],
      expectedRowsAffected: 1,
    },
    // Cancel the SLA timer for the returned work item — it is no longer
    // actionable. A new timer will be created for the replacement work item.
    {
      sql: `UPDATE ${TABLES.workflowTimers}
            SET status = 'cancelled', updated_at = ?
            WHERE work_item_id = ? AND status = 'active'`,
      args: [ts, workItemId],
    },
    // Write workflow event for the return — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, workItem.instance_id, {
      eventType: "workflow.work_returned",
      stepId: workItem.step_id,
      actorType: actor.type,
      actorId: actor.id,
      payload: { comment, new_work_item_id: newWorkItemId },
      occurredAt: ts,
    }),
    // Create a new work item for the same step (ready for the technician)
    {
      sql: `INSERT INTO ${TABLES.workItems}
            (id, workspace_id, instance_id, step_id, kind, status,
             subject_type, subject_id, assignee_type, assignee_id,
             candidate_rule_json, form_binding_id, due_at, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [newWorkItemId, workspaceId, workItem.instance_id, workItem.step_id, workItem.kind,
             workItem.subject_type, workItem.subject_id,
             assigneeRule?.permissionGroup ? "permission_group" : (assigneeRule?.userId ? "user" : null),
             assigneeRule?.permissionGroup ?? assigneeRule?.userId ?? null,
             assigneeRule ? JSON.stringify(assigneeRule) : workItem.candidate_rule_json,
             workItem.form_binding_id,
             stepDueAt,
             ts, ts],
    },
  ];

  // Create a new SLA timer for the replacement work item if the step has a due_at
  if (stepDueAt) {
    statements.push({
      sql: `INSERT INTO ${TABLES.workflowTimers}
            (id, workspace_id, instance_id, work_item_id, timer_type,
             due_at, status, payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'sla', ?, 'active', ?, ?, ?)`,
      args: [genId("wft"), workspaceId, workItem.instance_id, newWorkItemId, stepDueAt,
             JSON.stringify({ stepId: workItem.step_id, sla: stepDef.sla ?? null, replacement: true }), ts, ts],
    });
  }

  const aggregate: Partial<WorkItemRow> = {
    ...workItem,
    status: "returned",
    completed_at: ts,
    version: expectedVersion + 1,
    updated_at: ts,
  };

  return {
    statements,
    events: [{
      aggregateType: "work_item",
      aggregateId: workItemId,
      eventType: "work_item.returned",
      payload: { workItemId, newWorkItemId, comment },
    }],
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
    `SELECT * FROM ${TABLES.workflowInstances} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, instanceId]
  );

  if (!instance) {
    throw new NotFoundError(`Workflow instance not found: ${instanceId}`);
  }

  if (instance.status !== "running") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Workflow instance ${instanceId} is not running (status: ${instance.status})`,
      409
    );
  }

  await batch([
    // Cancel instance
    {
      sql: `UPDATE ${TABLES.workflowInstances}
            SET status = 'cancelled', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND status = 'running'`,
      args: [ts, ts, instanceId],
      expectedRowsAffected: 1,
    },
    // Cancel all open work items
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'cancelled', updated_at = ?
            WHERE instance_id = ? AND status IN ('ready', 'active')`,
      args: [ts, instanceId],
    },
    // Cancel all active SLA timers — without this, fireOverdueTimers and
    // fireSlaWarnings would continue firing events for a cancelled workflow.
    {
      sql: `UPDATE ${TABLES.workflowTimers}
            SET status = 'cancelled', updated_at = ?
            WHERE instance_id = ? AND status = 'active'`,
      args: [ts, instanceId],
    },
    // Write workflow event — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, instanceId, {
      eventType: "workflow.cancelled",
      stepId: null,
      actorType: actor.type,
      actorId: actor.id,
      payload: { reason },
      occurredAt: ts,
    }),
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

  // Assignee filter: assigned to the canonical user directly OR to one of
  // their permission groups. Dev personas carry external_id while persisted
  // assignments normally use saas_users.id, so both identifiers must match.
  const actorUser = await queryOne<{ id: string; external_id: string }>(
    `SELECT id, external_id FROM ${TABLES.users} WHERE id = ? OR external_id = ?`,
    [actorId, actorId]
  );
  const actorIds = [...new Set([actorId, actorUser?.id, actorUser?.external_id].filter((id): id is string => Boolean(id)))];
  const groups = await getUserPermissionGroups(workspaceId, actorUser?.id ?? actorId);
  const groupKeys = groups.map(g => g.groupKey);
  const actorPlaceholders = actorIds.map(() => "?").join(", ");

  if (groupKeys.length > 0) {
    const placeholders = groupKeys.map(() => "?").join(", ");
    conditions.push(
      `((assignee_type = 'user' AND assignee_id IN (${actorPlaceholders})) OR (assignee_type = 'permission_group' AND assignee_id IN (${placeholders})))`
    );
    args.push(...actorIds, ...groupKeys);
  } else {
    conditions.push(`(assignee_type = 'user' AND assignee_id IN (${actorPlaceholders}))`);
    args.push(...actorIds);
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

/**
 * Workspace administrators may supervise a Visit execution deliverable.
 *
 * This override is intentionally limited to `visit_execution:*` work items:
 * generic workflow approvals and assigned human tasks must retain their normal
 * candidate rules. Actor IDs can be either the internal user ID or the stable
 * external identity used by dev/OTP authentication.
 */
async function canSuperviseVisitExecution(
  workspaceId: string,
  actor: CommandActor
): Promise<boolean> {
  if (actor.type !== "user") return false;

  const membership = await queryOne<{ role: string }>(
    `SELECT membership.role
     FROM ${TABLES.workspaceMemberships} membership
     JOIN ${TABLES.users} user ON user.id = membership.user_id
     WHERE membership.workspace_id = ?
       AND membership.status = 'active'
       AND membership.role IN ('owner', 'admin')
       AND (user.id = ? OR user.external_id = ?)
     LIMIT 1`,
    [workspaceId, actor.id, actor.id]
  );

  return Boolean(membership);
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

  const statements: BatchStatement[] = [
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'active', claimed_by = ?, claimed_at = ?,
                version = version + 1, updated_at = ?
            WHERE id = ? AND version = ? AND status = 'ready'`,
      args: [actor.id, ts, ts, workItemId, expectedVersion],
      expectedRowsAffected: 1,
    },
    // Write workflow event — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, workItem.instance_id, {
      eventType: "workflow.work_claimed",
      stepId: workItem.step_id,
      actorType: actor.type,
      actorId: actor.id,
      payload: {},
      occurredAt: ts,
    }),
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
    events: [{
      aggregateType: "work_item",
      aggregateId: workItemId,
      eventType: "work_item.claimed",
      payload: { workItemId, claimedBy: actor.id },
    }],
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

  const statements: BatchStatement[] = [
    // Release back to ready, clear claim metadata
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'ready', claimed_by = NULL, claimed_at = NULL,
                version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, workItemId, expectedVersion],
      expectedRowsAffected: 1,
    },
    // Write workflow event — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, workItem.instance_id, {
      eventType: "workflow.work_released",
      stepId: workItem.step_id,
      actorType: actor.type,
      actorId: actor.id,
      payload: {},
      occurredAt: ts,
    }),
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
    events: [{
      aggregateType: "work_item",
      aggregateId: workItemId,
      eventType: "work_item.released",
      payload: { workItemId, releasedBy: actor.id },
    }],
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
  // Visit execution supports an explicit administrative supervision path so
  // Workspace Owners/Admins can complete the documented single-role
  // acceptance journey. Other workflow tasks keep strict assignee eligibility.
  const isVisitExecution = workItem.instance_id.startsWith("visit_execution:");
  const hasAdministrativeOverride = isVisitExecution
    ? await canSuperviseVisitExecution(workspaceId, actor)
    : false;
  if (!hasAdministrativeOverride) {
    await checkCandidateEligibility(workspaceId, workItem, actor);
  }

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

  // Field execution is a governed operational task, not a configurable
  // workflow definition. It deliberately reuses the durable work-item and
  // mobile-form contracts, but has no workflow instance to advance. Completing
  // it after the form gate is therefore a small terminal transition.
  if (isVisitExecution) {
    const completedVersion = workItem.version + 1;
    return {
      statements: [
        {
          sql: `UPDATE ${TABLES.workItems}
                SET status = 'completed', completed_at = ?, version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ? AND version = ?`,
          args: [ts, completedVersion, ts, workspaceId, workItemId, workItem.version],
        },
        // Cancel any active SLA timer for this work item
        {
          sql: `UPDATE ${TABLES.workflowTimers}
                SET status = 'cancelled', updated_at = ?
                WHERE work_item_id = ? AND status = 'active'`,
          args: [ts, workItemId],
        },
      ],
      events: [{
        aggregateType: "work_item",
        aggregateId: workItemId,
        eventType: "work_item.completed",
        payload: { workItemId, visitExecution: true },
      }],
      audit: {
        action: "visit_execution.deliverable_complete",
        entityType: "service_visit",
        entityId: workItem.subject_id ?? workItemId,
        before: { work_item_id: workItemId, status: workItem.status },
        after: { work_item_id: workItemId, status: "completed" },
      },
      aggregate: { ...workItem, status: "completed", completed_at: ts, version: completedVersion },
      newVersion: completedVersion,
    } as CommandHandlerResult<Partial<WorkItemRow>>;
  }

  // Read the instance to get the definition version
  const instance = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstances} WHERE workspace_id = ? AND id = ?`,
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

  const statements: BatchStatement[] = [
    // Mark work item as completed
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, ts, workItemId, expectedVersion],
      expectedRowsAffected: 1,
    },
    // Cancel the SLA timer for this work item — it is no longer actionable.
    // Without this, the cron coordinator would continue firing SLA warnings
    // and overdue events for a completed work item.
    {
      sql: `UPDATE ${TABLES.workflowTimers}
            SET status = 'cancelled', updated_at = ?
            WHERE work_item_id = ? AND status = 'active'`,
      args: [ts, workItemId],
    },
    // Write workflow event — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, workItem.instance_id, {
      eventType: "workflow.work_completed",
      stepId: workItem.step_id,
      actorType: actor.type,
      actorId: actor.id,
      payload: { formData: formData ?? null },
      occurredAt: ts,
    }),
  ];

  // Track IDs of created work items for the next step
  const workItemIds: string[] = [];

  // Advance the workflow to the next step
  if (nextStepId) {
    const nextStep = wfDef.steps.find(s => s.id === nextStepId);
    if (!nextStep) {
      console.warn(
        `[workflow] completeWorkItem: next step "${nextStepId}" not found in definition. ` +
        `Instance ${workItem.instance_id} may be stuck.`
      );
    } else {
      statements.push({
        sql: `UPDATE ${TABLES.workflowInstances}
              SET current_step_id = ?, version = version + 1, updated_at = ?
              WHERE id = ? AND status = 'running'`,
        args: [nextStepId, ts, instance.id],
        expectedRowsAffected: 1,
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
                  VALUES (?, ?, ?, ?, 'sla', ?, 'active', ?, ?, ?)`,
            args: [genId("wft"), workspaceId, workItem.instance_id, newWorkItemId, stepDueAt,
                   JSON.stringify({ stepId: nextStepId, sla: nextStep.sla ?? null }), ts, ts],
          });
        }
      }

      // If next step is 'end', complete the instance
      if (nextStep.kind === "end") {
        statements.push({
          sql: `UPDATE ${TABLES.workflowInstances}
                SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
                WHERE id = ? AND status = 'running'`,
          args: [ts, ts, instance.id],
          expectedRowsAffected: 1,
        });
      }
    }
  } else if (currentStep.kind === "end") {
    // No next step and current step is end — complete the instance
    statements.push({
      sql: `UPDATE ${TABLES.workflowInstances}
            SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND status = 'running'`,
      args: [ts, ts, instance.id],
      expectedRowsAffected: 1,
    });
  }

  const aggregate: Partial<WorkItemRow> & { nextStepId?: string | null; instanceId?: string } = {
    ...workItem,
    status: "completed",
    completed_at: ts,
    version: expectedVersion + 1,
    updated_at: ts,
    // Include nextStepId and instanceId so the post-commit
    // advanceSystemCommandStep call doesn't need an extra DB query.
    nextStepId,
    instanceId: workItem.instance_id,
  };

  return {
    statements,
    events: [{
      aggregateType: "work_item",
      aggregateId: workItemId,
      eventType: "work_item.completed",
      payload: { workItemId, nextWorkItemIds: workItemIds },
    }],
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
): Promise<CommandResult<Partial<WorkItemRow> & { nextStepId?: string | null; instanceId?: string }>> {
  const result = await executeCommand<Partial<WorkItemRow> & { nextStepId?: string | null; instanceId?: string }>(
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

  // Post-commit: if the workflow advanced to a system_command step after
  // completing this work item, execute the bound command automatically.
  // The handler returns nextStepId and instanceId in the aggregate so we
  // don't need an extra DB query to read current_step_id.
  //
  // Errors are caught and logged — the work item completion is already
  // committed atomically. See approvalDecide for the same pattern.
  if (result.aggregate?.nextStepId && result.aggregate?.instanceId) {
    try {
      await advanceSystemCommandStep(
        workspaceId,
        result.aggregate.instanceId,
        result.aggregate.nextStepId
      );
    } catch (err) {
      console.error(
        `[workflow] completeWorkItem: post-commit advanceSystemCommandStep failed for instance ${result.aggregate.instanceId}: ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ── Cancel Work Item ──

/**
 * Cancel a work item.
 *
 * Per architectural decision: canceling the current work item is equivalent
 * to canceling the entire workflow run. Automatic advancement is explicitly
 * forbidden — "uncompleted" must never be interpreted as "completed".
 *
 * In a single transaction:
 *   1. Validate the workflow instance is `running`.
 *   2. Validate the work item belongs to the instance's `current_step_id`.
 *   3. Only allow canceling `ready`, `active`, or `returned` work items.
 *   4. Mark the target work item as `cancelled`.
 *   5. Mark the workflow instance as `cancelled` with `completed_at`.
 *   6. Cancel all remaining open work items and active timers.
 *   7. Write a `workflow.cancelled` event with source = "work_item_cancel".
 *
 * The old `workflow.work_cancelled` event is no longer written.
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

  // Only actionable work items may be cancelled
  if (!["ready", "active", "returned"].includes(workItem.status)) {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} is in status '${workItem.status}', expected 'ready', 'active', or 'returned'`,
      409
    );
  }

  // Load the workflow instance to validate state
  const instance = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstances} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItem.instance_id]
  );
  if (!instance) {
    throw new NotFoundError(`Workflow instance not found: ${workItem.instance_id}`);
  }

  // Instance must be running
  if (instance.status !== "running") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Workflow instance ${instance.id} is not running (status: ${instance.status})`,
      409
    );
  }

  // Work item must belong to the instance's current step
  if (instance.current_step_id !== workItem.step_id) {
    throw new BusinessError(
      ERROR_CODES.WORK_ITEM_NOT_ACTIONABLE,
      `WORK_ITEM_NOT_ACTIONABLE: Work item ${workItemId} belongs to step '${workItem.step_id}' but the instance is at step '${instance.current_step_id}'`,
      409
    );
  }

  const statements: BatchStatement[] = [
    // Mark the target work item as cancelled
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'cancelled', version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
      args: [ts, workItemId, expectedVersion],
      expectedRowsAffected: 1,
    },
    // Cancel the workflow instance
    {
      sql: `UPDATE ${TABLES.workflowInstances}
            SET status = 'cancelled', completed_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND status = 'running'`,
      args: [ts, ts, instance.id],
      expectedRowsAffected: 1,
    },
    // Cancel all remaining open work items for this instance
    {
      sql: `UPDATE ${TABLES.workItems}
            SET status = 'cancelled', updated_at = ?
            WHERE instance_id = ? AND id != ? AND status IN ('ready', 'active', 'returned')`,
      args: [ts, instance.id, workItemId],
    },
    // Cancel all active SLA timers
    {
      sql: `UPDATE ${TABLES.workflowTimers}
            SET status = 'cancelled', updated_at = ?
            WHERE instance_id = ? AND status = 'active'`,
      args: [ts, instance.id],
    },
    // Write workflow.cancelled event — sequence allocated from counter
    ...makeWorkflowEventStatements(workspaceId, instance.id, {
      eventType: "workflow.cancelled",
      stepId: workItem.step_id,
      actorType: actor.type,
      actorId: actor.id,
      payload: {
        reason: reason ?? null,
        source: "work_item_cancel",
        workItemId,
      },
      occurredAt: ts,
    }),
  ];

  const aggregate: Partial<WorkItemRow> = {
    ...workItem,
    status: "cancelled",
    version: expectedVersion + 1,
    updated_at: ts,
  };

  return {
    statements,
    events: [{
      aggregateType: "work_item",
      aggregateId: workItemId,
      eventType: "work_item.cancelled",
      payload: { workItemId, reason: reason ?? null },
    }],
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
 * Fire overdue timers (called by the Cron Coordinator).
 *
 * For each timer in `active` status whose `due_at` has passed:
 *   1. Use dedupe_key `timer:{timerId}:overdue` for idempotency.
 *   2. Create a `timer.overdue` workflow event (if not already present).
 *   3. Mark the timer as `fired`.
 *
 * Timer state update, event write, and audit are in the same transaction.
 * Even if the lease expires or processes crash, duplicate execution produces
 * at most one event per timer (enforced by the unique index on dedupe_key).
 *
 * @param workspaceId Optional workspace filter. When omitted, processes
 *                    timers across all workspaces (used by the cron coordinator).
 * @param limit       Maximum timers to process per call (default 100).
 */
export async function fireOverdueTimers(
  workspaceId?: string,
  limit = 100,
): Promise<{ fired: number }> {
  const ts = now();

  // Query overdue active timers, batch-limited, sorted by due_at then id.
  // Defense-in-depth: only fire timers whose work item is still actionable
  // and whose workflow instance is still running. This prevents stale timers
  // (e.g., from a work item that was completed but whose timer was not
  // cancelled in the same transaction) from emitting false events.
  const wsFilter = workspaceId ? `AND t.workspace_id = ?` : ``;
  const args: unknown[] = [ts];
  if (workspaceId) args.push(workspaceId);
  args.push(limit);

  const overdueTimers = await queryAll<{
    id: string;
    workspace_id: string;
    instance_id: string;
    work_item_id: string | null;
    timer_type: string;
    due_at: string;
  }>(
    `SELECT t.id, t.workspace_id, t.instance_id, t.work_item_id, t.timer_type, t.due_at
     FROM ${TABLES.workflowTimers} t
     INNER JOIN ${TABLES.workflowInstances} i ON t.instance_id = i.id
     LEFT JOIN ${TABLES.workItems} w ON t.work_item_id = w.id
     WHERE t.status = 'active' AND t.due_at <= ?
     AND i.status = 'running'
     AND (w.id IS NULL OR w.status IN ('ready', 'active', 'returned'))
     ${wsFilter}
     ORDER BY t.due_at ASC, t.id ASC
     LIMIT ?`,
    args,
  );

  let fired = 0;

  for (const timer of overdueTimers) {
    const dedupeKey = `timer:${timer.id}:overdue`;

    const wasNewlyFired = await runInTransaction(async (tx) => {
      // Check dedupe_key — if event already exists, just mark timer as fired
      const existing = await tx.execute({
        sql: `SELECT 1 FROM ${TABLES.workflowEvents} WHERE dedupe_key = ?`,
        args: [dedupeKey],
      });
      if (existing.rows.length > 0) {
        await tx.execute({
          sql: `UPDATE ${TABLES.workflowTimers}
                SET status = 'fired', fired_at = ?, updated_at = ?
                WHERE id = ?`,
          args: [ts, ts, timer.id],
        });
        return false;
      }

      // Insert event with dedupe_key + update counter + mark timer fired
      const eventStmts = makeWorkflowEventStatements(timer.workspace_id, timer.instance_id, {
        eventType: "timer.overdue",
        stepId: null,
        actorType: "system",
        actorId: null,
        payload: {
          timerId: timer.id,
          workItemId: timer.work_item_id,
          timerType: timer.timer_type,
          dueAt: timer.due_at,
        },
        occurredAt: ts,
        dedupeKey,
      });
      await executeStatementsInTransaction(tx, eventStmts);
      await tx.execute({
        sql: `UPDATE ${TABLES.workflowTimers}
              SET status = 'fired', fired_at = ?, updated_at = ?
              WHERE id = ?`,
        args: [ts, ts, timer.id],
      });
      return true;
    });

    if (wasNewlyFired) fired++;
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
// Idempotency is enforced via dedupe_key `timer:{timerId}:sla_warning`.
// Timer state update, event write, and audit write are in the same transaction.

export async function fireSlaWarnings(
  workspaceId?: string,
  limit = 100,
): Promise<{ warned: number }> {
  const ts = now();

  // Find active SLA timers, batch-limited, sorted by due_at then id.
  // Defense-in-depth: only process timers whose work item is still actionable
  // and whose workflow instance is still running.
  const wsFilter = workspaceId ? `AND t.workspace_id = ?` : ``;
  const args: unknown[] = [];
  if (workspaceId) args.push(workspaceId);
  args.push(limit);

  const activeTimers = await queryAll<{
    id: string;
    workspace_id: string;
    instance_id: string;
    work_item_id: string | null;
    due_at: string;
    created_at: string;
  }>(
    `SELECT t.id, t.workspace_id, t.instance_id, t.work_item_id, t.due_at, t.created_at
     FROM ${TABLES.workflowTimers} t
     INNER JOIN ${TABLES.workflowInstances} i ON t.instance_id = i.id
     LEFT JOIN ${TABLES.workItems} w ON t.work_item_id = w.id
     WHERE t.status = 'active' AND t.timer_type = 'sla'
     AND i.status = 'running'
     AND (w.id IS NULL OR w.status IN ('ready', 'active', 'returned'))
     ${wsFilter}
     ORDER BY t.due_at ASC, t.id ASC
     LIMIT ?`,
    args,
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

    const dedupeKey = `timer:${timer.id}:sla_warning`;

    const wasNewlyWarned = await runInTransaction(async (tx) => {
      // Check dedupe_key — if event already exists, skip
      const existing = await tx.execute({
        sql: `SELECT 1 FROM ${TABLES.workflowEvents} WHERE dedupe_key = ?`,
        args: [dedupeKey],
      });
      if (existing.rows.length > 0) {
        return false;
      }

      // Insert event with dedupe_key + update counter
      const eventStmts = makeWorkflowEventStatements(timer.workspace_id, timer.instance_id, {
        eventType: "timer.sla_warning",
        stepId: null,
        actorType: "system",
        actorId: null,
        payload: {
          timerId: timer.id,
          workItemId: timer.work_item_id,
          timerType: "sla",
          dueAt: timer.due_at,
          remainingMs: remaining,
          totalDurationMs: totalDuration,
        },
        occurredAt: ts,
        dedupeKey,
      });
      await executeStatementsInTransaction(tx, eventStmts);

      // Audit event for SLA warning (atomic with workflow event — §11.4)
      await tx.execute({
        sql: `INSERT INTO ${TABLES.auditLogs}
              (id, workspace_id, actor_type, actor_id, action, entity_type,
               entity_id, before_json, after_json, extension_version_id,
               request_id, created_at)
              VALUES (?, ?, 'system', 'system', 'work_item.sla_warning', 'work_item',
                      ?, NULL, ?, NULL, ?, ?)`,
        args: [
          genId("aud"),
          timer.workspace_id,
          timer.work_item_id ?? timer.id,
          JSON.stringify({ due_at: timer.due_at, remaining_ms: remaining }),
          `sla-warning-${timer.id}-${ts}`,
          ts,
        ],
      });

      return true;
    });

    if (wasNewlyWarned) warned++;
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
