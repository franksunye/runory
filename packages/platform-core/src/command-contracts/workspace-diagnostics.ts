import { commandContractSchema } from "@runory/contracts";
import { TABLES } from "../contracts";
import { queryAll } from "../db";
import { commandContractError } from "./errors";
import { resolveCommandPlan } from "./runtime-plan";
import type {
  CommandContractSourceKind,
  WorkspaceCommandContractInventoryEntry,
} from "./types";

/** Read-only support view of exact Contract and Provider versions. */
export async function getWorkspaceCommandContractInventory(
  workspaceId: string,
): Promise<WorkspaceCommandContractInventoryEntry[]> {
  const rows = await queryAll<{
    command_key: string;
    source_kind: string;
    source_id: string;
    source_version: string;
    contract_version: string;
    contract_json: string;
  }>(
    `SELECT command_key, source_kind, source_id, source_version,
            contract_version, contract_json
     FROM ${TABLES.workspaceCommandContracts}
     WHERE workspace_id = ?
     ORDER BY source_kind, source_id, command_key`,
    [workspaceId],
  );

  return rows.map((row) => {
    let decoded: unknown;
    try {
      decoded = JSON.parse(row.contract_json);
    } catch {
      throw commandContractError(
        `Workspace '${workspaceId}' has invalid persisted JSON for '${row.command_key}'.`,
      );
    }
    const parsed = commandContractSchema.safeParse(decoded);
    if (!parsed.success || parsed.data.key !== row.command_key) {
      throw commandContractError(
        `Workspace '${workspaceId}' has an invalid persisted Contract for '${row.command_key}'.`,
      );
    }
    if (!["module", "platform_service"].includes(row.source_kind)) {
      throw commandContractError(
        `Workspace '${workspaceId}' has invalid source kind '${row.source_kind}' for '${row.command_key}'.`,
      );
    }
    if (parsed.data.contractVersion !== row.contract_version) {
      throw commandContractError(
        `Workspace '${workspaceId}' Contract '${row.command_key}' version metadata does not match its snapshot.`,
      );
    }
    const plan = resolveCommandPlan(parsed.data);
    return {
      commandKey: row.command_key,
      sourceKind: row.source_kind as CommandContractSourceKind,
      sourceId: row.source_id,
      sourceVersion: row.source_version,
      contractVersion: row.contract_version,
      aggregate: parsed.data.aggregate,
      operation: parsed.data.operation,
      permission: parsed.data.permission,
      providers: plan.effects.map(({ requirement, provider }) => ({
        capability: requirement.capability,
        requiredVersion: requirement.version,
        resolvedVersion: provider.version,
        consistency: requirement.consistency,
      })),
    };
  });
}
