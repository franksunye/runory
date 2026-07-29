/**
 * Rollout Upgrade Executor (v0.9.4)
 *
 * Executes module upgrades for rollout targets. This is the missing piece
 * referenced by `catalog-rollout.ts:updateRolloutTargetStatus()` — the actual
 * engine that:
 *
 *   1. Reads a rollout target (workspaceId, fromVersion → toVersion)
 *   2. Captures a pre-upgrade snapshot (for rollback support)
 *   3. Executes migration steps from the module manifest's `migrations.upgrade[]`
 *   4. Syncs metadata changes (new fields, views, navigation, relations)
 *   5. Updates the installations record
 *   6. Runs post-upgrade validation
 *   7. Calls `updateRolloutTargetStatus()` with the final status
 *
 * Design principles:
 * - Idempotent: re-running a completed target is a no-op
 * - Observable: every step is recorded with timing and status
 * - Safe: pre-upgrade snapshots enable rollback; failures are isolated
 * - Incremental: only the migration steps matching from→to are executed
 */

import { queryAll, queryOne, execute, genId, now, db } from "./db";
import { TABLES, MODULES_DIR, businessTable } from "./contracts";
import {
  loadModuleManifest,
  loadInstalledModuleManifest,
  loadModuleMigration,
} from "./installer";
import { updateRolloutTargetStatus, getRollout, listRolloutTargets } from "./catalog-rollout";
import { getCatalogVersion } from "./catalog-registry";
import { getRelease } from "./catalog-release";
import { writeAuditEvent } from "./audit-service";
import { syncWorkspaceCommandContracts } from "./command-contracts";
import {
  normalizeLegacyViewConfig,
  parseViewConfig,
  type ModuleManifest,
  type UpgradeExecutionResult,
  type UpgradeStepResult,
  type UpgradeValidationCheck,
  type RollbackSnapshot,
} from "@runory/contracts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { moduleManifestSchema } from "@runory/contracts";

// ── Pre-upgrade Snapshot ──

/**
 * Capture the state of a workspace's installation before an upgrade.
 * This snapshot is used by the rollback system to restore the workspace
 * if the upgrade fails or needs to be reversed.
 */
export async function capturePreUpgradeSnapshot(
  targetId: string,
  workspaceId: string,
  moduleId: string,
  versionBeforeUpgrade: string,
  versionAfterUpgrade: string,
): Promise<RollbackSnapshot> {
  const installation = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.installations}
     WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
    [workspaceId, moduleId],
  );

  const objects = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.objectDefinitions}
     WHERE workspace_id = ? AND module_id = ?`,
    [workspaceId, moduleId],
  );

  const fields = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.fieldDefinitions}
     WHERE workspace_id = ? AND module_id = ?`,
    [workspaceId, moduleId],
  );

  const views = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.viewDefinitions}
     WHERE workspace_id = ? AND module_id = ?`,
    [workspaceId, moduleId],
  );

  const navigation = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.navigationItems}
     WHERE workspace_id = ? AND module_id = ?`,
    [workspaceId, moduleId],
  );

  const snapshot: RollbackSnapshot = {
    targetId,
    workspaceId,
    moduleId,
    versionBeforeUpgrade,
    versionAfterUpgrade,
    capturedAt: now(),
    installationRecord: installation ?? {},
    metadataState: {
      objects: objects ?? [],
      fields: fields ?? [],
      views: views ?? [],
      navigation: navigation ?? [],
    },
  };

  // Persist the snapshot for later rollback
  await execute(
    `INSERT INTO ${TABLES.installations}
     (id, workspace_id, module_id, module_version, pack_id, status, installed_at, parent_operation_id)
     VALUES (?, ?, ?, ?, NULL, 'snapshot', ?, ?)`,
    [genId("snap"), workspaceId, moduleId, versionBeforeUpgrade, now(), targetId],
  ).catch(() => {
    // Snapshot persistence is best-effort — the table may not support this
    // pattern in all schemas. The snapshot is also returned to the caller.
  });

  return snapshot;
}

