import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryAll } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import { installPack, loadModuleManifest, loadPackManifest } from "./installer";
import { getRecords, getNavigation, getInstallations, createRecord, updateRecord, getObject } from "./metadata";
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
    [workspaceId, "After-sales Test WS", "as-test-ws", ts, ts]
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
// Acceptance 1: After-sales Pack installs with all 9 modules
// ─────────────────────────────────────────────────────────────────────────────

describe("After-sales Pack installation", () => {
  it("installs all 9 modules with correct object definitions and navigation", async () => {
    const result = await installPack(workspaceId, "after-sales-pack");

    expect(result.packId).toBe("after-sales-pack");
    expect(result.modulesInstalled.sort()).toEqual(
      [
        "runory.company",
        "runory.contact",
        "runory.task",
        "runory.warranty",
        "runory.entitlement",
        "runory.return-request",
        "runory.repair-request",
        "runory.maintenance-plan",
        "runory.customer-success",
      ].sort()
    );
    expect(result.ddlExecuted).toBe(true);

    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(9);

    // Verify after-sales-owned objects are created
    const asObjects = [
      "warranty",
      "entitlement",
      "return_request",
      "repair_request",
      "maintenance_plan",
      "customer_success",
    ];
    for (const objKey of asObjects) {
      const obj = await getObject(workspaceId, objKey);
      expect(obj).toBeDefined();
      expect(obj?.ownership).toBe("module_owned");
    }

    // Verify navigation includes after-sales routes
    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/warranties",
        "/entitlements",
        "/return-requests",
        "/repair-requests",
        "/maintenance-plans",
        "/customer-success",
        "/companies",
        "/contacts",
        "/tasks",
      ])
    );
  });

  it("creates business tables for all after-sales objects", async () => {
    await installPack(workspaceId, "after-sales-pack");

    for (const objKey of [
      "warranty",
      "entitlement",
      "return_request",
      "repair_request",
      "maintenance_plan",
      "customer_success",
    ]) {
      const records = await getRecords(workspaceId, objKey);
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("pack manifest validates against schema", async () => {
    const pack = loadPackManifest("after-sales-pack");
    const reparsed = packManifestSchema.parse(pack);
    expect(reparsed.id).toBe("after-sales-pack");
    expect(reparsed.modules).toHaveLength(9);
    expect(reparsed.dashboard?.defaultLayout).toBeDefined();
    expect(reparsed.terminology).toBeDefined();
    expect(reparsed.defaultTemplate).toBe("small-business-after-sales");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 2: Shared module dedupe
// ─────────────────────────────────────────────────────────────────────────────

describe("shared module dedupe with CRM Lite Pack", () => {
  it("installs CRM Lite Pack then After-sales Pack without duplicate shared modules", async () => {
    const crmResult = await installPack(workspaceId, "crm-lite-pack");
    expect(crmResult.modulesInstalled.sort()).toEqual(
      ["runory.company", "runory.contact", "runory.deal", "runory.task"].sort()
    );

    const asResult = await installPack(workspaceId, "after-sales-pack");
    // company, contact, task are shared (skip); warranty/entitlement/return-request/
    // repair-request/maintenance-plan/customer-success are new
    expect(asResult.modulesInstalled.sort()).toEqual(
      [
        "runory.warranty",
        "runory.entitlement",
        "runory.return-request",
        "runory.repair-request",
        "runory.maintenance-plan",
        "runory.customer-success",
      ].sort()
    );

    const installations = await getInstallations(workspaceId);
    // 4 CRM + 6 after-sales-new (company/contact/task deduped) = 10
    expect(installations).toHaveLength(10);

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
    await installPack(workspaceId, "after-sales-pack");

    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    const uniqueRoutes = new Set(routes);
    expect(routes.length).toBe(uniqueRoutes.size);

    expect(routes.filter((r) => r === "/companies").length).toBe(1);
    expect(routes.filter((r) => r === "/contacts").length).toBe(1);
    expect(routes.filter((r) => r === "/tasks").length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 3: Pack-specific terminology overlay
// ─────────────────────────────────────────────────────────────────────────────

describe("After-sales pack terminology overlay", () => {
  it("applies after-sales terminology to navigation labels", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "after-sales-pack");

    const nav = await getNavigation(workspaceId);
    const companyNav = nav.find((n) => n.route === "/companies");
    expect(companyNav?.label).toBe("Customer");
  });

  it("does not fork the underlying object definitions", async () => {
    await installPack(workspaceId, "after-sales-pack");

    const company = await getObject(workspaceId, "company");
    expect(company?.label).toBe("Company");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 4: Cross-pack demo data references via $lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("After-sales demo data with cross-pack references", () => {
  it("seeds after-sales demo data referencing companies and contacts", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    const asResult = await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });
    expect(asResult.demoRecordsCreated).toBeGreaterThan(0);

    // Verify warranties were created (5)
    const warranties = await getRecords(workspaceId, "warranty");
    expect(warranties.length).toBe(5);

    // Verify $lookup resolved company_id on WAR-2026-001 (Acme)
    const companies = await getRecords(workspaceId, "company");
    const acme = companies.find((c) => c.domain === "acme.example");
    expect(acme).toBeDefined();
    const war001 = warranties.find((w) => w.warranty_number === "WAR-2026-001");
    expect(war001).toBeDefined();
    expect(war001?.company_id).toBe(acme?.id);

    // Verify $lookup resolved contact_id on WAR-2026-001
    const contacts = await getRecords(workspaceId, "contact");
    const maya = contacts.find((c) => c.email === "maya@acme.example");
    expect(maya).toBeDefined();
    expect(war001?.contact_id).toBe(maya?.id);

    // Verify entitlements were created (4)
    const entitlements = await getRecords(workspaceId, "entitlement");
    expect(entitlements.length).toBe(4);

    // Verify $lookup resolved company_id on ENT-2026-001 (Acme)
    const ent001 = entitlements.find((e) => e.entitlement_number === "ENT-2026-001");
    expect(ent001).toBeDefined();
    expect(ent001?.company_id).toBe(acme?.id);
    expect(ent001?.contact_id).toBe(maya?.id);
    expect(ent001?.remaining_value).toBe(32);

    // Verify return requests were created (4)
    const returns = await getRecords(workspaceId, "return_request");
    expect(returns.length).toBe(4);

    // Verify $lookup resolved company_id on RET-2026-001 (Acme)
    const ret001 = returns.find((r) => r.return_number === "RET-2026-001");
    expect(ret001).toBeDefined();
    expect(ret001?.company_id).toBe(acme?.id);
    expect(ret001?.contact_id).toBe(maya?.id);

    // Verify repair requests were created (5)
    const repairs = await getRecords(workspaceId, "repair_request");
    expect(repairs.length).toBe(5);

    // Verify $lookup resolved company_id on REP-2026-001 (Acme)
    const rep001 = repairs.find((r) => r.repair_number === "REP-2026-001");
    expect(rep001).toBeDefined();
    expect(rep001?.company_id).toBe(acme?.id);
    expect(rep001?.contact_id).toBe(maya?.id);

    // Verify $alias resolved warranty_id on REP-2026-001 (war-acme-hvac → WAR-2026-001)
    expect(rep001?.warranty_id).toBe(war001?.id);

    // Verify $alias resolved warranty_id on REP-2026-002 (war-vertex-cnc → WAR-2026-003)
    const rep002 = repairs.find((r) => r.repair_number === "REP-2026-002");
    expect(rep002).toBeDefined();
    const war003 = warranties.find((w) => w.warranty_number === "WAR-2026-003");
    expect(war003).toBeDefined();
    expect(rep002?.warranty_id).toBe(war003?.id);

    // Verify maintenance plans were created (5)
    const plans = await getRecords(workspaceId, "maintenance_plan");
    expect(plans.length).toBe(5);

    // Verify $lookup resolved company_id on MP-2026-001 (Acme)
    const mp001 = plans.find((p) => p.plan_number === "MP-2026-001");
    expect(mp001).toBeDefined();
    expect(mp001?.company_id).toBe(acme?.id);
    expect(mp001?.contact_id).toBe(maya?.id);

    // Verify customer success follow-ups were created (5)
    const followups = await getRecords(workspaceId, "customer_success");
    expect(followups.length).toBe(5);

    // Verify $lookup resolved company_id on CS-2026-001 (Acme)
    const cs001 = followups.find((c) => c.followup_number === "CS-2026-001");
    expect(cs001).toBeDefined();
    expect(cs001?.company_id).toBe(acme?.id);
    expect(cs001?.contact_id).toBe(maya?.id);
  });

  it("resolves cross-pack $lookup to asset, work_order, quote, product_service, and ticket when FSM, Sales, and Customer Service packs are installed", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const assets = await getRecords(workspaceId, "asset");
    const workOrders = await getRecords(workspaceId, "work_order");
    const quotes = await getRecords(workspaceId, "quote");
    const products = await getRecords(workspaceId, "product_service");
    const tickets = await getRecords(workspaceId, "ticket");

    // WAR-2026-001 should have product_service_id, asset_id, and quote_id resolved via $lookup
    const warranties = await getRecords(workspaceId, "warranty");
    const war001 = warranties.find((w) => w.warranty_number === "WAR-2026-001");
    expect(war001).toBeDefined();

    const hvacAsset = assets.find((a) => a.serial_number === "HVAC-ACME-001");
    expect(hvacAsset).toBeDefined();
    expect(war001?.asset_id).toBe(hvacAsset?.id);

    const productService = products.find((p) => p.sku === "SVC-INSP-001");
    expect(productService).toBeDefined();
    expect(war001?.product_service_id).toBe(productService?.id);

    const quote = quotes.find((q) => q.quote_number === "Q-2026-001");
    expect(quote).toBeDefined();
    expect(war001?.quote_id).toBe(quote?.id);

    // ENT-2026-001 should have product_service_id and asset_id resolved via $lookup
    const entitlements = await getRecords(workspaceId, "entitlement");
    const ent001 = entitlements.find((e) => e.entitlement_number === "ENT-2026-001");
    expect(ent001).toBeDefined();
    expect(ent001?.product_service_id).toBe(productService?.id);
    expect(ent001?.asset_id).toBe(hvacAsset?.id);

    // RET-2026-001 should have asset_id and ticket_id resolved via $lookup
    const returns = await getRecords(workspaceId, "return_request");
    const ret001 = returns.find((r) => r.return_number === "RET-2026-001");
    expect(ret001).toBeDefined();
    expect(ret001?.asset_id).toBe(hvacAsset?.id);

    const tkt001 = tickets.find((t) => t.ticket_number === "TKT-2026-001");
    expect(tkt001).toBeDefined();
    expect(ret001?.ticket_id).toBe(tkt001?.id);

    // REP-2026-001 should have asset_id, ticket_id, and work_order_id resolved via $lookup
    const repairs = await getRecords(workspaceId, "repair_request");
    const rep001 = repairs.find((r) => r.repair_number === "REP-2026-001");
    expect(rep001).toBeDefined();
    expect(rep001?.asset_id).toBe(hvacAsset?.id);
    expect(rep001?.ticket_id).toBe(tkt001?.id);

    const acmeWo = workOrders.find((w) => w.title === "Acme HVAC emergency repair");
    expect(acmeWo).toBeDefined();
    expect(rep001?.work_order_id).toBe(acmeWo?.id);

    // REP-2026-002 should have asset_id, ticket_id, work_order_id, and quote_id resolved via $lookup
    const rep002 = repairs.find((r) => r.repair_number === "REP-2026-002");
    expect(rep002).toBeDefined();
    const cncAsset = assets.find((a) => a.serial_number === "CNC-VTX-001");
    expect(cncAsset).toBeDefined();
    expect(rep002?.asset_id).toBe(cncAsset?.id);
    const tkt003 = tickets.find((t) => t.ticket_number === "TKT-2026-003");
    expect(tkt003).toBeDefined();
    expect(rep002?.ticket_id).toBe(tkt003?.id);
    const vertexWo = workOrders.find((w) => w.title === "Vertex CNC calibration and service");
    expect(vertexWo).toBeDefined();
    expect(rep002?.work_order_id).toBe(vertexWo?.id);
    expect(rep002?.quote_id).toBe(quote?.id);

    // MP-2026-001 should have asset_id resolved via $lookup
    const plans = await getRecords(workspaceId, "maintenance_plan");
    const mp001 = plans.find((p) => p.plan_number === "MP-2026-001");
    expect(mp001).toBeDefined();
    expect(mp001?.asset_id).toBe(hvacAsset?.id);
  });

  it("demo data is idempotent across repeated installs", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });
    const second = await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    expect(second.demoRecordsCreated).toBe(0);

    const warranties = await getRecords(workspaceId, "warranty");
    const entitlements = await getRecords(workspaceId, "entitlement");
    const returns = await getRecords(workspaceId, "return_request");
    const repairs = await getRecords(workspaceId, "repair_request");
    const plans = await getRecords(workspaceId, "maintenance_plan");
    const followups = await getRecords(workspaceId, "customer_success");
    expect(warranties.length).toBe(5);
    expect(entitlements.length).toBe(4);
    expect(returns.length).toBe(4);
    expect(repairs.length).toBe(5);
    expect(plans.length).toBe(5);
    expect(followups.length).toBe(5);
  });

  it("includes required demo scenarios from the plan", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const warranties = await getRecords(workspaceId, "warranty");
    const entitlements = await getRecords(workspaceId, "entitlement");
    const returns = await getRecords(workspaceId, "return_request");
    const repairs = await getRecords(workspaceId, "repair_request");
    const plans = await getRecords(workspaceId, "maintenance_plan");
    const followups = await getRecords(workspaceId, "customer_success");

    // Warranties with different statuses
    expect(warranties.some((w) => w.status === "active")).toBe(true);
    expect(warranties.some((w) => w.status === "expired")).toBe(true);
    expect(warranties.some((w) => w.status === "pending")).toBe(true);

    // Warranties with different types
    expect(warranties.some((w) => w.warranty_type === "standard")).toBe(true);
    expect(warranties.some((w) => w.warranty_type === "extended")).toBe(true);
    expect(warranties.some((w) => w.warranty_type === "premium")).toBe(true);
    expect(warranties.some((w) => w.warranty_type === "trial")).toBe(true);

    // Entitlements with different statuses
    expect(entitlements.some((e) => e.status === "active")).toBe(true);
    expect(entitlements.some((e) => e.status === "expired")).toBe(true);

    // Entitlements with different types
    expect(entitlements.some((e) => e.entitlement_type === "support_hours")).toBe(true);
    expect(entitlements.some((e) => e.entitlement_type === "visits")).toBe(true);
    expect(entitlements.some((e) => e.entitlement_type === "discount")).toBe(true);
    expect(entitlements.some((e) => e.entitlement_type === "priority_response")).toBe(true);

    // Return requests with different statuses
    expect(returns.some((r) => r.status === "received")).toBe(true);
    expect(returns.some((r) => r.status === "in_transit")).toBe(true);
    expect(returns.some((r) => r.status === "approved")).toBe(true);
    expect(returns.some((r) => r.status === "rejected")).toBe(true);

    // Return requests with different types
    expect(returns.some((r) => r.return_type === "defective")).toBe(true);
    expect(returns.some((r) => r.return_type === "wrong_item")).toBe(true);
    expect(returns.some((r) => r.return_type === "upgrade")).toBe(true);
    expect(returns.some((r) => r.return_type === "not_needed")).toBe(true);

    // Repairs with different statuses
    expect(repairs.some((r) => r.status === "in_repair")).toBe(true);
    expect(repairs.some((r) => r.status === "quoted")).toBe(true);
    expect(repairs.some((r) => r.status === "completed")).toBe(true);
    expect(repairs.some((r) => r.status === "diagnosing")).toBe(true);

    // Warranty repairs and paid repairs
    expect(repairs.some((r) => r.is_warranty === true || r.is_warranty === 1)).toBe(true);
    expect(repairs.some((r) => r.is_paid === true || r.is_paid === 1)).toBe(true);
    expect(repairs.some((r) => (r.is_warranty === true || r.is_warranty === 1) && (r.is_paid === false || r.is_paid === 0))).toBe(true);
    expect(repairs.some((r) => (r.is_warranty === false || r.is_warranty === 0) && (r.is_paid === true || r.is_paid === 1))).toBe(true);

    // Maintenance plans with different statuses
    expect(plans.some((p) => p.status === "active")).toBe(true);
    expect(plans.some((p) => p.status === "paused")).toBe(true);

    // Maintenance plans with different types
    expect(plans.some((p) => p.plan_type === "recurring")).toBe(true);
    expect(plans.some((p) => p.plan_type === "preventive")).toBe(true);
    expect(plans.some((p) => p.plan_type === "seasonal")).toBe(true);

    // Maintenance plans with different frequencies
    expect(plans.some((p) => p.frequency === "quarterly")).toBe(true);
    expect(plans.some((p) => p.frequency === "annual")).toBe(true);
    expect(plans.some((p) => p.frequency === "monthly")).toBe(true);
    expect(plans.some((p) => p.frequency === "semi_annual")).toBe(true);

    // Customer success follow-ups with different statuses
    expect(followups.some((c) => c.status === "completed")).toBe(true);
    expect(followups.some((c) => c.status === "in_progress")).toBe(true);
    expect(followups.some((c) => c.status === "scheduled")).toBe(true);
    expect(followups.some((c) => c.status === "overdue")).toBe(true);

    // Customer success follow-ups with different types
    expect(followups.some((c) => c.followup_type === "check_in")).toBe(true);
    expect(followups.some((c) => c.followup_type === "onboarding")).toBe(true);
    expect(followups.some((c) => c.followup_type === "renewal")).toBe(true);
    expect(followups.some((c) => c.followup_type === "upsell")).toBe(true);
    expect(followups.some((c) => c.followup_type === "satisfaction")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 5: Warranty and entitlement lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("warranty and entitlement lifecycle", () => {
  it("supports warranty statuses active, expired, voided, and pending", async () => {
    await installPack(workspaceId, "after-sales-pack");

    const active = await createRecord(workspaceId, "warranty", {
      warranty_number: "WAR-LIFE-001",
      title: "Active Warranty",
      status: "active",
      warranty_type: "standard",
      start_date: "2026-01-01",
      end_date: "2027-01-01",
    });
    expect(active.status).toBe("active");

    const expired = await createRecord(workspaceId, "warranty", {
      warranty_number: "WAR-LIFE-002",
      title: "Expired Warranty",
      status: "expired",
      warranty_type: "standard",
      start_date: "2024-01-01",
      end_date: "2025-01-01",
    });
    expect(expired.status).toBe("expired");

    const voided = await createRecord(workspaceId, "warranty", {
      warranty_number: "WAR-LIFE-003",
      title: "Voided Warranty",
      status: "voided",
      warranty_type: "standard",
      start_date: "2026-01-01",
      end_date: "2027-01-01",
    });
    expect(voided.status).toBe("voided");

    const pending = await createRecord(workspaceId, "warranty", {
      warranty_number: "WAR-LIFE-004",
      title: "Pending Warranty",
      status: "pending",
      warranty_type: "trial",
      start_date: "2026-07-01",
      end_date: "2027-07-01",
    });
    expect(pending.status).toBe("pending");

    // Transition pending → active
    const activated = await updateRecord(workspaceId, "warranty", pending.id, { status: "active" });
    expect(activated?.status).toBe("active");
  });

  it("supports entitlement statuses active, suspended, expired, and consumed", async () => {
    await installPack(workspaceId, "after-sales-pack");

    const active = await createRecord(workspaceId, "entitlement", {
      entitlement_number: "ENT-LIFE-001",
      name: "Active Entitlement",
      status: "active",
      entitlement_type: "support_hours",
      total_value: 50,
      consumed_value: 10,
      remaining_value: 40,
      unit: "hours",
    });
    expect(active.status).toBe("active");

    const suspended = await createRecord(workspaceId, "entitlement", {
      entitlement_number: "ENT-LIFE-002",
      name: "Suspended Entitlement",
      status: "suspended",
      entitlement_type: "visits",
      total_value: 10,
      consumed_value: 5,
      remaining_value: 5,
      unit: "visits",
    });
    expect(suspended.status).toBe("suspended");

    const expired = await createRecord(workspaceId, "entitlement", {
      entitlement_number: "ENT-LIFE-003",
      name: "Expired Entitlement",
      status: "expired",
      entitlement_type: "discount",
      total_value: 20,
      consumed_value: 20,
      remaining_value: 0,
      unit: "percent",
    });
    expect(expired.status).toBe("expired");

    const consumed = await createRecord(workspaceId, "entitlement", {
      entitlement_number: "ENT-LIFE-004",
      name: "Consumed Entitlement",
      status: "consumed",
      entitlement_type: "service_credits",
      total_value: 100,
      consumed_value: 100,
      remaining_value: 0,
      unit: "credits",
    });
    expect(consumed.status).toBe("consumed");

    // Transition active → suspended → active
    const suspendedAgain = await updateRecord(workspaceId, "entitlement", active.id, { status: "suspended" });
    expect(suspendedAgain?.status).toBe("suspended");
    const reactivated = await updateRecord(workspaceId, "entitlement", active.id, { status: "active" });
    expect(reactivated?.status).toBe("active");
  });

  it("demo warranty WAR-2026-001 references company, contact, product_service, asset, and quote", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const warranties = await getRecords(workspaceId, "warranty");
    const war001 = warranties.find((w) => w.warranty_number === "WAR-2026-001");
    expect(war001).toBeDefined();

    // Verify all cross-pack references resolved
    expect(war001?.company_id).toBeTruthy();
    expect(war001?.contact_id).toBeTruthy();
    expect(war001?.product_service_id).toBeTruthy();
    expect(war001?.asset_id).toBeTruthy();
    expect(war001?.quote_id).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 6: Repair request with warranty and quote
// ─────────────────────────────────────────────────────────────────────────────

describe("repair request with warranty and quote", () => {
  it("REP-2026-001 is a warranty repair (is_warranty=true, is_paid=false)", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const repairs = await getRecords(workspaceId, "repair_request");
    const rep001 = repairs.find((r) => r.repair_number === "REP-2026-001");
    expect(rep001).toBeDefined();
    expect(rep001?.is_warranty === true || rep001?.is_warranty === 1).toBe(true);
    expect(rep001?.is_paid === false || rep001?.is_paid === 0).toBe(true);
    expect(rep001?.estimated_cost).toBe(0);
  });

  it("REP-2026-002 is a paid repair (is_warranty=false, is_paid=true, estimated_cost=12000)", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const repairs = await getRecords(workspaceId, "repair_request");
    const rep002 = repairs.find((r) => r.repair_number === "REP-2026-002");
    expect(rep002).toBeDefined();
    expect(rep002?.is_warranty === false || rep002?.is_warranty === 0).toBe(true);
    expect(rep002?.is_paid === true || rep002?.is_paid === 1).toBe(true);
    expect(rep002?.estimated_cost).toBe(12000);
  });

  it("verifies $alias-resolved warranty_id on repair requests", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const warranties = await getRecords(workspaceId, "warranty");
    const repairs = await getRecords(workspaceId, "repair_request");

    // REP-2026-001 warranty_id → WAR-2026-001 (war-acme-hvac)
    const war001 = warranties.find((w) => w.warranty_number === "WAR-2026-001");
    const rep001 = repairs.find((r) => r.repair_number === "REP-2026-001");
    expect(rep001?.warranty_id).toBe(war001?.id);

    // REP-2026-002 warranty_id → WAR-2026-003 (war-vertex-cnc)
    const war003 = warranties.find((w) => w.warranty_number === "WAR-2026-003");
    const rep002 = repairs.find((r) => r.repair_number === "REP-2026-002");
    expect(rep002?.warranty_id).toBe(war003?.id);

    // REP-2026-003 warranty_id → WAR-2026-002 (war-nova-fridge)
    const war002 = warranties.find((w) => w.warranty_number === "WAR-2026-002");
    const rep003 = repairs.find((r) => r.repair_number === "REP-2026-003");
    expect(rep003?.warranty_id).toBe(war002?.id);

    // REP-2026-004 warranty_id → WAR-2026-004 (war-acme-warehouse)
    const war004 = warranties.find((w) => w.warranty_number === "WAR-2026-004");
    const rep004 = repairs.find((r) => r.repair_number === "REP-2026-004");
    expect(rep004?.warranty_id).toBe(war004?.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 7: Maintenance plan progress tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("maintenance plan progress tracking", () => {
  it("MP-2026-001 has completed_visits=2 and total_visits=4", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const plans = await getRecords(workspaceId, "maintenance_plan");
    const mp001 = plans.find((p) => p.plan_number === "MP-2026-001");
    expect(mp001).toBeDefined();
    expect(mp001?.completed_visits).toBe(2);
    expect(mp001?.total_visits).toBe(4);
    expect(mp001?.status).toBe("active");
    expect(mp001?.frequency).toBe("quarterly");
  });

  it("MP-2026-005 is paused", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const plans = await getRecords(workspaceId, "maintenance_plan");
    const mp005 = plans.find((p) => p.plan_number === "MP-2026-005");
    expect(mp005).toBeDefined();
    expect(mp005?.status).toBe("paused");
    expect(mp005?.completed_visits).toBe(1);
    expect(mp005?.total_visits).toBe(2);
  });

  it("supports updating maintenance plan progress", async () => {
    await installPack(workspaceId, "after-sales-pack");

    const plan = await createRecord(workspaceId, "maintenance_plan", {
      plan_number: "MP-PROG-001",
      name: "Progress Test Maintenance Plan",
      status: "active",
      plan_type: "recurring",
      frequency: "quarterly",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      total_visits: 4,
      completed_visits: 1,
    });
    expect(plan.completed_visits).toBe(1);

    const updated = await updateRecord(workspaceId, "maintenance_plan", plan.id, {
      completed_visits: 2,
      next_visit_date: "2026-09-15",
    });
    expect(updated?.completed_visits).toBe(2);
    expect(updated?.next_visit_date).toBe("2026-09-15");

    // Complete all visits
    const completed = await updateRecord(workspaceId, "maintenance_plan", plan.id, {
      completed_visits: 4,
      status: "completed",
    });
    expect(completed?.completed_visits).toBe(4);
    expect(completed?.status).toBe("completed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 8: Customer success follow-ups in workbench
// ─────────────────────────────────────────────────────────────────────────────

describe("customer success follow-ups in workbench", () => {
  it("resolves effective layout with after-sales widgets", async () => {
    await installPack(workspaceId, "after-sales-pack");

    const layout = await resolveEffectiveLayout(workspaceId);
    expect(layout.length).toBeGreaterThan(0);

    const widgetKeys = layout.map((item) => item.widgetKey);
    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "active_warranties_metric",
        "expired_warranties_metric",
        "open_repairs_metric",
        "active_plans_metric",
        "open_followups_metric",
        "overdue_followups_metric",
        "expiring_warranties_list",
        "recent_warranties_list",
        "recent_repairs_list",
        "upcoming_visits_list",
        "recent_plans_list",
        "overdue_followups_list",
        "recent_followups_list",
        "recent_returns_list",
        "recent_entitlements_list",
        "warranty_status_breakdown",
        "repair_status_breakdown",
        "plan_status_breakdown",
        "followup_status_breakdown",
        "business_activity_feed",
      ])
    );

    const zones = new Set(layout.map((item) => item.zone));
    expect(zones.has("metrics")).toBe(true);
    expect(zones.has("lists")).toBe(true);
  });

  it("active warranties widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "warranty",
      where: "status = 'active'",
    });

    // 3 active warranties (WAR-001, WAR-002, WAR-004)
    expect(widget.count).toBe(3);
  });

  it("expired warranties widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "warranty",
      where: "status = 'expired'",
    });

    // 1 expired warranty (WAR-003)
    expect(widget.count).toBe(1);
  });

  it("open repairs widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "repair_request",
      where: "status IN ('requested', 'diagnosing', 'quoted', 'in_repair')",
    });

    // 1 in_repair (REP-001) + 1 quoted (REP-002) + 1 diagnosing (REP-004) = 3
    expect(widget.count).toBe(3);
  });

  it("warranty repairs widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "repair_request",
      where: "is_warranty = 1",
    });

    // 3 warranty repairs (REP-001, REP-003, REP-004)
    expect(widget.count).toBe(3);
  });

  it("active plans widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "maintenance_plan",
      where: "status = 'active'",
    });

    // 4 active plans (MP-001, MP-002, MP-003, MP-004)
    expect(widget.count).toBe(4);
  });

  it("open followups widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "customer_success",
      where: "status IN ('scheduled', 'in_progress')",
    });

    // 1 in_progress (CS-002) + 2 scheduled (CS-003, CS-004) = 3
    expect(widget.count).toBe(3);
  });

  it("overdue followups widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "customer_success",
      where: "status = 'overdue'",
    });

    // 1 overdue (CS-005)
    expect(widget.count).toBe(1);
  });

  it("completed followups widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "customer_success",
      where: "status = 'completed'",
    });

    // 1 completed (CS-001)
    expect(widget.count).toBe(1);
  });

  it("followup status breakdown resolves correctly", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "customer_success",
      groupBy: "status",
    });

    expect(widget.groups).toBeDefined();
    const statusMap = new Map(widget.groups!.map((g) => [g.key, g.count]));
    expect(statusMap.get("completed")).toBe(1);
    expect(statusMap.get("in_progress")).toBe(1);
    expect(statusMap.get("scheduled")).toBe(2);
    expect(statusMap.get("overdue")).toBe(1);
  });

  it("warranty status breakdown resolves correctly", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "warranty",
      groupBy: "status",
    });

    expect(widget.groups).toBeDefined();
    const statusMap = new Map(widget.groups!.map((g) => [g.key, g.count]));
    expect(statusMap.get("active")).toBe(3);
    expect(statusMap.get("expired")).toBe(1);
    expect(statusMap.get("pending")).toBe(1);
  });

  it("repair status breakdown resolves correctly", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "after-sales-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "repair_request",
      groupBy: "status",
    });

    expect(widget.groups).toBeDefined();
    const statusMap = new Map(widget.groups!.map((g) => [g.key, g.count]));
    expect(statusMap.get("in_repair")).toBe(1);
    expect(statusMap.get("quoted")).toBe(1);
    expect(statusMap.get("completed")).toBe(2);
    expect(statusMap.get("diagnosing")).toBe(1);
  });

  it("available widgets include after-sales module widgets", async () => {
    await installPack(workspaceId, "after-sales-pack");

    const widgets = await getAvailableWidgets(workspaceId);
    const widgetKeys = widgets.map((w) => w.widget.key);

    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "active_warranties_metric",
        "expired_warranties_metric",
        "warranty_status_breakdown",
        "warranty_type_breakdown",
        "recent_warranties_list",
        "expiring_warranties_list",
        "active_entitlements_metric",
        "entitlement_status_breakdown",
        "entitlement_type_breakdown",
        "recent_entitlements_list",
        "open_returns_metric",
        "completed_returns_metric",
        "return_status_breakdown",
        "recent_returns_list",
        "open_repairs_metric",
        "completed_repairs_metric",
        "warranty_repairs_metric",
        "repair_status_breakdown",
        "repair_type_breakdown",
        "recent_repairs_list",
        "active_plans_metric",
        "upcoming_visits_metric",
        "plan_status_breakdown",
        "plan_type_breakdown",
        "recent_plans_list",
        "upcoming_visits_list",
        "open_followups_metric",
        "overdue_followups_metric",
        "completed_followups_metric",
        "followup_status_breakdown",
        "followup_type_breakdown",
        "recent_followups_list",
        "overdue_followups_list",
      ])
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 9: Cross-pack relation declarations
// ─────────────────────────────────────────────────────────────────────────────

