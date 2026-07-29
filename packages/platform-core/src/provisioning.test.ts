import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import { installPack } from "./installer";
import {
  provisionWorkspace,
  applyReferenceSolution,
  listProvisionedWorkspaces,
  getWorkspaceProvisioningSummary,
} from "./provisioning";
import { checkWorkspaceHealth, getWorkspaceHealthStatus } from "./workspace-health";
import { generateDiagnosticsPackage } from "./diagnostics-package";
import type { ReferenceSolution, ProvisioningSpec } from "@runory/contracts";

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
    TABLES.organizations, TABLES.users, TABLES.packInstallations,
    TABLES.packPermissionGroups, TABLES.packPermissionAssignments,
    TABLES.workspaceCommandContracts, TABLES.outboxMessages,
    TABLES.organizationEntitlements,
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

  // Create workspace for tests that need an existing one
  const ts = now();
  workspaceId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
    [workspaceId, "Test WS", "test-ws", ts, ts],
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Provisioning Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

describe("provisionWorkspace", () => {
  it("creates a new workspace and installs packs", async () => {
    const spec: ProvisioningSpec = {
      workspaceName: "Provisioned Workspace",
      packs: [
        { packId: "crm-lite-pack", includeDemoData: false },
      ],
    };

    const result = await provisionWorkspace(spec, {
      externalId: "test-user",
      displayName: "Test User",
    });

    expect(result.status).toBe("success");
    expect(result.workspaceId).toBeTruthy();
    expect(result.workspaceSlug).toBeTruthy();
    expect(result.packsInstalled).toEqual(["crm-lite-pack"]);
    expect(result.steps.length).toBeGreaterThan(0);

    const createStep = result.steps.find((s) => s.step === "create_workspace");
    expect(createStep?.status).toBe("success");

    const installStep = result.steps.find((s) => s.step === "install_pack:crm-lite-pack");
    expect(installStep?.status).toBe("success");
  });

  it("installs packs with demo data", async () => {
    const spec: ProvisioningSpec = {
      workspaceName: "Demo Workspace",
      packs: [
        { packId: "crm-lite-pack", includeDemoData: true },
      ],
    };

    const result = await provisionWorkspace(spec, {
      externalId: "test-user",
      displayName: "Test User",
    });

    expect(result.status).toBe("success");
    expect(result.packsInstalled).toEqual(["crm-lite-pack"]);
    expect(result.demoRecordsCreated).toBeGreaterThan(0);
  });

  it("applies to an existing workspace", async () => {
    const result = await provisionWorkspace(
      { workspaceName: "Ignored", packs: [{ packId: "crm-lite-pack" }] },
      { externalId: "test-user", displayName: "Test User" },
      { existingWorkspaceId: workspaceId },
    );

    expect(result.workspaceId).toBe(workspaceId);
    expect(result.packsInstalled).toEqual(["crm-lite-pack"]);

    const resolveStep = result.steps.find((s) => s.step === "resolve_workspace");
    expect(resolveStep?.status).toBe("success");
  });

  it("reports partial success when a non-existent pack fails", async () => {
    const spec: ProvisioningSpec = {
      workspaceName: "Partial Workspace",
      packs: [
        { packId: "crm-lite-pack" },
        { packId: "nonexistent-pack" },
      ],
    };

    const result = await provisionWorkspace(spec, {
      externalId: "test-user",
      displayName: "Test User",
    });

    expect(result.status).toBe("partial");
    expect(result.packsInstalled).toContain("crm-lite-pack");
    expect(result.packsInstalled).not.toContain("nonexistent-pack");

    const failedStep = result.steps.find((s) => s.step === "install_pack:nonexistent-pack");
    expect(failedStep?.status).toBe("failed");
    expect(failedStep?.error).toBeTruthy();
  });

  it("fails when workspace not found", async () => {
    const result = await provisionWorkspace(
      { workspaceName: "Ignored", packs: [] },
      { externalId: "test-user", displayName: "Test User" },
      { existingWorkspaceId: "ws_nonexistent" },
    );

    expect(result.status).toBe("failed");
    const resolveStep = result.steps.find((s) => s.step === "resolve_workspace");
    expect(resolveStep?.status).toBe("failed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reference Solution
// ─────────────────────────────────────────────────────────────────────────────

describe("applyReferenceSolution", () => {
  it("applies a reference solution to a new workspace", async () => {
    const solution: ReferenceSolution = {
      name: "reactive-service",
      version: "1.0.0",
      description: "Canonical Reactive Repair / Callout configuration",
      spec: {
        workspaceName: "Reactive Service Customer",
        packs: [
          { packId: "crm-lite-pack", includeDemoData: true },
        ],
      },
    };

    const result = await applyReferenceSolution(solution, {
      externalId: "test-user",
      displayName: "Test User",
    });

    expect(result.status).toBe("success");
    expect(result.packsInstalled).toEqual(["crm-lite-pack"]);
    expect(result.demoRecordsCreated).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Provisioning Summary
// ─────────────────────────────────────────────────────────────────────────────

describe("getWorkspaceProvisioningSummary", () => {
  it("returns summary of installed packs and extensions", async () => {
    await installPack(workspaceId, "crm-lite-pack");

    const summary = await getWorkspaceProvisioningSummary(workspaceId);

    expect(summary.workspaceId).toBe(workspaceId);
    expect(summary.packs.length).toBe(1);
    expect(summary.packs[0].packId).toBe("crm-lite-pack");
    expect(summary.objects).toBeGreaterThan(0);
    expect(summary.fields).toBeGreaterThan(0);
    expect(summary.views).toBeGreaterThan(0);
    expect(summary.navigationItems).toBeGreaterThan(0);
  });

  it("returns empty summary for workspace with no packs", async () => {
    const summary = await getWorkspaceProvisioningSummary(workspaceId);

    expect(summary.packs).toEqual([]);
    expect(summary.extensions).toEqual([]);
    expect(summary.objects).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// List Provisioned Workspaces
// ─────────────────────────────────────────────────────────────────────────────

describe("listProvisionedWorkspaces", () => {
  it("lists workspaces with pack installation counts", async () => {
    await installPack(workspaceId, "crm-lite-pack");

    const workspaces = await listProvisionedWorkspaces();

    expect(workspaces.length).toBeGreaterThan(0);
    const ws = workspaces.find((w) => w.workspaceId === workspaceId);
    expect(ws).toBeTruthy();
    expect(ws!.packsInstalled).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Health Check
// ─────────────────────────────────────────────────────────────────────────────

describe("checkWorkspaceHealth", () => {
  it("returns healthy report for a workspace with installed packs", async () => {
    await installPack(workspaceId, "crm-lite-pack");

    const report = await checkWorkspaceHealth(workspaceId);

    expect(report.workspaceId).toBe(workspaceId);
    expect(report.items.length).toBeGreaterThan(0);
    expect(report.checkedAt).toBeTruthy();

    // Should have items from all categories
    const categories = new Set(report.items.map((i) => i.category));
    expect(categories.has("command_contracts")).toBe(true);
    expect(categories.has("schema_drift")).toBe(true);
    expect(categories.has("view_integrity")).toBe(true);
    expect(categories.has("entitlement")).toBe(true);
    expect(categories.has("extension_consistency")).toBe(true);
    expect(categories.has("installation")).toBe(true);
  });

  it("detects schema drift for objects without tables", async () => {
    // Insert an object definition without creating the business table
    const ts = now();
    await execute(
      `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, created_at)
       VALUES (?, ?, 'fake_object', 'Fake Object', 'test', ?)`,
      [genId("obj"), workspaceId, ts],
    );

    const report = await checkWorkspaceHealth(workspaceId);

    const schemaItem = report.items.find((i) => i.category === "schema_drift");
    expect(schemaItem?.status).toBe("error");
    expect(schemaItem?.detail?.missingTables).toContain("fake_object");
  });

  it("detects orphaned views referencing non-existent objects", async () => {
    const ts = now();
    await execute(
      `INSERT INTO ${TABLES.viewDefinitions} (id, workspace_id, object_key, view_key, view_type, label, config_json, created_at)
       VALUES (?, ?, 'nonexistent_obj', 'test_view', 'list', 'Test View', '{}', ?)`,
      [genId("view"), workspaceId, ts],
    );

    const report = await checkWorkspaceHealth(workspaceId);

    const viewItem = report.items.find((i) => i.category === "view_integrity");
    expect(viewItem?.status).toBe("warning");
  });
});

describe("getWorkspaceHealthStatus", () => {
  it("returns category-level status summary", async () => {
    await installPack(workspaceId, "crm-lite-pack");

    const status = await getWorkspaceHealthStatus(workspaceId);

    expect(status.workspaceId).toBe(workspaceId);
    expect(status.overallStatus).toBeTruthy();
    expect(status.categoryStatuses.command_contracts).toBeTruthy();
    expect(status.categoryStatuses.schema_drift).toBeTruthy();
    expect(status.categoryStatuses.installation).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostics Package
// ─────────────────────────────────────────────────────────────────────────────

describe("generateDiagnosticsPackage", () => {
  it("generates a complete diagnostics package", async () => {
    await installPack(workspaceId, "crm-lite-pack");

    const pkg = await generateDiagnosticsPackage(workspaceId);

    expect(pkg.workspaceId).toBe(workspaceId);
    expect(pkg.workspaceName).toBe("Test WS");
    expect(pkg.generatedAt).toBeTruthy();

    // Configuration section
    expect(pkg.configuration).toBeTruthy();
    const config = pkg.configuration as { summary: { packs: unknown[] }; objects: unknown[] };
    expect(config.summary.packs.length).toBe(1);
    expect(config.objects.length).toBeGreaterThan(0);

    // Contract inventory
    expect(pkg.contractInventory).toBeTruthy();
    expect(pkg.contractInventory.sourceCount).toBeGreaterThanOrEqual(0);

    // Migration state
    expect(pkg.migrationState).toBeTruthy();
    const migration = pkg.migrationState as { modules: unknown[]; packs: unknown[] };
    expect(migration.modules.length).toBeGreaterThan(0);

    // Health report
    expect(pkg.healthReport).toBeTruthy();
    expect(pkg.healthReport!.items.length).toBeGreaterThan(0);
  });

  it("throws for non-existent workspace", async () => {
    await expect(generateDiagnosticsPackage("ws_nonexistent")).rejects.toThrow("Workspace not found");
  });

  it("does not include business data records", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });

    const pkg = await generateDiagnosticsPackage(workspaceId);
    const serialized = JSON.stringify(pkg);

    // The package should contain configuration metadata, not business records
    expect(serialized).not.toContain("demo_data_json");
    expect(serialized).not.toContain("payload");
  });
});
