import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import { getView } from "./metadata";
import { installPack } from "./installer";
import {
  validateExtensionPlan,
  previewExtension,
  applyExtension,
  rollbackExtension,
} from "./extension";
import type { ExtensionPlan } from "@runory/contracts";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Test fixture ──

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
    TABLES.extensionFieldValues, TABLES.auditLogs, TABLES.navigationItems,
    TABLES.viewDefinitions, TABLES.fieldDefinitions, TABLES.objectDefinitions,
    TABLES.installations, TABLES.extensionVersions, TABLES.extensionDefinitions,
    TABLES.workspaceMemberships, TABLES.organizationMemberships,
    TABLES.workspaceTenants, TABLES.workspaces, TABLES.organizations, TABLES.users,
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

  // Install customer module via pack (registers objects, fields, views with module_id)
  await installPack(workspaceId, "crm-lite-pack");
});

// ── Helper: build a view-modification-only plan ──

function makePlan(name: string, viewModifications: ExtensionPlan["viewModifications"]): ExtensionPlan {
  return {
    name,
    description: "Test view modifications",
    targetModules: ["runory.customer"],
    riskLevel: "low",
    customFields: [],
    viewModifications,
  };
}

// ── Validation Tests ──

describe("validateExtensionPlan — viewModifications", () => {
  it("accepts a valid reorderColumns plan", async () => {
    const plan = makePlan("Reorder Test", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          reorderColumns: ["email", "name", "phone"],
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a valid addFilters plan", async () => {
    const plan = makePlan("Filter Test", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          addFilters: [
            { field: "name", operator: "contains", value: "Acme" },
          ],
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid addSection plan", async () => {
    const plan = makePlan("Section Test", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addSection: {
            title: "Extra Info",
            fields: [{ field: "email" }, { field: "phone" }],
          },
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid addAction plan", async () => {
    const plan = makePlan("Action Test", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addAction: "export",
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid pageSize plan", async () => {
    const plan = makePlan("PageSize Test", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          pageSize: 50,
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(true);
  });

  it("rejects when targetObject does not exist", async () => {
    const plan = makePlan("Bad Object", [
      {
        targetObject: "nonexistent",
        viewKey: "nonexistent_list",
        modifications: { pageSize: 10 },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("not found"))).toBe(true);
  });

  it("rejects when viewKey does not exist", async () => {
    const plan = makePlan("Bad View", [
      {
        targetObject: "customer",
        viewKey: "nonexistent_view",
        modifications: { pageSize: 10 },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("nonexistent_view"))).toBe(true);
  });

  it("rejects reorderColumns that does not include all existing columns", async () => {
    const plan = makePlan("Incomplete Reorder", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          reorderColumns: ["email", "name"], // missing "phone"
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Missing"))).toBe(true);
  });

  it("rejects reorderColumns with a non-existent column", async () => {
    const plan = makePlan("Bad Column", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          reorderColumns: ["email", "name", "phone", "nonexistent"],
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("nonexistent"))).toBe(true);
  });

  it("rejects addFilters with a non-existent field", async () => {
    const plan = makePlan("Bad Filter Field", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          addFilters: [{ field: "nonexistent_field", operator: "eq", value: "x" }],
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("nonexistent_field"))).toBe(true);
  });

  it("rejects addSection with a non-existent field", async () => {
    const plan = makePlan("Bad Section Field", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addSection: {
            title: "Bad",
            fields: [{ field: "nonexistent_field" }],
          },
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("nonexistent_field"))).toBe(true);
  });

  it("rejects addSection on a view that does not allow it", async () => {
    const plan = makePlan("Section Not Allowed", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          addSection: {
            title: "Extra",
            fields: [{ field: "name" }],
          },
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("does not allow adding sections"))).toBe(true);
  });

  it("rejects reorderColumns on a view that does not allow it", async () => {
    const plan = makePlan("Reorder Not Allowed", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          reorderColumns: ["name"],
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("does not allow column reordering"))).toBe(true);
  });

  it("rejects addAction on a view that does not allow it", async () => {
    const plan = makePlan("Action Not Allowed", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          addAction: "export",
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("does not allow adding actions"))).toBe(true);
  });

  it("rejects pageSize on a view that does not allow it", async () => {
    const plan = makePlan("PageSize Not Allowed", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          pageSize: 50,
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("does not allow page size changes"))).toBe(true);
  });

  it("rejects addFilters on a view that does not allow it", async () => {
    const plan = makePlan("Filters Not Allowed", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addFilters: [{ field: "name", operator: "eq", value: "x" }],
        },
      },
    ]);
    const result = await validateExtensionPlan(workspaceId, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("does not allow adding filters"))).toBe(true);
  });
});

// ── Preview Tests ──

