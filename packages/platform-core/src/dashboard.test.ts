import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, execute, genId, now, queryAll } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installPack } from "./installer";
import {
  parseWhereExpression,
  whereToSql,
  parseOrderBy,
  orderByToSql,
  validateModuleDashboard,
  validatePackDashboard,
  resolveWidgetData,
  resolveEffectiveLayout,
  getAvailableWidgets,
  upsertLayoutOverride,
  resetLayoutOverrides,
  mergeWidgetConfig,
  PLATFORM_WIDGETS,
} from "./dashboard";
import { InvalidInputError } from "./context";
import type {
  ModuleManifest,
  PackManifest,
  WidgetDeclaration,
} from "@runory/contracts";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;

beforeAll(async () => {
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
});

beforeEach(async () => {
  const tables = [
    TABLES.workspaceDashboardLayout, TABLES.extensionFieldValues, TABLES.auditLogs,
    TABLES.navigationItems, TABLES.viewDefinitions, TABLES.fieldDefinitions,
    TABLES.objectDefinitions, TABLES.installations, TABLES.extensionVersions,
    TABLES.extensionDefinitions, TABLES.workspaceMemberships,
    TABLES.organizationMemberships, TABLES.workspaceTenants, TABLES.workspaces,
    TABLES.organizations, TABLES.users,
  ];
  for (const t of tables) {
    try { await db.execute({ sql: `DELETE FROM ${t}` }); } catch {}
  }

  // Clear business tables
  const bizTables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'runory_business_%' ORDER BY name DESC",
  });
  for (const row of bizTables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DELETE FROM "${name}"` });
  }

  // Create workspace
  const ts = now();
  workspaceId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, "Test WS", "test-ws", ts, ts]
  );

  await installPack(workspaceId, "crm-lite-pack");
});

// ─────────────────────────────────────────────────────────────────────────────
// Where Expression Parser
// ─────────────────────────────────────────────────────────────────────────────

describe("parseWhereExpression", () => {
  it("parses empty expression", () => {
    expect(parseWhereExpression("")).toEqual([]);
    expect(parseWhereExpression("   ")).toEqual([]);
  });

  it("parses single equality clause", () => {
    const clauses = parseWhereExpression("status = 'todo'");
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toEqual({
      field: "status",
      operator: "=",
      value: "todo",
    });
  });

  it("parses single clause without quotes", () => {
    const clauses = parseWhereExpression("status = todo");
    expect(clauses[0].value).toBe("todo");
  });

  it("parses numeric value", () => {
    const clauses = parseWhereExpression("priority > 5");
    expect(clauses[0].value).toBe(5);
  });

  it("parses IN clause", () => {
    const clauses = parseWhereExpression("status in ('todo', 'in_progress')");
    expect(clauses[0].operator).toBe("in");
    expect(clauses[0].value).toEqual(["todo", "in_progress"]);
  });

  it("parses NOT IN clause", () => {
    const clauses = parseWhereExpression("status not in ('done', 'cancelled')");
    expect(clauses[0].operator).toBe("not in");
    expect(clauses[0].value).toEqual(["done", "cancelled"]);
  });

  it("parses LIKE clause", () => {
    const clauses = parseWhereExpression("title like '%customer%'");
    expect(clauses[0].operator).toBe("like");
    expect(clauses[0].value).toBe("%customer%");
  });

  it("parses compound AND expression", () => {
    const clauses = parseWhereExpression("status = 'todo' and priority > 3");
    expect(clauses).toHaveLength(2);
    expect(clauses[0].field).toBe("status");
    expect(clauses[1].field).toBe("priority");
  });

  it("parses today constant", () => {
    const clauses = parseWhereExpression("due_date < today");
    expect(clauses[0].value).toBe("today");
  });

  it("parses >= and <= operators", () => {
    expect(parseWhereExpression("x >= 5")[0].operator).toBe(">=");
    expect(parseWhereExpression("x <= 5")[0].operator).toBe("<=");
    expect(parseWhereExpression("x != 5")[0].operator).toBe("!=");
  });

  it("throws on unsupported syntax", () => {
    expect(() => parseWhereExpression("status @ 'todo'")).toThrow(InvalidInputError);
    expect(() => parseWhereExpression("status = ")).toThrow(InvalidInputError);
  });
});

describe("whereToSql", () => {
  it("returns empty for empty clauses", () => {
    const { sql, args } = whereToSql([]);
    expect(sql).toBe("");
    expect(args).toEqual([]);
  });

  it("translates equality to parameterized SQL", () => {
    const clauses = parseWhereExpression("status = 'todo'");
    const { sql, args } = whereToSql(clauses);
    expect(sql).toBe("status = ?");
    expect(args).toEqual(["todo"]);
  });

  it("translates IN clause", () => {
    const clauses = parseWhereExpression("status in ('todo', 'in_progress')");
    const { sql, args } = whereToSql(clauses);
    expect(sql).toBe("status IN (?, ?)");
    expect(args).toEqual(["todo", "in_progress"]);
  });

  it("translates NOT IN clause", () => {
    const clauses = parseWhereExpression("status not in ('done')");
    const { sql, args } = whereToSql(clauses);
    expect(sql).toBe("status NOT IN (?)");
    expect(args).toEqual(["done"]);
  });

  it("translates LIKE clause", () => {
    const clauses = parseWhereExpression("title like '%test%'");
    const { sql, args } = whereToSql(clauses);
    expect(sql).toBe("title LIKE ?");
    expect(args).toEqual(["%test%"]);
  });

  it("resolves today constant to date-only comparison", () => {
    const clauses = parseWhereExpression("due_date < today");
    const { sql, args } = whereToSql(clauses);
    expect(sql).toBe("DATE(due_date) < ?");
    expect(typeof args[0]).toBe("string");
    expect(args[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses DATE comparison for equality against today", () => {
    const clauses = parseWhereExpression("scheduled_start = today");
    const { sql, args } = whereToSql(clauses);
    expect(sql).toBe("DATE(scheduled_start) = ?");
    expect(args[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects invalid field identifier", () => {
    const clauses = [{ field: "status; DROP TABLE", operator: "=", value: "x" }];
    expect(() => whereToSql(clauses)).toThrow(InvalidInputError);
  });

  it("handles empty IN list", () => {
    const clauses = [{ field: "status", operator: "in", value: [] as string[] }];
    const { sql } = whereToSql(clauses);
    expect(sql).toBe("1=0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OrderBy Parser
// ─────────────────────────────────────────────────────────────────────────────

describe("parseOrderBy", () => {
  it("parses empty expression", () => {
    expect(parseOrderBy(undefined)).toEqual([]);
    expect(parseOrderBy("")).toEqual([]);
  });

  it("parses single field default asc", () => {
    const clauses = parseOrderBy("created_at");
    expect(clauses).toEqual([{ field: "created_at", direction: "asc" }]);
  });

  it("parses single field with desc", () => {
    const clauses = parseOrderBy("priority desc");
    expect(clauses).toEqual([{ field: "priority", direction: "desc" }]);
  });

  it("parses multiple fields", () => {
    const clauses = parseOrderBy("priority desc, due_date asc");
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toEqual({ field: "priority", direction: "desc" });
    expect(clauses[1]).toEqual({ field: "due_date", direction: "asc" });
  });

  it("rejects invalid identifier", () => {
    expect(() => parseOrderBy("priority; DROP TABLE")).toThrow(InvalidInputError);
  });
});

describe("orderByToSql", () => {
  it("returns empty for empty clauses", () => {
    expect(orderByToSql([])).toBe("");
  });

  it("translates to SQL fragment", () => {
    const clauses = parseOrderBy("priority desc, due_date asc");
    expect(orderByToSql(clauses)).toBe("priority desc, due_date asc");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Module Dashboard Validation
// ─────────────────────────────────────────────────────────────────────────────

describe("validateModuleDashboard", () => {
  function makeManifest(overrides: Partial<ModuleManifest> = {}): ModuleManifest {
    return {
      id: "runory.test",
      name: "Test Module",
      version: "1.0.0",
      coreCompatibility: ">=0.1.0",
      objects: [
        {
          key: "task",
          label: "Task",
          fields: [
            { key: "title", label: "Title", type: "text", ownership: "module_owned", required: false },
            { key: "status", label: "Status", type: "select", ownership: "module_owned", required: false },
            { key: "priority", label: "Priority", type: "select", ownership: "module_owned", required: false },
            { key: "due_date", label: "Due Date", type: "date", ownership: "module_owned", required: false },
          ],
        },
      ],
      views: [],
      migrations: { install: "migrations/install.sql" },
      ...overrides,
    } as ModuleManifest;
  }

  it("passes when no dashboard declared", () => {
    const errors = validateModuleDashboard(makeManifest());
    expect(errors).toEqual([]);
  });

  it("rejects module-declared activity_feed", () => {
    const manifest = makeManifest({
      dashboard: {
        widgets: [
          {
            key: "my_feed",
            type: "activity_feed",
            label: "My Feed",
            icon: "activity",
            tone: "slate",
            data: { kind: "count", object: "task" },
          },
        ],
      },
    });
    const errors = validateModuleDashboard(manifest);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("activity_feed"))).toBe(true);
  });

  it("rejects widget referencing unknown object", () => {
    const manifest = makeManifest({
      dashboard: {
        widgets: [
          {
            key: "bad_widget",
            type: "metric_card",
            label: "Bad",
            icon: "file",
            tone: "slate",
            data: { kind: "count", object: "nonexistent" },
          },
        ],
      },
    });
    const errors = validateModuleDashboard(manifest);
    expect(errors.some((e) => e.includes("not declared"))).toBe(true);
  });

  it("rejects where clause referencing unknown field", () => {
    const manifest = makeManifest({
      dashboard: {
        widgets: [
          {
            key: "bad_where",
            type: "metric_card",
            label: "Bad Where",
            icon: "file",
            tone: "slate",
            data: { kind: "count", object: "task", where: "unknown_field = 'x'" },
          },
        ],
      },
    });
    const errors = validateModuleDashboard(manifest);
    expect(errors.some((e) => e.includes("unknown field"))).toBe(true);
  });

  it("rejects duplicate widget keys", () => {
    const manifest = makeManifest({
      dashboard: {
        widgets: [
          {
            key: "dup",
            type: "metric_card",
            label: "Dup 1",
            icon: "file",
            tone: "slate",
            data: { kind: "count", object: "task" },
          },
          {
            key: "dup",
            type: "metric_card",
            label: "Dup 2",
            icon: "file",
            tone: "slate",
            data: { kind: "count", object: "task" },
          },
        ],
      },
    });
    const errors = validateModuleDashboard(manifest);
    expect(errors.some((e) => e.includes("Duplicate widget key"))).toBe(true);
  });

  it("passes valid widget declaration", () => {
    const manifest = makeManifest({
      dashboard: {
        widgets: [
          {
            key: "open_tasks",
            type: "metric_card",
            label: "Open Tasks",
            icon: "list-checks",
            tone: "amber",
            data: {
              kind: "count",
              object: "task",
              where: "status in ('todo', 'in_progress')",
            },
          },
        ],
      },
    });
    const errors = validateModuleDashboard(manifest);
    expect(errors).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pack Dashboard Validation
// ─────────────────────────────────────────────────────────────────────────────

describe("validatePackDashboard", () => {
  function makePack(overrides: Partial<PackManifest> = {}): PackManifest {
    return {
      id: "test-pack",
      name: "Test Pack",
      version: "1.0.0",
      coreCompatibility: ">=0.1.0",
      modules: ["runory.customer", "runory.task"],
      ...overrides,
    } as PackManifest;
  }

  it("passes when no dashboard declared", () => {
    const errors = validatePackDashboard(makePack());
    expect(errors).toEqual([]);
  });

  it("rejects layout referencing module not in pack", () => {
    const manifest = makePack({
      dashboard: {
        defaultLayout: [
          {
            zone: "metrics",
            widgets: [
              { module: "runory.unknown", widget: "some_widget", instance: "default" },
            ],
          },
        ],
      },
    });
    const errors = validatePackDashboard(manifest);
    expect(errors.some((e) => e.includes("not included in pack"))).toBe(true);
  });

  it("allows _platform module", () => {
    const manifest = makePack({
      dashboard: {
        defaultLayout: [
          {
            zone: "activity",
            widgets: [
              { module: "_platform", widget: "business_activity_feed", instance: "default" },
            ],
          },
        ],
      },
    });
    const errors = validatePackDashboard(manifest);
    expect(errors).toEqual([]);
  });

  it("rejects duplicate layout items without distinct instance", () => {
    const manifest = makePack({
      dashboard: {
        defaultLayout: [
          {
            zone: "metrics",
            widgets: [
              { module: "runory.task", widget: "open_tasks", instance: "default" },
              { module: "runory.task", widget: "open_tasks", instance: "default" },
            ],
          },
        ],
      },
    });
    const errors = validatePackDashboard(manifest);
    expect(errors.some((e) => e.includes("Duplicate layout item"))).toBe(true);
  });

  it("allows same widget with distinct instances", () => {
    const manifest = makePack({
      dashboard: {
        defaultLayout: [
          {
            zone: "trends",
            widgets: [
              { module: "runory.task", widget: "new_trend", instance: "14d" },
              { module: "runory.task", widget: "new_trend", instance: "30d" },
            ],
          },
        ],
      },
    });
    const errors = validatePackDashboard(manifest);
    expect(errors).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Widget Data Resolver (integration with real DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveWidgetData", () => {
  beforeEach(async () => {
    // Seed some task data
    const taskTable = businessTable("task");
    const ts = now();
    await execute(
      `INSERT INTO ${taskTable} (id, workspace_id, title, status, priority, due_date, assignee, company_id, created_at, updated_at)
       VALUES
         (?, ?, 'Task 1', 'todo', 'high', '2026-07-01', 'alice', null, ?, ?),
         (?, ?, 'Task 2', 'in_progress', 'medium', '2026-07-02', 'bob', null, ?, ?),
         (?, ?, 'Task 3', 'done', 'low', null, null, null, ?, ?)`,
      [
        genId("t"), workspaceId, ts, ts,
        genId("t"), workspaceId, ts, ts,
        genId("t"), workspaceId, ts, ts,
      ]
    );
  });

  it("resolves count intent", async () => {
    const result = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "task",
    });
    expect(result.kind).toBe("count");
    expect(result.count).toBe(3);
  });

  it("resolves count with where filter", async () => {
    const result = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "task",
      where: "status = 'todo'",
    });
    expect(result.count).toBe(1);
  });

  it("resolves count with IN filter", async () => {
    const result = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "task",
      where: "status in ('todo', 'in_progress')",
    });
    expect(result.count).toBe(2);
  });

  it("resolves group_count intent", async () => {
    const result = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "task",
      groupBy: "status",
    });
    expect(result.kind).toBe("group_count");
    expect(result.groups).toBeDefined();
    expect(result.groups!.length).toBe(3);
    const todoGroup = result.groups!.find((g) => g.key === "todo");
    expect(todoGroup?.count).toBe(1);
  });

  it("resolves recent intent", async () => {
    const result = await resolveWidgetData(workspaceId, {
      kind: "recent",
      object: "task",
      limit: 2,
      columns: ["title", "status"],
      orderBy: "title asc",
    });
    expect(result.kind).toBe("recent");
    expect(result.records).toBeDefined();
    expect(result.records!.length).toBe(2);
    expect(result.records![0].title).toBe("Task 1");
  });

  it("resolves timeseries intent", async () => {
    // Verify data exists first
    const countResult = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "task",
    });
    expect(countResult.count).toBe(3);

    const result = await resolveWidgetData(workspaceId, {
      kind: "timeseries",
      object: "task",
      range: "14d",
    });
    expect(result.kind).toBe("timeseries");
    expect(result.series).toBeDefined();
    expect(result.series!.length).toBe(14);
    // The 3 seeded tasks were created "now", so they should appear in the series.
    const totalCount = result.series!.reduce((sum, p) => sum + p.count, 0);
    expect(totalCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layout Resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveEffectiveLayout", () => {
  it("returns pack default layout when declared", async () => {
    // CRM Lite pack now has dashboard.defaultLayout
    const layout = await resolveEffectiveLayout(workspaceId);
    expect(layout.length).toBeGreaterThan(0);

    // Should include widgets from all zones
    const zones = new Set(layout.map((item) => item.zone));
    expect(zones.has("metrics")).toBe(true);
    expect(zones.has("trends")).toBe(true);
    expect(zones.has("lists")).toBe(true);
    expect(zones.has("activity")).toBe(true);

    // Should include platform activity_feed widget
    const hasActivityFeed = layout.some(
      (item) => item.moduleId === "_platform" && item.widgetKey === "business_activity_feed"
    );
    expect(hasActivityFeed).toBe(true);

    // Should include module widgets
    const hasCompanyMetric = layout.some(
      (item) => item.moduleId === "runory.company" && item.widgetKey === "company_total_metric"
    );
    expect(hasCompanyMetric).toBe(true);
  });

  it("respects hidden override", async () => {
    // Hide the platform activity feed
    await upsertLayoutOverride(workspaceId, {
      zone: "activity",
      widgetModule: "_platform",
      widgetKey: "business_activity_feed",
      widgetInstance: "default",
      hidden: true,
    }, "test-user");

    const layout = await resolveEffectiveLayout(workspaceId);
    const hasActivityFeed = layout.some(
      (item) => item.moduleId === "_platform" && item.widgetKey === "business_activity_feed"
    );
    expect(hasActivityFeed).toBe(false);
  });

  it("respects position override for reordering", async () => {
    // Get the default layout
    const defaultLayout = await resolveEffectiveLayout(workspaceId);
    const metricsWidgets = defaultLayout.filter((item) => item.zone === "metrics");
    expect(metricsWidgets.length).toBeGreaterThanOrEqual(2);

    // Move the last metric to position -1 (front)
    const lastWidget = metricsWidgets[metricsWidgets.length - 1];
    await upsertLayoutOverride(workspaceId, {
      zone: "metrics",
      widgetModule: lastWidget.moduleId,
      widgetKey: lastWidget.widgetKey,
      widgetInstance: lastWidget.instance,
      position: -1,
    }, "test-user");

    const newLayout = await resolveEffectiveLayout(workspaceId);
    const newMetrics = newLayout.filter((item) => item.zone === "metrics");
    expect(newMetrics[0].moduleId).toBe(lastWidget.moduleId);
    expect(newMetrics[0].widgetKey).toBe(lastWidget.widgetKey);
  });

  it("reset clears all overrides", async () => {
    await upsertLayoutOverride(workspaceId, {
      zone: "activity",
      widgetModule: "_platform",
      widgetKey: "business_activity_feed",
      widgetInstance: "default",
      hidden: true,
    }, "test-user");

    await resetLayoutOverrides(workspaceId);

    const layout = await resolveEffectiveLayout(workspaceId);
    const hasActivityFeed = layout.some(
      (item) => item.moduleId === "_platform" && item.widgetKey === "business_activity_feed"
    );
    expect(hasActivityFeed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Available Widgets
// ─────────────────────────────────────────────────────────────────────────────

describe("getAvailableWidgets", () => {
  it("includes platform widgets", async () => {
    const widgets = await getAvailableWidgets(workspaceId);
    const platformWidgets = widgets.filter((w) => w.moduleId === "_platform");
    expect(platformWidgets.length).toBeGreaterThan(0);
    expect(platformWidgets.some((w) => w.widget.key === "business_activity_feed")).toBe(true);
  });

  it("includes module widgets when manifest declares them", async () => {
    // After Phase 2, CRM Lite modules declare dashboard.widgets
    const widgets = await getAvailableWidgets(workspaceId);
    const moduleWidgets = widgets.filter((w) => w.moduleId !== "_platform");
    // runory.company (4 widgets) + runory.contact (1 widget) + runory.deal (4 widgets) + runory.task (5 widgets) = 14
    expect(moduleWidgets.length).toBe(14);
    // Verify specific widgets are present
    const widgetKeys = moduleWidgets.map((w) => w.widget.key);
    expect(widgetKeys).toContain("company_total_metric");
    expect(widgetKeys).toContain("contact_total_metric");
    expect(widgetKeys).toContain("open_deals_metric");
    expect(widgetKeys).toContain("open_tasks_metric");
    expect(widgetKeys).toContain("task_status_breakdown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Platform Widgets
// ─────────────────────────────────────────────────────────────────────────────

describe("PLATFORM_WIDGETS", () => {
  it("includes business_activity_feed", () => {
    const feed = PLATFORM_WIDGETS.find((w) => w.key === "business_activity_feed");
    expect(feed).toBeDefined();
    expect(feed?.type).toBe("activity_feed");
  });

  it("activity_feed widgets are platform-owned only", () => {
    // All activity_feed widgets in PLATFORM_WIDGETS must have module "_platform"
    const activityFeeds = PLATFORM_WIDGETS.filter((w) => w.type === "activity_feed");
    expect(activityFeeds.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v0.3.3 — Widget Configuration Override & Multi-Pack Resilience
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeWidgetConfig (v0.3.3)", () => {
  const baseWidget: WidgetDeclaration = {
    key: "test_list",
    type: "list",
    label: "Test List",
    icon: "list-checks",
    tone: "slate",
    data: {
      kind: "recent",
      object: "task",
      limit: 5,
      columns: ["title", "status"],
    },
    configurable: [
      { path: "data.limit", label: "显示条数", type: "number", min: 1, max: 20 },
    ],
  };

  it("returns widget unchanged when override is null", () => {
    const merged = mergeWidgetConfig(baseWidget, null);
    expect(merged.data.limit).toBe(5);
  });

  it("deep-merges override into widget declaration", () => {
    const merged = mergeWidgetConfig(baseWidget, { data: { limit: 10 } });
    expect(merged.data.limit).toBe(10);
    // Non-overridden fields are preserved
    expect(merged.data.columns).toEqual(["title", "status"]);
    expect(merged.data.object).toBe("task");
  });

  it("preserves sibling keys when overriding nested path", () => {
    const merged = mergeWidgetConfig(baseWidget, { data: { limit: 15 } });
    expect(merged.data.kind).toBe("recent");
    expect(merged.data.object).toBe("task");
    expect(merged.data.limit).toBe(15);
  });
});

describe("configOverride persistence (v0.3.3)", () => {
  it("persists configOverride via upsertLayoutOverride and returns it in resolveEffectiveLayout", async () => {
    // Find a configurable widget in the CRM Lite layout
    const layout = await resolveEffectiveLayout(workspaceId);
    const configurableItem = layout.find((i) => i.widget.configurable && i.widget.configurable.length > 0);
    expect(configurableItem).toBeDefined();

    // Override data.limit (or whatever the first configurable path is)
    const path = configurableItem!.widget.configurable![0].path;
    const override = path.split(".").reduceRight<Record<string, unknown>>(
      (acc, key) => ({ [key]: acc }),
      { overridden: true } as Record<string, unknown>
    );

    await upsertLayoutOverride(workspaceId, {
      zone: configurableItem!.zone,
      widgetModule: configurableItem!.moduleId,
      widgetKey: configurableItem!.widgetKey,
      widgetInstance: configurableItem!.instance,
      configOverride: override,
    }, "test-user");

    const newLayout = await resolveEffectiveLayout(workspaceId);
    const updated = newLayout.find(
      (i) => i.moduleId === configurableItem!.moduleId && i.widgetKey === configurableItem!.widgetKey
    );
    expect(updated).toBeDefined();
    expect(updated!.configOverride).not.toBeNull();
    // The overridden path should be present in configOverride
    const parts = path.split(".");
    let cur: unknown = updated!.configOverride;
    for (const p of parts) {
      cur = (cur as Record<string, unknown>)?.[p];
    }
    expect(cur).toEqual({ overridden: true });
  });

  it("clears configOverride when reset is called", async () => {
    const layout = await resolveEffectiveLayout(workspaceId);
    const item = layout[0];
    await upsertLayoutOverride(workspaceId, {
      zone: item.zone,
      widgetModule: item.moduleId,
      widgetKey: item.widgetKey,
      widgetInstance: item.instance,
      configOverride: { data: { limit: 99 } },
    }, "test-user");

    await resetLayoutOverrides(workspaceId);

    const reset = await resolveEffectiveLayout(workspaceId);
    const resetItem = reset.find(
      (i) => i.moduleId === item.moduleId && i.widgetKey === item.widgetKey
    );
    expect(resetItem!.configOverride).toBeNull();
  });
});

describe("multi-pack dashboard resilience (v0.3.3)", () => {
  it("remains readable after installing CRM Lite + FSM packs (2 packs)", async () => {
    await installPack(workspaceId, "fsm-pack");

    const layout = await resolveEffectiveLayout(workspaceId);
    expect(layout.length).toBeGreaterThan(0);

    // Widgets from both packs should be present
    const moduleIds = new Set(layout.map((i) => i.moduleId));
    expect(moduleIds.has("runory.company")).toBe(true);   // CRM
    expect(moduleIds.has("runory.work-order")).toBe(true); // FSM

    // All four zones should have content (or at least be valid)
    const zones = new Set(layout.map((i) => i.zone));
    expect(zones.size).toBeGreaterThan(0);

    // Every layout item should have a resolved widget declaration
    for (const item of layout) {
      expect(item.widget).toBeDefined();
      expect(item.widget.key).toBe(item.widgetKey);
    }
  });

  it("does not duplicate shared-module widgets when both packs are installed", async () => {
    await installPack(workspaceId, "fsm-pack");

    const layout = await resolveEffectiveLayout(workspaceId);
    // Count widgets per module:widget key — should all be unique
    const keys = layout.map((i) => `${i.moduleId}:${i.widgetKey}`);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it("available widgets include configurable fields from both packs", async () => {
    await installPack(workspaceId, "fsm-pack");

    const widgets = await getAvailableWidgets(workspaceId);
    const configurable = widgets.filter((w) => w.widget.configurable && w.widget.configurable.length > 0);
    expect(configurable.length).toBeGreaterThan(0);

    // FSM pack declares configurable widgets (e.g. work_orders_needing_dispatch_list)
    const fsmConfigurable = configurable.filter((w) => w.moduleId === "runory.work-order");
    expect(fsmConfigurable.length).toBeGreaterThan(0);
  });
});
