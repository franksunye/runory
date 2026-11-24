/**
 * Restore the durable pre-upgrade metadata and installation as one transaction.
 * Module SQL has no verified down-migration contract: after any SQL attempt,
 * recovery requires the operator's database backup/restore procedure instead.
 * Business records are never deleted or copied by metadata rollback.
 */
import { now, runInTransaction, validateIdentifier, type Transaction } from "./db";
import { TABLES } from "./contracts";
import { writeAuditEvent } from "./audit-service";
import type { RollbackSnapshot, RollbackResult } from "@runory/contracts";
import {
  loadPersistedUpgradeSnapshot,
  readUpgradeExecutionState,
  readUpgradeState,
  upgradeStateChecksum,
} from "./upgrade-snapshots";

export const loadRollbackSnapshot = loadPersistedUpgradeSnapshot;

type RecoveryRequired = NonNullable<RollbackResult["recoveryRequired"]>;
class RecoveryError extends Error {
  constructor(message: string, readonly recoveryRequired: RecoveryRequired = "operator_review") {
    super(message);
  }
}

function beforeChecksum(snapshot: RollbackSnapshot): string {
  return upgradeStateChecksum({
    installationRecord: snapshot.installationRecord,
    metadataState: snapshot.metadataState,
  });
}

/** The same guard is used for eligibility and the actual write transaction. */
async function checkRecovery(tx: Transaction, targetId: string, snapshot: RollbackSnapshot) {
  const target = (await tx.execute({
    sql: `SELECT status, workspace_id FROM ${TABLES.rolloutTargets} WHERE id = ?`, args: [targetId],
  })).rows[0];
  if (!target || target.workspace_id !== snapshot.workspaceId) throw new RecoveryError("Target not found or snapshot scope mismatch");
  if (target.status !== "succeeded" && target.status !== "failed") {
    throw new RecoveryError(`Target status is '${target.status}'; stop/reconcile the executor before recovery`);
  }
  const state = await readUpgradeExecutionState(targetId, tx);
  if (!state) throw new RecoveryError("Upgrade execution state is missing");
  if (state.migration_started_at) {
    throw new RecoveryError(
      "requires_database_restore: module SQL was attempted and has no verified downgrade path; metadata and business data were left unchanged",
      "database_restore",
    );
  }
  const current = await readUpgradeState(tx, snapshot.workspaceId, snapshot.moduleId);
  const expected = state.phase === "rolled_back"
    ? beforeChecksum(snapshot)
    : state.applied_state_checksum ?? beforeChecksum(snapshot);
  if (upgradeStateChecksum(current) !== expected) {
    throw new RecoveryError("Installation or module metadata changed since this upgrade; refusing to overwrite later changes");
  }
  return state;
}

async function restoreSnapshot(tx: Transaction, snapshot: RollbackSnapshot): Promise<void> {
  const { workspaceId, moduleId } = snapshot;
  const tables: Array<[string, Record<string, unknown>[], boolean]> = [
    [TABLES.objectDefinitions, snapshot.metadataState.objects, false],
    [TABLES.fieldDefinitions, snapshot.metadataState.fields, false],
    [TABLES.viewDefinitions, snapshot.metadataState.views, false],
    [TABLES.navigationItems, snapshot.metadataState.navigation, false],
    [TABLES.relationDefinitions, snapshot.metadataState.relations, false],
    [TABLES.workspaceCommandContracts, snapshot.metadataState.commandContracts, true],
  ];
  for (const [table, rows, commands] of tables) {
    const scope = commands ? "source_kind = 'module' AND source_id = ?" : "module_id = ?";
    for (const row of rows) {
      if (row.workspace_id !== workspaceId || (commands
        ? row.source_kind !== "module" || row.source_id !== moduleId
        : row.module_id !== moduleId)) {
        throw new RecoveryError("Metadata row is outside the snapshot scope");
      }
    }
    await tx.execute({ sql: `DELETE FROM ${table} WHERE workspace_id = ? AND ${scope}`, args: [workspaceId, moduleId] });
    // Preserve every captured column and ID, including configuration JSON,
    // ownership, defaults, relation composition and command source versions.
    for (const row of rows) {
      const columns = Object.keys(row).map(validateIdentifier);
      if (columns.length === 0) throw new RecoveryError("Empty row in upgrade snapshot");
      await tx.execute({
        sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        args: columns.map((column) => row[column]) as never,
      });
    }
  }
  const installation = snapshot.installationRecord;
  const columns = Object.keys(installation).map(validateIdentifier).filter((key) => key !== "id");
  const restored = await tx.execute({
    sql: `UPDATE ${TABLES.installations} SET ${columns.map((column) => `${column} = ?`).join(", ")}
          WHERE id = ? AND workspace_id = ? AND module_id = ?`,
    args: [...columns.map((column) => installation[column]), installation.id, workspaceId, moduleId] as never,
  });
  if (restored.rowsAffected !== 1) throw new RecoveryError("Installation identity changed before rollback");
  if (upgradeStateChecksum(await readUpgradeState(tx, workspaceId, moduleId)) !== beforeChecksum(snapshot)) {
    throw new RecoveryError("Restored metadata/installation did not match the durable snapshot");
  }
}

