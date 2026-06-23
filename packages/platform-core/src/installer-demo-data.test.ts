import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import { installPack } from "./installer";
import { getRecords } from "./metadata";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;

async function resetDatabase() {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;

  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DROP TABLE IF EXISTS "${name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createTestWorkspace() {
  const ts = now();
  workspaceId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, "Demo Data WS", "demo-data-ws", ts, ts]
  );
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await createTestWorkspace();
});

describe("installPack demo data", () => {
  it("seeds friendly CRM demo records when requested", async () => {
    const result = await installPack(workspaceId, "crm-lite-pack", {
      includeDemoData: true,
    });

    expect(result.demoRecordsCreated).toBe(6);

    const customers = await getRecords(workspaceId, "customer");
    const contacts = await getRecords(workspaceId, "contact");
    const tasks = await getRecords(workspaceId, "task");

    expect(customers.map((row) => row.name)).toEqual(
      expect.arrayContaining(["Acme Operations", "Nova Retail"])
    );
    expect(contacts.map((row) => row.email)).toEqual(
      expect.arrayContaining(["maya@acme.example", "jon@novaretail.example"])
    );
    expect(tasks.map((row) => row.title)).toEqual(
      expect.arrayContaining([
        "Prepare Acme onboarding plan",
        "Follow up with Nova Retail",
      ])
    );

    const acme = customers.find((row) => row.email === "ops@acme.example");
    const maya = contacts.find((row) => row.email === "maya@acme.example");
    expect(maya?.customer_id).toBe(acme?.id);
  });

  it("does not seed demo records by default", async () => {
    const result = await installPack(workspaceId, "crm-lite-pack");

    expect(result.demoRecordsCreated).toBe(0);
    expect(await getRecords(workspaceId, "customer")).toHaveLength(0);
    expect(await getRecords(workspaceId, "contact")).toHaveLength(0);
    expect(await getRecords(workspaceId, "task")).toHaveLength(0);
  });

  it("keeps demo data idempotent across repeated installs", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    const second = await installPack(workspaceId, "crm-lite-pack", {
      includeDemoData: true,
    });

    expect(second.demoRecordsCreated).toBe(0);
    expect(await getRecords(workspaceId, "customer")).toHaveLength(2);
    expect(await getRecords(workspaceId, "contact")).toHaveLength(2);
    expect(await getRecords(workspaceId, "task")).toHaveLength(2);
  });
});