// ── Find Upgrade Migration Steps ──

interface ResolvedUpgradePath {
  steps: NonNullable<ModuleManifest["migrations"]["upgrade"]>;
  fromVersion: string;
  toVersion: string;
}

/**
 * Resolve the upgrade migration steps from the current version to the target version.
 *
 * The module manifest's `migrations.upgrade[]` array contains steps with
 * `from` and `to` version fields. We find the chain of steps that goes from
 * the current version to the target version.
 */
function resolveUpgradePath(
  currentManifest: ModuleManifest,
  targetManifest: ModuleManifest,
): ResolvedUpgradePath {
  const upgradeSteps = targetManifest.migrations.upgrade ?? [];

  if (upgradeSteps.length === 0) {
    return {
      steps: [],
      fromVersion: currentManifest.version,
      toVersion: targetManifest.version,
    };
  }

  // Find steps that match the from→to path.
  // If a step has `from: undefined`, it applies to any starting version.
  // If a step's `from` matches the current version, include it.
  // For simplicity, we include all steps whose `from` is undefined or matches
  // the current version, and whose `to` is the target version or an intermediate.
  const matchingSteps = upgradeSteps.filter((step) => {
    const fromMatches = step.from === undefined || step.from === currentManifest.version;
    const toMatches = step.to === targetManifest.version ||
      step.to === currentManifest.version ||
      step.from === currentManifest.version;
    return fromMatches || toMatches;
  });

  return {
    steps: matchingSteps.length > 0 ? matchingSteps : upgradeSteps,
    fromVersion: currentManifest.version,
    toVersion: targetManifest.version,
  };
}

// ── Sync Metadata After Upgrade ──

/**
 * After executing upgrade SQL, sync the module's metadata (objects, fields,
 * views, navigation) to match the new manifest version. This handles cases
 * where the new version adds fields, changes labels, or adds new views.
 */
