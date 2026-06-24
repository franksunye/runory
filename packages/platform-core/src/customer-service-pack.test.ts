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
    [workspaceId, "Customer Service Test WS", "cs-test-ws", ts, ts]
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
// Acceptance 1: Customer Service Pack installs with all 7 modules
// ─────────────────────────────────────────────────────────────────────────────

describe("Customer Service Pack installation", () => {
  it("installs all 7 modules with correct object definitions and navigation", async () => {
    const result = await installPack(workspaceId, "customer-service-pack");

    expect(result.packId).toBe("customer-service-pack");
    expect(result.modulesInstalled.sort()).toEqual(
      [
        "runory.company",
        "runory.contact",
        "runory.task",
        "runory.ticket",
        "runory.conversation",
        "runory.knowledge",
        "runory.support-sla",
      ].sort()
    );
    expect(result.ddlExecuted).toBe(true);

    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(7);

    // Verify customer-service-owned objects are created
    const csObjects = ["ticket", "conversation", "knowledge", "support_sla"];
    for (const objKey of csObjects) {
      const obj = await getObject(workspaceId, objKey);
      expect(obj).toBeDefined();
      expect(obj?.ownership).toBe("module_owned");
    }

    // Verify navigation includes customer-service routes
    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/tickets",
        "/conversations",
        "/knowledge",
        "/support-slas",
        "/companies",
        "/contacts",
        "/tasks",
      ])
    );
  });

  it("creates business tables for all customer-service objects", async () => {
    await installPack(workspaceId, "customer-service-pack");

    for (const objKey of ["ticket", "conversation", "knowledge", "support_sla"]) {
      const records = await getRecords(workspaceId, objKey);
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("pack manifest validates against schema", async () => {
    const pack = loadPackManifest("customer-service-pack");
    const reparsed = packManifestSchema.parse(pack);
    expect(reparsed.id).toBe("customer-service-pack");
    expect(reparsed.modules).toHaveLength(7);
    expect(reparsed.dashboard?.defaultLayout).toBeDefined();
    expect(reparsed.terminology).toBeDefined();
    expect(reparsed.defaultTemplate).toBe("small-business-customer-service");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 2: Shared module dedupe
// ─────────────────────────────────────────────────────────────────────────────

describe("shared module dedupe with CRM Lite Pack", () => {
  it("installs CRM Lite Pack then Customer Service Pack without duplicate shared modules", async () => {
    const crmResult = await installPack(workspaceId, "crm-lite-pack");
    expect(crmResult.modulesInstalled.sort()).toEqual(
      ["runory.company", "runory.contact", "runory.deal", "runory.task"].sort()
    );

    const csResult = await installPack(workspaceId, "customer-service-pack");
    // company, contact, task are shared (skip); ticket/conversation/knowledge/support-sla are new
    expect(csResult.modulesInstalled.sort()).toEqual(
      [
        "runory.ticket",
        "runory.conversation",
        "runory.knowledge",
        "runory.support-sla",
      ].sort()
    );

    const installations = await getInstallations(workspaceId);
    // 4 CRM + 4 CS-new (company/contact/task deduped) = 8
    expect(installations).toHaveLength(8);

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
    await installPack(workspaceId, "customer-service-pack");

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

describe("Customer Service pack terminology overlay", () => {
  it("applies customer service terminology to navigation labels", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "customer-service-pack");

    const nav = await getNavigation(workspaceId);
    const companyNav = nav.find((n) => n.route === "/companies");
    expect(companyNav?.label).toBe("客户");
  });

  it("does not fork the underlying object definitions", async () => {
    await installPack(workspaceId, "customer-service-pack");

    const company = await getObject(workspaceId, "company");
    expect(company?.label).toBe("Company");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 4: Cross-pack demo data references via $lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("Customer Service demo data with cross-pack references", () => {
  it("seeds customer-service demo data referencing companies, contacts, knowledge, and SLA", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    const csResult = await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });
    expect(csResult.demoRecordsCreated).toBeGreaterThan(0);

    // Verify knowledge articles were created (5 published)
    const knowledge = await getRecords(workspaceId, "knowledge");
    expect(knowledge.length).toBe(5);
    for (const article of knowledge) {
      expect(article.status).toBe("published");
    }
    const coolingArticle = knowledge.find((k) => k.slug === "hvac-cooling-troubleshoot");
    expect(coolingArticle).toBeDefined();
    const maintenanceArticle = knowledge.find((k) => k.slug === "maintenance-pricing");
    expect(maintenanceArticle).toBeDefined();
    const warrantyArticle = knowledge.find((k) => k.slug === "warranty-policy");
    expect(warrantyArticle).toBeDefined();

    // Verify SLA policies were created (3 active)
    const slas = await getRecords(workspaceId, "support_sla");
    expect(slas.length).toBe(3);
    for (const sla of slas) {
      expect(sla.status).toBe("active");
    }
    const urgentSla = slas.find((s) => s.priority === "urgent");
    expect(urgentSla).toBeDefined();
    expect(urgentSla?.name).toBe("紧急 SLA");

    // Verify tickets were created (6)
    const tickets = await getRecords(workspaceId, "ticket");
    expect(tickets.length).toBe(6);

    // Verify $lookup resolved company_id on TKT-2026-001 (Acme)
    const companies = await getRecords(workspaceId, "company");
    const acme = companies.find((c) => c.domain === "acme.example");
    expect(acme).toBeDefined();
    const tkt001 = tickets.find((t) => t.ticket_number === "TKT-2026-001");
    expect(tkt001).toBeDefined();
    expect(tkt001?.company_id).toBe(acme?.id);

    // Verify $lookup resolved contact_id on TKT-2026-001
    const contacts = await getRecords(workspaceId, "contact");
    const maya = contacts.find((c) => c.email === "maya@acme.example");
    expect(maya).toBeDefined();
    expect(tkt001?.contact_id).toBe(maya?.id);

    // Verify $alias resolved knowledge_id on TKT-2026-002 (kb-maintenance-pricing)
    const tkt002 = tickets.find((t) => t.ticket_number === "TKT-2026-002");
    expect(tkt002).toBeDefined();
    expect(tkt002?.knowledge_id).toBe(maintenanceArticle?.id);

    // Verify $alias resolved sla_id on TKT-2026-003 (sla-urgent)
    const tkt003 = tickets.find((t) => t.ticket_number === "TKT-2026-003");
    expect(tkt003).toBeDefined();
    expect(tkt003?.sla_id).toBe(urgentSla?.id);

    // Verify $alias resolved knowledge_id on TKT-2026-006 (kb-warranty-policy)
    const tkt006 = tickets.find((t) => t.ticket_number === "TKT-2026-006");
    expect(tkt006).toBeDefined();
    expect(tkt006?.knowledge_id).toBe(warrantyArticle?.id);

    // Verify conversations were created (8) with $alias-resolved ticket_id
    const conversations = await getRecords(workspaceId, "conversation");
    expect(conversations.length).toBe(8);

    // All conversations should have a non-empty ticket_id resolved via $alias
    for (const conv of conversations) {
      expect(conv.ticket_id).toBeTruthy();
    }

    // Verify conversations linked to TKT-2026-001 (3 conversations)
    const tkt001Convs = conversations.filter((c) => c.ticket_id === tkt001?.id);
    expect(tkt001Convs.length).toBe(3);

    // Verify conversations linked to TKT-2026-002 (2 conversations)
    const tkt002Convs = conversations.filter((c) => c.ticket_id === tkt002?.id);
    expect(tkt002Convs.length).toBe(2);

    // Verify conversation linked to TKT-2026-003 (1 conversation)
    const tkt003Convs = conversations.filter((c) => c.ticket_id === tkt003?.id);
    expect(tkt003Convs.length).toBe(1);

    // Verify conversation linked to TKT-2026-004 (1 conversation)
    const tkt004 = tickets.find((t) => t.ticket_number === "TKT-2026-004");
    const tkt004Convs = conversations.filter((c) => c.ticket_id === tkt004?.id);
    expect(tkt004Convs.length).toBe(1);

    // Verify conversation linked to TKT-2026-006 (1 conversation)
    const tkt006Convs = conversations.filter((c) => c.ticket_id === tkt006?.id);
    expect(tkt006Convs.length).toBe(1);
  });

  it("resolves cross-pack $lookup to asset, work_order, and quote when FSM and Sales packs are installed", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "fsm-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const tickets = await getRecords(workspaceId, "ticket");

    // TKT-2026-001 should have asset_id and work_order_id resolved via $lookup
    const tkt001 = tickets.find((t) => t.ticket_number === "TKT-2026-001");
    expect(tkt001).toBeDefined();

    const assets = await getRecords(workspaceId, "asset");
    const hvacAsset = assets.find((a) => a.serial_number === "HVAC-ACME-001");
    expect(hvacAsset).toBeDefined();
    expect(tkt001?.asset_id).toBe(hvacAsset?.id);

    const workOrders = await getRecords(workspaceId, "work_order");
    const acmeWo = workOrders.find((w) => w.title === "Acme HVAC emergency repair");
    expect(acmeWo).toBeDefined();
    expect(tkt001?.work_order_id).toBe(acmeWo?.id);

    // TKT-2026-003 should have asset_id and work_order_id resolved via $lookup
    const tkt003 = tickets.find((t) => t.ticket_number === "TKT-2026-003");
    expect(tkt003).toBeDefined();
    const cncAsset = assets.find((a) => a.serial_number === "CNC-VTX-001");
    expect(cncAsset).toBeDefined();
    expect(tkt003?.asset_id).toBe(cncAsset?.id);
    const vertexWo = workOrders.find((w) => w.title === "Vertex CNC calibration and service");
    expect(vertexWo).toBeDefined();
    expect(tkt003?.work_order_id).toBe(vertexWo?.id);

    // TKT-2026-006 should have quote_id resolved via $lookup
    const tkt006 = tickets.find((t) => t.ticket_number === "TKT-2026-006");
    expect(tkt006).toBeDefined();
    const quotes = await getRecords(workspaceId, "quote");
    const quote = quotes.find((q) => q.quote_number === "Q-2026-001");
    expect(quote).toBeDefined();
    expect(tkt006?.quote_id).toBe(quote?.id);
  });

  it("demo data is idempotent across repeated installs", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });
    const second = await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    expect(second.demoRecordsCreated).toBe(0);

    const knowledge = await getRecords(workspaceId, "knowledge");
    const slas = await getRecords(workspaceId, "support_sla");
    const tickets = await getRecords(workspaceId, "ticket");
    const conversations = await getRecords(workspaceId, "conversation");
    expect(knowledge.length).toBe(5);
    expect(slas.length).toBe(3);
    expect(tickets.length).toBe(6);
    expect(conversations.length).toBe(8);
  });

  it("includes required demo scenarios from the plan", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const tickets = await getRecords(workspaceId, "ticket");
    const conversations = await getRecords(workspaceId, "conversation");
    const knowledge = await getRecords(workspaceId, "knowledge");
    const slas = await getRecords(workspaceId, "support_sla");

    // Tickets with different statuses
    expect(tickets.some((t) => t.status === "open")).toBe(true);
    expect(tickets.some((t) => t.status === "escalated")).toBe(true);
    expect(tickets.some((t) => t.status === "resolved")).toBe(true);
    expect(tickets.some((t) => t.status === "closed")).toBe(true);
    expect(tickets.some((t) => t.status === "pending")).toBe(true);
    expect(tickets.some((t) => t.status === "new")).toBe(true);

    // Tickets with different priorities
    expect(tickets.some((t) => t.priority === "urgent")).toBe(true);
    expect(tickets.some((t) => t.priority === "high")).toBe(true);
    expect(tickets.some((t) => t.priority === "medium")).toBe(true);
    expect(tickets.some((t) => t.priority === "low")).toBe(true);

    // Tickets from different channels
    expect(tickets.some((t) => t.channel === "phone")).toBe(true);
    expect(tickets.some((t) => t.channel === "email")).toBe(true);
    expect(tickets.some((t) => t.channel === "web")).toBe(true);
    expect(tickets.some((t) => t.channel === "chat")).toBe(true);

    // Conversations with different author types
    expect(conversations.some((c) => c.author_type === "customer")).toBe(true);
    expect(conversations.some((c) => c.author_type === "agent")).toBe(true);
    expect(conversations.some((c) => c.author_type === "system")).toBe(true);

    // Internal and external conversations
    expect(conversations.some((c) => c.is_internal === true || c.is_internal === 1)).toBe(true);
    expect(conversations.some((c) => c.is_internal === false || c.is_internal === 0)).toBe(true);

    // Conversations with different message types
    expect(conversations.some((c) => c.message_type === "email")).toBe(true);
    expect(conversations.some((c) => c.message_type === "note")).toBe(true);
    expect(conversations.some((c) => c.message_type === "comment")).toBe(true);
    expect(conversations.some((c) => c.message_type === "system")).toBe(true);

    // Knowledge articles all published
    expect(knowledge.every((k) => k.status === "published")).toBe(true);

    // Knowledge articles with different categories
    expect(knowledge.some((k) => k.category === "troubleshooting")).toBe(true);
    expect(knowledge.some((k) => k.category === "faq")).toBe(true);
    expect(knowledge.some((k) => k.category === "process")).toBe(true);
    expect(knowledge.some((k) => k.category === "billing")).toBe(true);
    expect(knowledge.some((k) => k.category === "warranty")).toBe(true);

    // SLA policies all active
    expect(slas.every((s) => s.status === "active")).toBe(true);

    // SLA policies with different priorities
    expect(slas.some((s) => s.priority === "urgent")).toBe(true);
    expect(slas.some((s) => s.priority === "high")).toBe(true);
    expect(slas.some((s) => s.priority === "medium")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 5: Ticket lifecycle and SLA
// ─────────────────────────────────────────────────────────────────────────────

describe("ticket lifecycle and SLA", () => {
  it("supports status transitions new → open → pending → resolved → closed", async () => {
    await installPack(workspaceId, "customer-service-pack");

    const created = await createRecord(workspaceId, "ticket", {
      ticket_number: "TKT-JOURNEY-001",
      subject: "生命周期测试工单",
      description: "用于测试工单状态流转",
      status: "new",
      priority: "medium",
      channel: "web",
      category: "inquiry",
    });
    expect(created.status).toBe("new");

    const open = await updateRecord(workspaceId, "ticket", created.id, { status: "open" });
    expect(open?.status).toBe("open");

    const pending = await updateRecord(workspaceId, "ticket", created.id, { status: "pending" });
    expect(pending?.status).toBe("pending");

    const resolved = await updateRecord(workspaceId, "ticket", created.id, {
      status: "resolved",
      resolved_at: "2026-06-23",
    });
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolved_at).toBe("2026-06-23");

    const closed = await updateRecord(workspaceId, "ticket", created.id, {
      status: "closed",
      closed_at: "2026-06-24",
    });
    expect(closed?.status).toBe("closed");
    expect(closed?.closed_at).toBe("2026-06-24");
  });

  it("supports escalation to escalated status", async () => {
    await installPack(workspaceId, "customer-service-pack");

    const created = await createRecord(workspaceId, "ticket", {
      ticket_number: "TKT-ESC-001",
      subject: "升级测试工单",
      status: "open",
      priority: "high",
      channel: "phone",
      category: "technical",
    });

    const escalated = await updateRecord(workspaceId, "ticket", created.id, {
      status: "escalated",
      priority: "urgent",
    });
    expect(escalated?.status).toBe("escalated");
    expect(escalated?.priority).toBe("urgent");
  });

  it("supports SLA policies with different priorities and time commitments", async () => {
    await installPack(workspaceId, "customer-service-pack");

    const urgentSla = await createRecord(workspaceId, "support_sla", {
      name: "紧急 SLA",
      description: "1 小时内响应，4 小时内解决",
      priority: "urgent",
      response_time_hours: 1,
      resolution_time_hours: 4,
      business_hours_only: false,
      status: "active",
    });
    expect(urgentSla.priority).toBe("urgent");
    expect(urgentSla.response_time_hours).toBe(1);
    expect(urgentSla.resolution_time_hours).toBe(4);

    const standardSla = await createRecord(workspaceId, "support_sla", {
      name: "标准 SLA",
      description: "24 小时内响应，72 小时内解决",
      priority: "medium",
      response_time_hours: 24,
      resolution_time_hours: 72,
      business_hours_only: true,
      status: "active",
    });
    expect(standardSla.priority).toBe("medium");
    expect(standardSla.response_time_hours).toBe(24);
    expect(standardSla.resolution_time_hours).toBe(72);

    // Link SLA to a ticket
    const ticket = await createRecord(workspaceId, "ticket", {
      ticket_number: "TKT-SLA-001",
      subject: "SLA 关联测试",
      status: "open",
      priority: "urgent",
      channel: "phone",
      category: "technical",
      sla_id: urgentSla.id,
    });
    expect(ticket.sla_id).toBe(urgentSla.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 6: Knowledge article resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("knowledge article resolution", () => {
  it("knowledge articles can be linked to tickets for resolution", async () => {
    await installPack(workspaceId, "customer-service-pack");

    const article = await createRecord(workspaceId, "knowledge", {
      title: "解决方案文章",
      slug: "resolution-article",
      content: "这是一篇用于解决工单的知识文章。",
      category: "troubleshooting",
      status: "published",
      author: "Alex Chen",
      published_at: "2026-06-23",
    });

    const ticket = await createRecord(workspaceId, "ticket", {
      ticket_number: "TKT-KB-001",
      subject: "知识文章解决测试",
      status: "open",
      priority: "medium",
      channel: "email",
      category: "technical",
    });

    const resolved = await updateRecord(workspaceId, "ticket", ticket.id, {
      status: "resolved",
      knowledge_id: article.id,
      resolved_at: "2026-06-23",
    });
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.knowledge_id).toBe(article.id);
  });

  it("demo tickets TKT-2026-002 and TKT-2026-006 have knowledge_id set", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const tickets = await getRecords(workspaceId, "ticket");
    const tkt002 = tickets.find((t) => t.ticket_number === "TKT-2026-002");
    const tkt006 = tickets.find((t) => t.ticket_number === "TKT-2026-006");

    expect(tkt002?.knowledge_id).toBeTruthy();
    expect(tkt006?.knowledge_id).toBeTruthy();

    // Verify the knowledge_id points to actual knowledge articles
    const knowledge = await getRecords(workspaceId, "knowledge");
    const kb002 = knowledge.find((k) => k.id === tkt002?.knowledge_id);
    const kb006 = knowledge.find((k) => k.id === tkt006?.knowledge_id);
    expect(kb002).toBeDefined();
    expect(kb002?.slug).toBe("maintenance-pricing");
    expect(kb006).toBeDefined();
    expect(kb006?.slug).toBe("warranty-policy");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 7: Workbench shows customer-service metrics
// ─────────────────────────────────────────────────────────────────────────────

describe("Customer Service workbench composition", () => {
  it("resolves effective layout with customer-service widgets", async () => {
    await installPack(workspaceId, "customer-service-pack");

    const layout = await resolveEffectiveLayout(workspaceId);
    expect(layout.length).toBeGreaterThan(0);

    const widgetKeys = layout.map((item) => item.widgetKey);
    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "open_tickets_metric",
        "escalated_tickets_metric",
        "resolved_tickets_metric",
        "published_knowledge_metric",
        "active_sla_metric",
        "escalated_tickets_list",
        "recent_tickets_list",
        "recent_conversations_list",
        "popular_knowledge_list",
        "recent_sla_list",
        "ticket_status_breakdown",
        "ticket_priority_breakdown",
        "ticket_channel_breakdown",
        "knowledge_status_breakdown",
        "sla_priority_breakdown",
        "business_activity_feed",
      ])
    );

    const zones = new Set(layout.map((item) => item.zone));
    expect(zones.has("metrics")).toBe(true);
    expect(zones.has("lists")).toBe(true);
  });

  it("open tickets widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "ticket",
      where: "status IN ('new', 'open', 'pending')",
    });

    // 1 open (TKT-001) + 1 pending (TKT-004) + 1 new (TKT-005) = 3
    expect(widget.count).toBe(3);
  });

  it("escalated tickets widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "ticket",
      where: "status = 'escalated'",
    });

    // 1 escalated (TKT-003)
    expect(widget.count).toBe(1);
  });

  it("resolved tickets widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "ticket",
      where: "status = 'resolved'",
    });

    // 1 resolved (TKT-002)
    expect(widget.count).toBe(1);
  });

  it("published knowledge widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "knowledge",
      where: "status = 'published'",
    });

    // 5 published knowledge articles
    expect(widget.count).toBe(5);
  });

  it("active SLA widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "support_sla",
      where: "status = 'active'",
    });

    // 3 active SLA policies
    expect(widget.count).toBe(3);
  });

  it("ticket status breakdown resolves correctly", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "ticket",
      groupBy: "status",
    });

    expect(widget.groups).toBeDefined();
    const statusMap = new Map(widget.groups!.map((g) => [g.key, g.count]));
    expect(statusMap.get("open")).toBe(1);
    expect(statusMap.get("resolved")).toBe(1);
    expect(statusMap.get("escalated")).toBe(1);
    expect(statusMap.get("pending")).toBe(1);
    expect(statusMap.get("new")).toBe(1);
    expect(statusMap.get("closed")).toBe(1);
  });

  it("ticket priority breakdown resolves correctly", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "customer-service-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "ticket",
      groupBy: "priority",
    });

    expect(widget.groups).toBeDefined();
    const priorityMap = new Map(widget.groups!.map((g) => [g.key, g.count]));
    expect(priorityMap.get("high")).toBe(1);
    expect(priorityMap.get("low")).toBe(2);
    expect(priorityMap.get("urgent")).toBe(1);
    expect(priorityMap.get("medium")).toBe(2);
  });

  it("available widgets include customer-service module widgets", async () => {
    await installPack(workspaceId, "customer-service-pack");

    const widgets = await getAvailableWidgets(workspaceId);
    const widgetKeys = widgets.map((w) => w.widget.key);

    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "open_tickets_metric",
        "escalated_tickets_metric",
        "resolved_tickets_metric",
        "ticket_status_breakdown",
        "ticket_priority_breakdown",
        "ticket_channel_breakdown",
        "recent_tickets_list",
        "escalated_tickets_list",
        "recent_conversations_list",
        "published_knowledge_metric",
        "draft_knowledge_metric",
        "knowledge_status_breakdown",
        "popular_knowledge_list",
        "active_sla_metric",
        "sla_priority_breakdown",
        "recent_sla_list",
      ])
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 8: Cross-pack relation declarations
// ─────────────────────────────────────────────────────────────────────────────

