import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  extractWorkspaceConfig,
  computeConfigDiff,
  computeCoverageMetrics,
  diffWorkspaces,
  diffWorkspaceAgainstReference,
  generateCoverageValidationReport,
  generateWorkspaceCoverageReport,
  type WorkspaceConfigSnapshot,
} from "./workspace-config-diff";
import { TABLES } from "./contracts";
import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let baselineWorkspaceId: string;
let targetWorkspaceId: string;

// ── Database setup ──

async function resetDatabase() {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${String(row.name)}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createWorkspace(wsId: string, name: string) {
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [wsId, name, `ws-${wsId}`, ts, ts],
  );
}

async function insertPackInstallation(wsId: string, packId: string, version: string, demoStatus: string) {
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.packInstallations} (id, workspace_id, pack_id, pack_version, demo_data_status, installed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [genId("pki"), wsId, packId, version, demoStatus, ts],
  );
}

async function insertObject(wsId: string, objectKey: string, label: string, ownership: string, moduleId: string | null) {
  await execute(
    `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [genId("obj"), wsId, objectKey, label, moduleId, ownership, now()],
  );
}

async function insertField(
  wsId: string,
  objectKey: string,
  fieldKey: string,
  label: string,
  type: string,
  ownership: string,
  required: boolean,
) {
  await execute(
    `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [genId("fld"), wsId, objectKey, fieldKey, label, type, ownership, required ? 1 : 0, now()],
  );
}

async function insertView(wsId: string, objectKey: string, viewKey: string, viewType: string, label: string) {
  await execute(
    `INSERT INTO ${TABLES.viewDefinitions} (id, workspace_id, object_key, view_key, view_type, label, config_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '{}', ?)`,
    [genId("vw"), wsId, objectKey, viewKey, viewType, label, now()],
  );
}

