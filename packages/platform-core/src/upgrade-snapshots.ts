import { createHash } from "node:crypto";
import { rollbackSnapshotSchema, type RollbackSnapshot } from "@runory/contracts";
import { TABLES } from "./contracts";
import { db, ensureSchema, now, runInTransaction, type Transaction } from "./db";

export type UpgradeState = Pick<RollbackSnapshot, "installationRecord" | "metadataState">;
export interface UpgradeExecutionState {
  phase: "captured" | "migrating" | "applied" | "failed" | "rolled_back";
  migration_started_at: string | null;
  applied_state_checksum: string | null;
}

// Use stable key/row order: the same persisted state must hash identically after
// a new process/DB connection, independently of a driver's property ordering.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

export function upgradeStateChecksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export async function readUpgradeState(
  connection: Pick<Transaction, "execute">,
  workspaceId: string,
  moduleId: string,
): Promise<UpgradeState> {
  const installation = await connection.execute({
    sql: `SELECT * FROM ${TABLES.installations} WHERE workspace_id = ? AND module_id = ?`,
    args: [workspaceId, moduleId],
  });
  if (installation.rows.length !== 1) throw new Error("Active installation not found for upgrade snapshot");
  const rows = async (table: string) => {
    const result = await connection.execute({
      sql: `SELECT * FROM ${table} WHERE workspace_id = ? AND module_id = ? ORDER BY id`,
      args: [workspaceId, moduleId],
    });
    return result.rows as unknown as Record<string, unknown>[];
  };
  const commands = await connection.execute({
    sql: `SELECT * FROM ${TABLES.workspaceCommandContracts}
          WHERE workspace_id = ? AND source_kind = 'module' AND source_id = ? ORDER BY command_key`,
    args: [workspaceId, moduleId],
  });
  return {
    installationRecord: installation.rows[0] as unknown as Record<string, unknown>,
    metadataState: {
      objects: await rows(TABLES.objectDefinitions),
      fields: await rows(TABLES.fieldDefinitions),
      views: await rows(TABLES.viewDefinitions),
      navigation: await rows(TABLES.navigationItems),
      relations: await rows(TABLES.relationDefinitions),
      commandContracts: commands.rows as unknown as Record<string, unknown>[],
    },
  };
}

export async function loadPersistedUpgradeSnapshot(
  targetId: string,
  connection: Pick<Transaction, "execute"> = db,
): Promise<RollbackSnapshot | null> {
  if (connection === db) await ensureSchema();
  const result = await connection.execute({
    sql: `SELECT * FROM ${TABLES.upgradeSnapshots} WHERE target_id = ?`,
    args: [targetId],
  });
  const row = result.rows[0];
  if (!row) return null;
  const decoded: unknown = JSON.parse(String(row.snapshot_json));
  if (upgradeStateChecksum(decoded) !== row.snapshot_checksum) {
    throw new Error("Upgrade snapshot checksum mismatch; operator review is required");
  }
  const snapshot = rollbackSnapshotSchema.parse(decoded);
  if (snapshot.targetId !== targetId || snapshot.workspaceId !== row.workspace_id
    || snapshot.moduleId !== row.module_id
    || snapshot.installationRecord.workspace_id !== snapshot.workspaceId
    || snapshot.installationRecord.module_id !== snapshot.moduleId) {
    throw new Error("Upgrade snapshot scope mismatch");
  }
  return snapshot;
}

export async function readUpgradeExecutionState(
  targetId: string,
  connection: Pick<Transaction, "execute"> = db,
): Promise<UpgradeExecutionState | null> {
  if (connection === db) await ensureSchema();
  const result = await connection.execute({
    sql: `SELECT phase, migration_started_at, applied_state_checksum
          FROM ${TABLES.upgradeExecutionStates} WHERE target_id = ?`,
    args: [targetId],
  });
  return (result.rows[0] as unknown as UpgradeExecutionState | undefined) ?? null;
}

/** Capture once, atomically. A persistence error propagates and blocks upgrade. */
export async function capturePreUpgradeSnapshot(
  targetId: string,
  workspaceId: string,
  moduleId: string,
  versionBeforeUpgrade: string,
  versionAfterUpgrade: string,
): Promise<RollbackSnapshot> {
  return runInTransaction(async (tx) => {
    const existing = await loadPersistedUpgradeSnapshot(targetId, tx);
    if (existing) {
      if (existing.workspaceId !== workspaceId || existing.moduleId !== moduleId
        || existing.versionBeforeUpgrade !== versionBeforeUpgrade
        || existing.versionAfterUpgrade !== versionAfterUpgrade) {
        throw new Error("Immutable upgrade snapshot already exists for a different operation");
      }
      return existing;
    }
    const state = await readUpgradeState(tx, workspaceId, moduleId);
    if (state.installationRecord.module_version !== versionBeforeUpgrade
      || state.installationRecord.status !== "installed") {
      throw new Error("Installation changed before the recovery point was captured");
    }
    const snapshot: RollbackSnapshot = {
      snapshotVersion: 1,
      targetId,
      workspaceId,
      moduleId,
      versionBeforeUpgrade,
      versionAfterUpgrade,
      capturedAt: now(),
      ...state,
    };
    await tx.execute({
      sql: `INSERT INTO ${TABLES.upgradeSnapshots}
            (target_id, workspace_id, module_id, snapshot_json, snapshot_checksum, captured_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [targetId, workspaceId, moduleId, JSON.stringify(snapshot), upgradeStateChecksum(snapshot), snapshot.capturedAt],
    });
    await tx.execute({
      sql: `INSERT INTO ${TABLES.upgradeExecutionStates} (target_id, phase, updated_at) VALUES (?, 'captured', ?)`,
      args: [targetId, snapshot.capturedAt],
    });
    return snapshot;
  });
}
