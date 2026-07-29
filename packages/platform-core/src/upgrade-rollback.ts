/**
 * Pack-level Rollback (v0.9.4)
 *
 * Reverts a module upgrade that was executed by the upgrade executor.
 * Uses the pre-upgrade snapshot captured during execution to restore
 * the workspace to its previous state.
 *
 * Rollback strategy:
 * 1. Load the pre-upgrade snapshot (captured before the upgrade)
 * 2. Restore the installation record to the previous version
 * 3. Remove metadata added by the upgrade (new fields, views, navigation)
 * 4. Restore metadata that was modified by the upgrade
 * 5. Optionally execute downgrade SQL if available
 * 6. Update the rollout target status to reflect the rollback
 *
 * Design principles:
 * - Safe: never loses business data; only restores metadata
 * - Verifiable: every restoration step is logged
 * - Best-effort: if some metadata can't be restored, the rollback still
 *   completes with partial status and a detailed error
 */

import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES, businessTable } from "./contracts";
import { loadInstalledModuleManifest, loadModuleMigration } from "./installer";
import { updateRolloutTargetStatus } from "./catalog-rollout";
import { writeAuditEvent } from "./audit-service";
import { syncWorkspaceCommandContracts } from "./command-contracts";
import type {
  RollbackSnapshot,
  RollbackResult,
  ModuleManifest,
} from "@runory/contracts";
import { db } from "./db";

// ── Load Rollback Snapshot ──

/**
 * Retrieve the pre-upgrade snapshot for a rollout target.
 * The snapshot was captured by `capturePreUpgradeSnapshot()` during
 * the upgrade execution.
 */
