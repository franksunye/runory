import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { loadModuleManifest } from "./installer";
import { MODULES_DIR } from "./contracts";
import {
  parseViewConfig,
  type ViewAction,
  type ModuleManifest,
} from "@runory/contracts";

// ── Tech Spec §14.1: View contract test matrix ──
//
// All modules in the catalog must have view configs that pass the typed
// v1.0 schema after normalization. The four reference surfaces (Company,
// Contact, Work Order, Invoice) from Truth Inventory §8.1 are a subset —
// every other module is held to the same contract.

// ── Discover all non-retired modules dynamically ──

const ALL_MODULES: ModuleManifest[] = readdirSync(MODULES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => loadModuleManifest(entry.name))
  .filter((manifest) => manifest.status !== "retired");

const ALL_VIEWS = ALL_MODULES.flatMap((manifest) =>
  manifest.views.map((view) => ({
    moduleId: manifest.id,
    viewKey: view.key,
    viewType: view.type as "list" | "form",
    objectKey: view.object,
    config: view.config as Record<string, unknown>,
  })),
);

// ── Reference surfaces (Truth Inventory §8.1) ──

const REFERENCE_SURFACE_KEYS = new Set([
  "company_list", "company_form",
  "contact_list", "contact_form",
  "work_order_list", "work_order_form",
  "invoice_list", "invoice_form",
]);

// ── Governed financial objects ──
//
// These objects are managed exclusively through Commands (e.g.,
// invoice.issue_from_work_order, payment.request). Their view configs must
// never expose generic CRUD actions (create, update, delete) that would
// bypass the governed command pipeline.

const GOVERNED_FINANCIAL_MODULES = new Set([
  "runory.invoice",
  "runory.payment",
]);

/** Actions that trigger generic CRUD mutations and must never appear on
 *  governed financial object views. */
const GENERIC_MUTATION_ACTIONS = new Set(["create", "update", "delete", "edit"]);

// ── Tests: every module view passes typed v1.0 schema ──

describe("all catalog views — typed View contract v1.0 (Tech Spec §14.1)", () => {
  // Sanity: we actually found modules
  it("discovers a non-trivial number of modules", () => {
    expect(ALL_MODULES.length).toBeGreaterThanOrEqual(30);
  });

  it("discovers a non-trivial number of views", () => {
    expect(ALL_VIEWS.length).toBeGreaterThanOrEqual(70);
  });

  for (const view of ALL_VIEWS) {
    describe(`${view.moduleId} / ${view.viewKey} (${view.viewType})`, () => {
      it("parses successfully through the typed v1.0 schema", () => {
        const result = parseViewConfig(view.config, view.viewKey, view.viewType);
        expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
      });

      it("has schemaVersion 1.0 after normalization", () => {
        const result = parseViewConfig(view.config, view.viewKey, view.viewType);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.config.schemaVersion).toBe("1.0");
        }
      });

      if (view.viewType === "list") {
        it("has at least one column", () => {
          const result = parseViewConfig(view.config, view.viewKey, "list");
          expect(result.ok).toBe(true);
          if (result.ok) {
            const listConfig = result.config as { columns: unknown[] };
            expect(listConfig.columns.length).toBeGreaterThanOrEqual(1);
          }
        });

        it("has a valid pageSize in the allowed set", () => {
          const result = parseViewConfig(view.config, view.viewKey, "list");
          expect(result.ok).toBe(true);
          if (result.ok) {
            const listConfig = result.config as { pageSize: number };
            expect([10, 20, 50, 100]).toContain(listConfig.pageSize);
          }
        });

        it("has typed ViewAction[] (not string actions) after normalization", () => {
          const result = parseViewConfig(view.config, view.viewKey, "list");
          expect(result.ok).toBe(true);
          if (result.ok) {
            const listConfig = result.config as { actions: ViewAction[] };
            for (const action of listConfig.actions) {
              expect(typeof action).toBe("object");
              expect(action.key).toBeTruthy();
              expect(["navigate", "command"]).toContain(action.kind);
            }
          }
        });
      }

      if (view.viewType === "form") {
        it("has at least one section with a key", () => {
          const result = parseViewConfig(view.config, view.viewKey, "form");
          expect(result.ok).toBe(true);
          if (result.ok) {
            const formConfig = result.config as {
              sections: Array<{ key: string; title: string; fields: unknown[] }>;
            };
            expect(formConfig.sections.length).toBeGreaterThanOrEqual(1);
            for (const section of formConfig.sections) {
              expect(section.key).toBeTruthy();
              expect(section.title).toBeTruthy();
            }
          }
        });

        it("has at least one field per section", () => {
          const result = parseViewConfig(view.config, view.viewKey, "form");
          expect(result.ok).toBe(true);
          if (result.ok) {
            const formConfig = result.config as {
              sections: Array<{ fields: unknown[] }>;
            };
            for (const section of formConfig.sections) {
              expect(section.fields.length).toBeGreaterThanOrEqual(1);
            }
          }
        });
      }
    });
  }
});

