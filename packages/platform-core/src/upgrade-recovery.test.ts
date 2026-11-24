import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandContractSchema, type ModuleManifest } from "@runory/contracts";
import { TABLES, businessTable } from "./contracts";
import { db, execute, genId, now, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { installModule, loadModuleManifest } from "./installer";
import { syncWorkspaceCommandContracts } from "./command-contracts";
import { capturePreUpgradeSnapshot, executeRolloutTarget } from "./upgrade-executor";
import { canRollback, loadRollbackSnapshot, rollbackUpgrade } from "./upgrade-rollback";
import { readUpgradeState, upgradeStateChecksum } from "./upgrade-snapshots";

// Every case uses a real file and all platform migrations, independently of the
// rest of the suite. Reopening discards the client and migration caches.
const temporaryDirectory = mkdtempSync(join(tmpdir(), "runory-upgrade-recovery-"));
const previousUrl = process.env.LIBSQL_URL;
let databaseNumber = 0;
const workspaceId = "ws_upgrade_recovery";
function closeDatabase() {
  globalThis.__platformDb?.close();
  globalThis.__platformDb = undefined;
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
}
beforeEach(async () => {
  closeDatabase();
  process.env.LIBSQL_URL = `file:${join(temporaryDirectory, `${++databaseNumber}.db`)}`;
  await runMigrations();
  await execute(`INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, 'Recovery', 'recovery', ?, ?)`,
    [workspaceId, now(), now()]);
});
afterEach(closeDatabase);
afterAll(() => {
  if (previousUrl === undefined) delete process.env.LIBSQL_URL;
  else process.env.LIBSQL_URL = previousUrl;
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function prepareUpgrade(sqlMigration = false) {
  const moduleId = sqlMigration ? "runory.customer" : "runory.company";
  const objectKey = sqlMigration ? "customer" : "company";
  await installModule(workspaceId, moduleId, "recovery-pack");
  const beforeManifest = structuredClone(loadModuleManifest(moduleId));
  if (!sqlMigration) {
    const command = commandContractSchema.parse({
      key: "company.qualify", contractVersion: "1.0.0", aggregate: "company",
      transition: { from: ["lead"], to: "customer" }, permission: "company.update",
      emits: ["company.qualified"], postconditions: ["Company stage is customer"],
    });
    beforeManifest.domain = { aggregates: [{ key: "company", stateField: "lifecycle_stage", versionField: "version" }], commands: [command] };
    beforeManifest.objects[0].fields.push({ key: "version", label: "Version", type: "number", ownership: "module_owned", required: true, default_value: "0" });
    await execute(`ALTER TABLE ${businessTable(objectKey)} ADD COLUMN version INTEGER NOT NULL DEFAULT 0`);
    await execute(`INSERT INTO ${TABLES.fieldDefinitions}
      (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, module_id, created_at)
      VALUES (?, ?, ?, 'version', 'Version', 'number', 'module_owned', 1, '0', ?, ?)`,
    [genId("field"), workspaceId, objectKey, moduleId, now()]);
    await syncWorkspaceCommandContracts(workspaceId, "module", moduleId, beforeManifest.version, [command]);
    // Persisted custom values intentionally differ from the shipped manifest.
    // Recovery must use the captured DB state, never reconstruct from YAML.
    await execute(`UPDATE ${TABLES.objectDefinitions} SET label = 'Local company label' WHERE workspace_id = ? AND module_id = ?`, [workspaceId, moduleId]);
    await execute(`UPDATE ${TABLES.fieldDefinitions} SET label = 'Local name', default_value = 'Prior default', validation_json = '{"maxLength":90}'
      WHERE workspace_id = ? AND module_id = ? AND field_key = 'name'`, [workspaceId, moduleId]);
    await execute(`UPDATE ${TABLES.navigationItems} SET label = 'Local navigation', enabled = 0 WHERE workspace_id = ? AND module_id = ?`, [workspaceId, moduleId]);
    await execute(`INSERT INTO ${TABLES.relationDefinitions}
      (id, workspace_id, object_key, target_object_key, target_module_id, relation_type, foreign_key, label, module_id, created_at)
      VALUES ('prior_relation', ?, 'company', 'company', ?, 'many_to_one', 'parent_id', 'Prior relation', ?, ?)`,
    [workspaceId, moduleId, moduleId, now()]);
  }
  const afterManifest: ModuleManifest = structuredClone(beforeManifest);
  afterManifest.version = "1.1.0";
  afterManifest.objects[0].label = "Upgraded object";
  afterManifest.objects[0].fields[0].label = "Upgraded name";
  afterManifest.objects[0].fields[0].default_value = "After default";
  afterManifest.objects[0].fields[0].validation = { maxLength: 50 };
  afterManifest.views[0].label = "Upgraded list";
  afterManifest.views[0].config.pageSize = 50;
  afterManifest.views.push({ ...structuredClone(afterManifest.views[0]), key: `${objectKey}_new_list` });
  afterManifest.ui!.navigation![0].label = "Upgraded navigation";
  afterManifest.ui!.navigation!.push({ label: "New navigation", route: "/new-recovery-view", icon: "file", sortOrder: 999, contextual: false });
  if (sqlMigration) {
    afterManifest.migrations.upgrade = [{ from: "1.0.0", to: "1.1.0", script: "v1.1/migrations/upgrade-from-1.0.sql", risk: "medium" }];
    afterManifest.objects[0].fields.push({ key: "industry", label: "Industry", type: "text", ownership: "module_owned", required: false });
  } else {
    afterManifest.domain!.commands[0].contractVersion = "1.1.0";
    afterManifest.domain!.commands[0].requiresReason = true;
    afterManifest.relations = [{ object: "company", targetObject: "company", targetModule: moduleId, type: "many_to_one", foreignKey: "parent_id", label: "Upgraded relation" }];
    // The installer's physical soft-delete column already exists; registering
    // its metadata needs no SQL migration.
    afterManifest.objects[0].fields.push({ key: "deleted_at", label: "Deleted at", type: "date", ownership: "module_owned", required: false });
  }
  const itemId = "recovery_item";
  const beforeVersionId = "recovery_version_before";
  const afterVersionId = "recovery_version_after";
  const beforeReleaseId = "recovery_release_before";
  const afterReleaseId = "recovery_release_after";
  const rolloutId = "recovery_rollout";
  const targetId = "recovery_target";
  await execute(`INSERT INTO ${TABLES.catalogItems} (id, item_type, name, description, publisher_id, visibility, status, created_at, updated_at)
    VALUES (?, 'module', ?, 'Recovery test', 'test', 'internal', 'active', ?, ?)`, [itemId, moduleId, now(), now()]);
  for (const [id, releaseId, manifest] of [[beforeVersionId, beforeReleaseId, beforeManifest], [afterVersionId, afterReleaseId, afterManifest]] as const) {
    await execute(`INSERT INTO ${TABLES.catalogVersions}
      (id, catalog_item_id, version, lifecycle_status, manifest_json, manifest_schema_version, artifact_checksum, created_by, created_at)
      VALUES (?, ?, ?, 'ready', ?, '1.0.0', ?, 'test', ?)`,
    [id, itemId, manifest.version, JSON.stringify(manifest), `checksum-${manifest.version}`, now()]);
    await execute(`INSERT INTO ${TABLES.catalogReleases} (id, catalog_version_id, channel, status, released_at, created_at)
      VALUES (?, ?, 'stable', 'active', ?, ?)`, [releaseId, id, now(), now()]);
  }
  await execute(`UPDATE ${TABLES.installations}
    SET catalog_item_id = ?, catalog_version_id = ?, resolved_version = '1.0.0', artifact_checksum = 'checksum-1.0.0',
        source_release_id = ?, upgraded_at = '2026-01-01T00:00:00Z', parent_operation_id = 'prior_operation'
    WHERE workspace_id = ? AND module_id = ?`, [itemId, beforeVersionId, beforeReleaseId, workspaceId, moduleId]);
  await execute(`INSERT INTO ${TABLES.releaseRollouts}
    (id, catalog_release_id, target_type, target_config_json, status, success_threshold, failure_threshold, started_by, started_at, created_at)
    VALUES (?, ?, 'allowlist', '{}', 'running', 0.95, 0.05, 'test', ?, ?)`, [rolloutId, afterReleaseId, now(), now()]);
  await execute(`INSERT INTO ${TABLES.rolloutTargets} (id, rollout_id, workspace_id, from_version_id, to_version_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)`, [targetId, rolloutId, workspaceId, beforeVersionId, afterVersionId, now()]);
  await execute(`INSERT INTO ${businessTable(objectKey)} (id, workspace_id, name, created_at, updated_at) VALUES ('business_record', ?, 'Before upgrade', ?, ?)`,
    [workspaceId, now(), now()]);
  return { moduleId, objectKey, targetId, beforeVersionId, afterVersionId, afterManifest };
}

async function readSnapshotRow(targetId: string) {
  return queryOne(`SELECT * FROM ${TABLES.upgradeSnapshots} WHERE target_id = ?`, [targetId]);
}

describe("durable upgrade recovery", () => {
  it("restores exact pre-upgrade metadata and catalog provenance after closing/reopening the database, retaining business edits", async () => {
    const fixture = await prepareUpgrade();
    const before = await readUpgradeState(db, workspaceId, fixture.moduleId);
    const upgraded = await executeRolloutTarget(fixture.targetId);
    expect(upgraded.status, upgraded.error).toBe("succeeded");
    const applied = await readUpgradeState(db, workspaceId, fixture.moduleId);
    expect(applied.installationRecord).toMatchObject({ module_version: "1.1.0", catalog_version_id: fixture.afterVersionId, resolved_version: "1.1.0", artifact_checksum: "checksum-1.1.0", source_release_id: "recovery_release_after" });
    expect(applied.metadataState.commandContracts[0].source_version).toBe("1.1.0");
    expect(applied.metadataState.relations[0].label).toBe("Upgraded relation");
    expect(applied.metadataState.fields.length).toBe(before.metadataState.fields.length + 1);
    const snapshotRow = await readSnapshotRow(fixture.targetId);
    expect(snapshotRow).toBeDefined();
    await execute(`UPDATE ${businessTable(fixture.objectKey)} SET name = 'Written after upgrade' WHERE id = 'business_record'`);
    closeDatabase();
    const loaded = await loadRollbackSnapshot(fixture.targetId);
    expect(loaded!.installationRecord).toEqual(before.installationRecord);
    expect(loaded!.metadataState).toEqual(before.metadataState);
    // Capture is insert-once even after the live installation has changed.
    expect(await capturePreUpgradeSnapshot(fixture.targetId, workspaceId, fixture.moduleId, "1.0.0", "1.1.0")).toEqual(loaded);
    expect(await readSnapshotRow(fixture.targetId)).toEqual(snapshotRow);
    expect(await canRollback(fixture.targetId)).toEqual({ eligible: true });
    const restored = await rollbackUpgrade(fixture.targetId);
    expect(restored).toMatchObject({ status: "succeeded", metadataRestored: true, rolledBackToVersion: "1.0.0" });
    expect(await readUpgradeState(db, workspaceId, fixture.moduleId)).toEqual(before);
    expect(await queryOne(`SELECT name FROM ${businessTable(fixture.objectKey)} WHERE id = 'business_record'`)).toEqual({ name: "Written after upgrade" });
    expect(await readSnapshotRow(fixture.targetId)).toEqual(snapshotRow);
    closeDatabase();
    expect((await rollbackUpgrade(fixture.targetId)).stepsTaken).toContain("already_restored");
    expect(await readUpgradeState(db, workspaceId, fixture.moduleId)).toEqual(before);
  });

  it("blocks SQL and metadata mutation when durable snapshot persistence fails", async () => {
    const fixture = await prepareUpgrade(true);
    const before = await readUpgradeState(db, workspaceId, fixture.moduleId);
    await db.executeMultiple(`CREATE TRIGGER reject_upgrade_snapshot BEFORE INSERT ON ${TABLES.upgradeSnapshots}
      BEGIN SELECT RAISE(ABORT, 'simulated snapshot persistence failure'); END;`);
    const result = await executeRolloutTarget(fixture.targetId);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("snapshot persistence failure");
    expect(await readUpgradeState(db, workspaceId, fixture.moduleId)).toEqual(before);
    expect(await readSnapshotRow(fixture.targetId)).toBeUndefined();
    const columns = await db.execute(`PRAGMA table_info(${businessTable(fixture.objectKey)})`);
    expect(columns.rows.map((column) => column.name)).not.toContain("industry");
  });

  it("reports database_restore after real module SQL and a reopened connection, without false version downgrade or data loss", async () => {
    const fixture = await prepareUpgrade(true);
    const result = await executeRolloutTarget(fixture.targetId);
    expect(result.status, result.error).toBe("succeeded");
    await execute(`UPDATE ${businessTable(fixture.objectKey)} SET industry = 'services', website = 'https://example.test' WHERE id = 'business_record'`);
    const applied = await readUpgradeState(db, workspaceId, fixture.moduleId);
    const snapshotRow = await readSnapshotRow(fixture.targetId);
    closeDatabase();
    expect(await canRollback(fixture.targetId)).toMatchObject({ eligible: false, reason: expect.stringContaining("requires_database_restore") });
    const restored = await rollbackUpgrade(fixture.targetId);
    expect(restored).toMatchObject({ status: "failed", metadataRestored: false, recoveryRequired: "database_restore", rolledBackToVersion: "" });
    expect(await readUpgradeState(db, workspaceId, fixture.moduleId)).toEqual(applied);
    expect(await queryOne(`SELECT name, industry, website FROM ${businessTable(fixture.objectKey)} WHERE id = 'business_record'`))
      .toEqual({ name: "Before upgrade", industry: "services", website: "https://example.test" });
    expect(await readSnapshotRow(fixture.targetId)).toEqual(snapshotRow);
    expect((await executeRolloutTarget(fixture.targetId)).status).toBe("skipped");
  });

  it("rolls the entire restoration transaction back if any metadata insert fails", async () => {
    const fixture = await prepareUpgrade();
    expect((await executeRolloutTarget(fixture.targetId)).status).toBe("succeeded");
    const applied = await readUpgradeState(db, workspaceId, fixture.moduleId);
    await db.executeMultiple(`CREATE TRIGGER reject_restored_field BEFORE INSERT ON ${TABLES.fieldDefinitions}
      BEGIN SELECT RAISE(ABORT, 'simulated restore failure'); END;`);
    const result = await rollbackUpgrade(fixture.targetId);
    expect(result).toMatchObject({ status: "failed", metadataRestored: false, recoveryRequired: "operator_review" });
    expect(result.error).toContain("simulated restore failure");
    expect(await readUpgradeState(db, workspaceId, fixture.moduleId)).toEqual(applied);
    expect(await queryOne(`SELECT status FROM ${TABLES.rolloutTargets} WHERE id = ?`, [fixture.targetId])).toEqual({ status: "succeeded" });
  });

  it("refuses to overwrite later metadata changes", async () => {
    const fixture = await prepareUpgrade();
    expect((await executeRolloutTarget(fixture.targetId)).status).toBe("succeeded");
    await execute(`UPDATE ${TABLES.objectDefinitions} SET label = 'Later operator change' WHERE workspace_id = ? AND module_id = ?`, [workspaceId, fixture.moduleId]);
    const afterEdit = await readUpgradeState(db, workspaceId, fixture.moduleId);
    const result = await rollbackUpgrade(fixture.targetId);
    expect(result).toMatchObject({ status: "failed", metadataRestored: false, recoveryRequired: "operator_review" });
    expect(result.error).toContain("refusing to overwrite later changes");
    expect(await readUpgradeState(db, workspaceId, fixture.moduleId)).toEqual(afterEdit);
  });

  it("detects a corrupted persisted snapshot instead of reconstructing a success from live metadata", async () => {
    const fixture = await prepareUpgrade();
    expect((await executeRolloutTarget(fixture.targetId)).status).toBe("succeeded");
    const appliedChecksum = upgradeStateChecksum(await readUpgradeState(db, workspaceId, fixture.moduleId));
    await execute(`UPDATE ${TABLES.upgradeSnapshots} SET snapshot_json = '{}' WHERE target_id = ?`, [fixture.targetId]);
    closeDatabase();
    const result = await rollbackUpgrade(fixture.targetId);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("checksum mismatch");
    expect(upgradeStateChecksum(await readUpgradeState(db, workspaceId, fixture.moduleId))).toBe(appliedChecksum);
  });

  it("refuses an unrelated migration path before any SQL or snapshot write", async () => {
    const fixture = await prepareUpgrade(true);
    fixture.afterManifest.migrations.upgrade![0].from = "0.5.0";
    await execute(`UPDATE ${TABLES.catalogVersions} SET manifest_json = ? WHERE id = ?`, [JSON.stringify(fixture.afterManifest), fixture.afterVersionId]);
    const before = await readUpgradeState(db, workspaceId, fixture.moduleId);
    const result = await executeRolloutTarget(fixture.targetId);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Expected one migration from 1.0.0");
    expect(await readUpgradeState(db, workspaceId, fixture.moduleId)).toEqual(before);
    expect(await readSnapshotRow(fixture.targetId)).toBeUndefined();
  });
});