describe("After-sales module cross-pack relation declarations", () => {
  it("runory.warranty declares 5 relations to company, contact, product_service, asset, quote", async () => {
    const manifest = loadModuleManifest("runory.warranty");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(5);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.product-service",
        "runory.asset",
        "runory.quote",
      ])
    );
  });

  it("runory.entitlement declares 4 relations to company, contact, product_service, asset", async () => {
    const manifest = loadModuleManifest("runory.entitlement");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(4);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.product-service",
        "runory.asset",
      ])
    );
  });

  it("runory.return-request declares 5 relations to company, contact, asset, ticket, work_order", async () => {
    const manifest = loadModuleManifest("runory.return-request");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(5);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.asset",
        "runory.ticket",
        "runory.work-order",
      ])
    );
  });

  it("runory.repair-request declares 6 relations to company, contact, asset, ticket, work_order, quote", async () => {
    const manifest = loadModuleManifest("runory.repair-request");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(6);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.asset",
        "runory.ticket",
        "runory.work-order",
        "runory.quote",
      ])
    );
  });

  it("runory.maintenance-plan declares 5 relations to company, contact, asset, task, work_order", async () => {
    const manifest = loadModuleManifest("runory.maintenance-plan");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(5);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.asset",
        "runory.task",
        "runory.work-order",
      ])
    );
  });

  it("runory.customer-success declares 4 relations to company, contact, deal, task", async () => {
    const manifest = loadModuleManifest("runory.customer-success");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(4);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.deal",
        "runory.task",
      ])
    );
  });

  it("all after-sales module manifests validate against schema", async () => {
    const moduleIds = [
      "runory.warranty",
      "runory.entitlement",
      "runory.return-request",
      "runory.repair-request",
      "runory.maintenance-plan",
      "runory.customer-success",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const reparsed = moduleManifestSchema.parse(manifest);
      expect(reparsed.id).toBe(moduleId);
      expect(reparsed.objects.length).toBeGreaterThan(0);
      expect(reparsed.migrations.install).toBeDefined();
    }
  });

  it("after-sales module dashboard widgets pass validation", async () => {
    const moduleIds = [
      "runory.warranty",
      "runory.entitlement",
      "runory.return-request",
      "runory.repair-request",
      "runory.maintenance-plan",
      "runory.customer-success",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const errors = validateModuleDashboard(manifest);
      expect(errors, `Module ${moduleId} dashboard errors: ${errors.join("; ")}`).toEqual([]);
    }
  });

  it("after-sales pack dashboard layout passes validation", async () => {
    const pack = loadPackManifest("after-sales-pack");
    const errors = validatePackDashboard(pack);
    expect(errors, `Pack dashboard layout errors: ${errors.join("; ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 10: After-sales demo journey — end-to-end after-sales flow
// Create warranty → create repair request linked to warranty → update repair to
// in_repair → create maintenance plan → create customer success followup →
// verify workbench updates
// ─────────────────────────────────────────────────────────────────────────────

describe("After-sales demo journey (end-to-end after-sales flow)", () => {
  it("completes the canonical after-sales journey", async () => {
    // 1. Install After-sales Pack
    await installPack(workspaceId, "after-sales-pack");

    // 2. Create a company and contact to link
    const company = await createRecord(workspaceId, "company", {
      name: "Journey Test Company",
      domain: "journey.example",
      industry: "technology",
      lifecycle_stage: "customer",
      owner: "Alex Chen",
    });
    const contact = await createRecord(workspaceId, "contact", {
      name: "Journey Contact",
      email: "contact@journey.example",
      company_id: company.id,
      owner: "Alex Chen",
    });

    // 3. Create a warranty linked to company and contact
    const warranty = await createRecord(workspaceId, "warranty", {
      warranty_number: "WAR-JOURNEY-001",
      title: "Journey Test Warranty",
      status: "active",
      warranty_type: "standard",
      start_date: "2026-01-01",
      end_date: "2027-01-01",
      company_id: company.id,
      contact_id: contact.id,
      terms: "Standard 12-month warranty",
      coverage_json: "[\"Manufacturing defects\",\"Parts replacement\"]",
      owner: "Alex Chen",
    });
    expect(warranty.id).toBeDefined();
    expect(warranty.status).toBe("active");
    expect(warranty.company_id).toBe(company.id);
    expect(warranty.contact_id).toBe(contact.id);

    // 4. Create a repair request linked to warranty
    const repair = await createRecord(workspaceId, "repair_request", {
      repair_number: "REP-JOURNEY-001",
      issue_description: "Customer repair request — insufficient cooling",
      status: "requested",
      priority: "high",
      repair_type: "on_site",
      is_warranty: true,
      is_paid: false,
      estimated_cost: 0,
      requested_at: "2026-06-23",
      company_id: company.id,
      contact_id: contact.id,
      warranty_id: warranty.id,
      assigned_to: "David Park",
      owner: "Alex Chen",
    });
    expect(repair.id).toBeDefined();
    expect(repair.status).toBe("requested");
    expect(repair.warranty_id).toBe(warranty.id);
    expect(repair.is_warranty === true || repair.is_warranty === 1).toBe(true);

    // 5. Update repair to in_repair
    const inRepair = await updateRecord(workspaceId, "repair_request", repair.id, {
      status: "in_repair",
    });
    expect(inRepair?.status).toBe("in_repair");

    // 6. Create a maintenance plan
    const plan = await createRecord(workspaceId, "maintenance_plan", {
      plan_number: "MP-JOURNEY-001",
      name: "Journey Test Maintenance Plan",
      status: "active",
      plan_type: "recurring",
      frequency: "quarterly",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      next_visit_date: "2026-09-15",
      total_visits: 4,
      completed_visits: 0,
      company_id: company.id,
      contact_id: contact.id,
      owner: "Alex Chen",
    });
    expect(plan.id).toBeDefined();
    expect(plan.status).toBe("active");

    // 7. Create a customer success followup
    const followup = await createRecord(workspaceId, "customer_success", {
      followup_number: "CS-JOURNEY-001",
      subject: "Journey Test Customer Follow-up",
      status: "scheduled",
      followup_type: "check_in",
      priority: "medium",
      scheduled_at: "2026-07-15",
      company_id: company.id,
      contact_id: contact.id,
      assigned_to: "Sam Lee",
      owner: "Sam Lee",
    });
    expect(followup.id).toBeDefined();
    expect(followup.status).toBe("scheduled");

    // 8. Verify workbench reflects the state
    const activeWarranties = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "warranty",
      where: "status = 'active'",
    });
    expect(activeWarranties.count).toBe(1); // The one we created

    const openRepairs = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "repair_request",
      where: "status IN ('requested', 'diagnosing', 'quoted', 'in_repair')",
    });
    expect(openRepairs.count).toBe(1); // Our repair is in_repair

    const activePlans = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "maintenance_plan",
      where: "status = 'active'",
    });
    expect(activePlans.count).toBe(1); // The one we created

    const openFollowups = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "customer_success",
      where: "status IN ('scheduled', 'in_progress')",
    });
    expect(openFollowups.count).toBe(1); // The one we created

    const warrantyRepairs = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "repair_request",
      where: "is_warranty = 1",
    });
    expect(warrantyRepairs.count).toBe(1); // Our warranty repair

    // 9. Complete the repair and followup, verify workbench updates
    const completedRepair = await updateRecord(workspaceId, "repair_request", repair.id, {
      status: "completed",
      completed_at: "2026-06-24",
      actual_cost: 0,
    });
    expect(completedRepair?.status).toBe("completed");

    const completedFollowup = await updateRecord(workspaceId, "customer_success", followup.id, {
      status: "completed",
      completed_at: "2026-06-24",
      outcome: "Customer satisfied with repair service",
      satisfaction_score: 9,
    });
    expect(completedFollowup?.status).toBe("completed");
    expect(completedFollowup?.satisfaction_score).toBe(9);

    const completedRepairs = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "repair_request",
      where: "status = 'completed'",
    });
    expect(completedRepairs.count).toBe(1); // Our completed repair

    const completedFollowups = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "customer_success",
      where: "status = 'completed'",
    });
    expect(completedFollowups.count).toBe(1); // Our completed followup

    const openRepairsAfter = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "repair_request",
      where: "status IN ('requested', 'diagnosing', 'quoted', 'in_repair')",
    });
    expect(openRepairsAfter.count).toBe(0); // Our repair is now completed
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 11: Pack installation tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("After-sales pack installation tracking", () => {
  it("records after-sales pack installation with terminology overlay", async () => {
    await installPack(workspaceId, "after-sales-pack");

    const packInstalls = await queryAll<{ pack_id: string; terminology_json: string | null }>(
      `SELECT pack_id, terminology_json FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "after-sales-pack"]
    );

    expect(packInstalls).toHaveLength(1);
    expect(packInstalls[0].terminology_json).not.toBeNull();

    const terminology = JSON.parse(packInstalls[0].terminology_json!);
    expect(terminology).toHaveLength(1);
    expect(terminology[0].object).toBe("company");
    expect(terminology[0].navigationLabel).toBe("Customer");
  });

  it("updates after-sales pack installation on re-install (idempotent)", async () => {
    await installPack(workspaceId, "after-sales-pack");
    await installPack(workspaceId, "after-sales-pack");

    const packInstalls = await queryAll<{ pack_id: string }>(
      `SELECT pack_id FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "after-sales-pack"]
    );

    expect(packInstalls).toHaveLength(1);
  });
});
