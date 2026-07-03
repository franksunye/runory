import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryAll } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installPack, installModule, loadModuleManifest, loadPackManifest } from "./installer";
import { getRecords, getNavigation, getInstallations, createRecord, updateRecord, getObject } from "./metadata";
import { moduleManifestSchema, packManifestSchema } from "@runory/contracts";
import {
  resolveEffectiveLayout,
  resolveWidgetData,
  getAvailableWidgets,
  validateModuleDashboard,
  validatePackDashboard,
} from "./dashboard";
import { submitForApproval, approveQuote, rejectQuote, markSent, acceptQuote, returnForChanges, withdrawQuote, type CommandActor } from "./quote-commands";

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
    [workspaceId, "Sales Quote Test WS", "sq-test-ws", ts, ts]
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
// Acceptance 1: Sales Quote Pack installs with all 6 modules (3 shared + 3 quote)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sales Quote Pack installation", () => {
  it("installs all 6 modules with correct object definitions and navigation", async () => {
    const result = await installPack(workspaceId, "sales-quote-pack");

    expect(result.packId).toBe("sales-quote-pack");
    expect(result.modulesInstalled.sort()).toEqual(
      [
        "runory.company",
        "runory.contact",
        "runory.deal",
        "runory.product-service",
        "runory.price-book",
        "runory.quote",
      ].sort()
    );
    expect(result.ddlExecuted).toBe(true);

    // Verify all 6 modules are registered as installations
    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(6);

    // Verify quote-owned objects are created
    const quoteObjects = ["product_service", "price_book", "quote", "quote_line"];
    for (const objKey of quoteObjects) {
      const obj = await getObject(workspaceId, objKey);
      expect(obj).toBeDefined();
      expect(obj?.ownership).toBe("module_owned");
    }

    // Verify navigation includes quote routes
    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/quotes",
        "/quote-lines",
        "/product-services",
        "/price-books",
        "/companies",
        "/contacts",
        "/deals",
      ])
    );
  });

  it("creates business tables for all quote objects", async () => {
    await installPack(workspaceId, "sales-quote-pack");

    // Verify business tables exist and are queryable
    for (const objKey of ["product_service", "price_book", "quote", "quote_line"]) {
      const records = await getRecords(workspaceId, objKey);
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("pack manifest validates against schema", async () => {
    const pack = loadPackManifest("sales-quote-pack");
    const reparsed = packManifestSchema.parse(pack);
    expect(reparsed.id).toBe("sales-quote-pack");
    expect(reparsed.modules).toHaveLength(6);
    expect(reparsed.dashboard?.defaultLayout).toBeDefined();
    expect(reparsed.terminology).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 2: Shared module dedupe — Sales Quote Pack reuses company/contact/deal
// from CRM Lite Pack without duplicate install.
// ─────────────────────────────────────────────────────────────────────────────

describe("shared module dedupe with CRM Lite Pack", () => {
  it("installs CRM Lite Pack then Sales Quote Pack without duplicate shared modules", async () => {
    // Install CRM Lite Pack first (installs company, contact, deal, task)
    const crmResult = await installPack(workspaceId, "crm-lite-pack");
    expect(crmResult.modulesInstalled.sort()).toEqual(
      ["runory.company", "runory.contact", "runory.deal", "runory.task"].sort()
    );

    // Install Sales Quote Pack — shared modules should be skipped
    const sqResult = await installPack(workspaceId, "sales-quote-pack");
    expect(sqResult.modulesInstalled.sort()).toEqual(
      [
        "runory.product-service",
        "runory.price-book",
        "runory.quote",
      ].sort()
    );

    // Verify no duplicate installations
    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(7); // 4 CRM + 3 Quote

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
    await installPack(workspaceId, "sales-quote-pack");

    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    const uniqueRoutes = new Set(routes);
    expect(routes.length).toBe(uniqueRoutes.size);

    // Shared routes should appear exactly once
    expect(routes.filter((r) => r === "/companies").length).toBe(1);
    expect(routes.filter((r) => r === "/contacts").length).toBe(1);
    expect(routes.filter((r) => r === "/deals").length).toBe(1);
  });

  it("installs in reverse order (Sales Quote first, then CRM Lite) without duplicates", async () => {
    const sqResult = await installPack(workspaceId, "sales-quote-pack");
    expect(sqResult.modulesInstalled).toHaveLength(6);

    // CRM Lite Pack should skip company/contact/deal, install only task
    const crmResult = await installPack(workspaceId, "crm-lite-pack");
    expect(crmResult.modulesInstalled).toEqual(["runory.task"]);

    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 3: Pack-specific terminology overlay — Sales Quote labels company as Customer
// ─────────────────────────────────────────────────────────────────────────────

describe("Sales Quote pack terminology overlay", () => {
  it("applies sales quote terminology to navigation labels", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "sales-quote-pack");

    const nav = await getNavigation(workspaceId);

    // Sales Quote pack (installed last) relabels company → Customer, deal → Opportunity
    const companyNav = nav.find((n) => n.route === "/companies");
    const dealNav = nav.find((n) => n.route === "/deals");
    expect(companyNav?.label).toBe("Customer");
    expect(dealNav?.label).toBe("Opportunity");
  });

  it("does not fork the underlying object definitions", async () => {
    await installPack(workspaceId, "sales-quote-pack");

    // Object definitions retain their original module-owned labels
    const company = await getObject(workspaceId, "company");
    const deal = await getObject(workspaceId, "deal");
    expect(company?.label).toBe("Company");
    expect(deal?.label).toBe("Deal");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 4: Cross-pack demo data references via $lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("Sales Quote demo data with cross-pack references", () => {
  it("seeds quote demo data referencing companies/contacts/deals from CRM Lite Pack", async () => {
    // Install CRM Lite Pack with demo data first
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });

    // Install Sales Quote Pack with demo data
    const sqResult = await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    expect(sqResult.demoRecordsCreated).toBeGreaterThan(0);

    // Verify products/services were created
    const products = await getRecords(workspaceId, "product_service");
    expect(products.length).toBe(10);
    const inspection = products.find((p) => p.sku === "SVC-INSP-001");
    expect(inspection).toBeDefined();
    expect(inspection?.name).toBe("On-site inspection service");

    // Verify price books were created
    const priceBooks = await getRecords(workspaceId, "price_book");
    expect(priceBooks.length).toBe(2);

    // Verify quotes were created with $lookup-resolved company_id
    const quotes = await getRecords(workspaceId, "quote");
    expect(quotes.length).toBe(11);

    const acmeQuote = quotes.find((q) => q.quote_number === "Q-2026-001");
    expect(acmeQuote).toBeDefined();

    // Verify $lookup resolved company_id to the actual Acme company record
    const companies = await getRecords(workspaceId, "company");
    const acme = companies.find((c) => c.domain === "acme.example");
    expect(acmeQuote?.company_id).toBe(acme?.id);

    // Verify $lookup resolved contact_id
    const contacts = await getRecords(workspaceId, "contact");
    const maya = contacts.find((c) => c.email === "maya@acme.example");
    expect(acmeQuote?.contact_id).toBe(maya?.id);

    // Verify $lookup resolved deal_id
    const deals = await getRecords(workspaceId, "deal");
    const acmeDeal = deals.find((d) => d.name === "Acme Expansion Plan");
    expect(acmeQuote?.deal_id).toBe(acmeDeal?.id);
  });

  it("seeds quote lines with internal references to quotes and products", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });

    const quoteLines = await getRecords(workspaceId, "quote_line");
    expect(quoteLines.length).toBeGreaterThanOrEqual(16);

    // Verify quote_line references quote and product_service
    const quotes = await getRecords(workspaceId, "quote");
    const acmeQuoteV1 = quotes.find((q) => q.quote_number === "Q-2026-001");
    const acmeQuoteLines = quoteLines.filter((ql) => ql.quote_id === acmeQuoteV1?.id);
    expect(acmeQuoteLines.length).toBe(3);

    // Verify $alias resolved product_service_id
    const products = await getRecords(workspaceId, "product_service");
    const maintenanceBundle = products.find((p) => p.sku === "BND-MAINT-001");
    const bundleLine = acmeQuoteLines.find((ql) => ql.product_service_id === maintenanceBundle?.id);
    expect(bundleLine).toBeDefined();
    expect(bundleLine?.line_total).toBe(19600);
  });

  it("demo data is idempotent across repeated installs", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    const second = await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });

    expect(second.demoRecordsCreated).toBe(0);

    // Counts should remain stable
    const products = await getRecords(workspaceId, "product_service");
    const quotes = await getRecords(workspaceId, "quote");
    const quoteLines = await getRecords(workspaceId, "quote_line");
    expect(products.length).toBe(10);
    expect(quotes.length).toBe(11);
    expect(quoteLines.length).toBeGreaterThanOrEqual(16);
  });

  it("includes required demo scenarios from the plan", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });

    const quotes = await getRecords(workspaceId, "quote");

    // One quote from a CRM deal (Q-2026-001 references Acme Expansion Plan deal)
    const dealOriginQuote = quotes.find((q) => q.quote_number === "Q-2026-001");
    expect(dealOriginQuote).toBeDefined();
    expect(dealOriginQuote?.deal_id).toBeTruthy();

    // One in review
    expect(quotes.some((q) => q.status === "in_review")).toBe(true);

    // One accepted quote
    expect(quotes.some((q) => q.status === "accepted")).toBe(true);

    // One expired quote
    const expired = quotes.find((q) => q.status === "expired");
    expect(expired).toBeDefined();
    expect(String(expired?.valid_until) < "2026-06-23").toBe(true);

    // One revised quote with version 2
    const revised = quotes.find((q) => String(q.quote_number).includes("V2"));
    expect(revised).toBeDefined();
    expect(revised?.version).toBe(2);

    // One rejected quote
    expect(quotes.some((q) => q.status === "rejected")).toBe(true);

    // Product and service line items
    const products = await getRecords(workspaceId, "product_service");
    expect(products.some((p) => p.type === "product")).toBe(true);
    expect(products.some((p) => p.type === "service")).toBe(true);
    expect(products.some((p) => p.type === "bundle")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 5: Cross-pack references to FSM work orders (when FSM is installed)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sales Quote demo data with FSM cross-pack references", () => {
  it("seeds quotes referencing FSM work orders, service sites, and assets", async () => {
    // Install CRM Lite Pack + FSM Pack with demo data first
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });

    // Install Sales Quote Pack with demo data
    const sqResult = await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    expect(sqResult.demoRecordsCreated).toBeGreaterThan(0);

    const quotes = await getRecords(workspaceId, "quote");

    // Verify the FSM-origin quote (Q-2026-002 references Acme HVAC emergency repair work order)
    const fsmQuote = quotes.find((q) => q.quote_number === "Q-2026-002");
    expect(fsmQuote).toBeDefined();

    // Verify $lookup resolved work_order_id
    const workOrders = await getRecords(workspaceId, "work_order");
    const urgentWo = workOrders.find((w) => w.title === "Acme HVAC emergency repair");
    expect(fsmQuote?.work_order_id).toBe(urgentWo?.id);

    // Verify $lookup resolved service_site_id
    const sites = await getRecords(workspaceId, "service_site");
    const acmeHq = sites.find((s) => s.name === "Acme HQ - San Francisco");
    expect(fsmQuote?.service_site_id).toBe(acmeHq?.id);

    // Verify $lookup resolved asset_id
    const assets = await getRecords(workspaceId, "asset");
    const hvacAsset = assets.find((a) => a.serial_number === "HVAC-ACME-001");
    expect(fsmQuote?.asset_id).toBe(hvacAsset?.id);
  });

  it("gracefully handles missing FSM pack (work_order_id stays null)", async () => {
    // Install only CRM Lite Pack (no FSM)
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });

    // Install Sales Quote Pack with demo data
    const sqResult = await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    expect(sqResult.demoRecordsCreated).toBeGreaterThan(0);

    const quotes = await getRecords(workspaceId, "quote");

    // The FSM-origin quote should still be created, but work_order_id should be null
    const fsmQuote = quotes.find((q) => q.quote_number === "Q-2026-002");
    expect(fsmQuote).toBeDefined();
    expect(fsmQuote?.company_id).toBeTruthy(); // CRM reference still resolves
    expect(fsmQuote?.work_order_id).toBeNull(); // FSM reference is null
    expect(fsmQuote?.service_site_id).toBeNull();
    expect(fsmQuote?.asset_id).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 6: Workbench shows commercial metrics
// ─────────────────────────────────────────────────────────────────────────────

describe("Sales Quote workbench composition", () => {
  it("resolves effective layout with sales quote widgets", async () => {
    await installPack(workspaceId, "sales-quote-pack");

    const layout = await resolveEffectiveLayout(workspaceId);
    expect(layout.length).toBeGreaterThan(0);

    // Verify sales quote widget keys are present in the layout
    const widgetKeys = layout.map((item) => item.widgetKey);
    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "open_quotes_metric",
        "pending_approvals_metric",
        "active_products_metric",
        "new_quotes_trend",
        "quotes_needing_approval_list",
        "recently_accepted_quotes_list",
        "expiring_quotes_list",
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

  it("open quotes widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "quote",
      where: "status not in ('accepted', 'rejected', 'expired', 'withdrawn')",
    });

    // 11 quotes total, 2 accepted + 1 expired + 1 rejected = 4 closed → 7 open
    expect(widget.count).toBe(7);
  });

  it("pending approvals widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "quote",
      where: "status = 'in_review'",
    });

    // 2 quotes with in_review status (Q-2026-002, Q-2026-007)
    expect(widget.count).toBe(2);
  });

  it("quote status breakdown resolves correctly", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "quote",
      groupBy: "status",
    });

    expect(widget.groups).toBeDefined();
    const statusMap = new Map(widget.groups!.map((g) => [g.key, g.count]));
    expect(statusMap.get("accepted")).toBe(2);
    expect(statusMap.get("in_review")).toBe(2);
    expect(statusMap.get("draft")).toBe(2);
    expect(statusMap.get("sent")).toBe(2);
    expect(statusMap.get("approved")).toBe(1);
    expect(statusMap.get("expired")).toBe(1);
    expect(statusMap.get("rejected")).toBe(1);
  });

  it("available widgets include sales quote module widgets", async () => {
    await installPack(workspaceId, "sales-quote-pack");

    const widgets = await getAvailableWidgets(workspaceId);
    const widgetKeys = widgets.map((w) => w.widget.key);

    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "open_quotes_metric",
        "pending_approvals_metric",
        "quote_status_breakdown",
        "quotes_needing_approval_list",
        "recently_accepted_quotes_list",
        "expiring_quotes_list",
        "new_quotes_trend",
        "active_products_metric",
        "product_type_breakdown",
        "recent_products_list",
        "active_price_books_metric",
        "recent_price_books_list",
      ])
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 7: Cross-pack relation declarations
// ─────────────────────────────────────────────────────────────────────────────

