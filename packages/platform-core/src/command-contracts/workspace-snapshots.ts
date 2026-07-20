import { commandContractSchema, type CommandContract } from "@runory/contracts";
import { TABLES } from "../contracts";
import { batch as runBatch, now, queryOne } from "../db";
import { commandContractError } from "./errors";
import type { CommandContractSourceKind } from "./types";

/** Atomically replace all Contract snapshots owned by one versioned source. */
export async function syncWorkspaceCommandContracts(
  workspaceId: string,
  sourceKind: CommandContractSourceKind,
  sourceId: string,
  sourceVersion: string,
  inputs: CommandContract[],
): Promise<void> {
  const contracts = inputs.map((input) => commandContractSchema.parse(input));
  for (const contract of contracts) {
    const owner = await queryOne<{ source_kind: string; source_id: string }>(
      `SELECT source_kind, source_id FROM ${TABLES.workspaceCommandContracts}
       WHERE workspace_id = ? AND command_key = ?
         AND (source_kind != ? OR source_id != ?)`,
      [workspaceId, contract.key, sourceKind, sourceId],
    );
    if (owner) {
      throw commandContractError(
        `Command '${contract.key}' is already owned by ${owner.source_kind} '${owner.source_id}' in workspace '${workspaceId}'.`,
      );
    }
  }

  const installedAt = now();
  await runBatch([
    {
      sql: `DELETE FROM ${TABLES.workspaceCommandContracts}
            WHERE workspace_id = ? AND source_kind = ? AND source_id = ?`,
      args: [workspaceId, sourceKind, sourceId],
    },
    ...contracts.map((contract) => ({
      sql: `INSERT INTO ${TABLES.workspaceCommandContracts}
            (workspace_id, command_key, source_kind, source_id, source_version,
             contract_version, contract_json, installed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        workspaceId,
        contract.key,
        sourceKind,
        sourceId,
        sourceVersion,
        contract.contractVersion,
        JSON.stringify(contract),
        installedAt,
      ],
    })),
  ]);
}

export async function removeWorkspaceCommandContracts(
  workspaceId: string,
  sourceKind: CommandContractSourceKind,
  sourceId: string,
): Promise<void> {
  await runBatch([{
    sql: `DELETE FROM ${TABLES.workspaceCommandContracts}
          WHERE workspace_id = ? AND source_kind = ? AND source_id = ?`,
    args: [workspaceId, sourceKind, sourceId],
  }]);
}
