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
    [workspaceId, "AI Visibility Test WS", "aiv-test-ws", ts, ts]
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
// Acceptance 1: AI Visibility Pack installs with all 8 modules
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Visibility Pack installation", () => {
  it("installs all 8 modules with correct object definitions and navigation", async () => {
    const result = await installPack(workspaceId, "ai-visibility-pack");

    expect(result.packId).toBe("ai-visibility-pack");
    expect(result.modulesInstalled.sort()).toEqual(
      [
        "runory.company",
        "runory.product-service",
        "runory.landing-page",
        "runory.entity-profile",
        "runory.question-map",
        "runory.answer-block",
        "runory.citation-source",
        "runory.ai-visibility-check",
      ].sort()
    );
    expect(result.ddlExecuted).toBe(true);

    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(8);

    // Verify GEO-owned objects are created
    const geoObjects = ["entity_profile", "question_map", "answer_block", "citation_source", "ai_visibility_check"];
    for (const objKey of geoObjects) {
      const obj = await getObject(workspaceId, objKey);
      expect(obj).toBeDefined();
      expect(obj?.ownership).toBe("module_owned");
    }

    // Verify navigation includes GEO routes
    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/entity-profiles",
        "/question-maps",
        "/answer-blocks",
        "/citation-sources",
        "/ai-visibility-checks",
        "/companies",
      ])
    );
  });

  it("creates business tables for all GEO objects", async () => {
    await installPack(workspaceId, "ai-visibility-pack");

    for (const objKey of ["entity_profile", "question_map", "answer_block", "citation_source", "ai_visibility_check"]) {
      const records = await getRecords(workspaceId, objKey);
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("pack manifest validates against schema", async () => {
    const pack = loadPackManifest("ai-visibility-pack");
    const reparsed = packManifestSchema.parse(pack);
    expect(reparsed.id).toBe("ai-visibility-pack");
    expect(reparsed.modules).toHaveLength(8);
    expect(reparsed.dashboard?.defaultLayout).toBeDefined();
    expect(reparsed.terminology).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 2: Shared module dedupe
// ─────────────────────────────────────────────────────────────────────────────

describe("shared module dedupe with CRM Lite Pack", () => {
  it("installs CRM Lite Pack then AI Visibility Pack without duplicate shared modules", async () => {
    const crmResult = await installPack(workspaceId, "crm-lite-pack");
    expect(crmResult.modulesInstalled.sort()).toEqual(
      ["runory.company", "runory.contact", "runory.deal", "runory.task"].sort()
    );

    const aivResult = await installPack(workspaceId, "ai-visibility-pack");
    // company is shared (skip), product-service/landing-page are new
    expect(aivResult.modulesInstalled.sort()).toEqual(
      [
        "runory.product-service",
        "runory.landing-page",
        "runory.entity-profile",
        "runory.question-map",
        "runory.answer-block",
        "runory.citation-source",
        "runory.ai-visibility-check",
      ].sort()
    );

    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(11); // 4 CRM + 7 AIV (company deduped)

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
    await installPack(workspaceId, "ai-visibility-pack");

    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    const uniqueRoutes = new Set(routes);
    expect(routes.length).toBe(uniqueRoutes.size);

    expect(routes.filter((r) => r === "/companies").length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 3: Pack-specific terminology overlay
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Visibility pack terminology overlay", () => {
  it("applies AI visibility terminology to navigation labels", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "ai-visibility-pack");

    const nav = await getNavigation(workspaceId);
    const companyNav = nav.find((n) => n.route === "/companies");
    expect(companyNav?.label).toBe("客户");
  });

  it("does not fork the underlying object definitions", async () => {
    await installPack(workspaceId, "ai-visibility-pack");

    const company = await getObject(workspaceId, "company");
    expect(company?.label).toBe("Company");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 4: Cross-pack demo data references via $lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Visibility demo data with cross-pack references", () => {
  it("seeds GEO demo data referencing companies, products, and landing pages", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });
    const aivResult = await installPack(workspaceId, "ai-visibility-pack", { includeDemoData: true });
    expect(aivResult.demoRecordsCreated).toBeGreaterThan(0);

    // Verify entity profiles were created
    const profiles = await getRecords(workspaceId, "entity_profile");
    expect(profiles.length).toBe(5);
    const hvacProfile = profiles.find((p) => String(p.name).includes("HVAC"));
    expect(hvacProfile).toBeDefined();

    // Verify $lookup resolved company_id
    const companies = await getRecords(workspaceId, "company");
    const acme = companies.find((c) => c.domain === "acme.example");
    expect(hvacProfile?.company_id).toBe(acme?.id);

    // Verify $lookup resolved product_service_id
    const products = await getRecords(workspaceId, "product_service");
    const inspection = products.find((p) => p.sku === "SVC-INSP-001");
    expect(hvacProfile?.product_service_id).toBe(inspection?.id);

    // Verify $lookup resolved landing_page_id
    const landingPages = await getRecords(workspaceId, "landing_page");
    const hvacLp = landingPages.find((lp) => lp.slug === "hvac-maintenance");
    expect(hvacProfile?.landing_page_id).toBe(hvacLp?.id);

    // Verify question maps were created
    const questionMaps = await getRecords(workspaceId, "question_map");
    expect(questionMaps.length).toBe(4);
    const hvacQm = questionMaps.find((qm) => String(qm.name).includes("HVAC"));
    expect(hvacQm).toBeDefined();
    expect(hvacQm?.status).toBe("approved");
    expect(hvacQm?.question_count).toBe(5);

    // Verify answer blocks were created
    const answerBlocks = await getRecords(workspaceId, "answer_block");
    expect(answerBlocks.length).toBe(9);

    // Verify citation sources were created
    const citations = await getRecords(workspaceId, "citation_source");
    expect(citations.length).toBe(5);

    // Verify visibility checks were created
    const checks = await getRecords(workspaceId, "ai_visibility_check");
    expect(checks.length).toBe(7);
  });

  it("seeds answer blocks with $lookup-resolved landing_page_id for publishing", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });
    await installPack(workspaceId, "ai-visibility-pack", { includeDemoData: true });

    const answerBlocks = await getRecords(workspaceId, "answer_block");
    const published = answerBlocks.find((ab) => ab.status === "published" && ab.landing_page_id);
    expect(published).toBeDefined();

    // Verify landing_page_id resolves to an actual landing page
    const landingPages = await getRecords(workspaceId, "landing_page");
    const linkedLp = landingPages.find((lp) => lp.id === published?.landing_page_id);
    expect(linkedLp).toBeDefined();
  });

  it("demo data is idempotent across repeated installs", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });
    await installPack(workspaceId, "ai-visibility-pack", { includeDemoData: true });
    const second = await installPack(workspaceId, "ai-visibility-pack", { includeDemoData: true });

    expect(second.demoRecordsCreated).toBe(0);

    const profiles = await getRecords(workspaceId, "entity_profile");
    const questionMaps = await getRecords(workspaceId, "question_map");
    const answerBlocks = await getRecords(workspaceId, "answer_block");
    const citations = await getRecords(workspaceId, "citation_source");
    const checks = await getRecords(workspaceId, "ai_visibility_check");
    expect(profiles.length).toBe(5);
    expect(questionMaps.length).toBe(4);
    expect(answerBlocks.length).toBe(9);
    expect(citations.length).toBe(5);
    expect(checks.length).toBe(7);
  });

  it("includes required demo scenarios from the plan", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });
    await installPack(workspaceId, "ai-visibility-pack", { includeDemoData: true });

    const profiles = await getRecords(workspaceId, "entity_profile");
    const questionMaps = await getRecords(workspaceId, "question_map");
    const answerBlocks = await getRecords(workspaceId, "answer_block");
    const citations = await getRecords(workspaceId, "citation_source");
    const checks = await getRecords(workspaceId, "ai_visibility_check");

    // Entity profiles of different types
    expect(profiles.some((p) => p.entity_type === "product_service")).toBe(true);
    expect(profiles.some((p) => p.entity_type === "landing_page")).toBe(true);
    expect(profiles.some((p) => p.entity_type === "company")).toBe(true);
    expect(profiles.some((p) => p.entity_type === "topic")).toBe(true);

    // Question maps with different statuses
    expect(questionMaps.some((qm) => qm.status === "approved")).toBe(true);
    expect(questionMaps.some((qm) => qm.status === "ready")).toBe(true);
    expect(questionMaps.some((qm) => qm.status === "draft")).toBe(true);
    expect(questionMaps.some((qm) => qm.status === "generating")).toBe(true);

    // Answer blocks with different statuses
    expect(answerBlocks.some((ab) => ab.status === "published")).toBe(true);
    expect(answerBlocks.some((ab) => ab.status === "approved")).toBe(true);
    expect(answerBlocks.some((ab) => ab.status === "pending_review")).toBe(true);
    expect(answerBlocks.some((ab) => ab.status === "draft")).toBe(true);
    expect(answerBlocks.some((ab) => ab.status === "rejected")).toBe(true);

    // Answer blocks from different sources
    expect(answerBlocks.some((ab) => ab.source_type === "agent_generated")).toBe(true);
    expect(answerBlocks.some((ab) => ab.source_type === "manual")).toBe(true);

    // Citation sources of different types
    expect(citations.some((c) => c.source_type === "official")).toBe(true);
    expect(citations.some((c) => c.source_type === "web")).toBe(true);
    expect(citations.some((c) => c.source_type === "research")).toBe(true);
    expect(citations.some((c) => c.source_type === "internal")).toBe(true);

    // Visibility checks with different result statuses
    expect(checks.some((c) => c.result_status === "visible")).toBe(true);
    expect(checks.some((c) => c.result_status === "partial")).toBe(true);
    expect(checks.some((c) => c.result_status === "not_visible")).toBe(true);

    // Visibility checks for different engines
    expect(checks.some((c) => c.engine === "chatgpt")).toBe(true);
    expect(checks.some((c) => c.engine === "google")).toBe(true);
    expect(checks.some((c) => c.engine === "perplexity")).toBe(true);
    expect(checks.some((c) => c.engine === "claude")).toBe(true);
    expect(checks.some((c) => c.engine === "gemini")).toBe(true);
    expect(checks.some((c) => c.engine === "bing")).toBe(true);

    // Improvement suggestions exist
    expect(checks.some((c) => c.improvement_suggestions && String(c.improvement_suggestions).length > 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 5: Safe publishing states for answer blocks
// ─────────────────────────────────────────────────────────────────────────────

describe("safe publishing states for answer blocks", () => {
  it("supports draft → pending_review → approved → published lifecycle", async () => {
    await installPack(workspaceId, "ai-visibility-pack");

    // Create entity profile and question map first
    const profile = await createRecord(workspaceId, "entity_profile", {
      name: "测试画像",
      entity_type: "topic",
      status: "active",
    });
    const qm = await createRecord(workspaceId, "question_map", {
      entity_profile_id: profile.id,
      name: "测试问题地图",
      status: "draft",
      question_count: 1,
    });

    // Create draft answer block
    const draft = await createRecord(workspaceId, "answer_block", {
      question_map_id: qm.id,
      entity_profile_id: profile.id,
      question: "测试问题？",
      answer_text: "测试答案。",
      status: "draft",
      source_type: "manual",
    });
    expect(draft.status).toBe("draft");

    // Submit for review
    const pending = await updateRecord(workspaceId, "answer_block", draft.id, {
      status: "pending_review",
    });
    expect(pending?.status).toBe("pending_review");

    // Approve
    const approved = await updateRecord(workspaceId, "answer_block", draft.id, {
      status: "approved",
      confidence_score: 85,
    });
    expect(approved?.status).toBe("approved");
    expect(approved?.confidence_score).toBe(85);

    // Publish (requires landing_page_id)
    const published = await updateRecord(workspaceId, "answer_block", draft.id, {
      status: "published",
    });
    expect(published?.status).toBe("published");
  });

  it("supports rejection of answer blocks", async () => {
    await installPack(workspaceId, "ai-visibility-pack");

    const profile = await createRecord(workspaceId, "entity_profile", {
      name: "测试画像",
      entity_type: "topic",
      status: "active",
    });
    const qm = await createRecord(workspaceId, "question_map", {
      entity_profile_id: profile.id,
      name: "测试问题地图",
      status: "draft",
      question_count: 1,
    });

    const draft = await createRecord(workspaceId, "answer_block", {
      question_map_id: qm.id,
      question: "待拒绝问题？",
      answer_text: "待拒绝答案。",
      status: "pending_review",
    });

    const rejected = await updateRecord(workspaceId, "answer_block", draft.id, {
      status: "rejected",
      notes: "内容不准确，需要修订",
    });
    expect(rejected?.status).toBe("rejected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 6: AI visibility check with improvement suggestions
// ─────────────────────────────────────────────────────────────────────────────

describe("AI visibility check with improvement suggestions", () => {
  it("stores visibility check results with improvement suggestions", async () => {
    await installPack(workspaceId, "ai-visibility-pack");

    const profile = await createRecord(workspaceId, "entity_profile", {
      name: "测试画像",
      entity_type: "topic",
      status: "active",
    });

    const check = await createRecord(workspaceId, "ai_visibility_check", {
      entity_profile_id: profile.id,
      query: "测试查询",
      engine: "chatgpt",
      locale: "zh-CN",
      result_status: "not_visible",
      result_summary: "AI 引擎未返回相关内容",
      improvement_suggestions: "建议增加结构化数据标记和 FAQ Schema",
      checked_at: "2026-06-23",
      checked_by: "Alex",
    });

    expect(check.id).toBeDefined();
    expect(check.result_status).toBe("not_visible");
    expect(check.improvement_suggestions).toContain("FAQ Schema");
  });

  it("supports different engines and locales", async () => {
    await installPack(workspaceId, "ai-visibility-pack");

    const profile = await createRecord(workspaceId, "entity_profile", {
      name: "测试画像",
      entity_type: "topic",
      status: "active",
    });

    const engines = ["google", "bing", "chatgpt", "perplexity", "claude", "gemini"];
    for (const engine of engines) {
      const check = await createRecord(workspaceId, "ai_visibility_check", {
        entity_profile_id: profile.id,
        query: `测试查询 ${engine}`,
        engine,
        locale: "zh-CN",
        result_status: "visible",
      });
      expect(check.engine).toBe(engine);
    }

    const checks = await getRecords(workspaceId, "ai_visibility_check");
    expect(checks.length).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 7: Workbench shows GEO metrics
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Visibility workbench composition", () => {
  it("resolves effective layout with GEO widgets", async () => {
    await installPack(workspaceId, "ai-visibility-pack");

    const layout = await resolveEffectiveLayout(workspaceId);
    expect(layout.length).toBeGreaterThan(0);

    const widgetKeys = layout.map((item) => item.widgetKey);
    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "active_entity_profiles_metric",
        "approved_answer_blocks_metric",
        "pending_review_answer_blocks_metric",
        "visible_checks_metric",
        "not_visible_checks_metric",
        "pending_review_answer_blocks_list",
        "published_answer_blocks_list",
        "not_visible_checks_list",
        "recent_visibility_checks_list",
        "recent_entity_profiles_list",
        "recent_question_maps_list",
        "recent_citation_sources_list",
        "business_activity_feed",
      ])
    );

    const zones = new Set(layout.map((item) => item.zone));
    expect(zones.has("metrics")).toBe(true);
    expect(zones.has("lists")).toBe(true);
  });

  it("approved answer blocks widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });
    await installPack(workspaceId, "ai-visibility-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "answer_block",
      where: "status in ('approved', 'published')",
    });

    // 3 published + 2 approved = 5
    expect(widget.count).toBe(5);
  });

  it("pending review answer blocks widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });
    await installPack(workspaceId, "ai-visibility-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "answer_block",
      where: "status = 'pending_review'",
    });

    // 2 pending_review (ab-hvac-choose-provider, ab-maintenance-includes)
    expect(widget.count).toBe(2);
  });

  it("visibility status breakdown resolves correctly", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "sales-quote-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });
    await installPack(workspaceId, "ai-visibility-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "ai_visibility_check",
      groupBy: "result_status",
    });

    expect(widget.groups).toBeDefined();
    const statusMap = new Map(widget.groups!.map((g) => [g.key, g.count]));
    expect(statusMap.get("visible")).toBe(3);
    expect(statusMap.get("partial")).toBe(2);
    expect(statusMap.get("not_visible")).toBe(2);
  });

  it("available widgets include GEO module widgets", async () => {
    await installPack(workspaceId, "ai-visibility-pack");

    const widgets = await getAvailableWidgets(workspaceId);
    const widgetKeys = widgets.map((w) => w.widget.key);

    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "active_entity_profiles_metric",
        "entity_profile_type_breakdown",
        "recent_entity_profiles_list",
        "ready_question_maps_metric",
        "question_map_status_breakdown",
        "recent_question_maps_list",
        "approved_answer_blocks_metric",
        "pending_review_answer_blocks_metric",
        "answer_block_status_breakdown",
        "pending_review_answer_blocks_list",
        "published_answer_blocks_list",
        "total_citation_sources_metric",
        "citation_source_type_breakdown",
        "recent_citation_sources_list",
        "visible_checks_metric",
        "not_visible_checks_metric",
        "visibility_status_breakdown",
        "visibility_by_engine_breakdown",
        "recent_visibility_checks_list",
        "not_visible_checks_list",
      ])
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 8: Cross-pack relation declarations
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Visibility module cross-pack relation declarations", () => {
  it("runory.entity-profile declares relations to company, product_service, landing_page", async () => {
    const manifest = loadModuleManifest("runory.entity-profile");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(3);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.company",
        "runory.product-service",
        "runory.landing-page",
      ])
    );
  });

  it("runory.answer-block declares relations to question_map, entity_profile, landing_page", async () => {
    const manifest = loadModuleManifest("runory.answer-block");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(3);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.question-map",
        "runory.entity-profile",
        "runory.landing-page",
      ])
    );
  });

  it("runory.citation-source declares relation to answer_block", async () => {
    const manifest = loadModuleManifest("runory.citation-source");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(1);
    expect(manifest.relations![0].targetModule).toBe("runory.answer-block");
  });

  it("runory.ai-visibility-check declares relation to entity_profile", async () => {
    const manifest = loadModuleManifest("runory.ai-visibility-check");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(1);
    expect(manifest.relations![0].targetModule).toBe("runory.entity-profile");
  });

  it("all GEO module manifests validate against schema", async () => {
    const moduleIds = [
      "runory.entity-profile",
      "runory.question-map",
      "runory.answer-block",
      "runory.citation-source",
      "runory.ai-visibility-check",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const reparsed = moduleManifestSchema.parse(manifest);
      expect(reparsed.id).toBe(moduleId);
      expect(reparsed.objects.length).toBeGreaterThan(0);
      expect(reparsed.migrations.install).toBeDefined();
    }
  });

  it("GEO module dashboard widgets pass validation", async () => {
    const moduleIds = [
      "runory.entity-profile",
      "runory.question-map",
      "runory.answer-block",
      "runory.citation-source",
      "runory.ai-visibility-check",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const errors = validateModuleDashboard(manifest);
      expect(errors, `Module ${moduleId} dashboard errors: ${errors.join("; ")}`).toEqual([]);
    }
  });

  it("GEO pack dashboard layout passes validation", async () => {
    const pack = loadPackManifest("ai-visibility-pack");
    const errors = validatePackDashboard(pack);
    expect(errors, `Pack dashboard layout errors: ${errors.join("; ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 9: AI Visibility demo journey — end-to-end GEO flow
// Create entity profile → Generate question map → Create answer block →
// Approve → Publish → Run visibility check → See improvement suggestions
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Visibility demo journey (end-to-end GEO flow)", () => {
  it("completes the canonical AI visibility journey", async () => {
    // 1. Install AI Visibility Pack
    await installPack(workspaceId, "ai-visibility-pack");

    // 2. Create an entity profile
    const profile = await createRecord(workspaceId, "entity_profile", {
      name: "新产品 AI 可见性画像",
      entity_type: "topic",
      description: "新产品的 AI 可见性优化画像",
      keywords_json: '["新产品","产品功能","使用方法"]',
      status: "active",
      locale: "zh-CN",
      owner: "Alex",
    });
    expect(profile.id).toBeDefined();

    // 3. Create a question map (draft → generating → ready → approved)
    const qmDraft = await createRecord(workspaceId, "question_map", {
      entity_profile_id: profile.id,
      name: "新产品常见问题",
      status: "draft",
      source: "manual",
      questions_json: "[]",
      question_count: 0,
      locale: "zh-CN",
    });

    // Simulate agent generating questions
    const qmGenerating = await updateRecord(workspaceId, "question_map", qmDraft.id, {
      status: "generating",
      source: "agent_generated",
    });
    expect(qmGenerating?.status).toBe("generating");

    // Questions generated
    const questions = ["新产品是什么？", "新产品有什么功能？", "如何使用新产品？"];
    const qmReady = await updateRecord(workspaceId, "question_map", qmDraft.id, {
      status: "ready",
      questions_json: JSON.stringify(questions),
      question_count: questions.length,
    });
    expect(qmReady?.status).toBe("ready");
    expect(qmReady?.question_count).toBe(3);

    // Approve question map
    const qmApproved = await updateRecord(workspaceId, "question_map", qmDraft.id, {
      status: "approved",
    });
    expect(qmApproved?.status).toBe("approved");

    // 4. Create answer block (draft → pending_review → approved → published)
    const abDraft = await createRecord(workspaceId, "answer_block", {
      question_map_id: qmDraft.id,
      entity_profile_id: profile.id,
      question: "新产品是什么？",
      answer_text: "我们的新产品是一款创新的解决方案，帮助用户高效完成任务。",
      status: "draft",
      source_type: "agent_generated",
      confidence_score: 75,
      locale: "zh-CN",
    });

    // Submit for review
    const abPending = await updateRecord(workspaceId, "answer_block", abDraft.id, {
      status: "pending_review",
    });
    expect(abPending?.status).toBe("pending_review");

    // Approve (agent suggests, human approves)
    const abApproved = await updateRecord(workspaceId, "answer_block", abDraft.id, {
      status: "approved",
      confidence_score: 90,
      answer_text: "我们的新产品是一款创新的解决方案，帮助用户高效完成任务。支持多种场景，操作简便。",
    });
    expect(abApproved?.status).toBe("approved");
    expect(abApproved?.confidence_score).toBe(90);

    // Publish to landing page
    const abPublished = await updateRecord(workspaceId, "answer_block", abDraft.id, {
      status: "published",
    });
    expect(abPublished?.status).toBe("published");

    // 5. Add citation source
    const citation = await createRecord(workspaceId, "citation_source", {
      answer_block_id: abDraft.id,
      title: "产品技术文档",
      url: "https://docs.example.com/product",
      source_type: "official",
      snippet: "新产品是创新解决方案，支持多种场景。",
      credibility_score: 95,
      captured_at: "2026-06-23",
      author: "产品团队",
      publisher: "官方文档",
    });
    expect(citation.id).toBeDefined();

    // 6. Run visibility check
    const check = await createRecord(workspaceId, "ai_visibility_check", {
      entity_profile_id: profile.id,
      query: "新产品是什么",
      engine: "chatgpt",
      locale: "zh-CN",
      result_status: "partial",
      result_summary: "ChatGPT 部分引用了我们的内容，但未完整呈现",
      result_snippet: "新产品是一款解决方案...",
      improvement_suggestions: "建议增加 FAQ Schema 和结构化数据标记，提升被完整引用的概率",
      checked_at: "2026-06-23",
      checked_by: "Alex",
    });
    expect(check.id).toBeDefined();
    expect(check.result_status).toBe("partial");
    expect(check.improvement_suggestions).toContain("FAQ Schema");

    // 7. Verify workbench reflects the state
    const approvedCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "answer_block",
      where: "status in ('approved', 'published')",
    });
    expect(approvedCount.count).toBe(1); // The one we created is published

    const visibleCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "ai_visibility_check",
      where: "result_status = 'visible'",
    });
    expect(visibleCount.count).toBe(0); // Our check is 'partial', not 'visible'

    const notVisibleCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "ai_visibility_check",
      where: "result_status = 'not_visible'",
    });
    expect(notVisibleCount.count).toBe(0); // Our check is 'partial', not 'not_visible'

    // 8. Verify active entity profiles
    const activeProfiles = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "entity_profile",
      where: "status = 'active'",
    });
    expect(activeProfiles.count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 10: Pack installation tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Visibility pack installation tracking", () => {
  it("records AI visibility pack installation with terminology overlay", async () => {
    await installPack(workspaceId, "ai-visibility-pack");

    const packInstalls = await queryAll<{ pack_id: string; terminology_json: string | null }>(
      `SELECT pack_id, terminology_json FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "ai-visibility-pack"]
    );

    expect(packInstalls).toHaveLength(1);
    expect(packInstalls[0].terminology_json).not.toBeNull();

    const terminology = JSON.parse(packInstalls[0].terminology_json!);
    expect(terminology).toHaveLength(1);
    expect(terminology[0].object).toBe("company");
    expect(terminology[0].navigationLabel).toBe("客户");
  });

  it("updates AI visibility pack installation on re-install (idempotent)", async () => {
    await installPack(workspaceId, "ai-visibility-pack");
    await installPack(workspaceId, "ai-visibility-pack");

    const packInstalls = await queryAll<{ pack_id: string }>(
      `SELECT pack_id FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "ai-visibility-pack"]
    );

    expect(packInstalls).toHaveLength(1);
  });
});
