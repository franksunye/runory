import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import {
  InvalidInputError,
  NotFoundError,
  type WorkspaceRole,
} from "./context";
import { getRecord, createRecord, updateRecord } from "./metadata";
import { writeAuditEvent } from "./audit-service";
import { evaluateConditions as evaluateWorkflowConditions } from "./workflow";
import type {
  AutomationDefinition,
  AutomationAction,
} from "@runory/contracts";
import { automationDefinitionSchema } from "@runory/contracts";

// ── Types ──

export interface AutomationRun {
  id: string;
  workspaceId: string;
  automationId: string;
  triggerType: string;
  triggerPayload: Record<string, unknown> | null;
  status: "success" | "failed" | "skipped" | "dry_run";
  errorMessage: string | null;
  actionsTaken: AutomationActionTaken[];
  dryRun: boolean;
  startedAt: string;
  completedAt: string | null;
}

export interface AutomationActionTaken {
  actionType: string;
  targetObject: string | null;
  result: Record<string, unknown>;
  error: string | null;
}

export interface AutomationDefinitionInfo {
  id: string;
  workspaceId: string;
  automationId: string;
  name: string;
  definition: AutomationDefinition;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Row Types ──

interface AutomationDefinitionRow {
  id: string;
  workspace_id: string;
  automation_id: string;
  name: string;
  definition_json: string;
  enabled: number;
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
  updated_at: string;
}

interface AutomationRunRow {
  id: string;
  workspace_id: string;
  automation_id: string;
  trigger_type: string;
  trigger_payload_json: string | null;
  status: string;
  error_message: string | null;
  actions_taken_json: string;
  dry_run: number;
  started_at: string;
  completed_at: string | null;
}

// ── Mappers ──

function mapDefinitionRow(row: AutomationDefinitionRow): AutomationDefinitionInfo {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    automationId: row.automation_id,
    name: row.name,
    definition: JSON.parse(row.definition_json) as AutomationDefinition,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRunRow(row: AutomationRunRow): AutomationRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    automationId: row.automation_id,
    triggerType: row.trigger_type,
    triggerPayload: row.trigger_payload_json ? JSON.parse(row.trigger_payload_json) : null,
    status: row.status as AutomationRun["status"],
    errorMessage: row.error_message,
    actionsTaken: JSON.parse(row.actions_taken_json) as AutomationActionTaken[],
    dryRun: row.dry_run === 1,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

// ── CRUD ──

export async function createAutomation(
  workspaceId: string,
  def: AutomationDefinition,
  actorId: string
): Promise<AutomationDefinitionInfo> {
  const parsed = automationDefinitionSchema.safeParse(def);
  if (!parsed.success) {
    throw new InvalidInputError(`Invalid automation definition: ${parsed.error.message}`);
  }
  const validated = parsed.data;

  // Validate trigger-specific fields
  if (validated.trigger.type === "record_field_changed" && !validated.trigger.fieldKey) {
    throw new InvalidInputError("record_field_changed trigger requires fieldKey");
  }
  if (validated.trigger.type === "schedule" && !validated.trigger.cron) {
    throw new InvalidInputError("schedule trigger requires cron expression");
  }

  const id = genId("auto");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.automationDefinitions}
     (id, workspace_id, automation_id, name, definition_json, enabled, last_run_at, last_run_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    [
      id,
      workspaceId,
      validated.id,
      validated.name,
      JSON.stringify(validated),
      validated.enabled ? 1 : 0,
      ts,
      ts,
    ]
  );

  writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId,
    action: "automation.create",
    entityType: "automation_definition",
    entityId: id,
    after: validated as unknown as Record<string, unknown>,
  }).catch((err) => {
    console.error("[audit] Failed to write automation.create audit event:", err);
  });

  return {
    id,
    workspaceId,
    automationId: validated.id,
    name: validated.name,
    definition: validated,
    enabled: validated.enabled,
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

export async function getAutomations(
  workspaceId: string
): Promise<AutomationDefinitionInfo[]> {
  const rows = await queryAll<AutomationDefinitionRow>(
    `SELECT * FROM ${TABLES.automationDefinitions} WHERE workspace_id = ? ORDER BY created_at`,
    [workspaceId]
  );
  return rows.map(mapDefinitionRow);
}

export async function getAutomation(
  workspaceId: string,
  automationId: string
): Promise<AutomationDefinitionInfo | undefined> {
  const row = await queryOne<AutomationDefinitionRow>(
    `SELECT * FROM ${TABLES.automationDefinitions}
     WHERE workspace_id = ? AND automation_id = ?`,
    [workspaceId, automationId]
  );
  if (!row) return undefined;
  return mapDefinitionRow(row);
}

export async function updateAutomation(
  workspaceId: string,
  automationId: string,
  updates: Partial<AutomationDefinition>,
  actorId: string
): Promise<AutomationDefinitionInfo | undefined> {
  const existing = await getAutomation(workspaceId, automationId);
  if (!existing) return undefined;

  const merged: AutomationDefinition = {
    ...existing.definition,
    ...updates,
    trigger: updates.trigger ?? existing.definition.trigger,
    conditions: updates.conditions ?? existing.definition.conditions,
    actions: updates.actions ?? existing.definition.actions,
  };

  const parsed = automationDefinitionSchema.safeParse(merged);
  if (!parsed.success) {
    throw new InvalidInputError(`Invalid automation definition: ${parsed.error.message}`);
  }

  const ts = now();
  await execute(
    `UPDATE ${TABLES.automationDefinitions}
     SET name = ?, definition_json = ?, updated_at = ?
     WHERE workspace_id = ? AND automation_id = ?`,
    [
      parsed.data.name,
      JSON.stringify(parsed.data),
      ts,
      workspaceId,
      automationId,
    ]
  );

  writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId,
    action: "automation.update",
    entityType: "automation_definition",
    entityId: existing.id,
    before: existing.definition as unknown as Record<string, unknown>,
    after: parsed.data as unknown as Record<string, unknown>,
  }).catch((err) => {
    console.error("[audit] Failed to write automation.update audit event:", err);
  });

  return {
    ...existing,
    name: parsed.data.name,
    definition: parsed.data,
    updatedAt: ts,
  };
}

