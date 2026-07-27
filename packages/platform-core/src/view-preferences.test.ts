import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import {
  getViews,
  getViewPreference,
  setViewPreference,
  type ViewPreferenceInput,
} from "./metadata";
import { installPack } from "./installer";
import { ConflictError, InvalidInputError, NotFoundError } from "./context";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ── Test fixture ──

let workspaceId: string;
let listViewId: string;
let formViewId: string;

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

  // Create workspace
  const ts = now();
  workspaceId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, "Test WS", "test-ws", ts, ts]
  );

  // Install company module via pack (registers objects, fields, views with module_id)
  await installPack(workspaceId, "crm-lite-pack");

  // Resolve view definition IDs
  const views = await getViews(workspaceId, "company");
  const listView = views.find((v) => v.viewKey === "company_list");
  const formView = views.find((v) => v.viewKey === "company_form");
  if (!listView || !formView) throw new Error("Test setup failed: company views not found");
  listViewId = listView.id;
  formViewId = formView.id;
});

// ── Helper: valid preference input ──

function validInput(overrides: Partial<ViewPreferenceInput> = {}): ViewPreferenceInput {
  return {
    visibleFields: ["name", "industry"],
    filters: [{ field: "lifecycle_stage", operator: "eq", value: "lead" }],
    sort: { field: "name", direction: "asc" as const },
    pageSize: 50,
    ...overrides,
  };
}

// ── Tests ──

describe("getViewPreference", () => {
  it("returns null when no preference exists", async () => {
    const result = await getViewPreference(workspaceId, "user-1", listViewId);
    expect(result).toBeNull();
  });

  it("returns the preference after it is created", async () => {
    const created = await setViewPreference(workspaceId, "user-1", listViewId, validInput());
    const result = await getViewPreference(workspaceId, "user-1", listViewId);
    expect(result).toEqual(created);
  });
});

describe("setViewPreference — create", () => {
  it("creates a new preference with version 1", async () => {
    const input = validInput();
    const result = await setViewPreference(workspaceId, "user-1", listViewId, input);
    expect(result.version).toBe(1);
    expect(result.visibleFields).toEqual(["name", "industry"]);
    expect(result.filters).toEqual([{ field: "lifecycle_stage", operator: "eq", value: "lead" }]);
    expect(result.sort).toEqual({ field: "name", direction: "asc" });
    expect(result.pageSize).toBe(50);
    expect(result.workspaceId).toBe(workspaceId);
    expect(result.userId).toBe("user-1");
    expect(result.viewDefinitionId).toBe(listViewId);
  });

  it("creates with minimal input (empty arrays for omitted fields)", async () => {
    const result = await setViewPreference(workspaceId, "user-1", listViewId, {});
    expect(result.visibleFields).toEqual([]);
    expect(result.filters).toEqual([]);
    expect(result.sort).toBeNull();
    expect(result.pageSize).toBeNull();
  });
});

describe("setViewPreference — update", () => {
  it("updates an existing preference with correct expectedVersion", async () => {
    const created = await setViewPreference(workspaceId, "user-1", listViewId, validInput());
    const updated = await setViewPreference(workspaceId, "user-1", listViewId, {
      ...validInput({ visibleFields: ["name", "domain"] }),
      expectedVersion: created.version,
    });
    expect(updated.version).toBe(2);
    expect(updated.visibleFields).toEqual(["name", "domain"]);
  });

  it("rejects update without expectedVersion", async () => {
    await setViewPreference(workspaceId, "user-1", listViewId, validInput());
    await expect(
      setViewPreference(workspaceId, "user-1", listViewId, validInput({ visibleFields: ["name"] }))
    ).rejects.toThrow(InvalidInputError);
  });

  it("rejects update with stale expectedVersion (optimistic concurrency)", async () => {
    const created = await setViewPreference(workspaceId, "user-1", listViewId, validInput());
    // First update bumps version to 2
    await setViewPreference(workspaceId, "user-1", listViewId, {
      ...validInput({ visibleFields: ["name", "domain"] }),
      expectedVersion: created.version,
    });
    // Second update with stale version 1 should fail
    await expect(
      setViewPreference(workspaceId, "user-1", listViewId, {
        ...validInput({ visibleFields: ["name", "phone"] }),
        expectedVersion: created.version,
      })
    ).rejects.toThrow(ConflictError);
  });
});

describe("setViewPreference — validation", () => {
  it("rejects unknown visible fields", async () => {
    await expect(
      setViewPreference(workspaceId, "user-1", listViewId, validInput({ visibleFields: ["nonexistent"] }))
    ).rejects.toThrow(InvalidInputError);
  });

  it("rejects unknown filter fields", async () => {
    await expect(
      setViewPreference(workspaceId, "user-1", listViewId, validInput({
        filters: [{ field: "nonexistent", operator: "eq", value: "x" }],
      }))
    ).rejects.toThrow(InvalidInputError);
  });

  it("rejects unknown sort field", async () => {
    await expect(
      setViewPreference(workspaceId, "user-1", listViewId, validInput({ sort: { field: "nonexistent", direction: "asc" } }))
    ).rejects.toThrow(InvalidInputError);
  });

  it("rejects invalid page size", async () => {
    await expect(
      setViewPreference(workspaceId, "user-1", listViewId, validInput({ pageSize: 30 as number }))
    ).rejects.toThrow(InvalidInputError);
  });

  it("rejects preferences for non-list views", async () => {
    await expect(
      setViewPreference(workspaceId, "user-1", formViewId, validInput())
    ).rejects.toThrow(InvalidInputError);
  });

  it("rejects preferences for non-existent view definitions", async () => {
    await expect(
      setViewPreference(workspaceId, "user-1", "nonexistent-view-id", validInput())
    ).rejects.toThrow(NotFoundError);
  });
});

describe("view preferences — isolation", () => {
  it("isolates preferences by user", async () => {
    const pref1 = await setViewPreference(workspaceId, "user-1", listViewId, validInput({ visibleFields: ["name"] }));
    const pref2 = await setViewPreference(workspaceId, "user-2", listViewId, validInput({ visibleFields: ["name", "domain"] }));

    expect(pref1.visibleFields).toEqual(["name"]);
    expect(pref2.visibleFields).toEqual(["name", "domain"]);

    // User-1's preference is unaffected by user-2's creation
    const result1 = await getViewPreference(workspaceId, "user-1", listViewId);
    expect(result1?.visibleFields).toEqual(["name"]);
  });

  it("allows independent version tracking per user", async () => {
    const pref1 = await setViewPreference(workspaceId, "user-1", listViewId, validInput());
    const pref2 = await setViewPreference(workspaceId, "user-2", listViewId, validInput());

    expect(pref1.version).toBe(1);
    expect(pref2.version).toBe(1);

    // User-1 updates; user-2's version should remain 1
    const updated1 = await setViewPreference(workspaceId, "user-1", listViewId, {
      ...validInput({ visibleFields: ["name", "phone"] }),
      expectedVersion: 1,
    });
    expect(updated1.version).toBe(2);

    const result2 = await getViewPreference(workspaceId, "user-2", listViewId);
    expect(result2?.version).toBe(1);
  });
});