// ── Tests: governed financial objects ──

describe("governed financial objects — no generic mutation actions (Tech Spec §14.1)", () => {
  for (const view of ALL_VIEWS) {
    if (!GOVERNED_FINANCIAL_MODULES.has(view.moduleId)) continue;

    it(`${view.moduleId} / ${view.viewKey} has no generic CRUD actions`, () => {
      const result = parseViewConfig(view.config, view.viewKey, view.viewType);
      expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
      if (result.ok) {
        const actions = (result.config as { actions: ViewAction[] }).actions;
        const mutationActions = actions.filter((a) =>
          GENERIC_MUTATION_ACTIONS.has(a.key),
        );
        expect(
          mutationActions,
          `${view.moduleId}/${view.viewKey} must not expose generic mutation actions: ` +
            mutationActions.map((a) => a.key).join(", "),
        ).toEqual([]);
      }
    });
  }

  it("invoice list view only exposes view action", () => {
    const manifest = ALL_MODULES.find((m) => m.id === "runory.invoice");
    expect(manifest).toBeDefined();
    const listView = manifest!.views.find((v) => v.type === "list");
    expect(listView).toBeDefined();
    const result = parseViewConfig(
      listView!.config as Record<string, unknown>,
      listView!.key,
      "list",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const actions = (result.config as { actions: ViewAction[] }).actions;
      expect(actions.map((a) => a.key)).toEqual(["view"]);
    }
  });

  it("payment_request list view only exposes view action", () => {
    const manifest = ALL_MODULES.find((m) => m.id === "runory.payment");
    expect(manifest).toBeDefined();
    const listView = manifest!.views.find((v) => v.type === "list");
    expect(listView).toBeDefined();
    const result = parseViewConfig(
      listView!.config as Record<string, unknown>,
      listView!.key,
      "list",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const actions = (result.config as { actions: ViewAction[] }).actions;
      expect(actions.map((a) => a.key)).toEqual(["view"]);
    }
  });
});

// ── Tests: reference surfaces are a subset of all views ──

describe("reference surfaces (Truth Inventory §8.1)", () => {
  it("all 8 reference surface views exist in the catalog", () => {
    const allViewKeys = new Set(ALL_VIEWS.map((v) => v.viewKey));
    for (const key of REFERENCE_SURFACE_KEYS) {
      expect(allViewKeys.has(key), `Missing reference surface: ${key}`).toBe(true);
    }
  });

  it("company list exposes create and view actions", () => {
    const view = ALL_VIEWS.find((v) => v.viewKey === "company_list");
    expect(view).toBeDefined();
    const result = parseViewConfig(view!.config, view!.viewKey, "list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const actions = (result.config as { actions: ViewAction[] }).actions;
      const actionKeys = actions.map((a) => a.key);
      expect(actionKeys).toContain("create");
      expect(actionKeys).toContain("view");
    }
  });

  it("work_order list exposes create and view actions", () => {
    const view = ALL_VIEWS.find((v) => v.viewKey === "work_order_list");
    expect(view).toBeDefined();
    const result = parseViewConfig(view!.config, view!.viewKey, "list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const actions = (result.config as { actions: ViewAction[] }).actions;
      const actionKeys = actions.map((a) => a.key);
      expect(actionKeys).toContain("create");
      expect(actionKeys).toContain("view");
    }
  });
});
