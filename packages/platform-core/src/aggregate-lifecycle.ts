import type { AggregateContract, AggregateLifecycle } from "@runory/contracts";
import { TABLES } from "./contracts";
import { queryOne } from "./db";
import { loadInstalledModuleManifest } from "./installer";
import { getObject } from "./metadata";

// ── Aggregate contract resolution for a Workspace ──
//
// Which states a record travels through is Module knowledge, so it is read from
// the manifest version the Workspace actually installed rather than from the
// current Catalog head. A Workspace that has not taken the latest Module keeps
// the lifecycle it was provisioned with, the same way Command execution keeps
// the Contract snapshot it was provisioned with.

export interface ResolvedAggregateContract {
  moduleId: string;
  moduleVersion: string;
  aggregate: AggregateContract;
}

/**
 * Resolve the aggregate contract governing an object in a Workspace.
 *
 * Returns null for objects that are not governed aggregates — workspace
 * extensions, reference data, and Module objects with no declared state machine.
 */
export async function resolveWorkspaceAggregate(
  workspaceId: string,
  objectKey: string,
): Promise<ResolvedAggregateContract | null> {
  const object = await getObject(workspaceId, objectKey);
  if (!object?.moduleId) return null;

  const installation = await queryOne<{ module_version: string }>(
    `SELECT module_version FROM ${TABLES.installations}
     WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
    [workspaceId, object.moduleId],
  );
  if (!installation) return null;

  let aggregate: AggregateContract | undefined;
  try {
    const manifest = loadInstalledModuleManifest(object.moduleId, installation.module_version);
    aggregate = manifest.domain?.aggregates.find((entry) => entry.key === objectKey);
  } catch {
    // A Workspace pinned to a Module version whose manifest snapshot is no
    // longer shipped keeps working without a lifecycle rather than failing the
    // read; Command execution still resolves from its own persisted snapshot.
    return null;
  }
  if (!aggregate) return null;

  return {
    moduleId: object.moduleId,
    moduleVersion: installation.module_version,
    aggregate,
  };
}

export async function resolveWorkspaceAggregateLifecycle(
  workspaceId: string,
  objectKey: string,
): Promise<AggregateLifecycle | null> {
  const resolved = await resolveWorkspaceAggregate(workspaceId, objectKey);
  return resolved?.aggregate.lifecycle ?? null;
}