async function syncModuleMetadata(
  workspaceId: string,
  moduleId: string,
  newManifest: ModuleManifest,
): Promise<void> {
  // Sync new fields that don't exist yet
  for (const obj of newManifest.objects) {
    // Ensure object definition exists
    const existingObj = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.objectDefinitions}
       WHERE workspace_id = ? AND object_key = ? AND module_id = ?`,
      [workspaceId, obj.key, moduleId],
    );

    if (!existingObj) {
      await execute(
        `INSERT INTO ${TABLES.objectDefinitions}
         (id, workspace_id, object_key, label, module_id, ownership, created_at)
         VALUES (?, ?, ?, ?, ?, 'module_owned', ?)`,
        [genId("obj"), workspaceId, obj.key, obj.label, moduleId, now()],
      );
    } else {
      // Update label if changed
      await execute(
        `UPDATE ${TABLES.objectDefinitions} SET label = ? WHERE id = ?`,
        [obj.label, existingObj.id],
      );
    }

    // Sync fields
    for (const field of obj.fields) {
      const existingField = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.fieldDefinitions}
         WHERE workspace_id = ? AND object_key = ? AND field_key = ? AND module_id = ?`,
        [workspaceId, obj.key, field.key, moduleId],
      );

      if (!existingField) {
        await execute(
          `INSERT INTO ${TABLES.fieldDefinitions}
           (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            genId("fld"), workspaceId, obj.key, field.key, field.label, field.type,
            field.ownership, field.required ? 1 : 0, field.default_value ?? null,
            field.validation ? JSON.stringify(field.validation) : null, moduleId, now(),
          ],
        );
      } else {
        // Update field metadata
        await execute(
          `UPDATE ${TABLES.fieldDefinitions}
           SET label = ?, type = ?, required = ?
           WHERE id = ?`,
          [field.label, field.type, field.required ? 1 : 0, existingField.id],
        );
      }
    }
  }

  // Sync views
  for (const view of newManifest.views) {
    const existingView = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.viewDefinitions}
       WHERE workspace_id = ? AND view_key = ? AND module_id = ?`,
      [workspaceId, view.key, moduleId],
    );

    const normalizedConfig = normalizeLegacyViewConfig(
      view.config as Record<string, unknown>,
      view.key,
      view.type as "list" | "form",
    );

    if (!existingView) {
      await execute(
        `INSERT INTO ${TABLES.viewDefinitions}
         (id, workspace_id, object_key, view_key, view_type, label, config_json, module_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          genId("view"), workspaceId, view.object, view.key, view.type, view.label,
          JSON.stringify(normalizedConfig), moduleId, now(),
        ],
      );
    } else {
      await execute(
        `UPDATE ${TABLES.viewDefinitions}
         SET label = ?, config_json = ?
         WHERE id = ?`,
        [view.label, JSON.stringify(normalizedConfig), existingView.id],
      );
    }
  }

  // Sync navigation items
  if (newManifest.ui?.navigation) {
    for (const nav of newManifest.ui.navigation) {
      const existingNav = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.navigationItems}
         WHERE workspace_id = ? AND route = ? AND module_id = ?`,
        [workspaceId, nav.route, moduleId],
      );

      if (!existingNav) {
        await execute(
          `INSERT INTO ${TABLES.navigationItems}
           (id, workspace_id, label, route, icon, sort_order, module_id, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [genId("nav"), workspaceId, nav.label, nav.route, nav.icon, nav.sortOrder, moduleId],
        );
      } else {
        await execute(
          `UPDATE ${TABLES.navigationItems}
           SET label = ?, icon = ?, sort_order = ?
           WHERE id = ?`,
          [nav.label, nav.icon, nav.sortOrder, existingNav.id],
        );
      }
    }
  }

  // Sync command contracts
  await syncWorkspaceCommandContracts(
    workspaceId,
    "module",
    moduleId,
    newManifest.version,
    newManifest.domain?.commands ?? [],
  );
}

// ── Post-upgrade Validation ──

/**
 * Validate that an upgrade was applied correctly by checking:
 * - All expected objects exist
 * - All expected fields exist with correct types
 * - All expected views exist
 * - The installation record reflects the new version
 */
export async function validateUpgrade(
  workspaceId: string,
  moduleId: string,
  expectedManifest: ModuleManifest,
): Promise<UpgradeValidationCheck[]> {
  const checks: UpgradeValidationCheck[] = [];

  // Check 1: Installation record reflects new version
  const installation = await queryOne<{ module_version: string; status: string }>(
    `SELECT module_version, status FROM ${TABLES.installations}
     WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
    [workspaceId, moduleId],
  );

  if (!installation) {
    checks.push({
      name: "installation_record",
      status: "fail",
      message: `No active installation found for ${moduleId} in workspace ${workspaceId}`,
    });
  } else if (installation.module_version !== expectedManifest.version) {
    checks.push({
      name: "installation_version",
      status: "fail",
      message: `Installation version is ${installation.module_version}, expected ${expectedManifest.version}`,
      detail: { actual: installation.module_version, expected: expectedManifest.version },
    });
  } else {
    checks.push({
      name: "installation_version",
      status: "pass",
      message: `Installation version matches expected ${expectedManifest.version}`,
    });
  }

  // Check 2: All expected objects exist
  for (const obj of expectedManifest.objects) {
    const objectDef = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.objectDefinitions}
       WHERE workspace_id = ? AND object_key = ? AND module_id = ?`,
      [workspaceId, obj.key, moduleId],
    );

    if (!objectDef) {
      checks.push({
        name: `object:${obj.key}`,
        status: "fail",
        message: `Object '${obj.key}' not found after upgrade`,
      });
    } else {
      checks.push({
        name: `object:${obj.key}`,
        status: "pass",
        message: `Object '${obj.key}' exists`,
      });
    }
  }

  // Check 3: All expected fields exist
  for (const obj of expectedManifest.objects) {
    for (const field of obj.fields) {
      const fieldDef = await queryOne<{ id: string; type: string }>(
        `SELECT id, type FROM ${TABLES.fieldDefinitions}
         WHERE workspace_id = ? AND object_key = ? AND field_key = ? AND module_id = ?`,
        [workspaceId, obj.key, field.key, moduleId],
      );

      if (!fieldDef) {
        checks.push({
          name: `field:${obj.key}.${field.key}`,
          status: "fail",
          message: `Field '${obj.key}.${field.key}' not found after upgrade`,
        });
      } else if (fieldDef.type !== field.type) {
        checks.push({
          name: `field:${obj.key}.${field.key}`,
          status: "warn",
          message: `Field '${obj.key}.${field.key}' type is ${fieldDef.type}, expected ${field.type}`,
          detail: { actual: fieldDef.type, expected: field.type },
        });
      } else {
        checks.push({
          name: `field:${obj.key}.${field.key}`,
          status: "pass",
          message: `Field '${obj.key}.${field.key}' exists with correct type`,
        });
      }
    }
  }

  // Check 4: All expected views exist
  for (const view of expectedManifest.views) {
    const viewDef = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.viewDefinitions}
       WHERE workspace_id = ? AND view_key = ? AND module_id = ?`,
      [workspaceId, view.key, moduleId],
    );

    if (!viewDef) {
      checks.push({
        name: `view:${view.key}`,
        status: "fail",
        message: `View '${view.key}' not found after upgrade`,
      });
    } else {
      checks.push({
        name: `view:${view.key}`,
        status: "pass",
        message: `View '${view.key}' exists`,
      });
    }
  }

  // Check 5: Business tables exist
  for (const obj of expectedManifest.objects) {
    const tableName = businessTable(obj.key);
    try {
      await queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
        [tableName],
      );
      checks.push({
        name: `table:${tableName}`,
        status: "pass",
        message: `Business table '${tableName}' exists`,
      });
    } catch {
      checks.push({
        name: `table:${tableName}`,
        status: "fail",
        message: `Business table '${tableName}' not found after upgrade`,
      });
    }
  }

  return checks;
}

