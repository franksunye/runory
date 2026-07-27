import { describe, it, expect } from "vitest";
import type { ViewAction } from "@runory/contracts";
import {
  filterActionsByPermission,
  resolveActionLabel,
  actionToneClass,
  extractViewActions,
} from "./view-actions";

// ── Test fixtures ──

const actions: ViewAction[] = [
  { key: "create", kind: "navigate", label: "New Record", tone: "primary" },
  { key: "view", kind: "navigate" },
  { key: "submit", kind: "command", label: "Submit for Approval", permission: "quote.submit" },
  { key: "approve", kind: "command", label: "Approve", permission: "quote.approve", tone: "primary" },
  { key: "delete", kind: "command", label: "Delete", permission: "company.delete", tone: "danger" },
  { key: "export", kind: "command", label: "Export" },
];

// ── filterActionsByPermission ──

describe("filterActionsByPermission", () => {
  it("returns all actions when user has wildcard permission", () => {
    const result = filterActionsByPermission(actions, new Set(["*"]));
    expect(result).toHaveLength(actions.length);
  });

  it("returns all actions when none have permission requirements", () => {
    const noPermActions: ViewAction[] = [
      { key: "create", kind: "navigate" },
      { key: "view", kind: "navigate" },
    ];
    const result = filterActionsByPermission(noPermActions, new Set());
    expect(result).toHaveLength(2);
  });

  it("filters out actions whose permission the user lacks", () => {
    const result = filterActionsByPermission(actions, new Set(["quote.submit"]));
    const keys = result.map((a) => a.key);
    expect(keys).toContain("create");
    expect(keys).toContain("view");
    expect(keys).toContain("submit");
    expect(keys).toContain("export");
    expect(keys).not.toContain("approve");
    expect(keys).not.toContain("delete");
  });

  it("returns only permitted actions for a restricted user", () => {
    const result = filterActionsByPermission(actions, new Set(["company.delete"]));
    const keys = result.map((a) => a.key);
    expect(keys).toContain("create");
    expect(keys).toContain("view");
    expect(keys).toContain("export");
    expect(keys).toContain("delete");
    expect(keys).not.toContain("submit");
    expect(keys).not.toContain("approve");
  });

  it("returns actions without permission for any user", () => {
    const result = filterActionsByPermission(actions, new Set());
    const keys = result.map((a) => a.key);
    expect(keys).toContain("create");
    expect(keys).toContain("view");
    expect(keys).toContain("export");
    expect(keys).not.toContain("submit");
    expect(keys).not.toContain("approve");
    expect(keys).not.toContain("delete");
  });

  it("handles empty actions array", () => {
    const result = filterActionsByPermission([], new Set(["*"]));
    expect(result).toEqual([]);
  });

  it("wildcard permission overrides specific permission checks", () => {
    const result = filterActionsByPermission(actions, new Set(["*"]));
    expect(result).toHaveLength(actions.length);
  });
});

// ── resolveActionLabel ──

describe("resolveActionLabel", () => {
  it("returns the explicit label when present", () => {
    const action: ViewAction = { key: "submit", kind: "command", label: "Submit for Approval" };
    expect(resolveActionLabel(action)).toBe("Submit for Approval");
  });

  it("falls back to capitalized key when label is absent", () => {
    const action: ViewAction = { key: "create", kind: "navigate" };
    expect(resolveActionLabel(action)).toBe("Create");
  });

  it("capitalizes single-character keys", () => {
    const action: ViewAction = { key: "x", kind: "command" };
    expect(resolveActionLabel(action)).toBe("X");
  });

  it("handles multi-word keys by capitalizing only the first letter", () => {
    const action: ViewAction = { key: "submit_for_approval", kind: "command" };
    expect(resolveActionLabel(action)).toBe("Submit_for_approval");
  });

  it("does not use label when label is empty string", () => {
    const action: ViewAction = { key: "export", kind: "command", label: "" };
    expect(resolveActionLabel(action)).toBe("Export");
  });
});

// ── actionToneClass ──

describe("actionToneClass", () => {
  it("returns primary class for primary tone", () => {
    expect(actionToneClass("primary")).toBe("app-button-primary");
  });

  it("returns danger class for danger tone", () => {
    const cls = actionToneClass("danger");
    expect(cls).toContain("text-red-600");
    expect(cls).toContain("border-red-200");
  });

  it("returns secondary class for secondary tone", () => {
    expect(actionToneClass("secondary")).toBe("app-button-secondary");
  });

  it("returns secondary class when tone is undefined", () => {
    expect(actionToneClass(undefined)).toBe("app-button-secondary");
  });
});

// ── extractViewActions ──

describe("extractViewActions", () => {
  it("extracts actions from a valid config object", () => {
    const config = {
      actions: [
        { key: "create", kind: "navigate" },
        { key: "view", kind: "navigate" },
      ],
      columns: [{ field: "name" }],
    };
    const result = extractViewActions(config);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe("create");
    expect(result[1].key).toBe("view");
  });

  it("returns empty array when config is null", () => {
    expect(extractViewActions(null)).toEqual([]);
  });

  it("returns empty array when config has no actions property", () => {
    expect(extractViewActions({ columns: [{ field: "name" }] })).toEqual([]);
  });

  it("returns empty array when actions is not an array", () => {
    expect(extractViewActions({ actions: "create" })).toEqual([]);
    expect(extractViewActions({ actions: { key: "create" } })).toEqual([]);
    expect(extractViewActions({ actions: 42 })).toEqual([]);
  });

  it("returns empty array for empty config object", () => {
    expect(extractViewActions({})).toEqual([]);
  });

  it("preserves action objects as-is (backend already normalizes)", () => {
    const actions = [
      { key: "submit", kind: "command" as const, label: "Submit", permission: "quote.submit", tone: "primary" as const },
    ];
    const config = { actions };
    const result = extractViewActions(config);
    expect(result).toEqual(actions);
  });
});
