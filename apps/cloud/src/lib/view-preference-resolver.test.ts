import { describe, it, expect } from "vitest";
import {
  parseSortParam,
  resolveEffectiveListState,
  buildPreferenceInput,
  type ViewPreferenceData,
  type ViewDefaults,
} from "./view-preference-resolver";

// ── Fixtures ──

const viewDefaults: ViewDefaults = {
  columns: [
    { field: "name" },
    { field: "email" },
    { field: "status" },
    { field: "created_at" },
  ],
  defaultSort: { field: "created_at", direction: "desc" },
  defaultPageSize: 20,
};

const availableFields = new Set(["name", "email", "status", "created_at", "updated_at", "industry"]);

const preference: ViewPreferenceData = {
  visibleFields: ["name", "email", "industry"],
  filters: [{ field: "status", operator: "eq", value: "active" }],
  sort: { field: "name", direction: "asc" },
  pageSize: 50,
  version: 1,
};

// ── parseSortParam ──

describe("parseSortParam", () => {
  it("parses a valid sort string", () => {
    expect(parseSortParam("name:asc")).toEqual({ field: "name", direction: "asc" });
    expect(parseSortParam("created_at:desc")).toEqual({ field: "created_at", direction: "desc" });
  });

  it("returns null for undefined", () => {
    expect(parseSortParam(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSortParam("")).toBeNull();
  });

  it("returns null for malformed strings", () => {
    expect(parseSortParam("name")).toBeNull();
    expect(parseSortParam("name:ascending")).toBeNull();
    expect(parseSortParam("name:desc:extra")).toBeNull();
  });

  it("returns null for invalid direction", () => {
    expect(parseSortParam("name:horizontal")).toBeNull();
  });
});

// ── resolveEffectiveListState ──

describe("resolveEffectiveListState", () => {
  it("uses view defaults when no preference or URL query", () => {
    const result = resolveEffectiveListState(viewDefaults, null, {}, availableFields);
    expect(result.search).toBe("");
    expect(result.sortBy).toBe("created_at");
    expect(result.sortOrder).toBe("desc");
    expect(result.filters).toEqual({});
    expect(result.pageSize).toBe(20);
    expect(result.visibleFields).toEqual(["name", "email", "status", "created_at"]);
  });

  it("uses preference sort when no URL sort", () => {
    const result = resolveEffectiveListState(viewDefaults, preference, {}, availableFields);
    expect(result.sortBy).toBe("name");
    expect(result.sortOrder).toBe("asc");
  });

  it("URL sort overrides preference sort", () => {
    const result = resolveEffectiveListState(
      viewDefaults,
      preference,
      { sort: "email:desc" },
      availableFields,
    );
    expect(result.sortBy).toBe("email");
    expect(result.sortOrder).toBe("desc");
  });

  it("uses preference page size when no URL page size", () => {
    const result = resolveEffectiveListState(viewDefaults, preference, {}, availableFields);
    expect(result.pageSize).toBe(50);
  });

  it("uses preference visible fields filtered against available fields", () => {
    const result = resolveEffectiveListState(viewDefaults, preference, {}, availableFields);
    expect(result.visibleFields).toEqual(["name", "email", "industry"]);
  });

  it("falls back to view columns when preference fields are all invalid", () => {
    const badPref: ViewPreferenceData = {
      ...preference,
      visibleFields: ["nonexistent"],
    };
    const result = resolveEffectiveListState(viewDefaults, badPref, {}, availableFields);
    expect(result.visibleFields).toEqual(["name", "email", "status", "created_at"]);
  });

  it("uses view columns when preference has no visible fields", () => {
    const noFieldsPref: ViewPreferenceData = {
      ...preference,
      visibleFields: [],
    };
    const result = resolveEffectiveListState(viewDefaults, noFieldsPref, {}, availableFields);
    expect(result.visibleFields).toEqual(["name", "email", "status", "created_at"]);
  });

  it("merges preference filters with URL filters (URL wins for same field)", () => {
    const result = resolveEffectiveListState(
      viewDefaults,
      preference,
      { filters: { status: "archived", industry: "tech" } },
      availableFields,
    );
    expect(result.filters).toEqual({ status: "archived", industry: "tech" });
  });

  it("preserves preference filters not overridden by URL", () => {
    const result = resolveEffectiveListState(
      viewDefaults,
      preference,
      { filters: { industry: "tech" } },
      availableFields,
    );
    expect(result.filters).toEqual({ status: "active", industry: "tech" });
  });

  it("search is URL-only, never from preference", () => {
    const result = resolveEffectiveListState(
      viewDefaults,
      preference,
      { q: "acme" },
      availableFields,
    );
    expect(result.search).toBe("acme");
  });

  it("falls back to created_at:desc when no sort anywhere", () => {
    const noSortDefaults: ViewDefaults = { columns: [{ field: "name" }] };
    const noSortPref: ViewPreferenceData = {
      visibleFields: [],
      filters: [],
      sort: null,
      pageSize: null,
      version: 1,
    };
    const result = resolveEffectiveListState(noSortDefaults, noSortPref, {}, availableFields);
    expect(result.sortBy).toBe("created_at");
    expect(result.sortOrder).toBe("desc");
  });

  it("uses fallback page size when neither view nor preference specifies", () => {
    const noPageSizeDefaults: ViewDefaults = { columns: [{ field: "name" }] };
    const noPageSizePref: ViewPreferenceData = {
      visibleFields: [],
      filters: [],
      sort: null,
      pageSize: null,
      version: 1,
    };
    const result = resolveEffectiveListState(noPageSizeDefaults, noPageSizePref, {}, availableFields, 30);
    expect(result.pageSize).toBe(30);
  });
});

// ── buildPreferenceInput ──

describe("buildPreferenceInput", () => {
  it("builds a preference input from effective state", () => {
    const state = {
      search: "acme",
      sortBy: "name",
      sortOrder: "asc" as const,
      filters: { status: "active", industry: "tech" },
      pageSize: 50,
      visibleFields: ["name", "email"],
    };
    const result = buildPreferenceInput(state, 2);
    expect(result.visibleFields).toEqual(["name", "email"]);
    expect(result.sort).toEqual({ field: "name", direction: "asc" });
    expect(result.pageSize).toBe(50);
    expect(result.expectedVersion).toBe(2);
    expect(result.filters).toEqual([
      { field: "status", operator: "eq", value: "active" },
      { field: "industry", operator: "eq", value: "tech" },
    ]);
  });

  it("does not include search in the preference input (search is URL-only)", () => {
    const state = {
      search: "acme",
      sortBy: "name",
      sortOrder: "asc" as const,
      filters: {},
      pageSize: 20,
      visibleFields: ["name"],
    };
    const result = buildPreferenceInput(state);
    expect(result).not.toHaveProperty("search");
  });
});