describe("Sales Quote module cross-pack relation declarations", () => {
  it("runory.quote declares relations to company, contact, deal, work_order, service_site, asset", async () => {
    const manifest = loadModuleManifest("runory.quote");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(8);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.deal",
        "runory.work-order",
        "runory.service-site",
        "runory.asset",
        "runory.quote",
        "runory.product-service",
      ])
    );

    // Verify each relation has a valid foreignKey on the quote or quote_line object
    const quoteFields = new Set(manifest.objects[0].fields.map((f) => f.key));
    const quoteLineFields = new Set(manifest.objects[1].fields.map((f) => f.key));
    for (const rel of manifest.relations!) {
      if (rel.object === "quote") {
        expect(quoteFields.has(rel.foreignKey)).toBe(true);
      } else if (rel.object === "quote_line") {
        expect(quoteLineFields.has(rel.foreignKey)).toBe(true);
      }
    }
  });

  it("all sales quote module manifests validate against schema", async () => {
    const moduleIds = [
      "runory.product-service",
      "runory.price-book",
      "runory.quote",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const reparsed = moduleManifestSchema.parse(manifest);
      expect(reparsed.id).toBe(moduleId);
      expect(reparsed.objects.length).toBeGreaterThan(0);
      expect(reparsed.migrations.install).toBeDefined();
    }
  });

  it("sales quote module dashboard widgets pass validation", async () => {
    const moduleIds = [
      "runory.product-service",
      "runory.price-book",
      "runory.quote",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const errors = validateModuleDashboard(manifest);
      expect(errors, `Module ${moduleId} dashboard errors: ${errors.join("; ")}`).toEqual([]);
    }
  });

  it("sales quote pack dashboard layout passes validation", async () => {
    const pack = loadPackManifest("sales-quote-pack");
    const errors = validatePackDashboard(pack);
    expect(errors, `Pack dashboard layout errors: ${errors.join("; ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 8: Sales Quote demo journey — end-to-end trial flow
// Create quote from CRM deal → Add lines → Submit for approval → Approve → Accept
// ─────────────────────────────────────────────────────────────────────────────

describe("Sales Quote demo journey (end-to-end trial flow)", () => {
  it("completes the canonical sales quote trial journey", async () => {
    // 1. Install Sales Quote Pack
    await installPack(workspaceId, "sales-quote-pack");

    // 2. Create a product/service
    const product = await createRecord(workspaceId, "product_service", {
      name: "Custom development service",
      type: "service",
      sku: "SVC-CUSTOM-001",
      description: "Custom software development service",
      unit: "Person-day",
      default_price: 2000,
      currency: "CNY",
      active: true,
    });
    expect(product.id).toBeDefined();

    // 3. Create a quote (simulating deal-origin quote)
    const quote = await createRecord(workspaceId, "quote", {
      quote_number: "Q-2026-NEW-001",
      title: "Custom development quote",
      status: "draft",
      version: 1,
      currency: "CNY",
      subtotal_amount: 25000,
      tax_amount: 3000,
      total_amount: 28000,
      valid_until: "2026-07-31",
      owner: "Alex",
      terms: "Payment terms: pay within 30 days",
      notes: "Newly created custom development quote",
    });
    expect(quote.id).toBeDefined();

    // 4. Add quote lines
    const line1 = await createRecord(workspaceId, "quote_line", {
      quote_id: quote.id,
      product_service_id: product.id,
      description: "Custom development service",
      quantity: 10,
      unit: "Person-day",
      unit_price: 2000,
      tax_amount: 2400,
      line_total: 20000,
      sort_order: 1,
    });
    expect(line1.id).toBeDefined();

    const line2 = await createRecord(workspaceId, "quote_line", {
      quote_id: quote.id,
      description: "Project management",
      quantity: 1,
      unit: "Month",
      unit_price: 5000,
      tax_amount: 600,
      line_total: 5000,
      sort_order: 2,
    });
    expect(line2.id).toBeDefined();

    // 5. Submit for approval (transitions status: draft → in_review)
    const actor: CommandActor = { type: "user", id: "test-user" };
    const submitted = await submitForApproval(workspaceId, quote.id, actor, 1);
    expect(submitted.aggregate.status).toBe("in_review");
    expect(submitted.aggregate.total_amount).toBe(28000);

    // 6. Approve the quote (transitions status: in_review → approved)
    const approved = await approveQuote(workspaceId, quote.id, actor, 2);
    expect(approved.aggregate.status).toBe("approved");

    // 7. Mark quote as sent (transitions status: approved → sent)
    const sent = await markSent(workspaceId, quote.id, actor, 3);
    expect(sent.aggregate.status).toBe("sent");

    // 8. Accept the quote (transitions status: sent → accepted)
    const accepted = await acceptQuote(workspaceId, quote.id, actor, 4);
    expect(accepted.aggregate.status).toBe("accepted");

    // 9. Verify workbench reflects the accepted state
    const openCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "quote",
      where: "status not in ('accepted', 'rejected', 'expired', 'withdrawn')",
    });
    expect(openCount.count).toBe(0); // The one we created is now accepted

    // 10. Verify the accepted quote appears in the recently accepted list
    const recentAccepted = await resolveWidgetData(workspaceId, {
      kind: "recent",
      object: "quote",
      where: "status = 'accepted'",
      orderBy: "created_at desc",
      limit: 5,
      columns: ["quote_number", "title", "total_amount"],
    });
    expect(recentAccepted.records).toBeDefined();
    expect(recentAccepted.records!.length).toBe(1);
    expect(recentAccepted.records![0].quote_number).toBe("Q-2026-NEW-001");
    expect(recentAccepted.records![0].total_amount).toBe(28000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 9: Pack installation tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("Sales Quote pack installation tracking", () => {
  it("records sales quote pack installation with terminology overlay", async () => {
    await installPack(workspaceId, "sales-quote-pack");

    const packInstalls = await queryAll<{ pack_id: string; terminology_json: string | null }>(
      `SELECT pack_id, terminology_json FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "sales-quote-pack"]
    );

    expect(packInstalls).toHaveLength(1);
    expect(packInstalls[0].terminology_json).not.toBeNull();

    const terminology = JSON.parse(packInstalls[0].terminology_json!);
    expect(terminology).toHaveLength(2);
    expect(terminology[0].object).toBe("company");
    expect(terminology[0].navigationLabel).toBe("Customer");
    expect(terminology[1].object).toBe("deal");
    expect(terminology[1].navigationLabel).toBe("Opportunity");
  });

  it("updates sales quote pack installation on re-install (idempotent)", async () => {
    await installPack(workspaceId, "sales-quote-pack");
    await installPack(workspaceId, "sales-quote-pack");

    const packInstalls = await queryAll<{ pack_id: string }>(
      `SELECT pack_id FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "sales-quote-pack"]
    );

    expect(packInstalls).toHaveLength(1);
  });
});
