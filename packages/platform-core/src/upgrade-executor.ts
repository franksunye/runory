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

import { query, queryOne, execute, genId, now, db, runInTransaction, type Transaction } from "./db";
import { TABLES, MODULES_DIR, businessTable } from "./contracts";
import { loadModuleMigration } from "./installer";
import { updateRolloutTargetStatus, getRollout, listRolloutTargets } from "./catalog-rollout";
import { getCatalogVersion } from "./catalog-registry";
import { writeAuditEvent } from "./audit-service";
import { syncWorkspaceCommandContracts } from "./command-contracts";
import {
  moduleManifestSchema,
  normalizeLegacyViewConfig,
  type ModuleManifest,
  type UpgradeExecutionResult,
  type UpgradeStepResult,
  type UpgradeValidationCheck,
} from "@runory/contracts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { capturePreUpgradeSnapshot, readUpgradeState, upgradeStateChecksum } from "./upgrade-snapshots";

export { capturePreUpgradeSnapshot } from "./upgrade-snapshots";

// An omitted `from` is a fresh-install step, never an upgrade wildcard.
// Refuse gaps/ambiguity instead of running unrelated SQL as a fallback.
function resolveUpgradePath(fromVersion: string, targetManifest: ModuleManifest) {
  const available = targetManifest.migrations.upgrade ?? [];
  if (available.length === 0) return [];
  const steps: typeof available = [];
  const visited = new Set<string>();
  let version = fromVersion;
  while (version !== targetManifest.version) {
    if (visited.has(version)) throw new Error("Cycle in module upgrade migration path");
    visited.add(version);
    const next = available.filter((step) => step.from === version);
    if (next.length !== 1) {
      throw new Error(`Expected one migration from ${version} toward ${targetManifest.version}, found ${next.length}`);
    }
    steps.push(next[0]);
    version = next[0].to;
  }
  return steps;
}