describe("previewExtension — viewModifications", () => {
  it("includes viewModifications in the diff with before config", async () => {
    const plan = makePlan("Preview Test", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          reorderColumns: ["email", "name", "phone"],
          pageSize: 50,
        },
      },
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addSection: {
            title: "Extra",
            fields: [{ field: "email" }],
          },
        },
      },
    ]);
    const diff = await previewExtension(workspaceId, plan);

    expect(diff.viewModifications).toHaveLength(2);

    const listMod = diff.viewModifications[0];
    expect(listMod.targetObject).toBe("customer");
    expect(listMod.viewKey).toBe("customer_list");
    expect(listMod.before).not.toBeNull();
    expect(listMod.before!.columns).toBeDefined();
    expect(listMod.modifications).toHaveLength(2);
    expect(listMod.modifications.some(m => m.type === "reorderColumns")).toBe(true);
    expect(listMod.modifications.some(m => m.type === "pageSize")).toBe(true);

    const formMod = diff.viewModifications[1];
    expect(formMod.viewKey).toBe("customer_form");
    expect(formMod.before).not.toBeNull();
    expect(formMod.before!.sections).toBeDefined();
    expect(formMod.modifications.some(m => m.type === "addSection")).toBe(true);
  });

  it("includes affected views from viewModifications", async () => {
    const plan = makePlan("Affected Views", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: { pageSize: 50 },
      },
    ]);
    const diff = await previewExtension(workspaceId, plan);
    expect(diff.affectedViews).toContain("customer_list");
  });

  it("returns empty viewModifications array when plan has none", async () => {
    const plan: ExtensionPlan = {
      name: "No View Mods",
      targetModules: ["runory.customer"],
      riskLevel: "low",
      customFields: [],
    };
    const diff = await previewExtension(workspaceId, plan);
    expect(diff.viewModifications).toEqual([]);
  });
});

// ── Apply Tests ──

