import type { CommandContract } from "@runory/contracts";
import { TABLES } from "./contracts";
import { queryAll } from "./db";
import { listPlatformServiceContractManifests } from "./platform-service-contracts";
import {
  syncWorkspaceCommandContracts,
  type CommandContractSourceKind,
} from "./command-contracts";

export type WorkspaceCommandContractRepairStatus =
  | "in_sync"
  | "missing"
  | "outdated"
  | "conflict";

export interface WorkspaceCommandContractRepairSource {
  sourceKind: CommandContractSourceKind;
  sourceId: string;
  expectedVersion: string;
  actualVersions: string[];
  status: WorkspaceCommandContractRepairStatus;
  expectedCommandKeys: string[];
  actualCommandKeys: string[];
  missingCommandKeys: string[];
  unexpectedCommandKeys: string[];
  conflictingCommands: Array<{
    commandKey: string;
    sourceKind: CommandContractSourceKind;
    sourceId: string;
  }>;
}

export interface WorkspaceCommandContractRepairReport {
  workspaceId: string;
  requiresRepair: boolean;
  sources: WorkspaceCommandContractRepairSource[];
  orphanedSources: Array<{
    sourceKind: CommandContractSourceKind;
    sourceId: string;
    sourceVersions: string[];
    commandKeys: string[];
  }>;
}

export interface WorkspaceCommandContractRepairResult {
  before: WorkspaceCommandContractRepairReport;
  repairedSources: Array<{
    sourceKind: CommandContractSourceKind;
    sourceId: string;
    sourceVersion: string;
  }>;
  after: WorkspaceCommandContractRepairReport;
}

export interface AllWorkspaceCommandContractRepairReport {
  workspaceCount: number;
  cleanWorkspaceCount: number;
  repairRequiredWorkspaceCount: number;
  blockedWorkspaceCount: number;
  workspaces: WorkspaceCommandContractRepairReport[];
}

export interface AllWorkspaceCommandContractRepairResult {
  before: AllWorkspaceCommandContractRepairReport;
  repairedWorkspaces: WorkspaceCommandContractRepairResult[];
  after: AllWorkspaceCommandContractRepairReport;
}

interface ExpectedSource {
  sourceKind: CommandContractSourceKind;
  sourceId: string;
  sourceVersion: string;
  contracts: CommandContract[];
}

interface PersistedContractRow {
  command_key: string;
  source_kind: string;
  source_id: string;
  source_version: string;
  contract_version: string;
  contract_json: string;
}

function sourceKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

async function getExpectedSources(workspaceId: string): Promise<ExpectedSource[]> {
  const installations = await queryAll<{ module_id: string; module_version: string }>(
    `SELECT module_id, module_version FROM ${TABLES.installations}
     WHERE workspace_id = ? AND status = 'installed'
     ORDER BY module_id`,
    [workspaceId],
  );
  // Dynamic import avoids making the installer and repair service depend on
  // each other during module initialization.
  const { loadInstalledModuleManifest } = await import("./installer");
  const modules = installations
    .map((installation) => {
      const manifest = loadInstalledModuleManifest(
        installation.module_id,
        installation.module_version,
      );
      return {
        sourceKind: "module" as const,
        sourceId: installation.module_id,
        sourceVersion: installation.module_version,
        contracts: manifest.domain?.commands ?? [],
      };
    })
    .filter((source) => source.contracts.length > 0);
  const platformServices = listPlatformServiceContractManifests().map((manifest) => ({
    sourceKind: "platform_service" as const,
    sourceId: manifest.id,
    sourceVersion: manifest.version,
    contracts: manifest.domain.commands,
  }));
  return [...modules, ...platformServices];
}

