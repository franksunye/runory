import { queryAll, queryOne, execute, batch, genId, now } from "./db";
import { TABLES } from "./contracts";
import {
  InvalidInputError,
  NotFoundError,
  AuthorizationError,
  type WorkspaceRole,
} from "./context";
import { roleAllows } from "./tenancy";
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

// ── Workflow Instance Lifecycle ──

export async function startWorkflow(
  workspaceId: string,
  workflowId: string,
  objectType: string,
  recordId: string,
  actor: WorkflowActor
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

  const id = genId("wfi");
  const ts = now();
  const instance: WorkflowInstance = {
    id,
    workspaceId,
    workflowId,
    objectType,
    recordId,
    currentState: def.initialState,
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
