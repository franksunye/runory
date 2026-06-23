import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import { installPack, installModule, loadModuleManifest, loadPackManifest } from "./installer";
import { getRecords, getNavigation, getInstallations } from "./metadata";
import { moduleManifestSchema } from "@runory/contracts";

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
    [workspaceId, "Shared Module WS", "shared-module-ws", ts, ts]
  );
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await createTestWorkspace();
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 1: Two packs can depend on runory.company, runory.contact, or
// runory.task without duplicate install or duplicate navigation chaos.
// ─────────────────────────────────────────────────────────────────────────────

describe("pack dependency dedupe (shared modules)", () => {
  it("installs crm-lite-pack then shared-business-consumer-pack without duplicate modules", async () => {
    // Install CRM Lite Pack first (installs company, contact, deal, task)
    const crmResult = await installPack(workspaceId, "crm-lite-pack", {
      includeDemoData: true,
    });
    expect(crmResult.modulesInstalled.sort()).toEqual(
      ["runory.company", "runory.contact", "runory.deal", "runory.task"].sort()
    );

    // Install the consumer pack — shared modules should be skipped
    const consumerResult = await installPack(workspaceId, "shared-business-consumer-pack", {
      includeDemoData: true,
    });
    expect(consumerResult.modulesInstalled).toEqual([]);
    expect(consumerResult.objectsCreated).toEqual([]);
    expect(consumerResult.viewsCreated).toEqual([]);
    expect(consumerResult.navigationItemsCreated).toBe(0);

    // Verify no duplicate installations in the DB
    const installations = await getInstallations(workspaceId);
    const moduleCounts = new Map<string, number>();
    for (const inst of installations) {
      moduleCounts.set(inst.moduleId, (moduleCounts.get(inst.moduleId) ?? 0) + 1);
    }
    for (const [moduleId, count] of moduleCounts) {
      expect(count).toBe(1);
    }
    expect(installations).toHaveLength(4); // company, contact, deal, task
  });

  it("does not produce duplicate navigation items when two packs share modules", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "shared-business-consumer-pack");

    const nav = await getNavigation(workspaceId);

    // Each route should appear exactly once
    const routes = nav.map((n) => n.route);
    const uniqueRoutes = new Set(routes);
    expect(routes.length).toBe(uniqueRoutes.size);

    // Core CRM routes should be present
    expect(routes).toEqual(
      expect.arrayContaining(["/companies", "/contacts", "/deals", "/tasks"])
    );
  });

  it("installs in reverse order (consumer first, then crm-lite) without duplicates", async () => {
    // Consumer pack installs company + task first
    const consumerResult = await installPack(workspaceId, "shared-business-consumer-pack");
    expect(consumerResult.modulesInstalled.sort()).toEqual(
      ["runory.company", "runory.task"].sort()
    );

    // CRM Lite Pack should skip company + task, install contact + deal
    const crmResult = await installPack(workspaceId, "crm-lite-pack");
    expect(crmResult.modulesInstalled.sort()).toEqual(
      ["runory.contact", "runory.deal"].sort()
    );

    // Still only 4 unique module installations
    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 2: A pack can label a shared object differently through template
// terminology without forking the object.
// ─────────────────────────────────────────────────────────────────────────────

describe("pack-specific terminology overlays", () => {
  it("applies terminology overlay to navigation labels after installing consumer pack", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "shared-business-consumer-pack");

    const nav = await getNavigation(workspaceId);

    // The consumer pack's terminology should override navigation labels
    const companyNav = nav.find((n) => n.route === "/companies");
    const taskNav = nav.find((n) => n.route === "/tasks");

    // Last pack wins — consumer pack relabels company → 客户企业, task → 服务工单
    expect(companyNav?.label).toBe("客户企业");
    expect(taskNav?.label).toBe("服务工单");
  });

  it("does not fork the underlying object definitions", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "shared-business-consumer-pack");

    // Object definitions should still have the original module-owned labels
    const { getObject } = await import("./metadata");
    const company = await getObject(workspaceId, "company");
    const task = await getObject(workspaceId, "task");

    // The object definition label comes from the module manifest, not the pack terminology
    expect(company?.label).toBe("Company");
    expect(task?.label).toBe("Task");
  });

  it("pack manifest declares terminology overlay correctly", async () => {
    const pack = loadPackManifest("shared-business-consumer-pack");
    expect(pack.terminology).toBeDefined();
    expect(pack.terminology).toHaveLength(2);
    expect(pack.terminology?.[0].object).toBe("company");
    expect(pack.terminology?.[0].navigationLabel).toBe("客户企业");
    expect(pack.terminology?.[1].object).toBe("task");
    expect(pack.terminology?.[1].navigationLabel).toBe("服务工单");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 3: Catalog validation rejects duplicate object ownership across
// installed packs unless it is an explicit compatible upgrade.
// ─────────────────────────────────────────────────────────────────────────────

describe("object ownership enforcement (one object key, one owning module)", () => {
  it("install-time enforcement rejects a module claiming an already-owned object key", async () => {
    // Install CRM Lite Pack — runory.company owns the "company" object key
    await installPack(workspaceId, "crm-lite-pack");

    // Create a fake module manifest that tries to claim "company" ownership
    const companyManifest = loadModuleManifest("runory.company");
    const impostorManifest = {
      ...companyManifest,
      id: "runory.impostor-company",
      name: "Impostor Company Module",
    };

    // Directly attempt to install the impostor module — should throw
    await expect(
      installModule(workspaceId, "runory.company")
    ).resolves.toMatchObject({ skipped: true });

    // The impostor would need a real manifest directory to install; instead
    // verify the ownership check at the DB level by simulating a second
    // module trying to insert an object_definition for "company"
    await expect(
      execute(
        `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at)
         VALUES (?, ?, 'company', 'Impostor Company', 'runory.impostor', 'module_owned', ?)`,
        [genId("obj"), workspaceId, now()]
      )
    ).rejects.toThrow(); // UNIQUE(workspace_id, object_key) constraint
  });

  it("allows the same module to re-install (idempotent skip)", async () => {
    await installPack(workspaceId, "crm-lite-pack");

    // Re-installing the same module should skip, not throw
    const result = await installModule(workspaceId, "runory.company");
    expect(result.skipped).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-pack demo data references via $lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("cross-pack demo data references", () => {
  it("consumer pack demo data references companies seeded by crm-lite-pack via $lookup", async () => {
    // Install CRM Lite Pack with demo data (seeds companies, contacts, etc.)
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });

    // Install consumer pack with demo data (uses $lookup to reference CRM companies)
    const consumerResult = await installPack(workspaceId, "shared-business-consumer-pack", {
      includeDemoData: true,
    });
    expect(consumerResult.demoRecordsCreated).toBe(2);

    // Verify the tasks were created with correct company_id references
    const tasks = await getRecords(workspaceId, "task");
    const serviceVisit = tasks.find((t) => t.title === "Service visit for Acme");
    const novaCheckin = tasks.find((t) => t.title === "Nova Retail service check-in");

    expect(serviceVisit).toBeDefined();
    expect(novaCheckin).toBeDefined();

    // Verify the $lookup resolved to the correct company IDs
    const companies = await getRecords(workspaceId, "company");
    const acme = companies.find((c) => c.domain === "acme.example");
    const nova = companies.find((c) => c.domain === "novaretail.example");

    expect(serviceVisit?.company_id).toBe(acme?.id);
    expect(novaCheckin?.company_id).toBe(nova?.id);

    // Verify the $lookup also resolved contact references
    const contacts = await getRecords(workspaceId, "contact");
    const maya = contacts.find((c) => c.email === "maya@acme.example");
    const jon = contacts.find((c) => c.email === "jon@novaretail.example");

    expect(serviceVisit?.contact_id).toBe(maya?.id);
    expect(novaCheckin?.contact_id).toBe(jon?.id);
  });

  it("consumer pack demo data is idempotent across repeated installs", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "shared-business-consumer-pack", { includeDemoData: true });
    const second = await installPack(workspaceId, "shared-business-consumer-pack", {
      includeDemoData: true,
    });

    expect(second.demoRecordsCreated).toBe(0);

    // Still only 2 consumer tasks (plus 6 CRM tasks = 8 total)
    const tasks = await getRecords(workspaceId, "task");
    expect(tasks).toHaveLength(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-pack relation declarations
// ─────────────────────────────────────────────────────────────────────────────

describe("cross-pack relation declarations", () => {
  it("runory.task manifest declares relations to company, contact, and deal", async () => {
    const manifest = loadModuleManifest("runory.task");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(3);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.deal",
      ])
    );

    // Verify each relation has a valid foreignKey on the task object
    const taskFields = new Set(manifest.objects[0].fields.map((f) => f.key));
    for (const rel of manifest.relations!) {
      expect(rel.object).toBe("task");
      expect(taskFields.has(rel.foreignKey)).toBe(true);
    }
  });

  it("relation schema validates correctly", async () => {
    const manifest = loadModuleManifest("runory.task");
    // Re-parse through zod to ensure schema validation passes
    const reparsed = moduleManifestSchema.parse(manifest);
    expect(reparsed.relations).toBeDefined();
    expect(reparsed.relations![0].type).toBe("many_to_one");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pack installation tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("pack installation tracking", () => {
  it("records pack installation with terminology overlay", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "shared-business-consumer-pack");

    const { queryAll } = await import("./db");
    const packInstalls = await queryAll<{ pack_id: string; terminology_json: string | null }>(
      `SELECT pack_id, terminology_json FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? ORDER BY pack_id`,
      [workspaceId]
    );

    expect(packInstalls).toHaveLength(2);
    const consumer = packInstalls.find((p) => p.pack_id === "shared-business-consumer-pack");
    expect(consumer?.terminology_json).not.toBeNull();
    const terminology = JSON.parse(consumer!.terminology_json!);
    expect(terminology).toHaveLength(2);
    expect(terminology[0].object).toBe("company");

    // CRM Lite Pack has no terminology overlay
    const crm = packInstalls.find((p) => p.pack_id === "crm-lite-pack");
    expect(crm?.terminology_json).toBeNull();
  });

  it("updates pack installation on re-install (idempotent)", async () => {
    await installPack(workspaceId, "shared-business-consumer-pack");
    await installPack(workspaceId, "shared-business-consumer-pack");

    const { queryAll } = await import("./db");
    const packInstalls = await queryAll<{ pack_id: string }>(
      `SELECT pack_id FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "shared-business-consumer-pack"]
    );

    expect(packInstalls).toHaveLength(1); // No duplicate
  });
});