export async function deleteAutomation(
  workspaceId: string,
  automationId: string,
  actorId: string
): Promise<boolean> {
  const existing = await getAutomation(workspaceId, automationId);
  if (!existing) return false;

  await execute(
    `DELETE FROM ${TABLES.automationDefinitions}
     WHERE workspace_id = ? AND automation_id = ?`,
    [workspaceId, automationId]
  );

  writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId,
    action: "automation.delete",
    entityType: "automation_definition",
    entityId: existing.id,
    before: existing.definition as unknown as Record<string, unknown>,
  }).catch((err) => {
    console.error("[audit] Failed to write automation.delete audit event:", err);
  });

  return true;
}

export async function setAutomationEnabled(
  workspaceId: string,
  automationId: string,
  enabled: boolean,
  actorId: string
): Promise<AutomationDefinitionInfo | undefined> {
  const existing = await getAutomation(workspaceId, automationId);
  if (!existing) return undefined;

  const ts = now();
  await execute(
    `UPDATE ${TABLES.automationDefinitions}
     SET enabled = ?, updated_at = ?
     WHERE workspace_id = ? AND automation_id = ?`,
    [enabled ? 1 : 0, ts, workspaceId, automationId]
  );

  writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId,
    action: enabled ? "automation.enable" : "automation.disable",
    entityType: "automation_definition",
    entityId: existing.id,
    after: { enabled },
  }).catch((err) => {
    console.error("[audit] Failed to write automation enable/disable audit event:", err);
  });

  return { ...existing, enabled, updatedAt: ts };
}

// ── Dry Run / Preview ──

export interface DryRunResult {
  automationId: string;
  wouldFire: boolean;
  reason: string | null;
  actionsPreview: Array<{
    actionType: string;
    targetObject: string | null;
    description: string;
  }>;
}

/**
 * Preview what an automation would do given a hypothetical trigger payload.
 * Does not execute any actions or create any records.
 */
export async function dryRunAutomation(
  workspaceId: string,
  automationId: string,
  triggerPayload: Record<string, unknown>
): Promise<DryRunResult> {
  const auto = await getAutomation(workspaceId, automationId);
  if (!auto) {
    throw new NotFoundError(`Automation "${automationId}" not found`);
  }

  const def = auto.definition;
  const record = (triggerPayload.record as Record<string, unknown>) ?? triggerPayload;

  // Evaluate conditions
  const conditionsMet = evaluateWorkflowConditions(
    record,
    def.conditions as unknown as Parameters<typeof evaluateWorkflowConditions>[1]
  );

  if (!conditionsMet) {
    return {
      automationId,
      wouldFire: false,
      reason: "Conditions not met",
      actionsPreview: [],
    };
  }

  const actionsPreview = def.actions.map(action => ({
    actionType: action.type,
    targetObject: action.targetObject ?? null,
    description: describeAction(action, record),
  }));

  return {
    automationId,
    wouldFire: true,
    reason: null,
    actionsPreview,
  };
}

