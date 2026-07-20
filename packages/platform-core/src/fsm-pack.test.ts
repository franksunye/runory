import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryAll, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installPack, installModule, loadModuleManifest, loadPackManifest } from "./installer";
import { getRecords, getNavigation, getInstallations, getInstalledPacks, getRelations, getBacklinks, getFields, createRecord, updateRecord, getObject } from "./metadata";
import {
  triageWorkOrder,
  createVisit,
  startWorkOrder,
  startTravel,
  arriveOnSite,
  submitWork,
  completeVisit,
  completeWorkOrder,
} from "./fsm-commands";
import { submitForm } from "./forms";
import { moduleManifestSchema, packManifestSchema } from "@runory/contracts";
import {
  resolveEffectiveLayout,
  resolveWidgetData,
  getAvailableWidgets,
  validateModuleDashboard,
  validatePackDashboard,
} from "./dashboard";

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
    [workspaceId, "FSM Test WS", "fsm-test-ws", ts, ts]
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
// Acceptance 1: FSM Pack installs with all 10 modules, including Payment.
// ─────────────────────────────────────────────────────────────────────────────

describe("FSM Pack installation", () => {
  it("installs all 10 modules with correct object definitions and navigation", async () => {
    const result = await installPack(workspaceId, "fsm-pack");

    expect(result.packId).toBe("fsm-pack");
    expect(result.modulesInstalled.sort()).toEqual(
      [
        "runory.company",
        "runory.contact",
        "runory.task",
        "runory.payment",
        "runory.service-site",
        "runory.asset",
        "runory.technician",
        "runory.work-order",
        "runory.service-visit",
        "runory.service-report",
      ].sort()
    );
    expect(result.ddlExecuted).toBe(true);

    // Verify all 10 modules are registered as installations
    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(10);

    // Verify FSM-owned objects are created
    const fsmObjects = ["service_site", "asset", "technician", "work_order", "service_visit", "service_report"];
    for (const objKey of fsmObjects) {
      const obj = await getObject(workspaceId, objKey);
      expect(obj).toBeDefined();
      expect(obj?.ownership).toBe("module_owned");
    }

    // Verify navigation includes FSM routes
    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/work-orders",
        "/service-sites",
        "/assets",
        "/technicians",
        "/service-visits",
        "/service-reports",
        "/companies",
        "/contacts",
        "/tasks",
      ])
    );
  });

  it("creates business tables for all FSM objects", async () => {
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    // Verify business tables exist and are queryable
    for (const objKey of ["service_site", "asset", "technician", "work_order", "service_visit", "service_report"]) {
      const records = await getRecords(workspaceId, objKey);
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("pack manifest validates against schema", async () => {
    const pack = loadPackManifest("fsm-pack");
    const reparsed = packManifestSchema.parse(pack);
    expect(reparsed.id).toBe("fsm-pack");
    expect(reparsed.modules).toHaveLength(10);
    expect(reparsed.dashboard?.defaultLayout).toBeDefined();
    expect(reparsed.terminology).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 2: Shared module dedupe — FSM Pack reuses company/contact/task
// from CRM Lite Pack without duplicate install.
// ─────────────────────────────────────────────────────────────────────────────

describe("shared module dedupe with CRM Lite Pack", () => {
  it("installs CRM Lite Pack then FSM Pack without duplicate shared modules", async () => {
    // Install CRM Lite Pack first (installs company, contact, deal, task)
    const crmResult = await installPack(workspaceId, "crm-lite-pack");
    expect(crmResult.modulesInstalled.sort()).toEqual(
      ["runory.company", "runory.contact", "runory.deal", "runory.task"].sort()
    );

    // Install FSM Pack — shared modules should be skipped
    const fsmResult = await installPack(workspaceId, "fsm-pack");
    expect(fsmResult.modulesInstalled.sort()).toEqual(
      [
        "runory.service-site",
        "runory.asset",
        "runory.technician",
        "runory.work-order",
        "runory.service-visit",
        "runory.service-report",
        "runory.payment",
      ].sort()
    );

    // Verify no duplicate installations
    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(11); // 4 CRM + 6 FSM + Payment

    const moduleCounts = new Map<string, number>();
    for (const inst of installations) {
      moduleCounts.set(inst.moduleId, (moduleCounts.get(inst.moduleId) ?? 0) + 1);
    }
    for (const [, count] of moduleCounts) {
      expect(count).toBe(1);
    }
  });

  it("does not produce duplicate navigation items when both packs share modules", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "fsm-pack");

    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    const uniqueRoutes = new Set(routes);
    expect(routes.length).toBe(uniqueRoutes.size);

    // Shared routes should appear exactly once
    expect(routes.filter((r) => r === "/companies").length).toBe(1);
    expect(routes.filter((r) => r === "/contacts").length).toBe(1);
    expect(routes.filter((r) => r === "/tasks").length).toBe(1);
  });

  it("installs in reverse order (FSM first, then CRM Lite) without duplicates", async () => {
    const fsmResult = await installPack(workspaceId, "fsm-pack");
    expect(fsmResult.modulesInstalled).toHaveLength(10);

    // CRM Lite Pack should skip company/contact/task, install only deal
    const crmResult = await installPack(workspaceId, "crm-lite-pack");
    expect(crmResult.modulesInstalled).toEqual(["runory.deal"]);

    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(11);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 3: Pack-specific terminology overlay — FSM labels company as Customer
// ─────────────────────────────────────────────────────────────────────────────

describe("FSM pack terminology overlay", () => {
  it("applies FSM terminology to navigation labels", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "fsm-pack");

    const nav = await getNavigation(workspaceId);

    // FSM pack (installed last) relabels company → Customer, task → Service Task
    const companyNav = nav.find((n) => n.route === "/companies");
    const taskNav = nav.find((n) => n.route === "/tasks");
    expect(companyNav?.label).toBe("Customer");
    expect(taskNav?.label).toBe("Service Task");
  });

  it("does not fork the underlying object definitions", async () => {
    await installPack(workspaceId, "fsm-pack");

    // Object definitions retain their original module-owned labels
    const company = await getObject(workspaceId, "company");
    const task = await getObject(workspaceId, "task");
    expect(company?.label).toBe("Company");
    expect(task?.label).toBe("Task");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 4: Cross-pack demo data references via $lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("FSM demo data with cross-pack references", () => {
  it("seeds FSM demo data referencing companies/contacts from CRM Lite Pack", async () => {
    // Install CRM Lite Pack with demo data first
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });

    // Install FSM Pack with demo data
    const fsmResult = await installPack(workspaceId, "fsm-pack", { includeDemoData: true });
    expect(fsmResult.demoRecordsCreated).toBeGreaterThan(0);

    // Verify technicians were created
    const technicians = await getRecords(workspaceId, "technician");
    expect(technicians.length).toBe(3);
    const david = technicians.find((t) => t.email === "david@runory.fsm");
    expect(david).toBeDefined();
    expect(david?.name).toBe("David Park");

    // Verify service sites were created with $lookup-resolved company_id
    const sites = await getRecords(workspaceId, "service_site");
    expect(sites.length).toBe(4);

    const acmeHq = sites.find((s) => s.name === "Acme HQ - San Francisco");
    expect(acmeHq).toBeDefined();

    // Verify $lookup resolved company_id to the actual Acme company record
    const companies = await getRecords(workspaceId, "company");
    const acme = companies.find((c) => c.domain === "acme.example");
    expect(acmeHq?.company_id).toBe(acme?.id);

    // Verify $lookup resolved primary_contact_id
    const contacts = await getRecords(workspaceId, "contact");
    const maya = contacts.find((c) => c.email === "maya@acme.example");
    expect(acmeHq?.primary_contact_id).toBe(maya?.id);
  });

  it("seeds work orders with correct cross-pack and internal references", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const workOrders = await getRecords(workspaceId, "work_order");
    expect(workOrders.length).toBe(6);

    // Verify the urgent work order
    const urgent = workOrders.find((w) => w.title === "Acme HVAC emergency repair");
    expect(urgent).toBeDefined();
    expect(urgent?.priority).toBe("urgent");
    expect(urgent?.status).toBe("planned");

    // Verify $lookup resolved company_id
    const companies = await getRecords(workspaceId, "company");
    const acme = companies.find((c) => c.domain === "acme.example");
    expect(urgent?.company_id).toBe(acme?.id);

    // Verify internal $alias resolved service_site_id and asset_id
    const sites = await getRecords(workspaceId, "service_site");
    const acmeHq = sites.find((s) => s.name === "Acme HQ - San Francisco");
    expect(urgent?.service_site_id).toBe(acmeHq?.id);

    const assets = await getRecords(workspaceId, "asset");
    const hvacAsset = assets.find((a) => a.serial_number === "HVAC-ACME-001");
    expect(urgent?.asset_id).toBe(hvacAsset?.id);

    // Verify internal $alias resolved assigned_to (technician)
    const technicians = await getRecords(workspaceId, "technician");
    const david = technicians.find((t) => t.email === "david@runory.fsm");
    expect(urgent?.assigned_to).toBe(david?.id);
  });

  it("seeds service visits and reports with internal references", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const visits = await getRecords(workspaceId, "service_visit");
    expect(visits.length).toBe(4);

    const reports = await getRecords(workspaceId, "service_report");
    expect(reports.length).toBe(2);

    // Verify service_visit references work_order and technician
    const workOrders = await getRecords(workspaceId, "work_order");
    const urgentWo = workOrders.find((w) => w.title === "Acme HVAC emergency repair");
    const urgentVisit = visits.find((v) => v.work_order_id === urgentWo?.id);
    expect(urgentVisit).toBeDefined();
    expect(urgentVisit?.status).toBe("scheduled");

    // Verify service_report references work_order and service_visit
    const completedReport = reports.find((r) => r.summary === "HVAC filter replacement completed");
    expect(completedReport).toBeDefined();

    const completedWo = workOrders.find((w) => w.title === "Acme server room HVAC filter replacement");
    expect(completedReport?.work_order_id).toBe(completedWo?.id);
    expect(String(completedReport?.photos ?? "")).toContain("att_acme_hvac_before");
  });

  it("seeds user-linked resources and operational assignments for dispatch", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const linkedResources = await queryAll<{ id: string; user_id: string | null }>(
      `SELECT id, user_id FROM ${TABLES.resources}
       WHERE workspace_id = ? AND user_id IS NOT NULL`,
      [workspaceId]
    );
    expect(linkedResources.length).toBeGreaterThan(0);

    const assignments = await queryAll<{ subject_type: string; status: string }>(
      `SELECT subject_type, status FROM ${TABLES.assignments}
       WHERE workspace_id = ?
       ORDER BY created_at ASC`,
      [workspaceId]
    );
    expect(assignments.length).toBeGreaterThanOrEqual(4);
    expect(assignments.some((a) => a.subject_type === "service_visit" && a.status === "accepted")).toBe(true);
    expect(assignments.some((a) => a.subject_type === "work_order" && a.status === "proposed")).toBe(true);

    const geolocatedSchedules = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.scheduleEntries}
       WHERE workspace_id = ?
         AND latitude IS NOT NULL
         AND longitude IS NOT NULL`,
      [workspaceId]
    );
    expect(geolocatedSchedules.length).toBeGreaterThanOrEqual(3);

    const conflictSchedules = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.scheduleEntries}
       WHERE workspace_id = ? AND conflict_state = 'conflict'`,
      [workspaceId]
    );
    expect(conflictSchedules.length).toBeGreaterThanOrEqual(1);
  });

  it("demo data is idempotent across repeated installs", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });
    const second = await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    expect(second.demoRecordsCreated).toBe(0);

    // Counts should remain stable
    const technicians = await getRecords(workspaceId, "technician");
    const sites = await getRecords(workspaceId, "service_site");
    const workOrders = await getRecords(workspaceId, "work_order");
    const schedules = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.scheduleEntries} WHERE workspace_id = ?`,
      [workspaceId]
    );
    expect(technicians.length).toBe(3);
    expect(sites.length).toBe(4);
    expect(workOrders.length).toBe(6);
    expect(schedules.length).toBe(6);
  });

  it("includes required demo scenarios from the plan", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const workOrders = await getRecords(workspaceId, "work_order");
    const assets = await getRecords(workspaceId, "asset");
    const sites = await getRecords(workspaceId, "service_site");
    const visits = await getRecords(workspaceId, "service_visit");

    // One urgent work order
    expect(workOrders.some((w) => w.priority === "urgent")).toBe(true);

    // One active high-priority work order for the current walkthrough.
    // Demo dates are relative-date based, so this should validate the scenario
    // instead of relying on a stale fixed calendar date.
    const activeHighPriority = workOrders.find(
      (w) =>
        w.status === "in_progress" &&
        w.priority === "high" &&
        String(w.title).includes("Acme warehouse HVAC refrigerant recharge")
    );
    expect(activeHighPriority).toBeDefined();

    // One completed work order with service report
    const completedWo = workOrders.find((w) => w.status === "completed");
    expect(completedWo).toBeDefined();
    const reports = await getRecords(workspaceId, "service_report");
    expect(reports.some((r) => r.work_order_id === completedWo?.id)).toBe(true);

    // One company with multiple service sites (Acme has 2 sites)
    const acmeSites = sites.filter((s) => String(s.name).startsWith("Acme"));
    expect(acmeSites.length).toBe(2);

    // One asset under maintenance
    expect(assets.some((a) => a.status === "maintenance")).toBe(true);

    // One technician with multiple assigned visits (David has 3 visits)
    const technicians = await getRecords(workspaceId, "technician");
    const david = technicians.find((t) => t.email === "david@runory.fsm");
    const davidAssignedVisits = visits.filter((v) => v.technician_id === david?.id);
    expect(davidAssignedVisits.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 5: Workbench shows operational metrics
// ─────────────────────────────────────────────────────────────────────────────

describe("FSM workbench composition", () => {
  it("resolves effective layout with FSM widgets", async () => {
    await installPack(workspaceId, "fsm-pack");

    const layout = await resolveEffectiveLayout(workspaceId);
    expect(layout.length).toBeGreaterThan(0);

    // Verify FSM widget keys are present in the layout
    const widgetKeys = layout.map((item) => item.widgetKey);
    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "open_work_orders_metric",
        "overdue_work_orders_metric",
        "scheduled_visits_today_metric",
        "active_assets_metric",
        "new_work_orders_trend",
        "work_orders_needing_dispatch_list",
        "today_schedule_list",
        "recent_service_reports_list",
        "business_activity_feed",
      ])
    );

    // Verify zones are populated
    const zones = new Set(layout.map((item) => item.zone));
    expect(zones.has("metrics")).toBe(true);
    expect(zones.has("trends")).toBe(true);
    expect(zones.has("lists")).toBe(true);
    expect(zones.has("activity")).toBe(true);
  });

  it("open work orders widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "work_order",
      where: "status not in ('completed', 'cancelled')",
    });

    // 6 work orders total, 1 completed → 5 open
    expect(widget.count).toBe(5);
  });

  it("active assets widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "asset",
      where: "status = 'active'",
    });

    // 4 assets total, 1 maintenance → 3 active
    expect(widget.count).toBe(3);
  });

  it("work order status breakdown resolves correctly", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "work_order",
      groupBy: "status",
    });

    expect(widget.groups).toBeDefined();
    const statusMap = new Map(widget.groups!.map((g) => [g.key, g.count]));
    expect(statusMap.get("planned")).toBe(2);
    expect(statusMap.get("in_progress")).toBe(1);
    expect(statusMap.get("new")).toBe(1);
    expect(statusMap.get("completed")).toBe(1);
    expect(statusMap.get("blocked")).toBe(1);
  });

  it("available widgets include FSM module widgets", async () => {
    await installPack(workspaceId, "fsm-pack");

    const widgets = await getAvailableWidgets(workspaceId);
    const widgetKeys = widgets.map((w) => w.widget.key);

    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "open_work_orders_metric",
        "overdue_work_orders_metric",
        "work_order_status_breakdown",
        "work_orders_needing_dispatch_list",
        "new_work_orders_trend",
        "active_assets_metric",
        "asset_status_breakdown",
        "available_technicians_metric",
        "technician_availability_breakdown",
        "active_service_sites_metric",
        "scheduled_visits_today_metric",
        "today_schedule_list",
        "recent_service_reports_list",
      ])
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 6: Cross-pack relation declarations
// ─────────────────────────────────────────────────────────────────────────────

describe("FSM module cross-pack relation declarations", () => {
  it("runory.work-order declares relations to company, contact, service_site, asset, technician", async () => {
    const manifest = loadModuleManifest("runory.work-order");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(5);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.service-site",
        "runory.asset",
        "runory.technician",
      ])
    );

    // Verify each relation has a valid foreignKey on the work_order object
    const woFields = new Set(manifest.objects[0].fields.map((f) => f.key));
    for (const rel of manifest.relations!) {
      expect(rel.object).toBe("work_order");
      expect(woFields.has(rel.foreignKey)).toBe(true);
    }
  });

  it("runory.service-visit declares relations to work_order and technician", async () => {
    const manifest = loadModuleManifest("runory.service-visit");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(2);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining(["runory.work-order", "runory.technician"])
    );

    const workOrderRelation = manifest.relations!.find(
      (relation) => relation.targetObject === "work_order"
    );
    expect(workOrderRelation?.backlinkPresentation).toMatchObject({
      mode: "compact",
      limit: 5,
      columns: [
        { field: "title" },
        { field: "technician_id" },
        { field: "scheduled_start" },
        { field: "scheduled_end" },
        { field: "status" },
      ],
    });
  });

  it("runory.service-report declares relations to work_order and service_visit", async () => {
    const manifest = loadModuleManifest("runory.service-report");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(2);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining(["runory.work-order", "runory.service-visit"])
    );
  });

  it("all FSM module manifests validate against schema", async () => {
    const moduleIds = [
      "runory.service-site",
      "runory.asset",
      "runory.technician",
      "runory.work-order",
      "runory.service-visit",
      "runory.service-report",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const reparsed = moduleManifestSchema.parse(manifest);
      expect(reparsed.id).toBe(moduleId);
      expect(reparsed.objects.length).toBeGreaterThan(0);
      expect(reparsed.migrations.install).toBeDefined();
    }
  });

  it("FSM module dashboard widgets pass validation", async () => {
    const moduleIds = [
      "runory.service-site",
      "runory.asset",
      "runory.technician",
      "runory.work-order",
      "runory.service-visit",
      "runory.service-report",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const errors = validateModuleDashboard(manifest);
      expect(errors, `Module ${moduleId} dashboard errors: ${errors.join("; ")}`).toEqual([]);
    }
  });

  it("FSM pack dashboard layout passes validation", async () => {
    const pack = loadPackManifest("fsm-pack");
    const errors = validatePackDashboard(pack);
    expect(errors, `Pack dashboard layout errors: ${errors.join("; ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 7: FSM demo journey — end-to-end trial flow
// Install → Load demo → Assign technician → Complete visit → Submit report
// ─────────────────────────────────────────────────────────────────────────────

describe("FSM demo journey (end-to-end trial flow)", () => {
  it("completes the canonical FSM trial journey", async () => {
    // 1. Install FSM Pack
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });
    const initialOpenCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "work_order",
      where: "status not in ('completed', 'cancelled')",
    });

    // 2. Create a new work order (simulating service request)
    const wo = await createRecord(workspaceId, "work_order", {
      title: "Emergency boiler repair",
      description: "Boiler not heating. Customer reports cold building.",
      status: "new",
      priority: "urgent",
      source: "customer_call",
      requested_at: "2026-06-23",
      sla_due_at: "2026-06-24",
    });
    expect(wo.id).toBeDefined();

    // 3. Use a dispatchable technician. Scheduling belongs to Plan & dispatch,
    // not to generic work-order fields.
    const tech = await queryOne<{ id: string }>(
      `SELECT id FROM ${businessTable("technician")} WHERE workspace_id = ? AND resource_id IS NOT NULL LIMIT 1`,
      [workspaceId],
    );
    expect(tech).toBeDefined();

    // 4b. Triage the work order (new → triaged) via FSM command
    const actor = { type: "system" as const, id: "test-runner" };
    const triageResult = await triageWorkOrder(workspaceId, wo.id, actor, 1, {
      priority: "urgent",
    });
    expect(triageResult.status).toBe("succeeded");
    expect(triageResult.newVersion).toBe(2);

    // 4c. Create a service visit (triaged → planned) via FSM command
    const visitResult = await createVisit(
      workspaceId,
      wo.id,
      actor,
      2, // expectedVersion after triage
      {
        title: "Emergency visit",
        technicianId: tech!.id,
        // Spec §5.5: schedule end_at MUST be after start_at (use a time window).
        scheduledStart: "2026-06-23T09:00:00Z",
        scheduledEnd: "2026-06-23T17:00:00Z",
        notes: "Emergency visit scheduled",
      }
    );
    expect(visitResult.status).toBe("succeeded");
    expect(visitResult.newVersion).toBe(3);

    // 5. Query for the created service visit
    const visit = await queryOne<{ id: string; status: string; work_order_id: string }>(
      `SELECT id, status, work_order_id FROM ${businessTable("service_visit")} WHERE workspace_id = ? AND work_order_id = ?`,
      [workspaceId, wo.id]
    );
    expect(visit).toBeDefined();
    expect(visit!.status).toBe("scheduled");

    // 6. Transition the service visit through its FSM lifecycle
    await startTravel(workspaceId, visit!.id, actor, 1);
    await arriveOnSite(workspaceId, visit!.id, actor, 2);
    await submitWork(workspaceId, visit!.id, actor, 3);
    const requirement = await queryOne<{ form_definition_id: string; form_version_id: string; binding_id: string }>(
      `SELECT form_definition_id, form_version_id, binding_id
       FROM ${TABLES.visitExecutionRequirements} WHERE workspace_id = ? AND visit_id = ?`,
      [workspaceId, visit!.id],
    );
    await submitForm(workspaceId, {
      formDefinitionId: requirement!.form_definition_id,
      formVersionId: requirement!.form_version_id,
      bindingId: requirement!.binding_id,
      subjectType: "service_visit",
      subjectId: visit!.id,
      answers: {
        work_performed: "Boiler repaired successfully",
        system_status_after_service: "operational",
        "cl-pre-service": { "cl-1": "pass", "cl-2": "pass", "cl-3": "pass", "cl-4": "pass" },
        "evi-photos": { attachments: ["before", "after"] },
        "sig-customer": { acknowledged: true, signedBy: "Building Manager" },
      },
      submittedBy: actor.id,
    }, undefined, undefined, actor);
    await completeVisit(workspaceId, visit!.id, actor, 3);

    // Verify visit is completed
    const completedVisitRow = await queryOne<{ status: string }>(
      `SELECT status FROM ${businessTable("service_visit")} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, visit!.id]
    );
    expect(completedVisitRow?.status).toBe("completed");

    // 7. Submit a service report
    const report = await createRecord(workspaceId, "service_report", {
      work_order_id: wo.id,
      service_visit_id: visit!.id,
      summary: "Boiler repaired successfully",
      resolution: "Replaced faulty thermocouple and cleaned burner assembly. System tested and operating normally.",
      customer_signature: "Building Manager",
      created_by: "Emergency Tech",
      completed_at: "2026-06-23",
    });
    expect(report.id).toBeDefined();

    // 8. Start and complete the work order via governed FSM commands.
    const startResult = await startWorkOrder(workspaceId, wo.id, actor, 3);
    expect(startResult.status).toBe("succeeded");
    expect(startResult.newVersion).toBe(4);

    const completeResult = await completeWorkOrder(workspaceId, wo.id, actor, 4, "Repair completed");
    expect(completeResult.status).toBe("succeeded");
    expect(completeResult.newVersion).toBe(5);

    // 9. Verify workbench reflects the completed state
    const openCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "work_order",
      where: "status not in ('completed', 'cancelled')",
    });
    // The demo fixture can contain other open work orders; completing this
    // journey must bring the workbench count back to its initial state.
    expect(openCount.count).toBe(initialOpenCount.count);

    // 10. Verify the service report is in the recent list
    const recentReports = await resolveWidgetData(workspaceId, {
      kind: "recent",
      object: "service_report",
      orderBy: "completed_at desc",
      limit: 5,
      columns: ["work_order_id", "summary"],
    });
    expect(recentReports.records).toBeDefined();
    expect(recentReports.records!.some((record) => record.summary === "Boiler repaired successfully")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 8: Pack installation tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("FSM pack installation tracking", () => {
  it("records FSM pack installation with terminology overlay", async () => {
    await installPack(workspaceId, "fsm-pack");

    const packInstalls = await queryAll<{ pack_id: string; terminology_json: string | null }>(
      `SELECT pack_id, terminology_json FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "fsm-pack"]
    );

    expect(packInstalls).toHaveLength(1);
    expect(packInstalls[0].terminology_json).not.toBeNull();

    const terminology = JSON.parse(packInstalls[0].terminology_json!);
    expect(terminology).toHaveLength(2);
    expect(terminology[0].object).toBe("company");
    expect(terminology[0].navigationLabel).toBe("Customer");
    expect(terminology[1].object).toBe("task");
    expect(terminology[1].navigationLabel).toBe("Service Task");
  });

  it("updates FSM pack installation on re-install (idempotent)", async () => {
    await installPack(workspaceId, "fsm-pack");
    await installPack(workspaceId, "fsm-pack");

    const packInstalls = await queryAll<{ pack_id: string }>(
      `SELECT pack_id FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "fsm-pack"]
    );

    expect(packInstalls).toHaveLength(1);
  });

  it("getInstalledPacks returns pack-level installation records", async () => {
    await installPack(workspaceId, "fsm-pack");

    const packs = await getInstalledPacks(workspaceId);
    expect(packs.length).toBeGreaterThanOrEqual(1);

    const fsmPack = packs.find((p) => p.packId === "fsm-pack");
    expect(fsmPack).toBeDefined();
    expect(fsmPack!.packVersion).toBe("1.0.0");
    expect(fsmPack!.installedAt).toBeTruthy();
  });

  it("getRelations returns persisted relation definitions (v0.3.2)", async () => {
    await installPack(workspaceId, "fsm-pack");

    // work_order has relations to service_site and asset
    const relations = await getRelations(workspaceId, "work_order");
    expect(relations.length).toBeGreaterThanOrEqual(1);

    const siteRel = relations.find((r) => r.targetObjectKey === "service_site");
    expect(siteRel).toBeDefined();
    expect(siteRel!.foreignKey).toBe("service_site_id");
    expect(siteRel!.relationType).toBe("many_to_one");
  });

  it("derives dependent lookup filters from the relation graph", async () => {
    await installPack(workspaceId, "fsm-pack");

    const fields = await getFields(workspaceId, "work_order");
    const lookupFilters = (fieldKey: string) =>
      fields.find((field) => field.fieldKey === fieldKey)?.validation?.lookupFilters;

    expect(lookupFilters("contact_id")).toEqual(expect.arrayContaining([
      { field: "company_id", targetField: "primary_company_id" },
    ]));
    expect(lookupFilters("service_site_id")).toEqual(expect.arrayContaining([
      { field: "company_id", targetField: "company_id" },
    ]));
    expect(lookupFilters("asset_id")).toEqual(expect.arrayContaining([
      { field: "company_id", targetField: "company_id" },
      { field: "service_site_id", targetField: "service_site_id" },
    ]));
  });

  it("getBacklinks returns incoming relations (v0.3.2)", async () => {
    await installPack(workspaceId, "fsm-pack");

    // service_site should have backlinks from work_order (service_site_id) and asset (site_id)
    const backlinks = await getBacklinks(workspaceId, "service_site");
    expect(backlinks.length).toBeGreaterThanOrEqual(1);

    const woBacklink = backlinks.find((b) => b.objectKey === "work_order");
    expect(woBacklink).toBeDefined();
    expect(woBacklink!.foreignKey).toBe("service_site_id");
    expect(woBacklink!.targetObjectKey).toBe("service_site");
  });
});
