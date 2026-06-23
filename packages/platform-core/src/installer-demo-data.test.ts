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

    // 6 companies + 8 contacts + 6 deals + 6 tasks = 26 records
    expect(result.demoRecordsCreated).toBe(26);

    const companies = await getRecords(workspaceId, "company");
    const contacts = await getRecords(workspaceId, "contact");
    const deals = await getRecords(workspaceId, "deal");
    const tasks = await getRecords(workspaceId, "task");

    expect(companies.map((row) => row.name)).toEqual(
      expect.arrayContaining(["Acme Operations", "Nova Retail", "Vertex Manufacturing"])
    );
    expect(contacts.map((row) => row.email)).toEqual(
      expect.arrayContaining(["maya@acme.example", "jon@novaretail.example"])
    );
    expect(deals.map((row) => row.name)).toEqual(
      expect.arrayContaining(["Acme Expansion Plan", "Nova Store Rollout"])
    );
    expect(tasks.map((row) => row.title)).toEqual(
      expect.arrayContaining([
        "Prepare Acme onboarding plan",
        "Follow up with Nova Retail",
      ])
    );

    // Verify contact-first linking: contact's primary_company_id points to company
    const acme = companies.find((row) => row.domain === "acme.example");
    const maya = contacts.find((row) => row.email === "maya@acme.example");
    expect(maya?.primary_company_id).toBe(acme?.id);

    // Verify task multi-link: task links to company, contact, and deal
    const acmeDeal = deals.find((row) => row.name === "Acme Expansion Plan");
    const kickoffTask = tasks.find((row) => row.title === "Prepare Acme onboarding plan");
    expect(kickoffTask?.company_id).toBe(acme?.id);
    expect(kickoffTask?.contact_id).toBe(maya?.id);
    expect(kickoffTask?.deal_id).toBe(acmeDeal?.id);

    // Verify contact-first usage: contact-tom has no primary_company_id
    const tom = contacts.find((row) => row.email === "tom@independent.example");
    expect(tom).toBeDefined();
    expect(tom?.primary_company_id).toBeNull();
  });

  it("does not seed demo records by default", async () => {
    const result = await installPack(workspaceId, "crm-lite-pack");

    expect(result.demoRecordsCreated).toBe(0);
    expect(await getRecords(workspaceId, "company")).toHaveLength(0);
    expect(await getRecords(workspaceId, "contact")).toHaveLength(0);
    expect(await getRecords(workspaceId, "deal")).toHaveLength(0);
    expect(await getRecords(workspaceId, "task")).toHaveLength(0);
  });

  it("keeps demo data idempotent across repeated installs", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    const second = await installPack(workspaceId, "crm-lite-pack", {
      includeDemoData: true,
    });

    expect(second.demoRecordsCreated).toBe(0);
    expect(await getRecords(workspaceId, "company")).toHaveLength(6);
    expect(await getRecords(workspaceId, "contact")).toHaveLength(8);
    expect(await getRecords(workspaceId, "deal")).toHaveLength(6);
    expect(await getRecords(workspaceId, "task")).toHaveLength(6);
  });
});