export async function inspectWorkspaceCommandContractRepair(
  workspaceId: string,
): Promise<WorkspaceCommandContractRepairReport> {
  const expectedSources = await getExpectedSources(workspaceId);
  const rows = await queryAll<PersistedContractRow>(
    `SELECT command_key, source_kind, source_id, source_version,
            contract_version, contract_json
     FROM ${TABLES.workspaceCommandContracts}
     WHERE workspace_id = ?
     ORDER BY source_kind, source_id, command_key`,
    [workspaceId],
  );
  const rowsBySource = new Map<string, PersistedContractRow[]>();
  const rowByCommand = new Map<string, PersistedContractRow>();
  for (const row of rows) {
    const key = sourceKey(row.source_kind, row.source_id);
    rowsBySource.set(key, [...(rowsBySource.get(key) ?? []), row]);
    rowByCommand.set(row.command_key, row);
  }

  const expectedKeys = new Set(expectedSources.map(
    (source) => sourceKey(source.sourceKind, source.sourceId),
  ));
  const sources = expectedSources.map((source): WorkspaceCommandContractRepairSource => {
    const key = sourceKey(source.sourceKind, source.sourceId);
    const actual = rowsBySource.get(key) ?? [];
    const expectedCommandKeys = source.contracts.map((contract) => contract.key).sort();
    const actualCommandKeys = actual.map((row) => row.command_key).sort();
    const expectedCommandSet = new Set(expectedCommandKeys);
    const actualCommandSet = new Set(actualCommandKeys);
    const missingCommandKeys = expectedCommandKeys.filter(
      (commandKey) => !actualCommandSet.has(commandKey),
    );
    const unexpectedCommandKeys = actualCommandKeys.filter(
      (commandKey) => !expectedCommandSet.has(commandKey),
    );
    const conflictingCommands = source.contracts.flatMap((contract) => {
      const owner = rowByCommand.get(contract.key);
      if (!owner || (owner.source_kind === source.sourceKind && owner.source_id === source.sourceId)) {
        return [];
      }
      return [{
        commandKey: contract.key,
        sourceKind: owner.source_kind as CommandContractSourceKind,
        sourceId: owner.source_id,
      }];
    });
    const actualVersions = [...new Set(actual.map((row) => row.source_version))].sort();
    const snapshotsMatch = source.contracts.every((contract) => {
      const row = actual.find((candidate) => candidate.command_key === contract.key);
      return row?.source_version === source.sourceVersion
        && row.contract_version === contract.contractVersion
        && row.contract_json === JSON.stringify(contract);
    });
    const status: WorkspaceCommandContractRepairStatus =
      conflictingCommands.length > 0 ? "conflict"
        : actual.length === 0 ? "missing"
          : missingCommandKeys.length > 0 || unexpectedCommandKeys.length > 0
            || !snapshotsMatch ? "outdated"
            : "in_sync";
    return {
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      expectedVersion: source.sourceVersion,
      actualVersions,
      status,
      expectedCommandKeys,
      actualCommandKeys,
      missingCommandKeys,
      unexpectedCommandKeys,
      conflictingCommands,
    };
  });

  const orphanedSources = [...rowsBySource.entries()]
    .filter(([key]) => !expectedKeys.has(key))
    .map(([, orphanedRows]) => ({
      sourceKind: orphanedRows[0].source_kind as CommandContractSourceKind,
      sourceId: orphanedRows[0].source_id,
      sourceVersions: [...new Set(orphanedRows.map((row) => row.source_version))].sort(),
      commandKeys: orphanedRows.map((row) => row.command_key).sort(),
    }));

  return {
    workspaceId,
    requiresRepair: sources.some((source) => source.status !== "in_sync")
      || orphanedSources.length > 0,
    sources,
    orphanedSources,
  };
}

export async function repairWorkspaceCommandContracts(
  workspaceId: string,
): Promise<WorkspaceCommandContractRepairResult> {
  const expectedSources = await getExpectedSources(workspaceId);
  const before = await inspectWorkspaceCommandContractRepair(workspaceId);
  const conflicts = before.sources.filter((source) => source.status === "conflict");
  if (conflicts.length > 0) {
    const details = conflicts.flatMap((source) => source.conflictingCommands)
      .map((conflict) => (
        `${conflict.commandKey} owned by ${conflict.sourceKind}:${conflict.sourceId}`
      ))
      .join(", ");
    throw new Error(`COMMAND_CONTRACT_REPAIR_CONFLICT: ${details}`);
  }

  const repairedSources: WorkspaceCommandContractRepairResult["repairedSources"] = [];
  for (const source of expectedSources) {
    const state = before.sources.find(
      (candidate) => candidate.sourceKind === source.sourceKind
        && candidate.sourceId === source.sourceId,
    );
    if (!state || state.status === "in_sync") continue;
    await syncWorkspaceCommandContracts(
      workspaceId,
      source.sourceKind,
      source.sourceId,
      source.sourceVersion,
      source.contracts,
    );
    repairedSources.push({
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
    });
  }

  return {
    before,
    repairedSources,
    after: await inspectWorkspaceCommandContractRepair(workspaceId),
  };
}

function isWorkspaceRepairBlocked(report: WorkspaceCommandContractRepairReport): boolean {
  return report.orphanedSources.length > 0
    || report.sources.some((source) => source.status === "conflict");
}

export async function inspectAllWorkspaceCommandContractRepairs(
): Promise<AllWorkspaceCommandContractRepairReport> {
  const workspaces = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.workspaces} ORDER BY id`,
  );
  const reports = await Promise.all(
    workspaces.map((workspace) => inspectWorkspaceCommandContractRepair(workspace.id)),
  );
  return {
    workspaceCount: reports.length,
    cleanWorkspaceCount: reports.filter((report) => !report.requiresRepair).length,
    repairRequiredWorkspaceCount: reports.filter((report) => report.requiresRepair).length,
    blockedWorkspaceCount: reports.filter(isWorkspaceRepairBlocked).length,
    workspaces: reports,
  };
}

/**
 * Backfill every existing Workspace after a complete read-only preflight.
 *
 * A conflict or orphaned source blocks the entire operation before writes so
 * operators can resolve ambiguous ownership without producing partial fleet
 * coverage.
 */
export async function repairAllWorkspaceCommandContracts(
): Promise<AllWorkspaceCommandContractRepairResult> {
  const before = await inspectAllWorkspaceCommandContractRepairs();
  const blocked = before.workspaces.filter(isWorkspaceRepairBlocked);
  if (blocked.length > 0) {
    const details = blocked.map((report) => report.workspaceId).join(", ");
    throw new Error(`COMMAND_CONTRACT_BULK_REPAIR_BLOCKED: ${details}`);
  }

  const repairedWorkspaces: WorkspaceCommandContractRepairResult[] = [];
  for (const report of before.workspaces) {
    if (!report.requiresRepair) continue;
    repairedWorkspaces.push(await repairWorkspaceCommandContracts(report.workspaceId));
  }
  return {
    before,
    repairedWorkspaces,
    after: await inspectAllWorkspaceCommandContractRepairs(),
  };
}
