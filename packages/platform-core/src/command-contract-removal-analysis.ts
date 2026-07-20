import {
  commandContractSchema,
  type CommandCapabilityProviderDeclaration,
} from "@runory/contracts";
import { TABLES } from "./contracts";
import { queryAll } from "./db";
import {
  commandEffectProviderMatches,
  type CommandContractSourceKind,
} from "./command-contracts";

export interface WorkspaceCommandContractRemovalCandidate {
  workspaceId: string;
  sourceKind: CommandContractSourceKind;
  sourceId: string;
  providedCapabilities?: CommandCapabilityProviderDeclaration[];
  ownedWorkflowIds?: string[];
  ignoredSourceKeys?: string[];
  ignoredWorkflowIds?: string[];
}

export interface WorkspaceCommandContractRemovalImpact {
  workspaceId: string;
  sourceKind: CommandContractSourceKind;
  sourceId: string;
  ownedCommandKeys: string[];
  capabilityConsumers: Array<{
    sourceKind: CommandContractSourceKind;
    sourceId: string;
    commandKey: string;
    capability: string;
  }>;
  workflowCommandConsumers: Array<{
    workflowId: string;
    commandKeys: string[];
  }>;
  automationWorkflowConsumers: Array<{
    automationId: string;
    workflowIds: string[];
  }>;
  retainedWorkflowInstances: Array<{
    workflowId: string;
    instanceCount: number;
  }>;
  unreadableConsumers: Array<{
    kind: "contract" | "workflow" | "automation";
    id: string;
  }>;
  canRemove: boolean;
}

function sourceKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function parseWorkflowCommandKeys(definitionJson: string): string[] {
  const decoded = JSON.parse(definitionJson) as {
    steps?: Array<{ kind?: string; command?: string }>;
  };
  if (!Array.isArray(decoded.steps)) return [];
  return decoded.steps
    .filter((step) => step.kind === "system_command" && typeof step.command === "string")
    .map((step) => step.command!);
}

function parseAutomationWorkflowIds(definitionJson: string): string[] {
  const decoded = JSON.parse(definitionJson) as {
    actions?: Array<{ type?: string; workflowId?: string }>;
  };
  if (!Array.isArray(decoded.actions)) return [];
  return decoded.actions
    .filter((action) => (
      action.type === "transition_workflow" && typeof action.workflowId === "string"
    ))
    .map((action) => action.workflowId!);
}

/** Analyze whether a Contract source can be removed without stranding consumers. */
export async function analyzeWorkspaceCommandContractSourceRemoval(
  candidate: WorkspaceCommandContractRemovalCandidate,
): Promise<WorkspaceCommandContractRemovalImpact> {
  const contractRows = await queryAll<{
    command_key: string;
    source_kind: string;
    source_id: string;
    contract_json: string;
  }>(
    `SELECT command_key, source_kind, source_id, contract_json
     FROM ${TABLES.workspaceCommandContracts}
     WHERE workspace_id = ?`,
    [candidate.workspaceId],
  );
  const ownedCommandKeys = contractRows
    .filter((row) => (
      row.source_kind === candidate.sourceKind && row.source_id === candidate.sourceId
    ))
    .map((row) => row.command_key)
    .sort();
  const ownedCommandSet = new Set(ownedCommandKeys);
  const ignoredSourceKeys = new Set(candidate.ignoredSourceKeys ?? []);
  const providers = candidate.providedCapabilities ?? [];
  const unreadableConsumers: WorkspaceCommandContractRemovalImpact["unreadableConsumers"] = [];
  const capabilityConsumers = contractRows.flatMap((row) => {
    if (row.source_kind === candidate.sourceKind && row.source_id === candidate.sourceId) {
      return [];
    }
    if (ignoredSourceKeys.has(sourceKey(row.source_kind, row.source_id))) return [];
    let contract;
    try {
      contract = commandContractSchema.parse(JSON.parse(row.contract_json));
    } catch {
      unreadableConsumers.push({
        kind: "contract",
        id: `${row.source_kind}:${row.source_id}:${row.command_key}`,
      });
      return [];
    }
    return contract.requiredEffects
      .filter((requirement) => providers.some(
        (provider) => commandEffectProviderMatches(requirement, provider),
      ))
      .map((requirement) => ({
        sourceKind: row.source_kind as CommandContractSourceKind,
        sourceId: row.source_id,
        commandKey: contract.key,
        capability: requirement.capability,
      }));
  });

  const ignoredWorkflowIds = new Set(candidate.ignoredWorkflowIds ?? []);
  const workflowRows = await queryAll<{
    workflow_id: string;
    definition_json: string;
  }>(
    `SELECT workflow_id, definition_json FROM ${TABLES.workflowDefinitions}
     WHERE workspace_id = ?`,
    [candidate.workspaceId],
  );
  const workflowCommandConsumers = workflowRows.flatMap((row) => {
    if (ignoredWorkflowIds.has(row.workflow_id)) return [];
    let commandKeys: string[];
    try {
      commandKeys = parseWorkflowCommandKeys(row.definition_json)
        .filter((commandKey) => ownedCommandSet.has(commandKey));
    } catch {
      unreadableConsumers.push({ kind: "workflow", id: row.workflow_id });
      return [];
    }
    return commandKeys.length > 0 ? [{
      workflowId: row.workflow_id,
      commandKeys: [...new Set(commandKeys)].sort(),
    }] : [];
  });

  const ownedWorkflowIds = new Set(candidate.ownedWorkflowIds ?? []);
  const automationRows = await queryAll<{
    automation_id: string;
    definition_json: string;
  }>(
    `SELECT automation_id, definition_json FROM ${TABLES.automationDefinitions}
     WHERE workspace_id = ?`,
    [candidate.workspaceId],
  );
  const automationWorkflowConsumers = automationRows.flatMap((row) => {
    let workflowIds: string[];
    try {
      workflowIds = parseAutomationWorkflowIds(row.definition_json)
        .filter((workflowId) => ownedWorkflowIds.has(workflowId));
    } catch {
      unreadableConsumers.push({ kind: "automation", id: row.automation_id });
      return [];
    }
    return workflowIds.length > 0 ? [{
      automationId: row.automation_id,
      workflowIds: [...new Set(workflowIds)].sort(),
    }] : [];
  });

  const instanceRows = ownedWorkflowIds.size === 0
    ? []
    : await queryAll<{ workflow_id: string; instance_count: number }>(
      `SELECT d.workflow_id, COUNT(*) AS instance_count
       FROM ${TABLES.workflowInstances} i
       JOIN ${TABLES.workflowDefinitions} d ON d.id = i.workflow_definition_id
       WHERE i.workspace_id = ?
       GROUP BY d.workflow_id`,
      [candidate.workspaceId],
    );
  const retainedWorkflowInstances = instanceRows
    .filter((row) => ownedWorkflowIds.has(row.workflow_id))
    .map((row) => ({
      workflowId: row.workflow_id,
      instanceCount: Number(row.instance_count),
    }));
  const canRemove = capabilityConsumers.length === 0
    && workflowCommandConsumers.length === 0
    && automationWorkflowConsumers.length === 0
    && retainedWorkflowInstances.length === 0
    && unreadableConsumers.length === 0;

  return {
    workspaceId: candidate.workspaceId,
    sourceKind: candidate.sourceKind,
    sourceId: candidate.sourceId,
    ownedCommandKeys,
    capabilityConsumers,
    workflowCommandConsumers,
    automationWorkflowConsumers,
    retainedWorkflowInstances,
    unreadableConsumers,
    canRemove,
  };
}