function describeAction(action: AutomationAction, record: Record<string, unknown>): string {
  switch (action.type) {
    case "create_task":
      return `Create task: ${resolveTemplate(action.title ?? "Untitled", record)}`;
    case "update_record":
      return `Update ${action.targetObject ?? "record"} fields: ${Object.keys(action.fields ?? {}).join(", ")}`;
    case "set_field":
      return `Set ${action.targetObject ?? "record"} fields: ${Object.keys(action.fields ?? {}).join(", ")}`;
    case "send_notification":
      return `Send notification: ${resolveTemplate(action.message ?? "", record)}`;
    case "transition_workflow":
      return `Transition workflow ${action.workflowId ?? ""} via ${action.transitionId ?? ""}`;
    default:
      return `Unknown action: ${action.type}`;
  }
}

// ── Execution ──

/**
 * Execute an automation against a trigger payload. If dryRun is true, no
 * side effects are performed; only a preview is recorded.
 */
export async function runAutomation(
  workspaceId: string,
  automationId: string,
  triggerType: string,
  triggerPayload: Record<string, unknown>,
  options?: { dryRun?: boolean; actorId?: string }
): Promise<AutomationRun> {
  const auto = await getAutomation(workspaceId, automationId);
  if (!auto) {
    throw new NotFoundError(`Automation "${automationId}" not found`);
  }

  const dryRun = options?.dryRun ?? false;
  const actorId = options?.actorId ?? "automation-runtime";
  const def = auto.definition;
  const record = (triggerPayload.record as Record<string, unknown>) ?? triggerPayload;
  const runId = genId("arun");
  const startedAt = now();

  // Evaluate conditions
  const conditionsMet = evaluateWorkflowConditions(
    record,
    def.conditions as unknown as Parameters<typeof evaluateWorkflowConditions>[1]
  );

  if (!conditionsMet) {
    const run: AutomationRun = {
      id: runId,
      workspaceId,
      automationId,
      triggerType,
      triggerPayload,
      status: "skipped",
      errorMessage: "Conditions not met",
      actionsTaken: [],
      dryRun,
      startedAt,
      completedAt: now(),
    };
    await persistRun(run);
    return run;
  }

  if (dryRun) {
    const actionsTaken = def.actions.map(action => ({
      actionType: action.type,
      targetObject: action.targetObject ?? null,
      result: { description: describeAction(action, record) },
      error: null,
    }));
    const run: AutomationRun = {
      id: runId,
      workspaceId,
      automationId,
      triggerType,
      triggerPayload,
      status: "dry_run",
      errorMessage: null,
      actionsTaken,
      dryRun: true,
      startedAt,
      completedAt: now(),
    };
    await persistRun(run);
    return run;
  }

  // Execute actions
  const actionsTaken: AutomationActionTaken[] = [];
  let hasError = false;
  let errorMessage: string | null = null;

  for (const action of def.actions) {
    try {
      const result = await executeAction(workspaceId, action, record, actorId);
      actionsTaken.push({
        actionType: action.type,
        targetObject: action.targetObject ?? null,
        result,
        error: null,
      });
    } catch (err) {
      hasError = true;
      errorMessage = err instanceof Error ? err.message : String(err);
      actionsTaken.push({
        actionType: action.type,
        targetObject: action.targetObject ?? null,
        result: {},
        error: errorMessage,
      });
      break; // Stop on first error
    }
  }

  const status: AutomationRun["status"] = hasError ? "failed" : "success";
  const completedAt = now();

  const run: AutomationRun = {
    id: runId,
    workspaceId,
    automationId,
    triggerType,
    triggerPayload,
    status,
    errorMessage,
    actionsTaken,
    dryRun: false,
    startedAt,
    completedAt,
  };

  await persistRun(run);

  // Update last run info on the definition
  await execute(
    `UPDATE ${TABLES.automationDefinitions}
     SET last_run_at = ?, last_run_status = ?
     WHERE workspace_id = ? AND automation_id = ?`,
    [completedAt, status, workspaceId, automationId]
  );

  // Audit
  writeAuditEvent({
    workspaceId,
    actorType: "system",
    actorId,
    action: status === "failed" ? "automation.run_fail" : "automation.run",
    entityType: "automation_definition",
    entityId: auto.id,
    after: {
      automationId,
      runId,
      status,
      actionsCount: actionsTaken.length,
      triggerType,
    },
  }).catch((err) => {
    console.error("[audit] Failed to write automation.run audit event:", err);
  });

  return run;
}