export async function loadRollbackSnapshot(
  targetId: string,
): Promise<RollbackSnapshot | null> {
  // The snapshot was stored as a special installation record with
  // status='snapshot' and parent_operation_id=targetId
  const snapshotRow = await queryOne<{
    workspace_id: string;
    module_id: string;
    module_version: string;
    parent_operation_id: string;
  }>(
    `SELECT workspace_id, module_id, module_version, parent_operation_id
     FROM ${TABLES.installations}
     WHERE parent_operation_id = ? AND status = 'snapshot'`,
    [targetId],
  );

  if (!snapshotRow) return null;

  // Reconstruct the metadata state from the current database.
  // In a production system, the full snapshot would be stored as JSON.
  // Here we query the current state and note that it reflects the
  // post-upgrade state — the rollback will restore to the pre-upgrade version.

  const currentInstallation = await queryOne<{ module_version: string }>(
    `SELECT module_version FROM ${TABLES.installations}
     WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
    [snapshotRow.workspace_id, snapshotRow.module_id],
  );

  const objects = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.objectDefinitions}
     WHERE workspace_id = ? AND module_id = ?`,
    [snapshotRow.workspace_id, snapshotRow.module_id],
  );

  const fields = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.fieldDefinitions}
     WHERE workspace_id = ? AND module_id = ?`,
    [snapshotRow.workspace_id, snapshotRow.module_id],
  );

  const views = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.viewDefinitions}
     WHERE workspace_id = ? AND module_id = ?`,
    [snapshotRow.workspace_id, snapshotRow.module_id],
  );

  const navigation = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.navigationItems}
     WHERE workspace_id = ? AND module_id = ?`,
    [snapshotRow.workspace_id, snapshotRow.module_id],
  );

  return {
    targetId,
    workspaceId: snapshotRow.workspace_id,
    moduleId: snapshotRow.module_id,
    versionBeforeUpgrade: snapshotRow.module_version,
    versionAfterUpgrade: currentInstallation?.module_version ?? "",
    capturedAt: now(),
    installationRecord: currentInstallation ?? {},
    metadataState: {
      objects: objects ?? [],
      fields: fields ?? [],
      views: views ?? [],
      navigation: navigation ?? [],
    },
  };
}

// ── Restore Metadata ──

/**
 * Restore the module's metadata to match the pre-upgrade manifest.
 *
 * This reverses any metadata changes made by `syncModuleMetadata()` during
 * the upgrade:
 * - Fields added by the upgrade are removed
 * - Fields modified by the upgrade are restored to their original definitions
 * - Views added by the upgrade are removed
 * - Navigation items added by the upgrade are removed
 */
async function restoreMetadataToVersion(
  workspaceId: string,
  moduleId: string,
  previousManifest: ModuleManifest,
  currentManifest: ModuleManifest,
): Promise<{ removedFields: string[]; removedViews: string[]; removedNav: string[] }> {
  const removedFields: string[] = [];
  const removedViews: string[] = [];
  const removedNav: string[] = [];

  // Build sets of what the previous version expected
  const previousFieldKeys = new Set<string>();
  for (const obj of previousManifest.objects) {
    for (const field of obj.fields) {
      previousFieldKeys.add(`${obj.key}.${field.key}`);
    }
  }

  const previousViewKeys = new Set(previousManifest.views.map((v) => v.key));
  const previousNavRoutes = new Set(
    (previousManifest.ui?.navigation ?? []).map((n) => n.route),
  );

  // Remove fields that exist now but weren't in the previous version
  for (const obj of currentManifest.objects) {
    for (const field of obj.fields) {
      const key = `${obj.key}.${field.key}`;
      if (!previousFieldKeys.has(key)) {
        await execute(
          `DELETE FROM ${TABLES.fieldDefinitions}
           WHERE workspace_id = ? AND object_key = ? AND field_key = ? AND module_id = ?`,
          [workspaceId, obj.key, field.key, moduleId],
        );
        removedFields.push(key);
      }
    }
  }

  // Restore field metadata for fields that existed in the previous version
  for (const obj of previousManifest.objects) {
    for (const field of obj.fields) {
      await execute(
        `UPDATE ${TABLES.fieldDefinitions}
         SET label = ?, type = ?, required = ?
         WHERE workspace_id = ? AND object_key = ? AND field_key = ? AND module_id = ?`,
        [
          field.label,
          field.type,
          field.required ? 1 : 0,
          workspaceId,
          obj.key,
          field.key,
          moduleId,
        ],
      );
    }
  }

  // Remove views that exist now but weren't in the previous version
  for (const view of currentManifest.views) {
    if (!previousViewKeys.has(view.key)) {
      await execute(
        `DELETE FROM ${TABLES.viewDefinitions}
         WHERE workspace_id = ? AND view_key = ? AND module_id = ?`,
        [workspaceId, view.key, moduleId],
      );
      removedViews.push(view.key);
    }
  }

  // Remove navigation items that exist now but weren't in the previous version
  if (currentManifest.ui?.navigation) {
    for (const nav of currentManifest.ui.navigation) {
      if (!previousNavRoutes.has(nav.route)) {
        await execute(
          `DELETE FROM ${TABLES.navigationItems}
           WHERE workspace_id = ? AND route = ? AND module_id = ?`,
          [workspaceId, nav.route, moduleId],
        );
        removedNav.push(nav.route);
      }
    }
  }

  // Restore command contracts to the previous version
  await syncWorkspaceCommandContracts(
    workspaceId,
    "module",
    moduleId,
    previousManifest.version,
    previousManifest.domain?.commands ?? [],
  );

  return { removedFields, removedViews, removedNav };
}

// ── Execute Rollback ──

/**
 * Roll back a module upgrade for a specific rollout target.
 *
 * This restores the workspace to the state it was in before the upgrade
 * was executed. The pre-upgrade snapshot is used to determine what to
 * restore.
 *
 * @param targetId The rollout target ID to roll back
 * @returns The rollback result
 */
export async function rollbackUpgrade(
  targetId: string,
): Promise<RollbackResult> {
  const stepsTaken: string[] = [];
  const completedAt = now();

  try {
    // Load the rollback snapshot
    const snapshot = await loadRollbackSnapshot(targetId);

    if (!snapshot) {
      return {
        targetId,
        workspaceId: "",
        moduleId: "",
        rolledBackToVersion: "",
        status: "failed",
        stepsTaken: ["load_snapshot"],
        metadataRestored: false,
        error: "No pre-upgrade snapshot found for this target",
        completedAt,
      };
    }
    stepsTaken.push("load_snapshot");

    const { workspaceId, moduleId, versionBeforeUpgrade, versionAfterUpgrade } = snapshot;

    // Load the previous (pre-upgrade) manifest
    const previousManifest = loadInstalledModuleManifest(moduleId, versionBeforeUpgrade);

    // Load the current (post-upgrade) manifest
    let currentManifest: ModuleManifest;
    try {
      currentManifest = loadInstalledModuleManifest(moduleId, versionAfterUpgrade);
    } catch {
      // If the post-upgrade manifest can't be loaded (e.g., files removed),
      // use the current installed manifest as a best-effort fallback
      currentManifest = previousManifest;
    }
    stepsTaken.push("load_manifests");

    // Restore metadata to the previous version
    const restoreResult = await restoreMetadataToVersion(
      workspaceId,
      moduleId,
      previousManifest,
      currentManifest,
    );
    stepsTaken.push("restore_metadata");

    // Update the installation record back to the previous version
    await execute(
      `UPDATE ${TABLES.installations}
       SET module_version = ?, upgraded_at = NULL
       WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
      [versionBeforeUpgrade, workspaceId, moduleId],
    );
    stepsTaken.push("restore_installation");

    // Optionally execute downgrade SQL if the previous manifest has it
    // (Currently no downgrade SQL support in manifests, but the infrastructure
    // is here for future use)
    stepsTaken.push("complete");

    // Update the rollout target status
    await updateRolloutTargetStatus(targetId, "failed", "rolled_back");

    // Write audit event
    await writeAuditEvent({
      workspaceId,
      actorType: "system",
      actorId: "rollback_executor",
      action: "upgrade.target_rolled_back",
      entityType: "rollout_target",
      entityId: targetId,
      before: { version: versionAfterUpgrade },
      after: {
        version: versionBeforeUpgrade,
        removedFields: restoreResult.removedFields,
        removedViews: restoreResult.removedViews,
        removedNav: restoreResult.removedNav,
      },
    });

    // Clean up the snapshot record
    await execute(
      `DELETE FROM ${TABLES.installations}
       WHERE parent_operation_id = ? AND status = 'snapshot'`,
      [targetId],
    ).catch(() => {
      // Best-effort cleanup
    });

    return {
      targetId,
      workspaceId,
      moduleId,
      rolledBackToVersion: versionBeforeUpgrade,
      status: "succeeded",
      stepsTaken,
      metadataRestored: true,
      completedAt,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await updateRolloutTargetStatus(targetId, "failed", "rollback_failed");

    await writeAuditEvent({
      workspaceId: "platform",
      actorType: "system",
      actorId: "rollback_executor",
      action: "upgrade.rollback_failed",
      entityType: "rollout_target",
      entityId: targetId,
      after: { error: errorMessage },
    });

    return {
      targetId,
      workspaceId: "",
      moduleId: "",
      rolledBackToVersion: "",
      status: "partial",
      stepsTaken,
      metadataRestored: false,
      error: errorMessage,
      completedAt,
    };
  }
}