describe("applyExtension — viewModifications", () => {
  it("reorders columns in a list view", async () => {
    const plan = makePlan("Apply Reorder", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          reorderColumns: ["phone", "email", "name"],
        },
      },
    ]);
    await applyExtension(workspaceId, plan, "test-agent");

    const view = await getView(workspaceId, "customer", "customer_list");
    expect(view).toBeDefined();
    const columns = (view!.config as { columns: Array<{ field: string }> }).columns;
    expect(columns.map(c => c.field)).toEqual(["phone", "email", "name"]);
  });

  it("adds filters to a list view", async () => {
    const plan = makePlan("Apply Filters", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          addFilters: [
            { field: "name", operator: "contains", value: "Acme" },
            { field: "email", operator: "eq", value: "test@test.com" },
          ],
        },
      },
    ]);
    await applyExtension(workspaceId, plan, "test-agent");

    const view = await getView(workspaceId, "customer", "customer_list");
    expect(view).toBeDefined();
    const filters = (view!.config as { filters?: Array<{ field: string; operator: string }> }).filters;
    expect(filters).toBeDefined();
    expect(filters).toHaveLength(2);
    expect(filters![0].field).toBe("name");
    expect(filters![1].field).toBe("email");
  });

  it("adds a section to a form view (append)", async () => {
    const plan = makePlan("Apply Section", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addSection: {
            title: "Extra Info",
            fields: [{ field: "email" }, { field: "phone" }],
          },
        },
      },
    ]);
    await applyExtension(workspaceId, plan, "test-agent");

    const view = await getView(workspaceId, "customer", "customer_form");
    expect(view).toBeDefined();
    const sections = (view!.config as { sections: Array<{ title: string }> }).sections;
    expect(sections).toHaveLength(2);
    expect(sections[1].title).toBe("Extra Info");
  });

  it("inserts a section after a specified section", async () => {
    const plan = makePlan("Apply Section After", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addSection: {
            title: "Inserted Section",
            fields: [{ field: "name" }],
            afterSection: "基本信息",
          },
        },
      },
    ]);
    await applyExtension(workspaceId, plan, "test-agent");

    const view = await getView(workspaceId, "customer", "customer_form");
    const sections = (view!.config as { sections: Array<{ title: string }> }).sections;
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("基本信息");
    expect(sections[1].title).toBe("Inserted Section");
  });

  it("appends section when afterSection is not found", async () => {
    const plan = makePlan("Apply Section Bad After", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addSection: {
            title: "Appended",
            fields: [{ field: "name" }],
            afterSection: "Nonexistent Section",
          },
        },
      },
    ]);
    await applyExtension(workspaceId, plan, "test-agent");

    const view = await getView(workspaceId, "customer", "customer_form");
    const sections = (view!.config as { sections: Array<{ title: string }> }).sections;
    expect(sections).toHaveLength(2);
    expect(sections[1].title).toBe("Appended");
  });

  it("adds an action to a form view", async () => {
    const plan = makePlan("Apply Action", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addAction: "export",
        },
      },
    ]);
    await applyExtension(workspaceId, plan, "test-agent");

    const view = await getView(workspaceId, "customer", "customer_form");
    expect(view).toBeDefined();
    const actions = (view!.config as { actions?: string[] }).actions;
    expect(actions).toBeDefined();
    expect(actions).toContain("export");
  });

  it("changes page size of a list view", async () => {
    const plan = makePlan("Apply PageSize", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          pageSize: 100,
        },
      },
    ]);
    await applyExtension(workspaceId, plan, "test-agent");

    const view = await getView(workspaceId, "customer", "customer_list");
    expect(view).toBeDefined();
    expect((view!.config as { pageSize?: number }).pageSize).toBe(100);
  });

  it("applies multiple modification types to the same view in one plan", async () => {
    const plan = makePlan("Apply Multiple", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          reorderColumns: ["phone", "email", "name"],
          addFilters: [{ field: "name", operator: "contains", value: "Acme" }],
          pageSize: 50,
        },
      },
    ]);
    await applyExtension(workspaceId, plan, "test-agent");

    const view = await getView(workspaceId, "customer", "customer_list");
    const config = view!.config as {
      columns: Array<{ field: string }>;
      filters?: Array<{ field: string }>;
      pageSize?: number;
    };
    expect(config.columns.map(c => c.field)).toEqual(["phone", "email", "name"]);
    expect(config.filters).toHaveLength(1);
    expect(config.pageSize).toBe(50);
  });

  it("applies modifications across multiple views in one plan", async () => {
    const plan = makePlan("Apply Multi View", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: { pageSize: 50 },
      },
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: { addAction: "export" },
      },
    ]);
    await applyExtension(workspaceId, plan, "test-agent");

    const listView = await getView(workspaceId, "customer", "customer_list");
    const formView = await getView(workspaceId, "customer", "customer_form");
    expect((listView!.config as { pageSize?: number }).pageSize).toBe(50);
    expect((formView!.config as { actions?: string[] }).actions).toContain("export");
  });

  it("works with a plan that has only viewModifications (no customFields)", async () => {
    const plan: ExtensionPlan = {
      name: "Only View Mods",
      targetModules: ["runory.customer"],
      riskLevel: "low",
      customFields: [],
      viewModifications: [
        {
          targetObject: "customer",
          viewKey: "customer_list",
          modifications: { pageSize: 30 },
        },
      ],
    };
    const version = await applyExtension(workspaceId, plan, "test-agent");
    expect(version.id).toBeDefined();

    const view = await getView(workspaceId, "customer", "customer_list");
    expect((view!.config as { pageSize?: number }).pageSize).toBe(30);
  });
});

// ── Rollback Tests ──

