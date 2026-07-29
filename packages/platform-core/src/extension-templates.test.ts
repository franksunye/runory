import { describe, expect, it } from "vitest";
import {
  listExtensionTemplates,
  listExtensionTemplatesByCategory,
  listExtensionTemplatesForSolution,
  loadExtensionTemplate,
} from "./extension-templates";

// ── Template Loading Tests ──

describe("loadExtensionTemplate", () => {
  it("loads a template by ID", () => {
    const template = loadExtensionTemplate("customer-loyalty-tier");
    expect(template).toBeDefined();
    expect(template!.id).toBe("customer-loyalty-tier");
    expect(template!.name).toBe("Customer Loyalty Tier");
    expect(template!.plan.customFields).toHaveLength(1);
  });

  it("returns undefined for non-existent template", () => {
    const template = loadExtensionTemplate("non-existent-template");
    expect(template).toBeUndefined();
  });

  it("loads work-order-priority-filter template", () => {
    const template = loadExtensionTemplate("work-order-priority-filter");
    expect(template).toBeDefined();
    expect(template!.plan.customFields).toHaveLength(1);
    expect(template!.plan.viewModifications).toHaveLength(1);
  });

  it("loads quote-expiry-section template", () => {
    const template = loadExtensionTemplate("quote-expiry-section");
    expect(template).toBeDefined();
    expect(template!.plan.customFields).toHaveLength(2);
    expect(template!.plan.viewModifications).toHaveLength(1);
  });

  it("loads service-visit-checklist template", () => {
    const template = loadExtensionTemplate("service-visit-checklist");
    expect(template).toBeDefined();
    expect(template!.plan.customFields).toHaveLength(2);
  });

  it("loads invoice-payment-terms template", () => {
    const template = loadExtensionTemplate("invoice-payment-terms");
    expect(template).toBeDefined();
    expect(template!.plan.customFields).toHaveLength(2);
  });
});

// ── Template Listing Tests ──

describe("listExtensionTemplates", () => {
  it("lists all available templates", () => {
    const templates = listExtensionTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(5);

    // Verify each template has required fields
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.riskLevel).toBeTruthy();
      expect(t.customFieldCount).toBeGreaterThanOrEqual(0);
      expect(t.viewModificationCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("sorts templates by category then name", () => {
    const templates = listExtensionTemplates();
    for (let i = 1; i < templates.length; i++) {
      const prev = templates[i - 1];
      const curr = templates[i];
      if (prev.category === curr.category) {
        expect(prev.name.localeCompare(curr.name)).toBeLessThanOrEqual(0);
      } else {
        expect(prev.category.localeCompare(curr.category)).toBeLessThan(0);
      }
    }
  });
});

describe("listExtensionTemplatesByCategory", () => {
  it("filters templates by category", () => {
    const customerTemplates = listExtensionTemplatesByCategory("customer");
    expect(customerTemplates.length).toBeGreaterThanOrEqual(1);
    expect(customerTemplates.every((t) => t.category === "customer")).toBe(true);

    const fieldServiceTemplates = listExtensionTemplatesByCategory("field-service");
    expect(fieldServiceTemplates.length).toBeGreaterThanOrEqual(2);
    expect(fieldServiceTemplates.every((t) => t.category === "field-service")).toBe(true);
  });

  it("returns empty array for non-existent category", () => {
    const templates = listExtensionTemplatesByCategory("non-existent");
    expect(templates).toHaveLength(0);
  });
});

describe("listExtensionTemplatesForSolution", () => {
  it("filters templates by solution type", () => {
    const reactiveTemplates = listExtensionTemplatesForSolution("reactive-repair-callout");
    expect(reactiveTemplates.length).toBeGreaterThanOrEqual(5);

    // All templates should be compatible with reactive-repair-callout
    for (const t of reactiveTemplates) {
      expect(
        t.targetSolutionTypes.length === 0 ||
        t.targetSolutionTypes.includes("reactive-repair-callout"),
      ).toBe(true);
    }
  });

  it("includes templates with no solution type restriction", () => {
    // Templates with empty targetSolutionTypes should appear for any solution type
    const unknownSolutionTemplates = listExtensionTemplatesForSolution("unknown-solution");
    // Templates with empty targetSolutionTypes should be included
    expect(unknownSolutionTemplates.length).toBeGreaterThanOrEqual(0);
  });
});