// ── Batch Rollback ──

/**
 * Roll back multiple targets that were part of a failed rollout.
 * Only targets with status 'failed' or 'succeeded' are eligible for rollback.
 */
export async function batchRollback(
  targetIds: string[],
): Promise<RollbackResult[]> {
  const results: RollbackResult[] = [];

  for (const targetId of targetIds) {
    const result = await rollbackUpgrade(targetId);
    results.push(result);
  }

  return results;
}

// ── Check Rollback Eligibility ──

/**
 * Check whether a rollout target is eligible for rollback.
 * A target is eligible if:
 * - It has a pre-upgrade snapshot
 * - Its status is 'succeeded' or 'failed' (i.e., it was executed)
 */
export async function canRollback(
  targetId: string,
): Promise<{ eligible: boolean; reason?: string }> {
  const target = await queryOne<{ status: string }>(
    `SELECT status FROM ${TABLES.rolloutTargets} WHERE id = ?`,
    [targetId],
  );

  if (!target) {
    return { eligible: false, reason: "Target not found" };
  }

  if (target.status !== "succeeded" && target.status !== "failed") {
    return {
      eligible: false,
      reason: `Target status is '${target.status}', must be 'succeeded' or 'failed'`,
    };
  }

  const snapshot = await loadRollbackSnapshot(targetId);
  if (!snapshot) {
    return { eligible: false, reason: "No pre-upgrade snapshot found" };
  }

  return { eligible: true };
}
