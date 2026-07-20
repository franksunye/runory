import { commandContractSchema } from "@runory/contracts";
import { satisfies, validRange } from "semver";
import { TABLES } from "../contracts";
import { queryOne } from "../db";
import { commandContractOperationalError } from "./errors";
import { getRegisteredCommandEffectProviders } from "./registry";
import { resolveCommandPlan } from "./runtime-plan";
import type { CommandContractSourceKind, ResolvedCommandPlan } from "./types";

/**
 * Resolve the exact Contract snapshot provisioned into a Workspace.
 *
 * Missing snapshots fail closed: execution is only allowed from the exact
 * Contract version provisioned for this Workspace.
 */
export async function resolveWorkspaceCommandPlan(
  workspaceId: string,
  commandType: string,
): Promise<ResolvedCommandPlan> {
  const row = await queryOne<{
    contract_json: string;
    source_kind: string;
    source_id: string;
    source_version: string;
  }>(
    `SELECT contract_json, source_kind, source_id, source_version
     FROM ${TABLES.workspaceCommandContracts}
     WHERE workspace_id = ? AND command_key = ?`,
    [workspaceId, commandType],
  );
  if (!row) {
    throw commandContractOperationalError({
      command: commandType,
      workspaceId,
      problem: "no provisioned Contract snapshot was found",
      remediation: "run Workspace Contract repair before executing the Command",
    });
  }

  const source = {
    kind: row.source_kind as CommandContractSourceKind,
    id: row.source_id,
    version: row.source_version,
  };
  let decoded: unknown;
  try {
    decoded = JSON.parse(row.contract_json);
  } catch {
    throw commandContractOperationalError({
      command: commandType,
      workspaceId,
      source,
      problem: "the persisted Contract snapshot contains invalid JSON",
      remediation: "repair the source manifest, then rerun Workspace Contract repair",
    });
  }
  const contract = commandContractSchema.safeParse(decoded);
  if (!contract.success || contract.data.key !== commandType) {
    throw commandContractOperationalError({
      command: commandType,
      workspaceId,
      source,
      problem: "the persisted Contract snapshot is invalid or has a mismatched Command key",
      remediation: "repair the source manifest, then rerun Workspace Contract repair",
    });
  }
  if (!["module", "platform_service"].includes(row.source_kind)) {
    throw commandContractOperationalError({
      command: commandType,
      workspaceId,
      source,
      problem: `the persisted source kind '${row.source_kind}' is invalid`,
      remediation: "remove the invalid snapshot and rerun Workspace Contract repair",
    });
  }
  for (const requirement of contract.data.requiresModules) {
    const installation = await queryOne<{ module_version: string }>(
      `SELECT module_version FROM ${TABLES.installations}
       WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
      [workspaceId, requirement.id],
    );
    if (!installation || !validRange(requirement.version)
      || !satisfies(installation.module_version, requirement.version)) {
      throw commandContractOperationalError({
        command: commandType,
        workspaceId,
        source,
        problem: `required Module '${requirement.id}@${requirement.version}' is not installed`,
        remediation: "install a compatible Module version, then rerun Workspace Contract repair",
      });
    }
  }
  return resolveCommandPlan(
    contract.data,
    getRegisteredCommandEffectProviders(),
    source,
    { workspaceId },
  );
}
