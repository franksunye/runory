import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { TABLES } from "./contracts";
import { runMigrations } from "./migrations";
import { loadModuleManifest } from "./installer";
import { loadPlatformServiceContractManifest } from "./platform-service-contracts";
import {
  getWorkspaceCommandContractInventory,
  syncWorkspaceCommandContracts,
} from "./command-contracts";

const workspaceId = "ws_contract_upgrade_fixture";

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

describe("Workspace Command Contract source upgrades", () => {
  beforeAll(resetDatabase);
  afterAll(resetDatabase);

  it("replaces one Module and Platform Service source snapshot without duplicates", async () => {
    const moduleManifest = loadModuleManifest("runory.service-visit");
    const serviceManifest = loadPlatformServiceContractManifest("runory.workflow");
    const moduleContracts = moduleManifest.domain?.commands ?? [];
    const serviceContracts = serviceManifest.domain.commands;

    await syncWorkspaceCommandContracts(
      workspaceId,
      "module",
      moduleManifest.id,
      "1.0.0",
      moduleContracts,
    );
    await syncWorkspaceCommandContracts(
      workspaceId,
      "platform_service",
      serviceManifest.id,
      "0.9.0",
      serviceContracts,
    );

    const before = await getWorkspaceCommandContractInventory(workspaceId);
    expect(before).toHaveLength(11);
    expect(new Set(before.map((entry) => entry.commandKey)).size).toBe(11);
    expect(before.find((entry) => entry.commandKey === "visit.complete")?.sourceVersion)
      .toBe("1.0.0");
    expect(before.find((entry) => entry.commandKey === "work_item.claim")?.sourceVersion)
      .toBe("0.9.0");

    await syncWorkspaceCommandContracts(
      workspaceId,
      "module",
      moduleManifest.id,
      moduleManifest.version,
      moduleContracts,
    );
    await syncWorkspaceCommandContracts(
      workspaceId,
      "platform_service",
      serviceManifest.id,
      serviceManifest.version,
      serviceContracts,
    );

    const after = await getWorkspaceCommandContractInventory(workspaceId);
    expect(after).toHaveLength(11);
    expect(new Set(after.map((entry) => entry.commandKey)).size).toBe(11);
    expect(after.find((entry) => entry.commandKey === "visit.complete")).toMatchObject({
      sourceKind: "module",
      sourceId: "runory.service-visit",
      sourceVersion: "1.1.0",
      contractVersion: "1.0.0",
    });
    expect(after.find((entry) => entry.commandKey === "work_item.claim")).toMatchObject({
      sourceKind: "platform_service",
      sourceId: "runory.workflow",
      sourceVersion: "1.0.0",
      contractVersion: "1.0.0",
    });
  });

  it("rejects an upgrade source that tries to take another source's Command", async () => {
    const visitComplete = loadModuleManifest("runory.service-visit").domain!.commands
      .find((contract) => contract.key === "visit.complete")!;

    await expect(syncWorkspaceCommandContracts(
      workspaceId,
      "platform_service",
      "runory.conflicting-service",
      "1.0.0",
      [visitComplete],
    )).rejects.toThrow(/already owned by module 'runory.service-visit'/);

    const rows = await db.execute({
      sql: `SELECT COUNT(*) AS count FROM ${TABLES.workspaceCommandContracts}
            WHERE workspace_id = ? AND command_key = 'visit.complete'`,
      args: [workspaceId],
    });
    expect(Number(rows.rows[0].count)).toBe(1);
  });
});