describe("Customer Service module cross-pack relation declarations", () => {
  it("runory.ticket declares 8 relations to company, contact, task, asset, work_order, quote, knowledge, support_sla", async () => {
    const manifest = loadModuleManifest("runory.ticket");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(8);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.contact",
        "runory.task",
        "runory.asset",
        "runory.work-order",
        "runory.quote",
        "runory.knowledge",
        "runory.support-sla",
      ])
    );
  });

  it("runory.conversation declares relation to ticket", async () => {
    const manifest = loadModuleManifest("runory.conversation");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(1);
    expect(manifest.relations![0].targetModule).toBe("runory.ticket");
  });

  it("all customer-service module manifests validate against schema", async () => {
    const moduleIds = [
      "runory.ticket",
      "runory.conversation",
      "runory.knowledge",
      "runory.support-sla",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const reparsed = moduleManifestSchema.parse(manifest);
      expect(reparsed.id).toBe(moduleId);
      expect(reparsed.objects.length).toBeGreaterThan(0);
      expect(reparsed.migrations.install).toBeDefined();
    }
  });

  it("customer-service module dashboard widgets pass validation", async () => {
    const moduleIds = [
      "runory.ticket",
      "runory.conversation",
      "runory.knowledge",
      "runory.support-sla",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const errors = validateModuleDashboard(manifest);
      expect(errors, `Module ${moduleId} dashboard errors: ${errors.join("; ")}`).toEqual([]);
    }
  });

  it("customer-service pack dashboard layout passes validation", async () => {
    const pack = loadPackManifest("customer-service-pack");
    const errors = validatePackDashboard(pack);
    expect(errors, `Pack dashboard layout errors: ${errors.join("; ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 9: Customer Service demo journey — end-to-end support flow
// Create ticket → Add conversation → Link company/contact → Escalate to work_order →
// Resolve with knowledge article → Verify workbench updates
// ─────────────────────────────────────────────────────────────────────────────

describe("Customer Service demo journey (end-to-end support flow)", () => {
  it("completes the canonical customer service journey", async () => {
    // 1. Install Customer Service Pack
    await installPack(workspaceId, "customer-service-pack");

    // 2. Create a knowledge article for later resolution
    const article = await createRecord(workspaceId, "knowledge", {
      title: "工单解决方案知识文章",
      slug: "journey-resolution-article",
      content: "这是一篇用于解决旅程工单的知识文章，包含详细的解决步骤。",
      category: "troubleshooting",
      status: "published",
      author: "Alex Chen",
      published_at: "2026-06-23",
    });
    expect(article.id).toBeDefined();

    // 3. Create a company and contact to link
    const company = await createRecord(workspaceId, "company", {
      name: "旅程测试公司",
      domain: "journey.example",
      industry: "technology",
      lifecycle_stage: "customer",
      owner: "Alex Chen",
    });
    const contact = await createRecord(workspaceId, "contact", {
      name: "旅程联系人",
      email: "contact@journey.example",
      company_id: company.id,
      owner: "Alex Chen",
    });

    // 4. Create a ticket linked to company and contact
    const ticket = await createRecord(workspaceId, "ticket", {
      ticket_number: "TKT-JOURNEY-002",
      subject: "客户报修 — 设备故障",
      description: "客户报告设备无法正常工作，需要工程师支援。",
      status: "new",
      priority: "medium",
      channel: "phone",
      category: "technical",
      company_id: company.id,
      contact_id: contact.id,
      assigned_to: "David Park",
      owner: "David Park",
    });
    expect(ticket.id).toBeDefined();
    expect(ticket.status).toBe("new");
    expect(ticket.company_id).toBe(company.id);
    expect(ticket.contact_id).toBe(contact.id);

    // 5. Add a conversation from the customer
    const customerMsg = await createRecord(workspaceId, "conversation", {
      ticket_id: ticket.id,
      author_type: "customer",
      author_name: "旅程联系人",
      body: "我们的设备从昨天开始出现故障，请尽快派人维修。",
      message_type: "email",
      is_internal: false,
    });
    expect(customerMsg.ticket_id).toBe(ticket.id);
    expect(customerMsg.author_type).toBe("customer");

    // 6. Add an agent response
    const agentMsg = await createRecord(workspaceId, "conversation", {
      ticket_id: ticket.id,
      author_type: "agent",
      author_name: "David Park",
      body: "收到您的报修请求，已安排工程师上门检查。",
      message_type: "email",
      is_internal: false,
    });
    expect(agentMsg.author_type).toBe("agent");

    // 7. Open the ticket
    const opened = await updateRecord(workspaceId, "ticket", ticket.id, { status: "open" });
    expect(opened?.status).toBe("open");

    // 8. Escalate to work_order (set work_order_id as text reference)
    const escalated = await updateRecord(workspaceId, "ticket", ticket.id, {
      status: "escalated",
      priority: "urgent",
      work_order_id: "WO-JOURNEY-001",
    });
    expect(escalated?.status).toBe("escalated");
    expect(escalated?.priority).toBe("urgent");
    expect(escalated?.work_order_id).toBe("WO-JOURNEY-001");

    // 9. Resolve with knowledge article
    const resolved = await updateRecord(workspaceId, "ticket", ticket.id, {
      status: "resolved",
      knowledge_id: article.id,
      resolved_at: "2026-06-23",
    });
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.knowledge_id).toBe(article.id);

    // 10. Add a resolution comment
    const resolutionMsg = await createRecord(workspaceId, "conversation", {
      ticket_id: ticket.id,
      author_type: "agent",
      author_name: "David Park",
      body: "已通过知识文章解决故障，设备恢复正常运行。",
      message_type: "comment",
      is_internal: false,
    });
    expect(resolutionMsg.message_type).toBe("comment");

    // 11. Verify workbench reflects the state
    const resolvedCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "ticket",
      where: "status = 'resolved'",
    });
    expect(resolvedCount.count).toBe(1); // The one we resolved

    const openCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "ticket",
      where: "status IN ('new', 'open', 'pending')",
    });
    expect(openCount.count).toBe(0); // Our ticket is resolved, not open

    const escalatedCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "ticket",
      where: "status = 'escalated'",
    });
    expect(escalatedCount.count).toBe(0); // Our ticket was escalated but now resolved

    const publishedKnowledge = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "knowledge",
      where: "status = 'published'",
    });
    expect(publishedKnowledge.count).toBe(1); // The one we created

    // 12. Verify conversations were created
    const conversations = await getRecords(workspaceId, "conversation");
    expect(conversations.length).toBe(3); // customer, agent, resolution
    const ticketConvs = conversations.filter((c) => c.ticket_id === ticket.id);
    expect(ticketConvs.length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 10: Pack installation tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("Customer Service pack installation tracking", () => {
  it("records customer service pack installation with terminology overlay", async () => {
    await installPack(workspaceId, "customer-service-pack");

    const packInstalls = await queryAll<{ pack_id: string; terminology_json: string | null }>(
      `SELECT pack_id, terminology_json FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "customer-service-pack"]
    );

    expect(packInstalls).toHaveLength(1);
    expect(packInstalls[0].terminology_json).not.toBeNull();

    const terminology = JSON.parse(packInstalls[0].terminology_json!);
    expect(terminology).toHaveLength(1);
    expect(terminology[0].object).toBe("company");
    expect(terminology[0].navigationLabel).toBe("客户");
  });

  it("updates customer service pack installation on re-install (idempotent)", async () => {
    await installPack(workspaceId, "customer-service-pack");
    await installPack(workspaceId, "customer-service-pack");

    const packInstalls = await queryAll<{ pack_id: string }>(
      `SELECT pack_id FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "customer-service-pack"]
    );

    expect(packInstalls).toHaveLength(1);
  });
});