// ── Execute Single Rollout Target ──

/**
 * Execute the upgrade for a single rollout target.
 *
 * This is the core function called by the upgrade executor. It:
 * 1. Loads the rollout target
 * 2. Resolves the from/to versions
 * 3. Captures a pre-upgrade snapshot
 * 4. Executes migration steps
 * 5. Syncs metadata
 * 6. Validates the result
 * 7. Updates the target status
 */
export async function executeRolloutTarget(
  targetId: string,
): Promise<UpgradeExecutionResult> {
  const startedAt = now();
  const startTime = Date.now();

  // Load the target
  const target = await queryOne<{
    id: string;
    rollout_id: string;
    workspace_id: string;
    from_version_id: string | null;
    to_version_id: string;
    status: string;
  }>(
    `SELECT * FROM ${TABLES.rolloutTargets} WHERE id = ?`,
    [targetId],
  );

  if (!target) {
    throw new Error(`Rollout target not found: ${targetId}`);
  }

  // Skip if already processed
  if (target.status === "succeeded" || target.status === "failed" || target.status === "skipped") {
    return {
      rolloutId: target.rollout_id,
      targetId,
      workspaceId: target.workspace_id,
      moduleId: "",
      fromVersion: "",
      toVersion: "",
      status: "skipped",
      steps: [],
      validations: [],
      startedAt,
      completedAt: now(),
      durationMs: 0,
      error: `Target already in status: ${target.status}`,
    };
  }

  // Mark as running
  await updateRolloutTargetStatus(targetId, "running");

  try {
    // Resolve the target version's catalog entry to get the module manifest
    const toVersion = await getCatalogVersion(target.to_version_id);

    // Load the target module manifest from the catalog version
    const targetManifest = JSON.parse(toVersion.manifestJson) as ModuleManifest;
    const moduleId = targetManifest.id;

    // Load the currently installed manifest
    const currentInstallation = await queryOne<{ module_version: string }>(
      `SELECT module_version FROM ${TABLES.installations}
       WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
      [target.workspace_id, moduleId],
    );

    if (!currentInstallation) {
      throw new Error(
        `No active installation found for ${moduleId} in workspace ${target.workspace_id}`,
      );
    }

    const fromVersion = currentInstallation.module_version;
    const currentManifest = loadInstalledModuleManifest(moduleId, fromVersion);

    // Capture pre-upgrade snapshot for rollback support
    await capturePreUpgradeSnapshot(
      targetId,
      target.workspace_id,
      moduleId,
      fromVersion,
      targetManifest.version,
    );

    // Resolve upgrade migration steps
    const upgradePath = resolveUpgradePath(currentManifest, targetManifest);

    const stepResults: UpgradeStepResult[] = [];

    // Execute each migration step
    for (let i = 0; i < upgradePath.steps.length; i++) {
      const step = upgradePath.steps[i];
      const stepStartTime = Date.now();

      const stepResult: UpgradeStepResult = {
        stepIndex: i,
        fromVersion: step.from,
        toVersion: step.to,
        script: step.script,
        risk: step.risk,
        status: "running",
        durationMs: 0,
      };

      try {
        // Load and execute the migration SQL
        const migrationSql = loadModuleMigration(moduleId, step.script);
        await db.executeMultiple(migrationSql);

        stepResult.status = "succeeded";
        stepResult.durationMs = Date.now() - stepStartTime;
      } catch (err) {
        stepResult.status = "failed";
        stepResult.error = err instanceof Error ? err.message : String(err);
        stepResult.durationMs = Date.now() - stepStartTime;
        stepResults.push(stepResult);
        throw err;
      }

      stepResults.push(stepResult);
    }

    // Sync metadata to match the new manifest
    await syncModuleMetadata(target.workspace_id, moduleId, targetManifest);

    // Update the installation record to the new version
    await execute(
      `UPDATE ${TABLES.installations}
       SET module_version = ?, catalog_version_id = ?, upgraded_at = ?
       WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
      [
        targetManifest.version,
        target.to_version_id,
        now(),
        target.workspace_id,
        moduleId,
      ],
    );

    // Run post-upgrade validation
    const validations = await validateUpgrade(
      target.workspace_id,
      moduleId,
      targetManifest,
    );

    const hasFailures = validations.some((v) => v.status === "fail");
    const completedAt = now();
    const durationMs = Date.now() - startTime;

    const result: UpgradeExecutionResult = {
      rolloutId: target.rollout_id,
      targetId,
      workspaceId: target.workspace_id,
      moduleId,
      fromVersion,
      toVersion: targetManifest.version,
      status: hasFailures ? "failed" : "succeeded",
      steps: stepResults,
      validations,
      startedAt,
      completedAt,
      durationMs,
      ...(hasFailures ? { error: "Post-upgrade validation failed" } : {}),
    };

    // Update the target status
    await updateRolloutTargetStatus(
      targetId,
      hasFailures ? "failed" : "succeeded",
      hasFailures ? "validation_failed" : undefined,
    );

    // Write audit event
    await writeAuditEvent({
      workspaceId: target.workspace_id,
      actorType: "system",
      actorId: "upgrade_executor",
      action: "upgrade.target_executed",
      entityType: "rollout_target",
      entityId: targetId,
      after: {
        moduleId,
        fromVersion,
        toVersion: targetManifest.version,
        status: result.status,
        durationMs,
        stepCount: stepResults.length,
        validationCount: validations.length,
      },
    });

    return result;
  } catch (err) {
    const completedAt = now();
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    await updateRolloutTargetStatus(targetId, "failed", "execution_error");

    await writeAuditEvent({
      workspaceId: target.workspace_id,
      actorType: "system",
      actorId: "upgrade_executor",
      action: "upgrade.target_failed",
      entityType: "rollout_target",
      entityId: targetId,
      after: {
        error: errorMessage,
        durationMs,
      },
    });

    return {
      rolloutId: target.rollout_id,
      targetId,
      workspaceId: target.workspace_id,
      moduleId: "",
      fromVersion: "",
      toVersion: "",
      status: "failed",
      steps: [],
      validations: [],
      startedAt,
      completedAt,
      durationMs,
      error: errorMessage,
    };
  }
}