function loadUpgradeSql(moduleId: string, step: NonNullable<ModuleManifest["migrations"]["upgrade"]>[number]) {
  const moduleRoot = resolve(MODULES_DIR, moduleId);
  const scriptPath = resolve(moduleRoot, step.script);
  const localPath = relative(moduleRoot, scriptPath);
  if (isAbsolute(localPath) || localPath === ".." || localPath.startsWith("../")) {
    throw new Error("Upgrade script must be inside its module directory");
  }
  if (step.checksum) {
    const checksum = createHash("sha256").update(readFileSync(scriptPath)).digest("hex");
    if (checksum !== step.checksum) throw new Error(`Upgrade script checksum mismatch: ${step.script}`);
  }
  return loadModuleMigration(moduleId, step.script);
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
  transaction: Transaction,
): Promise<void> {
  const queryOne = async <T>(sql: string, args: unknown[]): Promise<T | undefined> =>
    (await transaction.execute({ sql, args: args as never })).rows[0] as T | undefined;
  const execute = async (sql: string, args: unknown[]) => {
    await transaction.execute({ sql, args: args as never });
  };
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
           SET label = ?, type = ?, ownership = ?, required = ?, default_value = ?, validation_json = ?
           WHERE id = ?`,
          [field.label, field.type, field.ownership, field.required ? 1 : 0,
            field.default_value ?? null, field.validation ? JSON.stringify(field.validation) : null, existingField.id],
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
         SET object_key = ?, view_type = ?, label = ?, config_json = ?
         WHERE id = ?`,
        [view.object, view.type, view.label, JSON.stringify(normalizedConfig), existingView.id],
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

  for (const relation of newManifest.relations ?? []) {
    await execute(
      `INSERT INTO ${TABLES.relationDefinitions}
       (id, workspace_id, object_key, target_object_key, target_module_id, relation_type, foreign_key, label, module_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, object_key, foreign_key) DO UPDATE SET
         target_object_key = excluded.target_object_key, target_module_id = excluded.target_module_id,
         relation_type = excluded.relation_type, label = excluded.label
       WHERE module_id = excluded.module_id`,
      [genId("rel"), workspaceId, relation.object, relation.targetObject, relation.targetModule,
        relation.type, relation.foreignKey, relation.label ?? null, moduleId, now()],
    );
  }

  // Sync command contracts in the same transaction as metadata and installation.
  await syncWorkspaceCommandContracts(
    workspaceId,
    "module",
    moduleId,
    newManifest.version,
    newManifest.domain?.commands ?? [],
    transaction,
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
      const table = await queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
        [tableName],
      );
      if (!table) throw new Error(`Missing business table: ${tableName}`);
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

  // Only one worker can claim a pending target. A running SQL migration must
  // never be replayed automatically after a crash.
  const claim = await query(
    `UPDATE ${TABLES.rolloutTargets} SET status = 'running', started_at = ?
     WHERE id = ? AND status = 'pending'`,
    [startedAt, targetId],
  );
  if (claim.rowsAffected !== 1) {
    return {
      rolloutId: target.rollout_id, targetId, workspaceId: target.workspace_id,
      moduleId: "", fromVersion: "", toVersion: "", status: "skipped",
      steps: [], validations: [], startedAt, completedAt: now(), durationMs: 0,
      error: `Target is already running or settled: ${target.status}`,
    };
  }

  const stepResults: UpgradeStepResult[] = [];
  let moduleId = "";
  let fromVersion = "";
  let toVersionNumber = "";
  let snapshotCaptured = false;
  try {
    const toVersion = await getCatalogVersion(target.to_version_id);
    const targetManifest = moduleManifestSchema.parse(JSON.parse(toVersion.manifestJson));
    moduleId = targetManifest.id;
    toVersionNumber = targetManifest.version;
    if (toVersion.version !== targetManifest.version) throw new Error("Catalog and manifest versions differ");

    const currentInstallation = await queryOne<{ module_version: string; catalog_version_id: string | null }>(
      `SELECT module_version, catalog_version_id FROM ${TABLES.installations}
       WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
      [target.workspace_id, moduleId],
    );
    if (!currentInstallation) throw new Error(`No active installation found for ${moduleId} in workspace ${target.workspace_id}`);
    if (target.from_version_id && target.from_version_id !== currentInstallation.catalog_version_id) {
      throw new Error("Installation no longer matches the rollout's source catalog version");
    }
    fromVersion = currentInstallation.module_version;
    // Validate and load the complete migration path before capturing/mutating.
    const upgradeSteps = resolveUpgradePath(fromVersion, targetManifest);
    const scripts = upgradeSteps.map((step) => loadUpgradeSql(moduleId, step));
    const snapshot = await capturePreUpgradeSnapshot(
      targetId, target.workspace_id, moduleId, fromVersion, targetManifest.version,
    );
    snapshotCaptured = true;
    const beforeChecksum = upgradeStateChecksum({
      installationRecord: snapshot.installationRecord, metadataState: snapshot.metadataState,
    });

    if (scripts.length > 0) {
      // Persist the irreversible boundary BEFORE the first SQL statement. If a
      // process dies or a script partially fails, metadata-only rollback must
      // not pretend to restore the database schema/data.
      await runInTransaction(async (tx) => {
        if (upgradeStateChecksum(await readUpgradeState(tx, target.workspace_id, moduleId)) !== beforeChecksum) {
          throw new Error("Installation or metadata changed after upgrade snapshot capture");
        }
        const marked = await tx.execute({
          sql: `UPDATE ${TABLES.upgradeExecutionStates}
                SET phase = 'migrating', migration_started_at = ?, updated_at = ?
                WHERE target_id = ? AND phase = 'captured' AND migration_started_at IS NULL`,
          args: [now(), now(), targetId],
        });
        if (marked.rowsAffected !== 1) throw new Error("Migration was already attempted; operator recovery is required");
      });
    }

    for (let i = 0; i < upgradeSteps.length; i++) {
      const step = upgradeSteps[i];
      const stepStartTime = Date.now();
      const stepResult: UpgradeStepResult = {
        stepIndex: i, fromVersion: step.from, toVersion: step.to, script: step.script,
        risk: step.risk, status: "running", durationMs: 0,
      };
      stepResults.push(stepResult);
      try {
        await db.executeMultiple(scripts[i]);
        stepResult.status = "succeeded";
      } catch (err) {
        stepResult.status = "failed";
        stepResult.error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        stepResult.durationMs = Date.now() - stepStartTime;
      }
    }

    await runInTransaction(async (tx) => {
      if (upgradeStateChecksum(await readUpgradeState(tx, target.workspace_id, moduleId)) !== beforeChecksum) {
        throw new Error("Installation or metadata changed after upgrade snapshot capture");
      }
      await syncModuleMetadata(target.workspace_id, moduleId, targetManifest, tx);
      await tx.execute({
        sql: `UPDATE ${TABLES.installations}
              SET module_version = ?, catalog_item_id = ?, catalog_version_id = ?,
                  resolved_version = ?, artifact_checksum = ?,
                  source_release_id = (SELECT catalog_release_id FROM ${TABLES.releaseRollouts} WHERE id = ?),
                  upgraded_at = ?, last_compatibility_report_id = NULL
              WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
        args: [targetManifest.version, toVersion.catalogItemId, target.to_version_id,
          targetManifest.version, toVersion.artifactChecksum ?? null, target.rollout_id, now(), target.workspace_id, moduleId],
      });
      const applied = await readUpgradeState(tx, target.workspace_id, moduleId);
      await tx.execute({
        sql: `UPDATE ${TABLES.upgradeExecutionStates}
              SET phase = 'applied', applied_state_checksum = ?, updated_at = ? WHERE target_id = ?`,
        args: [upgradeStateChecksum(applied), now(), targetId],
      });
    });

    const validations = await validateUpgrade(target.workspace_id, moduleId, targetManifest);
    const hasFailures = validations.some((v) => v.status === "fail");
    const durationMs = Date.now() - startTime;
    const result: UpgradeExecutionResult = {
      rolloutId: target.rollout_id, targetId, workspaceId: target.workspace_id,
      moduleId, fromVersion, toVersion: targetManifest.version,
      status: hasFailures ? "failed" : "succeeded", steps: stepResults, validations,
      startedAt, completedAt: now(), durationMs,
      ...(hasFailures ? { error: "Post-upgrade validation failed" } : {}),
    };
    await updateRolloutTargetStatus(targetId, result.status, hasFailures ? "validation_failed" : undefined);
    await writeAuditEvent({
      workspaceId: target.workspace_id, actorType: "system", actorId: "upgrade_executor",
      action: "upgrade.target_executed", entityType: "rollout_target", entityId: targetId,
      after: { moduleId, fromVersion, toVersion: targetManifest.version, status: result.status,
        durationMs, stepCount: stepResults.length, validationCount: validations.length },
    });
    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (snapshotCaptured) {
      await execute(
        `UPDATE ${TABLES.upgradeExecutionStates} SET phase = 'failed', updated_at = ? WHERE target_id = ?`,
        [now(), targetId],
      );
    }
    await updateRolloutTargetStatus(targetId, "failed", "execution_error");
    await writeAuditEvent({
      workspaceId: target.workspace_id, actorType: "system", actorId: "upgrade_executor",
      action: "upgrade.target_failed", entityType: "rollout_target", entityId: targetId,
      after: { error: errorMessage, durationMs },
    });
    return {
      rolloutId: target.rollout_id, targetId, workspaceId: target.workspace_id,
      moduleId, fromVersion, toVersion: toVersionNumber, status: "failed", steps: stepResults,
      validations: [], startedAt, completedAt: now(), durationMs, error: errorMessage,
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
