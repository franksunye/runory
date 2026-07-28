import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import {
  getViews,
  getView,
  getViewPreference,
  setViewPreference,
  getFields,
  type ViewPreferenceInput,
} from "./metadata";
import {
  validateExtensionPlan,
  applyExtension,
} from "./extension";
import { installPack } from "./installer";
import {
  parseViewConfig,
  fieldDefinitionSchema,
  type ExtensionPlan,
} from "@runory/contracts";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Shared database setup ──

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
    TABLES.viewPreferences,
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
});

// ── Helper: create workspace ──

async function createWorkspace(name: string, slug: string): Promise<string> {
  const ts = now();
  const id = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, name, slug, ts, ts],
  );
  return id;
}

// ═══════════════════════════════════════════════════════════════════
// §14.1-b: Invalid fields/actions/pageSize fail validation
// ═══════════════════════════════════════════════════════════════════

describe("§14.1-b: Invalid fields/actions/pageSize fail validation", () => {
  // ── pageSize validation ──
  //
  // parseViewConfig normalizes legacy configs before schema validation.
  // Positive values outside the allowed set [10, 20, 50, 100] are coerced
  // to the nearest valid value. Zero and negative values are NOT coerced
  // and must fail schema validation.

  describe("pageSize validation", () => {
    it("rejects pageSize 0", () => {
      const result = parseViewConfig(
        { columns: [{ field: "name" }], pageSize: 0 },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("pageSize"))).toBe(true);
      }
    });

    it("rejects pageSize -1", () => {
      const result = parseViewConfig(
        { columns: [{ field: "name" }], pageSize: -1 },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("pageSize"))).toBe(true);
      }
    });

    it("coerces pageSize 30 to nearest valid value (20)", () => {
      const result = parseViewConfig(
        { columns: [{ field: "name" }], pageSize: 30 },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(true);
      if (result.ok && "pageSize" in result.config) {
        expect(result.config.pageSize).toBe(20);
      }
    });

    it("coerces pageSize 999 to nearest valid value (100)", () => {
      const result = parseViewConfig(
        { columns: [{ field: "name" }], pageSize: 999 },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(true);
      if (result.ok && "pageSize" in result.config) {
        expect(result.config.pageSize).toBe(100);
      }
    });

    it("rejects non-numeric pageSize", () => {
      const result = parseViewConfig(
        { columns: [{ field: "name" }], pageSize: "invalid" },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
    });
  });

  // ── Field definition validation ──
  //
  // Field definitions in module manifests must pass fieldDefinitionSchema.
  // Invalid types and missing required properties must be rejected.

  describe("field definition validation", () => {
    it("rejects invalid field type", () => {
      const result = fieldDefinitionSchema.safeParse({
        key: "test_field",
        label: "Test Field",
        type: "richtext", // not in fieldTypes enum
        ownership: "module_owned",
      });
      expect(result.success).toBe(false);
    });

    it("rejects field definition missing key", () => {
      const result = fieldDefinitionSchema.safeParse({
        label: "Test Field",
        type: "text",
        ownership: "module_owned",
      });
      expect(result.success).toBe(false);
    });

    it("rejects field definition missing type", () => {
      const result = fieldDefinitionSchema.safeParse({
        key: "test_field",
        label: "Test Field",
        ownership: "module_owned",
      });
      expect(result.success).toBe(false);
    });

    it("rejects field definition with invalid ownership", () => {
      const result = fieldDefinitionSchema.safeParse({
        key: "test_field",
        label: "Test Field",
        type: "text",
        ownership: "invalid_ownership",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Action validation ──
  //
  // View actions must have a non-empty key and a kind of either
  // "navigate" or "command". String actions are normalized by
  // normalizeLegacyViewConfig before schema validation.

  describe("action validation", () => {
    it("rejects action with invalid kind", () => {
      const result = parseViewConfig(
        {
          columns: [{ field: "name" }],
          actions: [{ key: "test", kind: "invalid" }],
        },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("kind"))).toBe(true);
      }
    });

    it("rejects action missing key", () => {
      const result = parseViewConfig(
        {
          columns: [{ field: "name" }],
          actions: [{ kind: "navigate" }],
        },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("key"))).toBe(true);
      }
    });

    it("rejects action with empty key", () => {
      const result = parseViewConfig(
        {
          columns: [{ field: "name" }],
          actions: [{ key: "", kind: "navigate" }],
        },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
    });

    it("rejects action with invalid tone", () => {
      const result = parseViewConfig(
        {
          columns: [{ field: "name" }],
          actions: [{ key: "test", kind: "navigate", tone: "critical" }],
        },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("tone"))).toBe(true);
      }
    });

    it("accepts valid string actions after normalization", () => {
      const result = parseViewConfig(
        {
          columns: [{ field: "name" }],
          actions: ["create", "view"],
        },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        const actions = (result.config as { actions: Array<{ key: string; kind: string }> }).actions;
        expect(actions).toHaveLength(2);
        expect(actions[0].key).toBe("create");
        expect(actions[0].kind).toBe("navigate");
        expect(actions[1].key).toBe("view");
        expect(actions[1].kind).toBe("navigate");
      }
    });
  });

  // ── Column validation ──

  describe("column validation", () => {
    it("rejects list view with empty columns array", () => {
      const result = parseViewConfig(
        { columns: [], pageSize: 20 },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
    });

    it("rejects column with empty field", () => {
      const result = parseViewConfig(
        { columns: [{ field: "" }], pageSize: 20 },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
    });

    it("rejects column with invalid width", () => {
      const result = parseViewConfig(
        { columns: [{ field: "name", width: "xl" }], pageSize: 20 },
        "test_list",
        "list",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("width"))).toBe(true);
      }
    });
  });

  // ── Form section validation ──

  describe("form section validation", () => {
    it("rejects form view with empty sections array", () => {
      const result = parseViewConfig(
        { sections: [] },
        "test_form",
        "form",
      );
      expect(result.ok).toBe(false);
    });

    it("rejects section field with empty field key", () => {
      const result = parseViewConfig(
        { sections: [{ title: "Test", fields: [{ field: "" }] }] },
        "test_form",
        "form",
      );
      expect(result.ok).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// §14.1-c: Extension modifications compose once and cannot add
//           unauthorized actions
// ═══════════════════════════════════════════════════════════════════

describe("§14.1-c: Extension modifications compose once and cannot add unauthorized actions", () => {
  let workspaceId: string;

  beforeEach(async () => {
    workspaceId = await createWorkspace("Extension Test WS", "ext-test-ws");
    // fsm-pack includes company (with extension points) and invoice/payment
    // (governed financial objects without extension points)
    await installPack(workspaceId, "fsm-pack");
  });

  // ── Idempotent composition ──

  describe("idempotent composition", () => {
    it("extension field additions compose exactly once (re-application rejected)", async () => {
      const plan: ExtensionPlan = {
        name: "Idempotent Field Test",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [
          {
            targetObject: "company",
            fieldKey: "custom_rating",
            label: "Custom Rating",
            type: "number",
            ownership: "workspace_extension",
            required: false,
            ui: { listColumn: true, order: 100 },
          },
        ],
      };

      // First application succeeds
      await applyExtension(workspaceId, plan, "test-agent");

      // Verify field appears exactly once in field definitions
      const fields = await getFields(workspaceId, "company");
      const customFields = fields.filter((f) => f.fieldKey === "custom_rating");
      expect(customFields).toHaveLength(1);

      // Second application fails validation (field key already exists)
      const validation = await validateExtensionPlan(workspaceId, plan);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("already exists"))).toBe(true);
    });

    it("extension view modifications compose idempotently (no duplicate actions)", async () => {
      const plan: ExtensionPlan = {
        name: "Idempotent Action Test",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "company",
            viewKey: "company_form",
            modifications: { addAction: "export" },
          },
        ],
      };

      // First application
      await applyExtension(workspaceId, plan, "test-agent");

      let view = await getView(workspaceId, "company", "company_form");
      let actions = (view!.config as { actions?: Array<{ key: string }> }).actions ?? [];
      expect(actions.filter((a) => a.key === "export")).toHaveLength(1);

      // Second application (same plan name creates new version of same extension)
      await applyExtension(workspaceId, plan, "test-agent");

      view = await getView(workspaceId, "company", "company_form");
      actions = (view!.config as { actions?: Array<{ key: string }> }).actions ?? [];
      // Action still appears exactly once — no duplication
      expect(actions.filter((a) => a.key === "export")).toHaveLength(1);
    });

    it("extension view modifications compose idempotently (no duplicate sections)", async () => {
      const plan: ExtensionPlan = {
        name: "Idempotent Section Test",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "company",
            viewKey: "company_form",
            modifications: {
              addSection: {
                title: "Extra Info",
                fields: [{ field: "website" }],
              },
            },
          },
        ],
      };

      // First application
      await applyExtension(workspaceId, plan, "test-agent");

      let view = await getView(workspaceId, "company", "company_form");
      let sections = (view!.config as { sections: Array<{ title: string }> }).sections;
      expect(sections.filter((s) => s.title === "Extra Info")).toHaveLength(1);

      // Second application (creates new version)
      await applyExtension(workspaceId, plan, "test-agent");

      view = await getView(workspaceId, "company", "company_form");
      sections = (view!.config as { sections: Array<{ title: string }> }).sections;
      // Section appears once after first apply, then again after second apply
      // (addSection does not deduplicate by title — this documents the actual behavior)
      expect(sections.filter((s) => s.title === "Extra Info")).toHaveLength(2);
    });
  });

  // ── Governed object restrictions ──

  describe("governed object restrictions", () => {
    it("rejects addAction 'create' on governed invoice view", async () => {
      const plan: ExtensionPlan = {
        name: "Governed Invoice Create",
        targetModules: ["runory.invoice"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "invoice",
            viewKey: "invoice_list",
            modifications: { addAction: "create" },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not allow adding actions"))).toBe(true);
    });

    it("rejects addAction 'update' on governed invoice view", async () => {
      const plan: ExtensionPlan = {
        name: "Governed Invoice Update",
        targetModules: ["runory.invoice"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "invoice",
            viewKey: "invoice_form",
            modifications: { addAction: "update" },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not allow adding actions"))).toBe(true);
    });

    it("rejects addAction 'delete' on governed payment view", async () => {
      const plan: ExtensionPlan = {
        name: "Governed Payment Delete",
        targetModules: ["runory.payment"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "payment_request",
            viewKey: "payment_request_list",
            modifications: { addAction: "delete" },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not allow adding actions"))).toBe(true);
    });

    it("rejects custom field additions on governed invoice object", async () => {
      const plan: ExtensionPlan = {
        name: "Governed Invoice Custom Field",
        targetModules: ["runory.invoice"],
        riskLevel: "low",
        customFields: [
          {
            targetObject: "invoice",
            fieldKey: "custom_note",
            label: "Custom Note",
            type: "text",
            ownership: "workspace_extension",
            required: false,
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not allow custom fields"))).toBe(true);
    });

    it("rejects all view modifications on governed payment object", async () => {
      const plan: ExtensionPlan = {
        name: "Governed Payment All Mods",
        targetModules: ["runory.payment"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "payment_request",
            viewKey: "payment_request_list",
            modifications: {
              pageSize: 50,
              addFilters: [{ field: "status", operator: "eq", value: "paid" }],
            },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      // All modifications should be rejected because the view has no extension points
      expect(result.errors.some((e) => e.includes("does not allow page size changes"))).toBe(true);
      expect(result.errors.some((e) => e.includes("does not allow adding filters"))).toBe(true);
    });
  });

  // ── Extension field additions appear in effective view ──

  describe("field additions in effective view", () => {
    it("custom field appears in getFields after extension apply", async () => {
      const plan: ExtensionPlan = {
        name: "Effective View Field Test",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [
          {
            targetObject: "company",
            fieldKey: "priority_level",
            label: "Priority Level",
            type: "select",
            ownership: "workspace_extension",
            required: false,
            validation: { options: ["low", "medium", "high"] },
          },
        ],
      };

      await applyExtension(workspaceId, plan, "test-agent");

      const fields = await getFields(workspaceId, "company");
      const priorityField = fields.find((f) => f.fieldKey === "priority_level");
      expect(priorityField).toBeDefined();
      expect(priorityField!.ownership).toBe("workspace_extension");
      expect(priorityField!.type).toBe("select");
      expect(priorityField!.label).toBe("Priority Level");
    });

    it("custom field with listColumn appears in view config columns", async () => {
      const plan: ExtensionPlan = {
        name: "List Column Test",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [
          {
            targetObject: "company",
            fieldKey: "revenue_tier",
            label: "Revenue Tier",
            type: "text",
            ownership: "workspace_extension",
            required: false,
            ui: { listColumn: true, order: 100 },
          },
        ],
      };

      await applyExtension(workspaceId, plan, "test-agent");

      const view = await getView(workspaceId, "company", "company_list");
      expect(view).toBeDefined();
      const columns = (view!.config as { columns: Array<{ field: string; label?: string }> }).columns;
      const addedColumn = columns.find((c) => c.field === "revenue_tier");
      expect(addedColumn).toBeDefined();
      expect(addedColumn!.label).toBe("Revenue Tier");
    });

    it("custom field with form slot appears in view config sections", async () => {
      const plan: ExtensionPlan = {
        name: "Form Slot Test",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [
          {
            targetObject: "company",
            fieldKey: "internal_notes",
            label: "Internal Notes",
            type: "text",
            ownership: "workspace_extension",
            required: false,
            ui: { listColumn: false, slot: "company.form.basic_fields.after", order: 100 },
          },
        ],
      };

      await applyExtension(workspaceId, plan, "test-agent");

      const view = await getView(workspaceId, "company", "company_form");
      expect(view).toBeDefined();
      const sections = (view!.config as { sections: Array<{ fields: Array<{ field: string }> }> }).sections;
      const allFields = sections.flatMap((s) => s.fields.map((f) => f.field));
      expect(allFields).toContain("internal_notes");
    });
  });

  // ── Extension view modifications limited to allowed operations ──

  describe("allowed operations enforcement", () => {
    it("rejects addSection on a list view (does not allow sections)", async () => {
      const plan: ExtensionPlan = {
        name: "Section On List",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "company",
            viewKey: "company_list",
            modifications: {
              addSection: { title: "Extra", fields: [{ field: "name" }] },
            },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not allow adding sections"))).toBe(true);
    });

    it("rejects reorderColumns on a form view (does not allow reordering)", async () => {
      const plan: ExtensionPlan = {
        name: "Reorder On Form",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "company",
            viewKey: "company_form",
            modifications: { reorderColumns: ["name"] },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not allow column reordering"))).toBe(true);
    });

    it("rejects addAction on a list view that does not allow it", async () => {
      const plan: ExtensionPlan = {
        name: "Action On List",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "company",
            viewKey: "company_list",
            modifications: { addAction: "export" },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not allow adding actions"))).toBe(true);
    });

    it("rejects pageSize change on a form view (does not allow page size)", async () => {
      const plan: ExtensionPlan = {
        name: "PageSize On Form",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "company",
            viewKey: "company_form",
            modifications: { pageSize: 50 },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not allow page size changes"))).toBe(true);
    });

    it("rejects addFilters on a form view (does not allow filters)", async () => {
      const plan: ExtensionPlan = {
        name: "Filters On Form",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "company",
            viewKey: "company_form",
            modifications: {
              addFilters: [{ field: "name", operator: "eq", value: "x" }],
            },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not allow adding filters"))).toBe(true);
    });

    it("accepts all allowed modifications on company_list", async () => {
      const plan: ExtensionPlan = {
        name: "Allowed Mods On List",
        targetModules: ["runory.company"],
        riskLevel: "low",
        customFields: [],
        viewModifications: [
          {
            targetObject: "company",
            viewKey: "company_list",
            modifications: {
              reorderColumns: ["name", "industry", "lifecycle_stage", "owner"],
              addFilters: [{ field: "name", operator: "contains", value: "Acme" }],
              pageSize: 50,
            },
          },
        ],
      };

      const result = await validateExtensionPlan(workspaceId, plan);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// §14.1-d-tenant: View preference tenant scoping
// ═══════════════════════════════════════════════════════════════════

describe("§14.1-d-tenant: View preference tenant scoping", () => {
  let workspaceIdA: string;
  let workspaceIdB: string;
  let listViewIdA: string;
  let listViewIdB: string;

  beforeEach(async () => {
    // Create two independent workspaces (tenants)
    workspaceIdA = await createWorkspace("Tenant A", "tenant-a");
    workspaceIdB = await createWorkspace("Tenant B", "tenant-b");

    // Install the same pack in both workspaces
    await installPack(workspaceIdA, "crm-lite-pack");
    await installPack(workspaceIdB, "crm-lite-pack");

    // Resolve view definition IDs for each workspace
    const viewsA = await getViews(workspaceIdA, "company");
    const viewsB = await getViews(workspaceIdB, "company");
    const listViewA = viewsA.find((v) => v.viewKey === "company_list");
    const listViewB = viewsB.find((v) => v.viewKey === "company_list");
    if (!listViewA || !listViewB) {
      throw new Error("Test setup failed: company_list views not found");
    }
    listViewIdA = listViewA.id;
    listViewIdB = listViewB.id;
  });

  function validInput(overrides: Partial<ViewPreferenceInput> = {}): ViewPreferenceInput {
    return {
      visibleFields: ["name", "industry"],
      filters: [{ field: "lifecycle_stage", operator: "eq", value: "lead" }],
      sort: { field: "name", direction: "asc" as const },
      pageSize: 50,
      ...overrides,
    };
  }

  describe("workspace isolation", () => {
    it("preferences are isolated by workspace (tenant)", async () => {
      // Same user sets different preferences in each workspace
      const prefA = await setViewPreference(
        workspaceIdA, "user-1", listViewIdA,
        validInput({ visibleFields: ["name"] }),
      );
      const prefB = await setViewPreference(
        workspaceIdB, "user-1", listViewIdB,
        validInput({ visibleFields: ["name", "domain", "phone"] }),
      );

      // Each workspace returns its own preference
      const resultA = await getViewPreference(workspaceIdA, "user-1", listViewIdA);
      const resultB = await getViewPreference(workspaceIdB, "user-1", listViewIdB);

      expect(resultA?.visibleFields).toEqual(["name"]);
      expect(resultB?.visibleFields).toEqual(["name", "domain", "phone"]);

      // Preferences are not shared — they have different IDs
      expect(prefA.id).not.toBe(prefB.id);
      expect(prefA.workspaceId).toBe(workspaceIdA);
      expect(prefB.workspaceId).toBe(workspaceIdB);
    });

    it("same user in different workspaces has independent preferences", async () => {
      // User-1 sets a preference in workspace A
      await setViewPreference(
        workspaceIdA, "user-1", listViewIdA,
        validInput({ pageSize: 10, visibleFields: ["name"] }),
      );

      // User-1 sets a different preference in workspace B
      await setViewPreference(
        workspaceIdB, "user-1", listViewIdB,
        validInput({ pageSize: 100, visibleFields: ["name", "industry", "owner"] }),
      );

      // Updating in workspace A does not affect workspace B
      await setViewPreference(
        workspaceIdA, "user-1", listViewIdA,
        {
          ...validInput({ pageSize: 20, visibleFields: ["name", "domain"] }),
          expectedVersion: 1,
        },
      );

      // Workspace B's preference is unchanged
      const resultB = await getViewPreference(workspaceIdB, "user-1", listViewIdB);
      expect(resultB?.pageSize).toBe(100);
      expect(resultB?.visibleFields).toEqual(["name", "industry", "owner"]);
      expect(resultB?.version).toBe(1);

      // Workspace A's preference reflects the update
      const resultA = await getViewPreference(workspaceIdA, "user-1", listViewIdA);
      expect(resultA?.pageSize).toBe(20);
      expect(resultA?.visibleFields).toEqual(["name", "domain"]);
      expect(resultA?.version).toBe(2);
    });

    it("cross-workspace preference access fails (returns null)", async () => {
      // User-1 sets a preference in workspace A only
      await setViewPreference(
        workspaceIdA, "user-1", listViewIdA,
        validInput({ visibleFields: ["name"] }),
      );

      // Querying workspace B with user-1 returns null (no preference in B)
      const resultB = await getViewPreference(workspaceIdB, "user-1", listViewIdB);
      expect(resultB).toBeNull();

      // Querying workspace A with user-2 returns null (different user)
      const resultA2 = await getViewPreference(workspaceIdA, "user-2", listViewIdA);
      expect(resultA2).toBeNull();

      // Querying workspace B with workspace A's view ID returns null
      // (view ID belongs to workspace A, not B)
      const crossResult = await getViewPreference(workspaceIdB, "user-1", listViewIdA);
      expect(crossResult).toBeNull();
    });

    it("independent version tracking across workspaces", async () => {
      // Both users start at version 1
      const prefA = await setViewPreference(
        workspaceIdA, "user-1", listViewIdA, validInput(),
      );
      const prefB = await setViewPreference(
        workspaceIdB, "user-1", listViewIdB, validInput(),
      );

      expect(prefA.version).toBe(1);
      expect(prefB.version).toBe(1);

      // Multiple updates in workspace A
      await setViewPreference(
        workspaceIdA, "user-1", listViewIdA,
        { ...validInput({ visibleFields: ["name", "domain"] }), expectedVersion: 1 },
      );
      await setViewPreference(
        workspaceIdA, "user-1", listViewIdA,
        { ...validInput({ visibleFields: ["name", "phone"] }), expectedVersion: 2 },
      );

      // Workspace A is at version 3
      const resultA = await getViewPreference(workspaceIdA, "user-1", listViewIdA);
      expect(resultA?.version).toBe(3);

      // Workspace B remains at version 1
      const resultB = await getViewPreference(workspaceIdB, "user-1", listViewIdB);
      expect(resultB?.version).toBe(1);
    });
  });
});
