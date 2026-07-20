import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TABLES } from "./contracts";
import { db, execute, genId, now, queryOne } from "./db";
import { loadModuleManifest } from "./installer";
import { runMigrations } from "./migrations";
import {
  inspectAllWorkspaceCommandContractRepairs,
  repairAllWorkspaceCommandContracts,
} from "./command-contract-repair";
import {
  resolveWorkspaceCommandPlan,
  syncWorkspaceCommandContracts,
} from "./command-contracts";

const cleanableWorkspaceId = "ws_bulk_cleanable";
const secondWorkspaceId = "ws_bulk_second";
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

async function seedWorkspaces(): Promise<void> {
  const ts = now();
  for (const [id, slug] of [
    [cleanableWorkspaceId, "bulk-cleanable"],
    [secondWorkspaceId, "bulk-second"],
  ]) {
    await execute(
      `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, slug, slug, ts, ts],
    );
  }
  const manifest = loadModuleManifest(moduleId);
  await execute(
    `INSERT INTO ${TABLES.installations}
     (id, workspace_id, module_id, module_version, pack_id, status, installed_at)
     VALUES (?, ?, ?, ?, 'fsm-pack', 'installed', ?)`,
    [genId("inst"), cleanableWorkspaceId, moduleId, manifest.version, ts],
  );
}

describe("all-Workspace Command Contract repair", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedWorkspaces();
  });
  afterAll(resetDatabase);

  it("backfills every Workspace, verifies coverage, and is idempotent", async () => {
    const before = await inspectAllWorkspaceCommandContractRepairs();
    expect(before).toMatchObject({
      workspaceCount: 2,
      cleanWorkspaceCount: 0,
      repairRequiredWorkspaceCount: 2,
      blockedWorkspaceCount: 0,
    });
    await expect(resolveWorkspaceCommandPlan(cleanableWorkspaceId, "visit.complete"))
      .rejects.toMatchObject({ code: "COMMAND_CONTRACT_INCOMPLETE" });

    const repaired = await repairAllWorkspaceCommandContracts();
    expect(repaired.repairedWorkspaces.map((result) => result.before.workspaceId).sort())
      .toEqual([cleanableWorkspaceId, secondWorkspaceId].sort());
    expect(repaired.after).toMatchObject({
      workspaceCount: 2,
      cleanWorkspaceCount: 2,
      repairRequiredWorkspaceCount: 0,
      blockedWorkspaceCount: 0,
    });
    await expect(resolveWorkspaceCommandPlan(cleanableWorkspaceId, "visit.complete"))
      .resolves.toMatchObject({
        contract: { key: "visit.complete" },
        source: { kind: "module", id: moduleId },
      });

    const repeated = await repairAllWorkspaceCommandContracts();
    expect(repeated.repairedWorkspaces).toEqual([]);
    expect(repeated.after.repairRequiredWorkspaceCount).toBe(0);
  });

  it("blocks the entire bulk operation before writes when ownership is ambiguous", async () => {
    const visitComplete = loadModuleManifest(moduleId).domain!.commands
      .find((contract) => contract.key === "visit.complete")!;
    await syncWorkspaceCommandContracts(
      cleanableWorkspaceId,
      "platform_service",
      "runory.conflicting-service",
      "1.0.0",
      [visitComplete],
    );

    const preflight = await inspectAllWorkspaceCommandContractRepairs();
    expect(preflight.blockedWorkspaceCount).toBe(1);
    await expect(repairAllWorkspaceCommandContracts())
      .rejects.toThrow(/COMMAND_CONTRACT_BULK_REPAIR_BLOCKED.*ws_bulk_cleanable/);

    const persisted = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.workspaceCommandContracts}
       WHERE workspace_id = ?`,
      [secondWorkspaceId],
    );
    expect(Number(persisted?.count)).toBe(0);
  });
});