async function insertNavigation(wsId: string, route: string, label: string, icon: string, sortOrder: number) {
  await execute(
    `INSERT INTO ${TABLES.navigationItems} (id, workspace_id, route, label, icon, sort_order, enabled)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [genId("nav"), wsId, route, label, icon, sortOrder],
  );
}

async function insertExtension(wsId: string, name: string, version: number) {
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.extensionDefinitions} (id, workspace_id, name, namespace, status, current_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
    [genId("ext"), wsId, name, `ext_${name.toLowerCase()}`, version, ts, ts],
  );
}

async function insertRelation(wsId: string, objectKey: string, targetObjectKey: string, relationType: string, foreignKey: string) {
  await execute(
    `INSERT INTO ${TABLES.relationDefinitions} (id, workspace_id, object_key, target_object_key, target_module_id, relation_type, foreign_key, module_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [genId("rel"), wsId, objectKey, targetObjectKey, "runory.contact", relationType, foreignKey, "runory.contact", now()],
  );
}

async function insertAutomation(wsId: string, name: string, automationId: string, enabled: boolean) {
  await execute(
    `INSERT INTO ${TABLES.automationDefinitions} (id, workspace_id, name, enabled, automation_id, definition_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
    [genId("aut"), wsId, name, enabled ? 1 : 0, automationId, now(), now()],
  );
}

async function insertWorkflow(wsId: string, workflowId: string, name: string, targetObject: string) {
  await execute(
    `INSERT INTO ${TABLES.workflowDefinitions} (id, workspace_id, workflow_id, name, target_object, definition_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
    [genId("wfd"), wsId, workflowId, name, targetObject, now(), now()],
  );
}

async function insertForm(wsId: string, formKey: string, name: string, status: string) {
  await execute(
    `INSERT INTO ${TABLES.formDefinitions} (id, workspace_id, form_key, name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [genId("frm"), wsId, formKey, name, status, now(), now()],
  );
}

// ── Test fixtures ──

async function seedBaselineWorkspace(wsId: string) {
  await createWorkspace(wsId, "Baseline Workspace");
  await insertPackInstallation(wsId, "crm-lite-pack", "1.0.0", "loaded");
  await insertPackInstallation(wsId, "fsm-pack", "1.1.0", "loaded");
  await insertObject(wsId, "customer", "Customer", "module_owned", "runory.contact");
  await insertObject(wsId, "work_order", "Work Order", "module_owned", "runory.work-order");
  await insertField(wsId, "customer", "name", "Name", "text", "module_owned", true);
  await insertField(wsId, "customer", "email", "Email", "email", "module_owned", false);
  await insertField(wsId, "work_order", "title", "Title", "text", "module_owned", true);
  await insertView(wsId, "customer", "customer_list", "list", "Customers");
  await insertView(wsId, "customer", "customer_form", "form", "Customer Form");
  await insertView(wsId, "work_order", "work_order_list", "list", "Work Orders");
  await insertNavigation(wsId, "/customers", "Customers", "users", 1);
  await insertNavigation(wsId, "/work-orders", "Work Orders", "wrench", 2);
  await insertRelation(wsId, "work_order", "customer", "many_to_one", "customer_id");
  await insertAutomation(wsId, "Auto-assign", "auto_assign_001", true);
  await insertWorkflow(wsId, "wf_approval", "Approval Flow", "quote");
  await insertForm(wsId, "contact_form", "Contact Form", "active");
}

async function seedTargetWorkspace(wsId: string) {
  await createWorkspace(wsId, "Target Workspace");
  // Same packs as baseline
  await insertPackInstallation(wsId, "crm-lite-pack", "1.0.0", "loaded");
  await insertPackInstallation(wsId, "fsm-pack", "1.1.0", "loaded");
  // Extra pack not in baseline
  await insertPackInstallation(wsId, "sales-quote-pack", "1.0.0", "loaded");

  // Same objects as baseline
  await insertObject(wsId, "customer", "Customer", "module_owned", "runory.contact");
  await insertObject(wsId, "work_order", "Work Order", "module_owned", "runory.work-order");
  // Extension object not in baseline
  await insertObject(wsId, "custom_asset", "Custom Asset", "workspace_extension", null);

  // Same fields as baseline
  await insertField(wsId, "customer", "name", "Name", "text", "module_owned", true);
  await insertField(wsId, "customer", "email", "Email", "email", "module_owned", false);
  await insertField(wsId, "work_order", "title", "Title", "text", "module_owned", true);
  // Extension field
  await insertField(wsId, "customer", "loyalty_tier", "Loyalty Tier", "text", "workspace_extension", false);

  // Same views
  await insertView(wsId, "customer", "customer_list", "list", "Customers");
  await insertView(wsId, "customer", "customer_form", "form", "Customer Form");
  await insertView(wsId, "work_order", "work_order_list", "list", "Work Orders");

  // Same navigation
  await insertNavigation(wsId, "/customers", "Customers", "users", 1);
  await insertNavigation(wsId, "/work-orders", "Work Orders", "wrench", 2);
  // Extra nav item
  await insertNavigation(wsId, "/quotes", "Quotes", "file-text", 3);

  // Same relations
  await insertRelation(wsId, "work_order", "customer", "many_to_one", "customer_id");

  // Same automation
  await insertAutomation(wsId, "Auto-assign", "auto_assign_001", true);

  // Same workflow
  await insertWorkflow(wsId, "wf_approval", "Approval Flow", "quote");

  // Same form
  await insertForm(wsId, "contact_form", "Contact Form", "active");

  // Extension definition
  await insertExtension(wsId, "Customer Loyalty Extension", 1);
}

beforeEach(async () => {
  await resetDatabase();
  baselineWorkspaceId = genId("ws");
  targetWorkspaceId = genId("ws");
  await seedBaselineWorkspace(baselineWorkspaceId);
  await seedTargetWorkspace(targetWorkspaceId);
});

// ── Snapshot Extraction Tests ──

describe("extractWorkspaceConfig", () => {
  it("extracts all configuration categories from a workspace", async () => {
    const snapshot = await extractWorkspaceConfig(targetWorkspaceId);

    expect(snapshot.workspaceId).toBe(targetWorkspaceId);
    expect(snapshot.packs).toHaveLength(3);
    expect(snapshot.objects).toHaveLength(3);
    expect(snapshot.fields).toHaveLength(4);
    expect(snapshot.views).toHaveLength(3);
    expect(snapshot.navigation).toHaveLength(3);
    expect(snapshot.relations).toHaveLength(1);
    expect(snapshot.automations).toHaveLength(1);
    expect(snapshot.workflows).toHaveLength(1);
    expect(snapshot.forms).toHaveLength(1);
    expect(snapshot.extensions).toHaveLength(1);
  });

  it("returns empty arrays for a workspace with no configuration", async () => {
    const emptyWsId = genId("ws");
    await createWorkspace(emptyWsId, "Empty Workspace");
    const snapshot = await extractWorkspaceConfig(emptyWsId);

    expect(snapshot.packs).toHaveLength(0);
    expect(snapshot.objects).toHaveLength(0);
    expect(snapshot.fields).toHaveLength(0);
  });
});

// ── Diff Computation Tests ──

describe("computeConfigDiff", () => {
  it("detects added items in target workspace", async () => {
    const baseline = await extractWorkspaceConfig(baselineWorkspaceId);
    const target = await extractWorkspaceConfig(targetWorkspaceId);
    const diff = computeConfigDiff(baseline, target);

    const additions = diff.entries.filter((e) => e.changeType === "added");
    const addedPackIds = additions
      .filter((e) => e.category === "packs")
      .map((e) => e.identifier);
    const addedObjectKeys = additions
      .filter((e) => e.category === "objects")
      .map((e) => e.identifier);
    const addedFieldKeys = additions
      .filter((e) => e.category === "fields")
      .map((e) => e.identifier);

    expect(addedPackIds).toContain("sales-quote-pack");
    expect(addedObjectKeys).toContain("custom_asset");
    expect(addedFieldKeys).toContain("customer.loyalty_tier");
  });

  it("detects removed items when target is missing baseline items", async () => {
    const baseline = await extractWorkspaceConfig(targetWorkspaceId);
    const target = await extractWorkspaceConfig(baselineWorkspaceId);
    const diff = computeConfigDiff(baseline, target);

    const removals = diff.entries.filter((e) => e.changeType === "removed");
    const removedPackIds = removals
      .filter((e) => e.category === "packs")
      .map((e) => e.identifier);

    expect(removedPackIds).toContain("sales-quote-pack");
  });

  it("detects modified items when attributes differ", async () => {
    // Modify a pack version in the target workspace
    await execute(
      `UPDATE ${TABLES.packInstallations} SET pack_version = '2.0.0' WHERE workspace_id = ? AND pack_id = ?`,
      [targetWorkspaceId, "crm-lite-pack"],
    );

    const baseline = await extractWorkspaceConfig(baselineWorkspaceId);
    const target = await extractWorkspaceConfig(targetWorkspaceId);
    const diff = computeConfigDiff(baseline, target);

    const modifications = diff.entries.filter((e) => e.changeType === "modified");
    const modifiedPack = modifications.find(
      (e) => e.category === "packs" && e.identifier === "crm-lite-pack",
    );

    expect(modifiedPack).toBeDefined();
    expect(modifiedPack!.before).toBeDefined();
    expect(modifiedPack!.after).toBeDefined();
  });

  it("produces correct summary counts", async () => {
    const baseline = await extractWorkspaceConfig(baselineWorkspaceId);
    const target = await extractWorkspaceConfig(targetWorkspaceId);
    const diff = computeConfigDiff(baseline, target);

    expect(diff.summary.totalChanges).toBe(diff.entries.length);
    expect(diff.summary.additions).toBe(
      diff.entries.filter((e) => e.changeType === "added").length,
    );
    expect(diff.summary.removals).toBe(
      diff.entries.filter((e) => e.changeType === "removed").length,
    );
    expect(diff.summary.modifications).toBe(
      diff.entries.filter((e) => e.changeType === "modified").length,
    );
  });

  it("returns empty diff for identical snapshots", async () => {
    const snapshot = await extractWorkspaceConfig(baselineWorkspaceId);
    const diff = computeConfigDiff(snapshot, snapshot);

    expect(diff.entries).toHaveLength(0);
    expect(diff.summary.totalChanges).toBe(0);
  });

  it("sorts entries by category, then changeType, then identifier", async () => {
    const baseline = await extractWorkspaceConfig(baselineWorkspaceId);
    const target = await extractWorkspaceConfig(targetWorkspaceId);
    const diff = computeConfigDiff(baseline, target);

    for (let i = 1; i < diff.entries.length; i++) {
      const prev = diff.entries[i - 1];
      const curr = diff.entries[i];
      const prevKey = `${prev.category}|${prev.changeType}|${prev.identifier}`;
      const currKey = `${curr.category}|${curr.changeType}|${curr.identifier}`;
      expect(prevKey.localeCompare(currKey)).toBeLessThanOrEqual(0);
    }
  });
});

// ── Coverage Metrics Tests ──

describe("computeCoverageMetrics", () => {
  it("calculates standard vs extension coverage correctly", async () => {
    const snapshot = await extractWorkspaceConfig(targetWorkspaceId);
    const coverage = computeCoverageMetrics(snapshot);

    // Target has 3 objects: 2 module_owned + 1 extension
    expect(coverage.standardObjectCount).toBe(2);
    expect(coverage.extensionObjectCount).toBe(1);

    // Target has 4 fields: 3 module_owned + 1 extension
    expect(coverage.standardFieldCount).toBe(3);
    expect(coverage.extensionFieldCount).toBe(1);

    // Coverage percentage should be calculated
    expect(coverage.standardCoveragePct).toBeGreaterThan(0);
    expect(coverage.extensionCoveragePct).toBeGreaterThan(0);
    expect(coverage.standardCoveragePct + coverage.extensionCoveragePct).toBeCloseTo(100, 1);
  });

  it("meets 90/10 target when extensions are minimal", async () => {
    const snapshot = await extractWorkspaceConfig(baselineWorkspaceId);
    const coverage = computeCoverageMetrics(snapshot);

    // Baseline has no extensions at all
    expect(coverage.extensionObjectCount).toBe(0);
    expect(coverage.extensionFieldCount).toBe(0);
    expect(coverage.meets90_10Target).toBe(true);
    expect(coverage.standardCoveragePct).toBe(100);
  });

  it("handles empty workspace gracefully", async () => {
    const emptySnapshot: WorkspaceConfigSnapshot = {
      workspaceId: "empty",
      packs: [],
      extensions: [],
      objects: [],
      fields: [],
      views: [],
      navigation: [],
      relations: [],
      automations: [],
      workflows: [],
      forms: [],
    };
    const coverage = computeCoverageMetrics(emptySnapshot);

    expect(coverage.standardCoveragePct).toBe(100);
    expect(coverage.extensionCoveragePct).toBe(0);
    expect(coverage.meets90_10Target).toBe(true);
  });
});

// ── High-level API Tests ──

describe("diffWorkspaces", () => {
  it("diffs two workspaces end-to-end", async () => {
    const diff = await diffWorkspaces(baselineWorkspaceId, targetWorkspaceId);

    expect(diff.baselineWorkspaceId).toBe(baselineWorkspaceId);
    expect(diff.targetWorkspaceId).toBe(targetWorkspaceId);
    expect(diff.generatedAt).toBeTruthy();
    expect(diff.entries.length).toBeGreaterThan(0);
    expect(diff.coverage).toBeDefined();
  });
});

describe("diffWorkspaceAgainstReference", () => {
  it("diffs workspace against a reference solution spec", async () => {
    const diff = await diffWorkspaceAgainstReference(
      {
        name: "reactive-service",
        packs: [
          { packId: "crm-lite-pack", includeDemoData: true },
          { packId: "fsm-pack", includeDemoData: true },
          { packId: "sales-quote-pack", includeDemoData: true },
        ],
      },
      targetWorkspaceId,
    );

    // Target has all 3 reference packs, so no pack additions or removals
    const packEntries = diff.entries.filter((e) => e.category === "packs");
    // Target may have same packs but with different versions, so check for no removals
    const packRemovals = packEntries.filter((e) => e.changeType === "removed");
    expect(packRemovals).toHaveLength(0);

    // Coverage should be computed
    expect(diff.coverage).toBeDefined();
    // Target has extensions (custom_asset, loyalty_tier) so coverage < 90%
    expect(diff.coverage!.standardCoveragePct).toBeLessThan(90);
    expect(diff.coverage!.meets90_10Target).toBe(false);
  });

  it("shows missing packs when target doesn't match reference", async () => {
    const diff = await diffWorkspaceAgainstReference(
      {
        name: "full-service",
        packs: [
          { packId: "crm-lite-pack", includeDemoData: true },
          { packId: "fsm-pack", includeDemoData: true },
          { packId: "sales-quote-pack", includeDemoData: true },
          { packId: "invoicing-pack", includeDemoData: true },
        ],
      },
      baselineWorkspaceId,
    );

    // Baseline doesn't have sales-quote-pack or invoicing-pack
    const packRemovals = diff.entries.filter(
      (e) => e.category === "packs" && e.changeType === "removed",
    );
    const removedPackIds = packRemovals.map((e) => e.identifier);
    expect(removedPackIds).toContain("sales-quote-pack");
    expect(removedPackIds).toContain("invoicing-pack");
  });
});

// ── Coverage Validation Report Tests ──

describe("generateCoverageValidationReport", () => {
  it("aggregates coverage across all provisioned workspaces", async () => {
    const report = await generateCoverageValidationReport();

    expect(report.totalWorkspaces).toBe(2);
    expect(report.passingWorkspaces + report.failingWorkspaces).toBe(2);
    expect(report.passRate).toBeGreaterThan(0);
    expect(report.averageStandardCoverage).toBeGreaterThan(0);
    expect(report.averageStandardCoverage + report.averageExtensionCoverage).toBeCloseTo(100, 1);
    expect(report.workspaces).toHaveLength(2);
  });

  it("sorts workspaces by standard coverage ascending", async () => {
    const report = await generateCoverageValidationReport();

    for (let i = 1; i < report.workspaces.length; i++) {
      expect(report.workspaces[i - 1].coverage.standardCoveragePct)
        .toBeLessThanOrEqual(report.workspaces[i].coverage.standardCoveragePct);
    }
  });

  it("correctly identifies which workspaces meet the 90/10 target", async () => {
    const report = await generateCoverageValidationReport();

    const baselineEntry = report.workspaces.find((w) => w.workspaceId === baselineWorkspaceId);
    const targetEntry = report.workspaces.find((w) => w.workspaceId === targetWorkspaceId);

    // Baseline has no extensions → meets target
    expect(baselineEntry).toBeDefined();
    expect(baselineEntry!.meetsTarget).toBe(true);

    // Target has extensions → may or may not meet target depending on ratio
    expect(targetEntry).toBeDefined();
  });

  it("handles empty workspace list gracefully", async () => {
    // Reset database with no workspaces
    await resetDatabase();

    const report = await generateCoverageValidationReport();

    expect(report.totalWorkspaces).toBe(0);
    expect(report.passingWorkspaces).toBe(0);
    expect(report.failingWorkspaces).toBe(0);
    expect(report.passRate).toBe(100);
    expect(report.overallMeetsTarget).toBe(true);
    expect(report.workspaces).toHaveLength(0);
  });
});

describe("generateWorkspaceCoverageReport", () => {
  it("generates a detailed coverage report for a single workspace", async () => {
    const report = await generateWorkspaceCoverageReport(targetWorkspaceId);

    expect(report.workspaceId).toBe(targetWorkspaceId);
    expect(report.workspaceName).toBe("Target Workspace");
    expect(report.packCount).toBe(3);
    expect(report.extensionCount).toBe(1);
    expect(report.coverage).toBeDefined();
    expect(report.meetsTarget).toBeDefined();
  });

  it("throws for non-existent workspace", async () => {
    await expect(
      generateWorkspaceCoverageReport("nonexistent_ws"),
    ).rejects.toThrow("Workspace not found");
  });
});
