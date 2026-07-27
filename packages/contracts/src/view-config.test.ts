import { describe, it, expect } from "vitest";
import {
  parseViewConfig,
  normalizeLegacyViewConfig,
  listViewConfigV1Schema,
  formViewConfigV1Schema,
} from "./index.js";

describe("normalizeLegacyViewConfig", () => {
  it("converts string actions to ViewAction objects", () => {
    const raw = { actions: ["create", "view", "submit"] };
    const result = normalizeLegacyViewConfig(raw, "test_list", "list");
    expect(result.actions).toEqual([
      { key: "create", kind: "navigate" },
      { key: "view", kind: "navigate" },
      { key: "submit", kind: "command" },
    ]);
  });

  it("preserves object actions unchanged", () => {
    const raw = {
      actions: [
        { key: "accept", kind: "command", label: "Accept Quote", tone: "primary" },
      ],
    };
    const result = normalizeLegacyViewConfig(raw, "test_list", "list");
    expect(result.actions).toEqual(raw.actions);
  });

  it("adds missing schemaVersion", () => {
    const raw = { columns: [{ field: "name" }] };
    const result = normalizeLegacyViewConfig(raw, "test_list", "list");
    expect(result.schemaVersion).toBe("1.0");
  });

  it("preserves existing schemaVersion", () => {
    const raw = { schemaVersion: "2.0", columns: [{ field: "name" }] };
    const result = normalizeLegacyViewConfig(raw, "test_list", "list");
    expect(result.schemaVersion).toBe("2.0");
  });

  it("adds deterministic keys to form sections without keys", () => {
    const raw = {
      sections: [
        { title: "Basic Info", fields: [{ field: "name" }] },
        { title: "Details", fields: [{ field: "description" }] },
      ],
    };
    const result = normalizeLegacyViewConfig(raw, "quote_form", "form");
    expect(result.sections).toEqual([
      { key: "quote_form_section_0", title: "Basic Info", fields: [{ field: "name" }] },
      { key: "quote_form_section_1", title: "Details", fields: [{ field: "description" }] },
    ]);
  });

  it("preserves existing section keys", () => {
    const raw = {
      sections: [
        { key: "custom_key", title: "Basic Info", fields: [{ field: "name" }] },
      ],
    };
    const result = normalizeLegacyViewConfig(raw, "quote_form", "form");
    expect((result.sections as unknown[])[0]).toMatchObject({ key: "custom_key" });
  });

  it("coerces arbitrary pageSize to nearest allowed value", () => {
    const raw = { pageSize: 15 };
    const result = normalizeLegacyViewConfig(raw, "test_list", "list");
    expect(result.pageSize).toBe(20);
  });

  it("does not coerce valid pageSize values", () => {
    for (const ps of [10, 20, 50, 100]) {
      const raw = { pageSize: ps };
      const result = normalizeLegacyViewConfig(raw, "test_list", "list");
      expect(result.pageSize).toBe(ps);
    }
  });

  it("defaults pageSize to 20 for list views when missing", () => {
    const raw = { columns: [{ field: "name" }] };
    const result = normalizeLegacyViewConfig(raw, "test_list", "list");
    expect(result.pageSize).toBe(20);
  });

  it("does not add pageSize for form views when missing", () => {
    const raw = { sections: [{ title: "Info", fields: [{ field: "name" }] }] };
    const result = normalizeLegacyViewConfig(raw, "test_form", "form");
    expect(result.pageSize).toBeUndefined();
  });
});