async function persistRun(run: AutomationRun): Promise<void> {
  await execute(
    `INSERT INTO ${TABLES.automationRuns}
     (id, workspace_id, automation_id, trigger_type, trigger_payload_json, status, error_message, actions_taken_json, dry_run, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.id,
      run.workspaceId,
      run.automationId,
      run.triggerType,
      run.triggerPayload ? JSON.stringify(run.triggerPayload) : null,
      run.status,
      run.errorMessage,
      JSON.stringify(run.actionsTaken),
      run.dryRun ? 1 : 0,
      run.startedAt,
      run.completedAt,
    ]
  );
}

// ── Run History ──

export async function getAutomationRuns(
  workspaceId: string,
  automationId?: string,
  limit = 50
): Promise<AutomationRun[]> {
  const conditions = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (automationId) {
    conditions.push("automation_id = ?");
    args.push(automationId);
  }

  args.push(limit);

  const rows = await queryAll<AutomationRunRow>(
    `SELECT * FROM ${TABLES.automationRuns}
     WHERE ${conditions.join(" AND ")}
     ORDER BY started_at DESC LIMIT ?`,
    args
  );
  return rows.map(mapRunRow);
}

// ── Action Execution ──

async function executeAction(
  workspaceId: string,
  action: AutomationAction,
  record: Record<string, unknown>,
  actorId: string
): Promise<Record<string, unknown>> {
  switch (action.type) {
    case "create_task": {
      const targetObject = action.targetObject ?? "task";
      const title = resolveTemplate(action.title ?? "Automation task", record);
      const description = action.description ? resolveTemplate(action.description, record) : null;
      const taskData: Record<string, unknown> = {
        title,
        ...(description ? { description } : {}),
      };
      const created = await createRecord(workspaceId, targetObject, taskData);
      return { recordId: created.id, title };
    }

    case "update_record":
    case "set_field": {
      const targetObject = action.targetObject ?? "task";
      const targetRecordId = (record.id as string) ?? "";
      if (!targetRecordId) {
        throw new InvalidInputError(
          `${action.type} requires a record id in the trigger payload`
        );
      }
      if (action.fields) {
        const resolved = resolveFieldsMap(action.fields, record);
        await updateRecord(workspaceId, targetObject, targetRecordId, resolved);
        return { updatedFields: Object.keys(resolved) };
      }
      return { updatedFields: [] };
    }

    case "send_notification": {
      const message = resolveTemplate(action.message ?? "", record);
      // Notification delivery is a future concern; record the intent via audit
      writeAuditEvent({
        workspaceId,
        actorType: "system",
        actorId,
        action: "automation.run",
        entityType: "notification",
        entityId: genId("notif"),
        after: { message, source: "automation" },
      }).catch(() => {
        // best-effort
      });
      return { message };
    }

    case "transition_workflow": {
      // Workflow transition from automation is recorded but requires the
      // workflow runtime to be invoked. For MVP we record the intent;
      // full integration with workflow instances is a follow-up.
      return {
        workflowId: action.workflowId,
        transitionId: action.transitionId,
        note: "Workflow transition queued (full integration pending)",
      };
    }

    default:
      throw new InvalidInputError(`Unknown action type: ${action.type}`);
  }
}

// ── Template Helpers ──

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

// ── Trigger Matching ──

/**
 * Find automations that should fire for a given record event.
 * Used by the record lifecycle to invoke automations on create/update.
 */
export async function findAutomationsForRecordEvent(
  workspaceId: string,
  eventType: "record_created" | "record_updated" | "record_field_changed",
  objectType: string,
  fieldKey?: string
): Promise<AutomationDefinitionInfo[]> {
  const rows = await queryAll<AutomationDefinitionRow>(
    `SELECT * FROM ${TABLES.automationDefinitions}
     WHERE workspace_id = ? AND enabled = 1
     ORDER BY created_at`,
    [workspaceId]
  );

  return rows
    .map(mapDefinitionRow)
    .filter(info => {
      const trigger = info.definition.trigger;
      if (trigger.type !== eventType) return false;
      if (trigger.targetObject && trigger.targetObject !== objectType) return false;
      if (eventType === "record_field_changed") {
        if (trigger.fieldKey && trigger.fieldKey !== fieldKey) return false;
      }
      return true;
    });
}
