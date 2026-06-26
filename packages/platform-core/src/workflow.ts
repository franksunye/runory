import { queryAll, queryOne, execute, batch, genId, now } from "./db";
import { TABLES } from "./contracts";
import {
  InvalidInputError,
  NotFoundError,
  AuthorizationError,
  type WorkspaceRole,
} from "./context";
import { roleAllows } from "./tenancy";
import { getRecord, createRecord, updateRecord } from "./metadata";
import { writeAuditEvent } from "./audit-service";
import type {
  WorkflowDefinition,
  WorkflowTransition,
  WorkflowCondition,
} from "@runory/contracts";
import { workflowDefinitionSchema } from "@runory/contracts";

// ── Types ──

export interface WorkflowInstance {
  id: string;
  workspaceId: string;
  workflowId: string;
  objectType: string;
  recordId: string;
  currentState: string;
  history: WorkflowTransitionEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTransitionEvent {
  fromStatus: string;
  toStatus: string;
  transitionLabel: string;
  actorId: string;
  actorType: string;
  comment: string | null;
  timestamp: string;
}

export interface WorkflowActor {
  id: string;
  type: string;
  role: WorkspaceRole;
}

// ── Row Types ──

interface WorkflowDefinitionRow {
  id: string;
  workspace_id: string;
  workflow_id: string;
  name: string;
  target_object: string;
  definition_json: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowInstanceRow {
  id: string;
  workspace_id: string;
  workflow_id: string;
  object_type: string;
  record_id: string;
  current_state: string;
  history_json: string;
  created_at: string;
  updated_at: string;
}

// ── Mappers ──

function mapDefinitionRow(row: WorkflowDefinitionRow): WorkflowDefinition {
  return JSON.parse(row.definition_json) as WorkflowDefinition;
}

function mapInstanceRow(row: WorkflowInstanceRow): WorkflowInstance {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workflowId: row.workflow_id,
    objectType: row.object_type,
    recordId: row.record_id,
    currentState: row.current_state,
    history: row.history_json ? (JSON.parse(row.history_json) as WorkflowTransitionEvent[]) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Workflow Definition CRUD ──

export async function createWorkflowDefinition(
  workspaceId: string,
  def: WorkflowDefinition
): Promise<WorkflowDefinition> {
  // Validate input against schema
  const parsed = workflowDefinitionSchema.safeParse(def);
  if (!parsed.success) {
    throw new InvalidInputError(`Invalid workflow definition: ${parsed.error.message}`);
  }
  const validated = parsed.data;

  // Ensure initialState exists in states
  const stateNames = validated.states.map(s => s.name);
  if (!stateNames.includes(validated.initialState)) {
    throw new InvalidInputError(
      `initialState "${validated.initialState}" is not in the states list`
    );
  }

  // Validate transitions reference declared states
  for (const t of validated.transitions) {
    if (!stateNames.includes(t.fromStatus)) {
      throw new InvalidInputError(`Transition fromStatus "${t.fromStatus}" is not a declared state`);
    }
    if (!stateNames.includes(t.toStatus)) {
      throw new InvalidInputError(`Transition toStatus "${t.toStatus}" is not a declared state`);
    }
  }

  const id = genId("wfd");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.workflowDefinitions}
     (id, workspace_id, workflow_id, name, target_object, definition_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      validated.id,
      validated.name,
      validated.targetObject,
      JSON.stringify(validated),
      ts,
      ts,
    ]
  );
  return validated;
}

export async function getWorkflowDefinitions(
  workspaceId: string
): Promise<WorkflowDefinition[]> {
  const rows = await queryAll<WorkflowDefinitionRow>(
    `SELECT * FROM ${TABLES.workflowDefinitions} WHERE workspace_id = ? ORDER BY created_at`,
    [workspaceId]
  );
  return rows.map(mapDefinitionRow);
}

export async function getWorkflowDefinition(
  workspaceId: string,
  workflowId: string
): Promise<WorkflowDefinition | undefined> {
  const row = await queryOne<WorkflowDefinitionRow>(
    `SELECT * FROM ${TABLES.workflowDefinitions}
     WHERE workspace_id = ? AND workflow_id = ?`,
    [workspaceId, workflowId]
  );
  if (!row) return undefined;
  return mapDefinitionRow(row);
}

export async function deleteWorkflowDefinition(
  workspaceId: string,
  workflowId: string
): Promise<boolean> {
  const existing = await getWorkflowDefinition(workspaceId, workflowId);
  if (!existing) return false;
  await execute(
    `DELETE FROM ${TABLES.workflowDefinitions}
     WHERE workspace_id = ? AND workflow_id = ?`,
    [workspaceId, workflowId]
  );
  return true;
}

export async function updateWorkflowDefinition(
  workspaceId: string,
  workflowId: string,
  updates: Partial<Pick<WorkflowDefinition, "name" | "states" | "transitions" | "initialState" | "stateField" | "autoStart">>
): Promise<WorkflowDefinition> {
  const existing = await getWorkflowDefinition(workspaceId, workflowId);
  if (!existing) {
    throw new NotFoundError(`Workflow definition "${workflowId}" not found`);
  }

  const merged: WorkflowDefinition = { ...existing, ...updates };

  // Re-validate the merged definition
  const parsed = workflowDefinitionSchema.safeParse(merged);
  if (!parsed.success) {
    throw new InvalidInputError(`Invalid workflow definition: ${parsed.error.message}`);
  }
  const validated = parsed.data;

  // Validate initialState exists in states
  const stateNames = validated.states.map(s => s.name);
  if (!stateNames.includes(validated.initialState)) {
    throw new InvalidInputError(
      `initialState "${validated.initialState}" is not in the states list`
    );
  }

  // Validate transitions reference declared states
  for (const t of validated.transitions) {
    if (!stateNames.includes(t.fromStatus)) {
      throw new InvalidInputError(`Transition fromStatus "${t.fromStatus}" is not a declared state`);
    }
    if (!stateNames.includes(t.toStatus)) {
      throw new InvalidInputError(`Transition toStatus "${t.toStatus}" is not a declared state`);
    }
  }

  // Safety check: existing instances must not be in a removed state
  const allInstances = await getWorkflowInstances(workspaceId, validated.targetObject);
  const activeInstances = allInstances.filter(i => i.workflowId === workflowId);
  for (const inst of activeInstances) {
    if (!stateNames.includes(inst.currentState)) {
      throw new InvalidInputError(
        `Cannot remove state "${inst.currentState}": workflow instance "${inst.id}" is currently in this state`
      );
    }
  }

  const ts = now();
  await execute(
    `UPDATE ${TABLES.workflowDefinitions}
     SET name = ?, target_object = ?, definition_json = ?, updated_at = ?
     WHERE workspace_id = ? AND workflow_id = ?`,
    [validated.name, validated.targetObject, JSON.stringify(validated), ts, workspaceId, workflowId]
  );

  return validated;
}

// ── Workflow Instance Lifecycle ──

export async function startWorkflow(
  workspaceId: string,
  workflowId: string,
  objectType: string,
  recordId: string,
  actor: WorkflowActor,
  options?: { overrideState?: string; skipSync?: boolean }
): Promise<WorkflowInstance> {
  const def = await getWorkflowDefinition(workspaceId, workflowId);
  if (!def) {
    throw new NotFoundError(`Workflow definition "${workflowId}" not found`);
  }

  // Verify object_type matches the workflow's targetObject
  if (def.targetObject !== objectType) {
    throw new InvalidInputError(
      `Workflow "${workflowId}" targets object "${def.targetObject}", got "${objectType}"`
    );
  }

  // Use overrideState if provided (e.g. demo data seeding where records
  // already have a state value that should be preserved), otherwise use
  // the definition's initialState.
  const startState = options?.overrideState ?? def.initialState;

  // Validate that the overrideState is a declared state
  if (options?.overrideState && !def.states.some(s => s.name === options.overrideState)) {
    throw new InvalidInputError(
      `overrideState "${options.overrideState}" is not a declared state in workflow "${workflowId}"`
    );
  }

  const id = genId("wfi");
  const ts = now();
  const instance: WorkflowInstance = {
    id,
    workspaceId,
    workflowId,
    objectType,
    recordId,
    currentState: startState,
    history: [],
    createdAt: ts,
    updatedAt: ts,
  };

  await execute(
    `INSERT INTO ${TABLES.workflowInstances}
     (id, workspace_id, workflow_id, object_type, record_id, current_state, history_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      workflowId,
      objectType,
      recordId,
      instance.currentState,
      JSON.stringify(instance.history),
      ts,
      ts,
    ]
  );

  // Auto-sync initial state to the record's stateField (v0.4).
  // Skip when overrideState is used (record already has the correct value)
  // or when skipSync is explicitly requested.
  if (def.stateField && !options?.skipSync && !options?.overrideState) {
    try {
      const existing = await getRecord(workspaceId, objectType, recordId);
      const currentVal = existing?.[def.stateField];
      if (currentVal !== def.initialState) {
        await updateRecord(workspaceId, objectType, recordId, {
          [def.stateField]: def.initialState,
        });
      }
    } catch (err) {
      console.error("[workflow] Failed to sync initial state to record:", err);
    }
  }

  // Audit: workflow.start
  writeAuditEvent({
    workspaceId,
    actorType: actor.type as "user" | "api_key" | "system" | "agent",
    actorId: actor.id,
    action: "workflow.start",
    entityType: "workflow_instance",
    entityId: id,
    after: {
      workflowId,
      objectType,
      recordId,
      initialState: instance.currentState,
    },
  }).catch((err) => {
    console.error("[audit] Failed to write workflow.start audit event:", err);
  });

  return instance;
}

export async function getWorkflowInstance(
  workspaceId: string,
  instanceId: string
): Promise<WorkflowInstance | undefined> {
  const row = await queryOne<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstances}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, instanceId]
  );
  if (!row) return undefined;
  return mapInstanceRow(row);
}

export async function getWorkflowInstances(
  workspaceId: string,
  objectType?: string,
  recordId?: string,
  status?: string
): Promise<WorkflowInstance[]> {
  const conditions: string[] = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (objectType) {
    conditions.push("object_type = ?");
    args.push(objectType);
  }
  if (recordId) {
    conditions.push("record_id = ?");
    args.push(recordId);
  }
  if (status) {
    conditions.push("current_state = ?");
    args.push(status);
  }

  const rows = await queryAll<WorkflowInstanceRow>(
    `SELECT * FROM ${TABLES.workflowInstances}
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    args
  );
  return rows.map(mapInstanceRow);
}

// ── Transition Execution ──

export async function transitionWorkflow(
  workspaceId: string,
  instanceId: string,
  transitionId: string,
  actor: WorkflowActor,
  comment?: string
): Promise<WorkflowInstance> {
  const instance = await getWorkflowInstance(workspaceId, instanceId);
  if (!instance) {
    throw new NotFoundError(`Workflow instance "${instanceId}" not found`);
  }

  const def = await getWorkflowDefinition(workspaceId, instance.workflowId);
  if (!def) {
    throw new NotFoundError(
      `Workflow definition "${instance.workflowId}" not found (deleted?)`
    );
  }

  // Find the transition by matching fromStatus + toStatus (transitionId is "fromStatus->toStatus")
  // or by label. We support both "fromStatus->toStatus" and the label as the transitionId.
  const transition = findTransition(def.transitions, transitionId, instance.currentState);
  if (!transition) {
    throw new InvalidInputError(
      `Transition "${transitionId}" not found from state "${instance.currentState}"`
    );
  }

  // Validate fromStatus matches current state
  if (transition.fromStatus !== instance.currentState) {
    throw new InvalidInputError(
      `Transition requires fromStatus "${transition.fromStatus}", but instance is in "${instance.currentState}"`
    );
  }

  // Validate actor role
  if (!roleAllows(actor.role, transition.requiredRole)) {
    throw new AuthorizationError(
      `Transition requires role "${transition.requiredRole}", actor has "${actor.role}"`
    );
  }

  // If transition requires approval, the actor must be an approver (admin or above).
  // For our basic runtime, we treat requiresApproval as requiring admin role implicitly
  // (in addition to requiredRole). The check above already enforces requiredRole; if
  // requiresApproval is true and requiredRole was set lower than admin, we still require admin.
  if (transition.requiresApproval && !roleAllows(actor.role, "admin")) {
    throw new AuthorizationError(
      `Transition requires approval; admin role required`
    );
  }

  // Enforce transition conditions (v0.3.5): if the transition declares conditions,
  // fetch the bound record and evaluate them. Conditions that reference fields the
  // record does not have are treated as failing.
  if (transition.conditions && transition.conditions.length > 0) {
    const record = await getRecord(workspaceId, instance.objectType, instance.recordId);
    if (!record) {
      throw new InvalidInputError(
        `Transition conditions cannot be evaluated: bound record "${instance.recordId}" of "${instance.objectType}" not found`
      );
    }
    if (!evaluateConditions(record, transition.conditions)) {
      throw new InvalidInputError(
        `Transition conditions not met for "${transition.label}"`
      );
    }
  }

  // Append to history and update state
  const event: WorkflowTransitionEvent = {
    fromStatus: transition.fromStatus,
    toStatus: transition.toStatus,
    transitionLabel: transition.label,
    actorId: actor.id,
    actorType: actor.type,
    comment: comment ?? null,
    timestamp: now(),
  };

  const newHistory = [...instance.history, event];
  const ts = event.timestamp;

  await batch([
    {
      sql: `UPDATE ${TABLES.workflowInstances}
            SET current_state = ?, history_json = ?, updated_at = ?
            WHERE workspace_id = ? AND id = ?`,
      args: [
        transition.toStatus,
        JSON.stringify(newHistory),
        ts,
        workspaceId,
        instanceId,
      ],
    },
  ]);

  // Auto-sync state to the record's stateField (v0.4).
  // After a successful transition, if the workflow definition declares a
  // stateField, update the bound record so the record's field reflects the
  // new workflow state. This is the core of the "workflow-driven field" design:
  // the workflow instance is the single source of truth, and the record field
  // is a reflection of it.
  if (def.stateField) {
    try {
      await updateRecord(workspaceId, instance.objectType, instance.recordId, {
        [def.stateField]: transition.toStatus,
      });
    } catch (err) {
      // Best-effort: the transition itself already succeeded. Log the error
      // but do not roll back the state change.
      console.error("[workflow] Failed to sync state to record field:", err);
    }
  }

  // Audit: workflow.transition (or workflow.approve for approval transitions)
  const auditAction = transition.requiresApproval ? "workflow.approve" : "workflow.transition";
  writeAuditEvent({
    workspaceId,
    actorType: actor.type as "user" | "api_key" | "system" | "agent",
    actorId: actor.id,
    action: auditAction,
    entityType: "workflow_instance",
    entityId: instanceId,
    before: {
      state: instance.currentState,
      workflowId: instance.workflowId,
      objectType: instance.objectType,
      recordId: instance.recordId,
    },
    after: {
      state: transition.toStatus,
      transitionLabel: transition.label,
      comment: comment ?? null,
    },
  }).catch((err) => {
    console.error("[audit] Failed to write workflow transition audit event:", err);
  });

  // Execute system action if declared (v0.3.5).
  // Failures are recorded as audit events but do not roll back the state change —
  // the transition itself already succeeded. This matches the spec's "system action
  // step" semantics: the state move is the source of truth, side effects are best-effort.
  if (transition.systemAction) {
    try {
      await executeSystemAction(workspaceId, instance, transition, actor);
    } catch (err) {
      writeAuditEvent({
        workspaceId,
        actorType: "system",
        actorId: "workflow-runtime",
        action: "workflow.system_action",
        entityType: "workflow_instance",
        entityId: instanceId,
        after: {
          transitionLabel: transition.label,
          systemActionType: transition.systemAction.type,
          error: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => {
        // best-effort audit
      });
    }
  }

  return {
    ...instance,
    currentState: transition.toStatus,
    history: newHistory,
    updatedAt: ts,
  };
}

function findTransition(
  transitions: WorkflowTransition[],
  transitionId: string,
  currentState: string
): WorkflowTransition | undefined {
  // Match by canonical id "fromStatus->toStatus"
  const byCanonical = transitions.find(
    t => `${t.fromStatus}->${t.toStatus}` === transitionId
  );
  if (byCanonical) return byCanonical;

  // Match by label (only valid if fromStatus matches currentState)
  const byLabel = transitions.find(
    t => t.label === transitionId && t.fromStatus === currentState
  );
  if (byLabel) return byLabel;

  // Match by toStatus (only valid if fromStatus matches currentState)
  const byToStatus = transitions.find(
    t => t.toStatus === transitionId && t.fromStatus === currentState
  );
  return byToStatus;
}

// ── Available Transitions ──

export async function getAvailableTransitions(
  workspaceId: string,
  instanceId: string,
  actorRole: WorkspaceRole
): Promise<WorkflowTransition[]> {
  const instance = await getWorkflowInstance(workspaceId, instanceId);
  if (!instance) {
    throw new NotFoundError(`Workflow instance "${instanceId}" not found`);
  }

  const def = await getWorkflowDefinition(workspaceId, instance.workflowId);
  if (!def) {
    throw new NotFoundError(
      `Workflow definition "${instance.workflowId}" not found (deleted?)`
    );
  }

  // Return transitions whose fromStatus matches current state AND actor role is sufficient
  return def.transitions.filter(
    t => t.fromStatus === instance.currentState && roleAllows(actorRole, t.requiredRole)
  );
}

// ── Condition Evaluation ──

export function evaluateConditions(
  record: Record<string, unknown>,
  conditions: WorkflowCondition[]
): boolean {
  if (!conditions || conditions.length === 0) return true;
  for (const cond of conditions) {
    const actual = record[cond.field];
    if (!evaluateCondition(actual, cond.operator, cond.value)) {
      return false;
    }
  }
  return true;
}

function evaluateCondition(
  actual: unknown,
  operator: WorkflowCondition["operator"],
  expected: WorkflowCondition["value"]
): boolean {
  switch (operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.includes(expected);
      }
      if (Array.isArray(actual) && typeof expected === "string") {
        return actual.includes(expected);
      }
      return false;
    case "in":
      if (Array.isArray(expected)) {
        return expected.includes(actual as string);
      }
      return false;
    default:
      return false;
  }
}

// ── Record-Workflow Helpers (v0.4) ──

/**
 * Find the workflow instance bound to a specific record.
 * Returns the most recent instance along with its definition.
 * If multiple workflows target the same object, returns the first (most recent).
 */
export async function getRecordWorkflow(
  workspaceId: string,
  objectType: string,
  recordId: string
): Promise<{ instance: WorkflowInstance; definition: WorkflowDefinition } | undefined> {
  const instances = await getWorkflowInstances(workspaceId, objectType, recordId);
  if (instances.length === 0) return undefined;

  const instance = instances[0];
  const definition = await getWorkflowDefinition(workspaceId, instance.workflowId);
  if (!definition) return undefined;

  return { instance, definition };
}

/**
 * Find workflow definitions that should auto-start for a given object.
 * Used by the record creation API to automatically start workflow instances.
 */
export async function getAutoStartWorkflowDefinitions(
  workspaceId: string,
  objectKey: string
): Promise<WorkflowDefinition[]> {
  const all = await getWorkflowDefinitions(workspaceId);
  return all.filter(d => d.autoStart && d.targetObject === objectKey);
}

/**
 * Check if a state is terminal (no further transitions expected).
 * Terminal state types: approved, rejected, final.
 */
export function isTerminalState(
  definition: WorkflowDefinition,
  stateName: string
): boolean {
  const state = definition.states.find(s => s.name === stateName);
  if (!state) return false;
  return state.type === "approved" || state.type === "rejected" || state.type === "final";
}

// ── Helpers ──

/**
 * Find workflow instances that are pending approval (current state has a
 * transition requiring approval that hasn't been executed yet).
 */
export async function getPendingApprovals(
  workspaceId: string
): Promise<Array<WorkflowInstance & { definition: WorkflowDefinition }>> {
  const instances = await getWorkflowInstances(workspaceId);
  const result: Array<WorkflowInstance & { definition: WorkflowDefinition }> = [];

  for (const instance of instances) {
    const def = await getWorkflowDefinition(workspaceId, instance.workflowId);
    if (!def) continue;

    // Check if any transition from the current state requires approval
    const hasPendingApproval = def.transitions.some(
      t => t.fromStatus === instance.currentState && t.requiresApproval
    );

    if (hasPendingApproval) {
      result.push({ ...instance, definition: def });
    }
  }

  return result;
}

// ── System Action Execution (v0.3.5) ──

/**
 * Resolve a template string by substituting {{record.fieldKey}} placeholders
 * with values from the bound record. Unknown placeholders are left as-is.
 */
function resolveTemplate(template: string, record: Record<string, unknown>): string {
  return template.replace(/\{\{record\.([a-zA-Z0-9_]+)\}\}/g, (_match, fieldKey: string) => {
    const value = record[fieldKey];
    return value === null || value === undefined ? "" : String(value);
  });
}

function resolveFieldsMap(
  fields: Record<string, unknown>,
  record: Record<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") {
      resolved[key] = resolveTemplate(value, record);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Execute a transition's declared system action against the bound record
 * (or a related object). Called after the state change has been persisted.
 */
async function executeSystemAction(
  workspaceId: string,
  instance: WorkflowInstance,
  transition: WorkflowTransition,
  actor: WorkflowActor
): Promise<void> {
  const action = transition.systemAction;
  if (!action) return;

  // Fetch the bound record for template resolution
  const record = await getRecord(workspaceId, instance.objectType, instance.recordId);
  const recordData = record ?? {};

  switch (action.type) {
    case "create_task": {
      const targetObject = action.targetObject ?? "task";
      const title = action.title ? resolveTemplate(action.title, recordData) : `Workflow task: ${transition.label}`;
      const description = action.description ? resolveTemplate(action.description, recordData) : null;
      const taskData: Record<string, unknown> = {
        title,
        ...(description ? { description } : {}),
      };
      // Link to the source record if the task object supports it
      if (targetObject === "task") {
        taskData[`${instance.objectType}_id`] = instance.recordId;
      }
      await createRecord(workspaceId, targetObject, taskData);

      writeAuditEvent({
        workspaceId,
        actorType: "system",
        actorId: "workflow-runtime",
        action: "workflow.system_action",
        entityType: "workflow_instance",
        entityId: instance.id,
        after: {
          transitionLabel: transition.label,
          systemActionType: "create_task",
          targetObject,
          title,
          triggeredBy: actor.id,
        },
      }).catch(() => {
        // best-effort audit
      });
      break;
    }

    case "update_record":
    case "set_field": {
      const targetObject = action.targetObject ?? instance.objectType;
      const targetRecordId = action.targetObject ? instance.recordId : instance.recordId;
      if (action.fields) {
        const resolved = resolveFieldsMap(action.fields, recordData);
        await updateRecord(workspaceId, targetObject, targetRecordId, resolved);
      }

      writeAuditEvent({
        workspaceId,
        actorType: "system",
        actorId: "workflow-runtime",
        action: "workflow.system_action",
        entityType: "workflow_instance",
        entityId: instance.id,
        after: {
          transitionLabel: transition.label,
          systemActionType: action.type,
          targetObject,
          targetRecordId,
          fields: action.fields ?? {},
          triggeredBy: actor.id,
        },
      }).catch(() => {
        // best-effort audit
      });
      break;
    }

    case "send_notification": {
      const message = action.message ? resolveTemplate(action.message, recordData) : `Workflow notification: ${transition.label}`;
      writeAuditEvent({
        workspaceId,
        actorType: "system",
        actorId: "workflow-runtime",
        action: "workflow.system_action",
        entityType: "workflow_instance",
        entityId: instance.id,
        after: {
          transitionLabel: transition.label,
          systemActionType: "send_notification",
          message,
          triggeredBy: actor.id,
        },
      }).catch(() => {
        // best-effort audit
      });
      // Notification delivery (email/in-app) is a future concern; for now we
      // record the intent as an audit event so it is visible in the audit surface.
      break;
    }

    default:
      // Unknown action types are silently ignored to preserve forward compatibility
      break;
  }
}