export async function rollbackUpgrade(targetId: string): Promise<RollbackResult> {
  const stepsTaken: string[] = [];
  let snapshot: RollbackSnapshot | null = null;
  try {
    return await runInTransaction(async (tx) => {
      snapshot = await loadPersistedUpgradeSnapshot(targetId, tx);
      stepsTaken.push("load_snapshot");
      if (!snapshot) throw new RecoveryError("No pre-upgrade snapshot found for this target");
      const state = await checkRecovery(tx, targetId, snapshot);
      stepsTaken.push("verify_recovery_boundary");
      if (state.phase !== "rolled_back") {
        await restoreSnapshot(tx, snapshot);
        stepsTaken.push("restore_metadata", "restore_installation", "verify_restored_state");
        await tx.execute({
          sql: `UPDATE ${TABLES.upgradeExecutionStates} SET phase = 'rolled_back', updated_at = ? WHERE target_id = ?`,
          args: [now(), targetId],
        });
        await tx.execute({
          sql: `UPDATE ${TABLES.rolloutTargets} SET status = 'failed', reason_code = 'rolled_back', completed_at = ? WHERE id = ?`,
          args: [now(), targetId],
        });
        // A rollback is an explicit stop signal for any still-running rollout.
        await tx.execute({
          sql: `UPDATE ${TABLES.releaseRollouts} SET status = 'paused'
                WHERE id = (SELECT rollout_id FROM ${TABLES.rolloutTargets} WHERE id = ?)
                  AND status IN ('running', 'resumed')`, args: [targetId],
        });
        await writeAuditEvent({
          workspaceId: snapshot.workspaceId, actorType: "system", actorId: "rollback_executor",
          action: "upgrade.target_rolled_back", entityType: "rollout_target", entityId: targetId,
          before: { version: snapshot.versionAfterUpgrade },
          after: { version: snapshot.versionBeforeUpgrade, recoveryScope: "metadata_and_installation", businessDataRetained: true },
        }, tx);
      } else {
        stepsTaken.push("already_restored");
      }
      return {
        targetId, workspaceId: snapshot.workspaceId, moduleId: snapshot.moduleId,
        rolledBackToVersion: snapshot.versionBeforeUpgrade, status: "succeeded" as const,
        stepsTaken, metadataRestored: true, completedAt: now(),
      };
    });
  } catch (err) {
    // All writes above are one transaction. Failed/blocked recovery never claims
    // a partial restoration or changes the active installation's version label.
    const saved = snapshot as RollbackSnapshot | null;
    let error = err instanceof Error ? err.message : String(err);
    try {
      await writeAuditEvent({
        workspaceId: saved?.workspaceId ?? "platform", actorType: "system", actorId: "rollback_executor",
        action: "upgrade.rollback_failed", entityType: "rollout_target", entityId: targetId,
        after: { error, recoveryRequired: err instanceof RecoveryError ? err.recoveryRequired : "operator_review" },
      });
    } catch (auditError) {
      error += `; failure audit could not be persisted: ${auditError instanceof Error ? auditError.message : String(auditError)}`;
    }
    return {
      targetId, workspaceId: saved?.workspaceId ?? "", moduleId: saved?.moduleId ?? "",
      rolledBackToVersion: "", status: "failed", stepsTaken, metadataRestored: false,
      recoveryRequired: err instanceof RecoveryError ? err.recoveryRequired : "operator_review",
      error, completedAt: now(),
    };
  }
}

export async function batchRollback(targetIds: string[]): Promise<RollbackResult[]> {
  const results: RollbackResult[] = [];
  for (const targetId of targetIds) results.push(await rollbackUpgrade(targetId));
  return results;
}

export async function canRollback(targetId: string): Promise<{ eligible: boolean; reason?: string }> {
  try {
    return await runInTransaction(async (tx) => {
      const snapshot = await loadPersistedUpgradeSnapshot(targetId, tx);
      if (!snapshot) return { eligible: false, reason: "No pre-upgrade snapshot found" };
      await checkRecovery(tx, targetId, snapshot);
      return { eligible: true };
    });
  } catch (err) {
    return { eligible: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
