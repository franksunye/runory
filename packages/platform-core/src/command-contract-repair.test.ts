import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TABLES } from "./contracts";
import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";
import { loadModuleManifest } from "./installer";
import { syncWorkspaceCommandContracts } from "./command-contracts";
import {
  inspectWorkspaceCommandContractRepair,
  repairWorkspaceCommandContracts,
} from "./command-contract-repair";

const workspaceId = "ws_contract_repair";
const moduleId = "runory.service-visit";

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows as unknown as Array<{ name: string }>) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${row.name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function seedInstalledModuleSnapshot(): Promise<void> {
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, 'Contract Repair', 'contract-repair', ?, ?)`,
    [workspaceId, ts, ts],
  );
  const manifest = loadModuleManifest(moduleId);
  await execute(
    `INSERT INTO ${TABLES.installations}
     (id, workspace_id, module_id, module_version, pack_id, status, installed_at)
     VALUES (?, ?, ?, ?, 'fsm-pack', 'installed', ?)`,
    [genId("inst"), workspaceId, moduleId, manifest.version, ts],
  );
  await syncWorkspaceCommandContracts(
    workspaceId,
    "module",
    moduleId,
    manifest.version,
    manifest.domain?.commands ?? [],
  );
  const company = loadModuleManifest("runory.company");
  await execute(
    `INSERT INTO ${TABLES.installations}
     (id, workspace_id, module_id, module_version, pack_id, status, installed_at)
     VALUES (?, ?, ?, ?, 'crm-lite-pack', 'installed', ?)`,
    [genId("inst"), workspaceId, company.id, company.version, ts],
  );
}

describe("Workspace Command Contract repair", () => {
  beforeAll(async () => {
    await resetDatabase();
    await seedInstalledModuleSnapshot();
  });
  afterAll(resetDatabase);

  it("dry-runs missing Platform Service snapshots without writing", async () => {
    const report = await inspectWorkspaceCommandContractRepair(workspaceId);

    expect(report.requiresRepair).toBe(true);
    expect(report.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKind: "module",
        sourceId: moduleId,
        status: "in_sync",
      }),
      expect.objectContaining({
        sourceKind: "platform_service",
        sourceId: "runory.forms",
        status: "missing",
      }),
      expect.objectContaining({
        sourceKind: "platform_service",
        sourceId: "runory.workflow",
        status: "missing",
      }),
    ]));
  });

  it("does not invent snapshot work for installed Modules without Commands", async () => {
    const report = await inspectWorkspaceCommandContractRepair(workspaceId);
    expect(report.sources.some((source) => source.sourceId === "runory.company")).toBe(false);
  });

  it("repairs missing snapshots and is idempotent on repetition", async () => {
    const first = await repairWorkspaceCommandContracts(workspaceId);
    expect(first.repairedSources).toHaveLength(2);
    expect(first.after.requiresRepair).toBe(false);

    const second = await repairWorkspaceCommandContracts(workspaceId);
    expect(second.repairedSources).toEqual([]);
    expect(second.before.requiresRepair).toBe(false);
    expect(second.after.requiresRepair).toBe(false);
  });

  it("detects and repairs incomplete and outdated source snapshots", async () => {
    await execute(
      `DELETE FROM ${TABLES.workspaceCommandContracts}
       WHERE workspace_id = ? AND command_key = 'visit.arrive'`,
      [workspaceId],
    );
    await execute(
      `UPDATE ${TABLES.workspaceCommandContracts}
       SET source_version = '0.9.0'
       WHERE workspace_id = ? AND source_kind = 'platform_service'
         AND source_id = 'runory.workflow'`,
      [workspaceId],
    );

    const before = await inspectWorkspaceCommandContractRepair(workspaceId);
    expect(before.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: moduleId,
        status: "outdated",
        missingCommandKeys: ["visit.arrive"],
      }),
      expect.objectContaining({
        sourceId: "runory.workflow",
        status: "outdated",
        actualVersions: ["0.9.0"],
      }),
    ]));

    const repaired = await repairWorkspaceCommandContracts(workspaceId);
    expect(repaired.repairedSources.map((source) => source.sourceId).sort())
      .toEqual([moduleId, "runory.workflow"].sort());
    expect(repaired.after.requiresRepair).toBe(false);
  });

  it("fails closed when another source owns an expected Command", async () => {
    const visitComplete = loadModuleManifest(moduleId).domain!.commands
      .find((contract) => contract.key === "visit.complete")!;
    await execute(
      `DELETE FROM ${TABLES.workspaceCommandContracts}
       WHERE workspace_id = ? AND source_kind = 'module' AND source_id = ?`,
      [workspaceId, moduleId],
    );
    await syncWorkspaceCommandContracts(
      workspaceId,
      "platform_service",
      "runory.conflicting-service",
      "1.0.0",
      [visitComplete],
    );

    const report = await inspectWorkspaceCommandContractRepair(workspaceId);
    expect(report.sources.find((source) => source.sourceId === moduleId)).toMatchObject({
      status: "conflict",
      conflictingCommands: [{
        commandKey: "visit.complete",
        sourceKind: "platform_service",
        sourceId: "runory.conflicting-service",
      }],
    });
    expect(report.orphanedSources).toEqual([
      expect.objectContaining({ sourceId: "runory.conflicting-service" }),
    ]);

    await expect(repairWorkspaceCommandContracts(workspaceId))
      .rejects.toThrow(/COMMAND_CONTRACT_REPAIR_CONFLICT/);
  });
});
