import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryAll } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installPack, loadPackDemoData, hasPackDemoData, updatePackDemoDataStatus } from "./installer";
import { getRecords, getInstalledPacks } from "./metadata";

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

    // 7 demo users + 6 companies + 8 contacts + 6 deals + 6 tasks
    // + 2 automations = 35
    // (V1 workflows removed — V2 definitions published from module JSON)
    expect(result.demoRecordsCreated).toBe(35);

    const demoUsers = await queryAll<{ avatar_url: string | null }>(
      `SELECT avatar_url FROM ${TABLES.users} WHERE external_id LIKE 'persona:%'`
    );
    expect(demoUsers).toHaveLength(7);
    expect(demoUsers.every((user) => user.avatar_url?.endsWith(".svg"))).toBe(true);

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

// ─────────────────────────────────────────────────────────────────────────────
// v0.3.4 — Separate demo data loading & status tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("demo data status tracking (v0.3.4)", () => {
  it("installPack without demo data sets status to 'none'", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    const packs = await getInstalledPacks(workspaceId);
    const crm = packs.find((p) => p.packId === "crm-lite-pack");
    expect(crm).toBeDefined();
    expect(crm!.demoDataStatus).toBe("none");
    expect(crm!.demoDataLoadedAt).toBeNull();
  });

  it("installPack with demo data sets status to 'loaded'", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    const packs = await getInstalledPacks(workspaceId);
    const crm = packs.find((p) => p.packId === "crm-lite-pack");
    expect(crm).toBeDefined();
    expect(crm!.demoDataStatus).toBe("loaded");
    expect(crm!.demoDataLoadedAt).not.toBeNull();
  });

  it("loadPackDemoData loads demo data separately after install", async () => {
    // Install without demo data
    await installPack(workspaceId, "crm-lite-pack");
    let packs = await getInstalledPacks(workspaceId);
    expect(packs.find((p) => p.packId === "crm-lite-pack")!.demoDataStatus).toBe("none");
    expect(await getRecords(workspaceId, "company")).toHaveLength(0);

    // Load demo data separately
    const result = await loadPackDemoData(workspaceId, "crm-lite-pack");
    // 7 demo users + 28 business/automation records = 35
    expect(result.recordsCreated).toBe(35);

    packs = await getInstalledPacks(workspaceId);
    expect(packs.find((p) => p.packId === "crm-lite-pack")!.demoDataStatus).toBe("loaded");
    expect(await getRecords(workspaceId, "company")).toHaveLength(6);
  });

  it("loadPackDemoData is idempotent", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await loadPackDemoData(workspaceId, "crm-lite-pack");
    const second = await loadPackDemoData(workspaceId, "crm-lite-pack");
    expect(second.recordsCreated).toBe(0);
    expect(await getRecords(workspaceId, "company")).toHaveLength(6);
  });

  it("hasPackDemoData correctly detects demo data availability", async () => {
    expect(hasPackDemoData("crm-lite-pack")).toBe(true);
    expect(hasPackDemoData("fsm-pack")).toBe(true);
    expect(hasPackDemoData("nonexistent-pack")).toBe(false);
  });

  it("FSM demo data includes field evidence, service-report photos, and geolocated schedule entries", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const evidenceSubmissions = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.formSubmissions}
       WHERE workspace_id = ?
         AND answers_json LIKE '%"evi-photos"%'
         AND answers_json LIKE '%"attachments"%'`,
      [workspaceId]
    );
    expect(evidenceSubmissions.length).toBeGreaterThanOrEqual(2);

    const reportsWithPhotos = await queryAll<{ id: string }>(
      `SELECT id FROM ${businessTable("service_report")}
       WHERE workspace_id = ?
         AND photos IS NOT NULL
         AND photos <> ''`,
      [workspaceId]
    );
    expect(reportsWithPhotos.length).toBeGreaterThanOrEqual(2);

    const geolocatedSchedules = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.scheduleEntries}
       WHERE workspace_id = ?
         AND location_type = 'customer_site'
         AND latitude IS NOT NULL
         AND longitude IS NOT NULL`,
      [workspaceId]
    );
    expect(geolocatedSchedules.length).toBeGreaterThanOrEqual(3);
  });

  it("updatePackDemoDataStatus updates the status directly", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await updatePackDemoDataStatus(workspaceId, "crm-lite-pack", "error");

    const packs = await getInstalledPacks(workspaceId);
    expect(packs.find((p) => p.packId === "crm-lite-pack")!.demoDataStatus).toBe("error");
  });
});
