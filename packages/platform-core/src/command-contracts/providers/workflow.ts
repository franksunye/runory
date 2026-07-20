import { TABLES } from "../../contracts";
import { genId, queryOne } from "../../db";
import { commandContractError } from "../errors";
import { registerCommandEffectProvider } from "../registry";
import { assertEffectCardinality } from "./cardinality";

interface StartWorkflowProcessEffectInput {
  workflowKey: string;
  instanceId: string;
  workItemId: string;
}

function parseStartWorkflowProcessEffectInput(
  commandType: string,
  input: unknown,
): StartWorkflowProcessEffectInput {
  const invalid = (): never => {
    throw commandContractError(
      `${commandType} did not provide a valid effect input for workflow.start_process.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  for (const key of ["workflowKey", "instanceId", "workItemId"]) {
    if (typeof value[key] !== "string" || value[key] === "") invalid();
  }
  return value as unknown as StartWorkflowProcessEffectInput;
}

registerCommandEffectProvider({
  capability: "workflow.start_process",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement, effectInput }) => {
    const input = parseStartWorkflowProcessEffectInput(envelope.commandType, effectInput);
    assertEffectCardinality(envelope.commandType, requirement, 1, "Workflow start request(s)");
    const definition = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.workflowDefinitions}
       WHERE workspace_id = ? AND workflow_id = ?`,
      [envelope.workspaceId, input.workflowKey],
    );
    if (!definition) {
      throw commandContractError(
        `${envelope.commandType} requires installed Workflow '${input.workflowKey}'.`,
      );
    }
    const version = await queryOne<{ id: string; definition_json: string }>(
      `SELECT id, definition_json FROM ${TABLES.workflowDefinitionVersions}
       WHERE workflow_definition_id = ? ORDER BY version_number DESC LIMIT 1`,
      [definition.id],
    );
    if (!version) {
      throw commandContractError(
        `${envelope.commandType} requires a published version of Workflow '${input.workflowKey}'.`,
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(version.definition_json);
    } catch {
      throw commandContractError(`Workflow '${input.workflowKey}' has invalid definition JSON.`);
    }
    if (!decoded || typeof decoded !== "object"
      || !Array.isArray((decoded as { steps?: unknown }).steps)) {
      throw commandContractError(`Workflow '${input.workflowKey}' has no executable steps.`);
    }
    type WorkflowStep = {
      id?: string;
      kind?: string;
      next?: string;
      command?: string;
      assigneeRule?: { permissionGroup?: string; userId?: string };
      formBindingId?: string;
    };
    const steps = (decoded as { steps: WorkflowStep[] }).steps;
    const start = steps.find((step) => step.kind === "start");
    let actionable = start?.next ? steps.find((step) => step.id === start.next) : undefined;
    if (actionable?.kind === "system_command" && actionable.command === envelope.commandType) {
      actionable = actionable.next
        ? steps.find((step) => step.id === actionable!.next)
        : undefined;
    }
    if (!actionable?.id || !["approval", "human_task"].includes(actionable.kind ?? "")) {
      throw commandContractError(
        `Workflow '${input.workflowKey}' does not lead ${envelope.commandType} to an actionable step.`,
      );
    }
    const assigneeRule = actionable.assigneeRule;
    const assigneeType = assigneeRule?.permissionGroup
      ? "permission_group"
      : assigneeRule?.userId ? "user" : null;
    const assigneeId = assigneeRule?.permissionGroup ?? assigneeRule?.userId ?? null;
    const ts = envelope.occurredAt;
    return {
      recordCount: 1,
      statements: [
        {
        sql: `INSERT INTO ${TABLES.workflowInstances}
              (id, workspace_id, workflow_definition_id, definition_version_id,
               object_type, record_id, status, current_step_id, version,
               started_by, started_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'running', ?, 1, ?, ?, ?, ?)`,
        args: [
          input.instanceId, envelope.workspaceId, definition.id, version.id,
          envelope.aggregateType, envelope.aggregateId, actionable.id,
          envelope.actor.id, ts, ts, ts,
        ],
        expectedRowsAffected: 1,
        },
        {
        sql: `INSERT INTO ${TABLES.workflowEvents}
              (id, workspace_id, instance_id, sequence, event_type, step_id,
               actor_type, actor_id, payload_json, occurred_at)
              VALUES (?, ?, ?, 1, 'workflow.started', ?, ?, ?, ?, ?)`,
        args: [
          genId("wfe"), envelope.workspaceId, input.instanceId, "start",
          envelope.actor.type, envelope.actor.id,
          JSON.stringify({
            workflowKey: input.workflowKey,
            objectType: envelope.aggregateType,
            recordId: envelope.aggregateId,
          }),
          ts,
        ],
        expectedRowsAffected: 1,
        },
        {
        sql: `INSERT INTO ${TABLES.workItems}
              (id, workspace_id, instance_id, step_id, kind, status,
               subject_type, subject_id, assignee_type, assignee_id,
               candidate_rule_json, form_binding_id, due_at, version, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
        args: [
          input.workItemId, envelope.workspaceId, input.instanceId, actionable.id,
          actionable.kind, envelope.aggregateType, envelope.aggregateId,
          assigneeType, assigneeId, assigneeRule ? JSON.stringify(assigneeRule) : null,
          actionable.formBindingId ?? null, ts, ts,
        ],
        expectedRowsAffected: 1,
        },
      ],
    };
  },
});