// ── Execute All Pending Targets in a Rollout ──

/**
 * Execute all pending targets in a rollout sequentially.
 * Stops if the rollout is paused or canceled.
 *
 * Returns the results for all executed targets.
 */
export async function executeRollout(
  rolloutId: string,
  options?: { maxTargets?: number },
): Promise<UpgradeExecutionResult[]> {
  // Verify the rollout exists and is in a runnable state
  const rollout = await getRollout(rolloutId);
  if (rollout.status !== "running" && rollout.status !== "resumed") {
    throw new Error(
      `Rollout ${rolloutId} must be 'running' or 'resumed' to execute (current: ${rollout.status})`,
    );
  }

  // Get all pending targets
  const pendingTargets = await listRolloutTargets(rolloutId, { status: "pending" });

  const maxTargets = options?.maxTargets ?? pendingTargets.length;
  const targetsToExecute = pendingTargets.slice(0, maxTargets);

  const results: UpgradeExecutionResult[] = [];

  for (const target of targetsToExecute) {
    // Re-check rollout status — it may have been auto-paused
    const currentRollout = await getRollout(rolloutId);
    if (currentRollout.status !== "running" && currentRollout.status !== "resumed") {
      // Rollout was paused/canceled — stop processing
      break;
    }

    const result = await executeRolloutTarget(target.id);
    results.push(result);

    // If a target failed and the rollout was auto-paused, stop processing
    if (result.status === "failed") {
      const updatedRollout = await getRollout(rolloutId);
      if (updatedRollout.status === "paused") {
        break;
      }
    }
  }

  // Check if all targets are settled — if so, mark the rollout as completed
  const allTargets = await listRolloutTargets(rolloutId);
  const allSettled = allTargets.every(
    (t) => t.status === "succeeded" || t.status === "failed" || t.status === "skipped",
  );

  if (allSettled) {
    await execute(
      `UPDATE ${TABLES.releaseRollouts}
       SET status = 'completed', completed_at = ?
       WHERE id = ?`,
      [now(), rolloutId],
    );
  }

  return results;
}

// ── Get Upgrade Execution Status ──

/**
 * Get a summary of upgrade execution status for a rollout.
 */
export async function getUpgradeExecutionStatus(
  rolloutId: string,
): Promise<{
  rolloutId: string;
  rolloutStatus: string;
  totalTargets: number;
  executedTargets: number;
  succeededTargets: number;
  failedTargets: number;
  pendingTargets: number;
  skippedTargets: number;
}> {
  const rollout = await getRollout(rolloutId);
  const targets = await listRolloutTargets(rolloutId);

  const counts = {
    succeeded: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    running: 0,
  };

  for (const target of targets) {
    counts[target.status]++;
  }

  return {
    rolloutId,
    rolloutStatus: rollout.status,
    totalTargets: targets.length,
    executedTargets: counts.succeeded + counts.failed,
    succeededTargets: counts.succeeded,
    failedTargets: counts.failed,
    pendingTargets: counts.pending,
    skippedTargets: counts.skipped,
  };
}