describe("rollbackExtension — viewModifications", () => {
  it("reverses reorderColumns", async () => {
    const plan = makePlan("Rollback Reorder", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          reorderColumns: ["phone", "email", "name"],
        },
      },
    ]);
    const version = await applyExtension(workspaceId, plan, "test-agent");

    // Verify reorder happened
    let view = await getView(workspaceId, "customer", "customer_list");
    expect((view!.config as { columns: Array<{ field: string }> }).columns.map(c => c.field))
      .toEqual(["phone", "email", "name"]);

    // Rollback
    await rollbackExtension(workspaceId, version.extensionId, "test-agent");

    // Verify original order restored
    view = await getView(workspaceId, "customer", "customer_list");
    expect((view!.config as { columns: Array<{ field: string }> }).columns.map(c => c.field))
      .toEqual(["name", "email", "phone"]);
  });

  it("reverses addFilters", async () => {
    const plan = makePlan("Rollback Filters", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          addFilters: [
            { field: "name", operator: "contains", value: "Acme" },
            { field: "email", operator: "eq", value: "x@y.com" },
          ],
        },
      },
    ]);
    const version = await applyExtension(workspaceId, plan, "test-agent");

    let view = await getView(workspaceId, "customer", "customer_list");
    expect((view!.config as { filters?: unknown[] }).filters).toHaveLength(2);

    await rollbackExtension(workspaceId, version.extensionId, "test-agent");

    view = await getView(workspaceId, "customer", "customer_list");
    const filters = (view!.config as { filters?: unknown[] }).filters;
    expect(filters).toHaveLength(0);
  });

  it("reverses addSection", async () => {
    const plan = makePlan("Rollback Section", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addSection: {
            title: "Extra Info",
            fields: [{ field: "email" }],
          },
        },
      },
    ]);
    const version = await applyExtension(workspaceId, plan, "test-agent");

    let view = await getView(workspaceId, "customer", "customer_form");
    expect((view!.config as { sections: Array<{ title: string }> }).sections).toHaveLength(2);

    await rollbackExtension(workspaceId, version.extensionId, "test-agent");

    view = await getView(workspaceId, "customer", "customer_form");
    const sections = (view!.config as { sections: Array<{ title: string }> }).sections;
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("基本信息");
  });

  it("reverses addAction", async () => {
    const plan = makePlan("Rollback Action", [
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addAction: "export",
        },
      },
    ]);
    const version = await applyExtension(workspaceId, plan, "test-agent");

    let view = await getView(workspaceId, "customer", "customer_form");
    expect((view!.config as { actions?: string[] }).actions).toContain("export");

    await rollbackExtension(workspaceId, version.extensionId, "test-agent");

    view = await getView(workspaceId, "customer", "customer_form");
    const actions = (view!.config as { actions?: string[] }).actions ?? [];
    expect(actions).not.toContain("export");
  });

  it("reverses pageSize", async () => {
    const plan = makePlan("Rollback PageSize", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          pageSize: 100,
        },
      },
    ]);
    const version = await applyExtension(workspaceId, plan, "test-agent");

    let view = await getView(workspaceId, "customer", "customer_list");
    expect((view!.config as { pageSize?: number }).pageSize).toBe(100);

    await rollbackExtension(workspaceId, version.extensionId, "test-agent");

    view = await getView(workspaceId, "customer", "customer_list");
    expect((view!.config as { pageSize?: number }).pageSize).toBe(20);
  });

  it("reverses all modification types in a combined plan", async () => {
    const plan = makePlan("Rollback All", [
      {
        targetObject: "customer",
        viewKey: "customer_list",
        modifications: {
          reorderColumns: ["phone", "email", "name"],
          addFilters: [{ field: "name", operator: "contains", value: "Acme" }],
          pageSize: 50,
        },
      },
      {
        targetObject: "customer",
        viewKey: "customer_form",
        modifications: {
          addSection: {
            title: "Extra Info",
            fields: [{ field: "email" }],
          },
          addAction: "export",
        },
      },
    ]);

    // Capture original configs before apply
    const originalList = await getView(workspaceId, "customer", "customer_list");
    const originalForm = await getView(workspaceId, "customer", "customer_form");

    const version = await applyExtension(workspaceId, plan, "test-agent");

    // Verify changes applied
    let listView = await getView(workspaceId, "customer", "customer_list");
    expect((listView!.config as { columns: Array<{ field: string }> }).columns.map(c => c.field))
      .toEqual(["phone", "email", "name"]);
    expect((listView!.config as { pageSize?: number }).pageSize).toBe(50);

    let formView = await getView(workspaceId, "customer", "customer_form");
    expect((formView!.config as { sections: Array<{ title: string }> }).sections).toHaveLength(2);

    // Rollback
    await rollbackExtension(workspaceId, version.extensionId, "test-agent");

    // Verify everything restored
    listView = await getView(workspaceId, "customer", "customer_list");
    expect((listView!.config as { columns: Array<{ field: string }> }).columns.map(c => c.field))
      .toEqual((originalList!.config as { columns: Array<{ field: string }> }).columns.map(c => c.field));
    expect((listView!.config as { pageSize?: number }).pageSize)
      .toBe((originalList!.config as { pageSize?: number }).pageSize);

    formView = await getView(workspaceId, "customer", "customer_form");
    const sections = (formView!.config as { sections: Array<{ title: string }> }).sections;
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("基本信息");

    const actions = (formView!.config as { actions?: string[] }).actions ?? [];
    expect(actions).not.toContain("export");
  });
});

// ── Backward Compatibility ──

describe("backward compatibility", () => {
  it("plans without viewModifications still validate and apply", async () => {
    const plan: ExtensionPlan = {
      name: "No View Mods",
      targetModules: ["runory.customer"],
      riskLevel: "low",
      customFields: [
        {
          targetObject: "customer",
          fieldKey: "company_name",
          label: "Company Name",
          type: "text",
          ownership: "workspace_extension",
          required: false,
        },
      ],
    };

    const validation = await validateExtensionPlan(workspaceId, plan);
    expect(validation.valid).toBe(true);

    const version = await applyExtension(workspaceId, plan, "test-agent");
    expect(version.id).toBeDefined();
  });

  it("preview without viewModifications returns empty array", async () => {
    const plan: ExtensionPlan = {
      name: "Empty Preview",
      targetModules: ["runory.customer"],
      riskLevel: "low",
      customFields: [],
    };
    const diff = await previewExtension(workspaceId, plan);
    expect(diff.viewModifications).toEqual([]);
  });
});