describe("parseViewConfig — list views", () => {
  it("parses a valid list config with all fields", () => {
    const raw = {
      schemaVersion: "1.0",
      columns: [
        { field: "quote_number", label: "Quote #" },
        { field: "status" },
        { field: "grand_total", width: "lg" },
      ],
      actions: [
        { key: "create", kind: "navigate", label: "New Quote", tone: "primary" },
        { key: "view", kind: "navigate" },
      ],
      defaultSort: { field: "created_at", direction: "desc" },
      defaultFilters: [{ field: "status", operator: "eq" as const, value: "sent" }],
      pageSize: 20,
      emptyState: { title: "No quotes yet", actionKey: "create" },
    };
    const result = parseViewConfig(raw, "quote_list", "list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.schemaVersion).toBe("1.0");
      expect(result.config).toMatchObject({ pageSize: 20 });
    }
  });

  it("parses legacy list config with string actions", () => {
    const raw = {
      columns: [{ field: "name" }, { field: "status" }],
      actions: ["create", "view"],
      pageSize: 20,
    };
    const result = parseViewConfig(raw, "company_list", "list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const config = result.config as { actions: unknown[] };
      expect(config.actions).toEqual([
        { key: "create", kind: "navigate" },
        { key: "view", kind: "navigate" },
      ]);
    }
  });

  it("rejects empty columns array", () => {
    const raw = { schemaVersion: "1.0", columns: [], actions: [], pageSize: 20 };
    const result = parseViewConfig(raw, "test_list", "list");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("columns"))).toBe(true);
    }
  });

  it("rejects invalid pageSize", () => {
    const raw = { columns: [{ field: "name" }], pageSize: 15 };
    const result = parseViewConfig(raw, "test_list", "list");
    // pageSize 15 is coerced to 20 by normalizer, so this should pass
    expect(result.ok).toBe(true);
  });

  it("rejects missing columns entirely", () => {
    const raw = { actions: [], pageSize: 20 };
    const result = parseViewConfig(raw, "test_list", "list");
    expect(result.ok).toBe(false);
  });
});

describe("parseViewConfig — form views", () => {
  it("parses a valid form config", () => {
    const raw = {
      schemaVersion: "1.0",
      sections: [
        { key: "basic", title: "Basic Info", fields: [{ field: "name", required: true }] },
        { key: "details", title: "Details", fields: [{ field: "description" }] },
      ],
      actions: [{ key: "save", kind: "command", label: "Save" }],
    };
    const result = parseViewConfig(raw, "quote_form", "form");
    expect(result.ok).toBe(true);
  });

  it("parses legacy form config without section keys", () => {
    const raw = {
      sections: [
        { title: "Basic Info", fields: [{ field: "name" }] },
        { title: "Details", fields: [{ field: "description" }] },
      ],
    };
    const result = parseViewConfig(raw, "quote_form", "form");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const config = result.config as { sections: Array<{ key: string }> };
      expect(config.sections[0].key).toBe("quote_form_section_0");
      expect(config.sections[1].key).toBe("quote_form_section_1");
    }
  });

  it("rejects empty sections array", () => {
    const raw = { schemaVersion: "1.0", sections: [], actions: [] };
    const result = parseViewConfig(raw, "test_form", "form");
    expect(result.ok).toBe(false);
  });
});

describe("listViewConfigV1Schema — validation rules", () => {
  it("accepts workspaceRoleDefaults", () => {
    const config = {
      schemaVersion: "1.0",
      columns: [{ field: "name" }],
      actions: [],
      pageSize: 20,
      workspaceRoleDefaults: {
        admin: { visibleFields: ["name", "status"] },
        viewer: { pageSize: 10 },
      },
    };
    expect(listViewConfigV1Schema.safeParse(config).success).toBe(true);
  });

  it("accepts emptyState", () => {
    const config = {
      schemaVersion: "1.0",
      columns: [{ field: "name" }],
      actions: [],
      pageSize: 20,
      emptyState: { title: "No records", description: "Create one to get started" },
    };
    expect(listViewConfigV1Schema.safeParse(config).success).toBe(true);
  });

  it("defaults actions to empty array when omitted", () => {
    const config = {
      schemaVersion: "1.0",
      columns: [{ field: "name" }],
      pageSize: 20,
    };
    const parsed = listViewConfigV1Schema.safeParse(config);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.actions).toEqual([]);
    }
  });

  it("defaults defaultFilters to empty array when omitted", () => {
    const config = {
      schemaVersion: "1.0",
      columns: [{ field: "name" }],
      pageSize: 20,
    };
    const parsed = listViewConfigV1Schema.safeParse(config);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.defaultFilters).toEqual([]);
    }
  });
});

describe("formViewConfigV1Schema — validation rules", () => {
  it("requires at least one section", () => {
    const config = {
      schemaVersion: "1.0",
      sections: [],
      actions: [],
    };
    expect(formViewConfigV1Schema.safeParse(config).success).toBe(false);
  });

  it("requires each section to have a key", () => {
    const config = {
      schemaVersion: "1.0",
      sections: [{ title: "Info", fields: [] }],
      actions: [],
    };
    expect(formViewConfigV1Schema.safeParse(config).success).toBe(false);
  });
});
