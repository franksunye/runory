import { describe, it, expect } from "vitest";
import { loadModuleManifest } from "./installer";
import {
  parseViewConfig,
  type ViewAction,
} from "@runory/contracts";

// ── Tech Spec §14.1: View contract test matrix ──
//
// Covers:
// - Company/Contact, Work Order, and Invoice render from effective definitions
// - governed financial objects never receive generic mutation actions

// ── Reference surface fixtures (Truth Inventory §8.1) ──

interface ReferenceSurface {
  moduleId: string;
  objectKey: string;
  viewKey: string;
  viewType: "list" | "form";
}

const REFERENCE_SURFACES: ReferenceSurface[] = [
  { moduleId: "runory.company", objectKey: "company", viewKey: "company_list", viewType: "list" },
  { moduleId: "runory.company", objectKey: "company", viewKey: "company_form", viewType: "form" },
  { moduleId: "runory.contact", objectKey: "contact", viewKey: "contact_list", viewType: "list" },
  { moduleId: "runory.contact", objectKey: "contact", viewKey: "contact_form", viewType: "form" },
  { moduleId: "runory.work-order", objectKey: "work_order", viewKey: "work_order_list", viewType: "list" },
  { moduleId: "runory.work-order", objectKey: "work_order", viewKey: "work_order_form", viewType: "form" },
  { moduleId: "runory.invoice", objectKey: "invoice", viewKey: "invoice_list", viewType: "list" },
  { moduleId: "runory.invoice", objectKey: "invoice", viewKey: "invoice_form", viewType: "form" },
];

// ── Governed financial objects ──
//
// These objects are managed exclusively through Commands (e.g.,
// invoice.issue_from_work_order, payment.request). Their view configs must
// never expose generic CRUD actions (create, update, delete) that would
// bypass the governed command pipeline.

const GOVERNED_FINANCIAL_MODULES = [
  "runory.invoice",
  "runory.payment",
];

/** Actions that trigger generic CRUD mutations and must never appear on
 *  governed financial object views. */
const GENERIC_MUTATION_ACTIONS = new Set(["create", "update", "delete", "edit"]);

// ── Helpers ──

function getViewsFromManifest(moduleId: string) {
  const manifest = loadModuleManifest(moduleId);
  return manifest.views;
}

function getViewConfig(moduleId: string, viewKey: string) {
  const views = getViewsFromManifest(moduleId);
  const view = views.find((v) => v.key === viewKey);
  if (!view) throw new Error(`View ${viewKey} not found in ${moduleId}`);
  return { view, config: view.config as Record<string, unknown> };
}

// ── Tests ──

describe("reference surfaces — typed View contract (Tech Spec §14.1)", () => {
  for (const surface of REFERENCE_SURFACES) {
    describe(`${surface.moduleId} / ${surface.viewKey} (${surface.viewType})`, () => {
      it("parses successfully through the typed v1.0 schema", () => {
        const { config } = getViewConfig(surface.moduleId, surface.viewKey);
        const result = parseViewConfig(config, surface.viewKey, surface.viewType);
        expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
      });

      it("has schemaVersion 1.0 after normalization", () => {
        const { config } = getViewConfig(surface.moduleId, surface.viewKey);
        const result = parseViewConfig(config, surface.viewKey, surface.viewType);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.config.schemaVersion).toBe("1.0");
        }
      });

      if (surface.viewType === "list") {
        it("has at least one column", () => {
          const { config } = getViewConfig(surface.moduleId, surface.viewKey);
          const result = parseViewConfig(config, surface.viewKey, "list");
          expect(result.ok).toBe(true);
          if (result.ok) {
            const listConfig = result.config as { columns: unknown[] };
            expect(listConfig.columns.length).toBeGreaterThanOrEqual(1);
          }
        });

        it("has a valid pageSize in the allowed set", () => {
          const { config } = getViewConfig(surface.moduleId, surface.viewKey);
          const result = parseViewConfig(config, surface.viewKey, "list");
          expect(result.ok).toBe(true);
          if (result.ok) {
            const listConfig = result.config as { pageSize: number };
            expect([10, 20, 50, 100]).toContain(listConfig.pageSize);
          }
        });

        it("has typed ViewAction[] (not string actions) after normalization", () => {
          const { config } = getViewConfig(surface.moduleId, surface.viewKey);
          const result = parseViewConfig(config, surface.viewKey, "list");
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

      if (surface.viewType === "form") {
        it("has at least one section with a key", () => {
          const { config } = getViewConfig(surface.moduleId, surface.viewKey);
          const result = parseViewConfig(config, surface.viewKey, "form");
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
          const { config } = getViewConfig(surface.moduleId, surface.viewKey);
          const result = parseViewConfig(config, surface.viewKey, "form");
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

describe("governed financial objects — no generic mutation actions (Tech Spec §14.1)", () => {
  for (const moduleId of GOVERNED_FINANCIAL_MODULES) {
    describe(moduleId, () => {
      const manifest = loadModuleManifest(moduleId);

      for (const view of manifest.views) {
        it(`${view.key} has no generic CRUD actions (create/update/delete/edit)`, () => {
          const config = view.config as Record<string, unknown>;
          const result = parseViewConfig(config, view.key, view.type);
          expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
          if (result.ok) {
            const actions = (result.config as { actions: ViewAction[] }).actions;
            const mutationActions = actions.filter((a) =>
              GENERIC_MUTATION_ACTIONS.has(a.key),
            );
            expect(
              mutationActions,
              `${moduleId}/${view.key} must not expose generic mutation actions: ` +
                mutationActions.map((a) => a.key).join(", "),
            ).toEqual([]);
          }
        });
      }
    });
  }

  it("invoice list view only exposes view action", () => {
    const manifest = loadModuleManifest("runory.invoice");
    const listView = manifest.views.find((v) => v.type === "list");
    expect(listView).toBeDefined();
    const config = listView!.config as Record<string, unknown>;
    const result = parseViewConfig(config, listView!.key, "list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const actions = (result.config as { actions: ViewAction[] }).actions;
      const actionKeys = actions.map((a) => a.key);
      expect(actionKeys).toEqual(["view"]);
    }
  });

  it("payment_request list view only exposes view action", () => {
    const manifest = loadModuleManifest("runory.payment");
    const listView = manifest.views.find((v) => v.type === "list");
    expect(listView).toBeDefined();
    const config = listView!.config as Record<string, unknown>;
    const result = parseViewConfig(config, listView!.key, "list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const actions = (result.config as { actions: ViewAction[] }).actions;
      const actionKeys = actions.map((a) => a.key);
      expect(actionKeys).toEqual(["view"]);
    }
  });
});

describe("non-governed reference surfaces — CRUD actions allowed", () => {
  it("company list exposes create and view actions", () => {
    const { config } = getViewConfig("runory.company", "company_list");
    const result = parseViewConfig(config, "company_list", "list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const actions = (result.config as { actions: ViewAction[] }).actions;
      const actionKeys = actions.map((a) => a.key);
      expect(actionKeys).toContain("create");
      expect(actionKeys).toContain("view");
    }
  });

  it("work_order list exposes create and view actions", () => {
    const { config } = getViewConfig("runory.work-order", "work_order_list");
    const result = parseViewConfig(config, "work_order_list", "list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const actions = (result.config as { actions: ViewAction[] }).actions;
      const actionKeys = actions.map((a) => a.key);
      expect(actionKeys).toContain("create");
      expect(actionKeys).toContain("view");
    }
  });
});
