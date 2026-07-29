import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  capturePreUpgradeSnapshot,
  validateUpgrade,
  getUpgradeExecutionStatus,
} from "./upgrade-executor";
import {
  rollbackUpgrade,
  canRollback,
  loadRollbackSnapshot,
} from "./upgrade-rollback";
import {
  compareSnapshots,
  captureContractFreezeSnapshot,
} from "./contract-freeze";
import {
  publishPolicy,
  listPolicies,
  getPolicy,
  getDefaultPolicies,
  publishDefaultPolicies,
  generateVocabularyReport,
} from "./upgrade-policy";
import { TABLES } from "./contracts";
import { db, execute, genId, now } from "./db";
import { runMigrations } from "./migrations";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;

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

async function createInstallation(wsId: string, moduleId: string, version: string) {
  await execute(
    `INSERT INTO ${TABLES.installations} (id, workspace_id, module_id, module_version, pack_id, status, installed_at)
     VALUES (?, ?, ?, ?, 'test-pack', 'installed', ?)`,
    [genId("inst"), wsId, moduleId, version, now()],
  );
}

async function createObjectDef(wsId: string, objectKey: string, moduleId: string) {
  await execute(
    `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at)
     VALUES (?, ?, ?, ?, ?, 'module_owned', ?)`,
    [genId("obj"), wsId, objectKey, objectKey.replace(/_/g, " "), moduleId, now()],
  );
}

async function createFieldDef(
  wsId: string,
  objectKey: string,
  fieldKey: string,
  type: string,
  moduleId: string,
) {
  await execute(
    `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, module_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'module_owned', 0, ?, ?)`,
    [genId("fld"), wsId, objectKey, fieldKey, fieldKey, type, moduleId, now()],
  );
}

async function createViewDef(
  wsId: string,
  objectKey: string,
  viewKey: string,
  moduleId: string,
) {
  await execute(
    `INSERT INTO ${TABLES.viewDefinitions} (id, workspace_id, object_key, view_key, view_type, label, config_json, module_id, created_at)
     VALUES (?, ?, ?, ?, 'list', ?, '{}', ?, ?)`,
    [genId("vw"), wsId, objectKey, viewKey, viewKey, moduleId, now()],
  );
}

async function createRolloutTarget(
  rolloutId: string,
  wsId: string,
  toVersionId: string,
): Promise<string> {
  const targetId = genId("rtgt");
  await execute(
    `INSERT INTO ${TABLES.rolloutTargets}
     (id, rollout_id, workspace_id, from_version_id, to_version_id, status, reason_code, started_at, completed_at, created_at)
     VALUES (?, ?, ?, NULL, ?, 'pending', NULL, NULL, NULL, ?)`,
    [targetId, rolloutId, wsId, toVersionId, now()],
  );
  return targetId;
}

async function createCatalogItem(itemId: string, name: string) {
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.catalogItems} (id, item_type, name, description, publisher_id, visibility, status, created_at, updated_at)
     VALUES (?, 'module', ?, 'Test module', 'test-publisher', 'internal', 'active', ?, ?)`,
    [itemId, name, ts, ts],
  );
}

async function createCatalogVersion(versionId: string, itemId: string, manifestJson: string) {
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.catalogVersions} (id, catalog_item_id, version, lifecycle_status, manifest_json, manifest_schema_version, created_by, created_at)
     VALUES (?, ?, '1.0.0', 'ready', ?, '1.0', 'test-user', ?)`,
    [versionId, itemId, manifestJson, ts],
  );
}

async function createCatalogRelease(releaseId: string, versionId: string) {
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.catalogReleases} (id, catalog_version_id, channel, status, released_at, created_at)
     VALUES (?, ?, 'stable', 'active', ?, ?)`,
    [releaseId, versionId, ts, ts],
  );
}

async function createReleaseRollout(rolloutId: string): Promise<string> {
  // Create the full FK chain: catalog_item → catalog_version → catalog_release → release_rollout
  const itemId = genId("citem");
  const versionId = genId("cver");
  const releaseId = genId("crel");
  await createCatalogItem(itemId, "test-module");
  await createCatalogVersion(versionId, itemId, JSON.stringify({ id: "runory.test", version: "1.0.0" }));
  await createCatalogRelease(releaseId, versionId);

  await execute(
    `INSERT INTO ${TABLES.releaseRollouts}
     (id, catalog_release_id, target_type, target_config_json, status, success_threshold, failure_threshold, started_by, started_at, completed_at, created_at)
     VALUES (?, ?, 'allowlist', '{}', 'running', 0.95, 0.05, 'test-user', ?, NULL, ?)`,
    [rolloutId, releaseId, now(), now()],
  );
  return releaseId;
}

beforeEach(async () => {
  await resetDatabase();
  workspaceId = genId("ws");
  await createWorkspace(workspaceId, "Test Workspace");
});

// ── Snapshot Tests ──

describe("capturePreUpgradeSnapshot", () => {
  it("captures installation and metadata state before upgrade", async () => {
    const moduleId = "runory.test";
    await createInstallation(workspaceId, moduleId, "1.0.0");
    await createObjectDef(workspaceId, "test_object", moduleId);
    await createFieldDef(workspaceId, "test_object", "name", "text", moduleId);
    await createViewDef(workspaceId, "test_object", "test_list", moduleId);

    const targetId = genId("rtgt");
    const snapshot = await capturePreUpgradeSnapshot(
      targetId,
      workspaceId,
      moduleId,
      "1.0.0",
      "1.1.0",
    );

    expect(snapshot.targetId).toBe(targetId);
    expect(snapshot.workspaceId).toBe(workspaceId);
    expect(snapshot.moduleId).toBe(moduleId);
    expect(snapshot.versionBeforeUpgrade).toBe("1.0.0");
    expect(snapshot.versionAfterUpgrade).toBe("1.1.0");
    expect(snapshot.metadataState.objects).toHaveLength(1);
    expect(snapshot.metadataState.fields).toHaveLength(1);
    expect(snapshot.metadataState.views).toHaveLength(1);
  });

  it("returns empty metadata for module with no objects", async () => {
    const moduleId = "runory.empty";
    await createInstallation(workspaceId, moduleId, "1.0.0");

    const targetId = genId("rtgt");
    const snapshot = await capturePreUpgradeSnapshot(
      targetId,
      workspaceId,
      moduleId,
      "1.0.0",
      "1.1.0",
    );

    expect(snapshot.metadataState.objects).toHaveLength(0);
    expect(snapshot.metadataState.fields).toHaveLength(0);
  });
});

// ── Validation Tests ──

describe("validateUpgrade", () => {
  it("returns pass checks when all expected metadata exists", async () => {
    const moduleId = "runory.test";
    await createInstallation(workspaceId, moduleId, "1.1.0");
    await createObjectDef(workspaceId, "test_object", moduleId);
    await createFieldDef(workspaceId, "test_object", "name", "text", moduleId);
    await createViewDef(workspaceId, "test_object", "test_list", moduleId);

    const manifest = {
      id: moduleId,
      name: "Test Module",
      version: "1.1.0",
      coreCompatibility: "^0.9",
      objects: [
        {
          key: "test_object",
          label: "Test Object",
          fields: [
            { key: "name", label: "Name", type: "text", ownership: "module_owned", required: false },
          ],
        },
      ],
      views: [
        { object: "test_object", key: "test_list", type: "list", label: "Test List", config: {} },
      ],
      migrations: { install: "migrations/install.sql", uninstallPolicy: "retain_data" },
    };

    const checks = await validateUpgrade(workspaceId, moduleId, manifest as any);

    const passes = checks.filter((c) => c.status === "pass");
    const fails = checks.filter((c) => c.status === "fail");
    expect(fails).toHaveLength(0);
    expect(passes.length).toBeGreaterThan(0);
  });

  it("returns fail checks when expected objects are missing", async () => {
    const moduleId = "runory.test";
    await createInstallation(workspaceId, moduleId, "1.1.0");

    const manifest = {
      id: moduleId,
      name: "Test Module",
      version: "1.1.0",
      coreCompatibility: "^0.9",
      objects: [
        {
          key: "missing_object",
          label: "Missing Object",
          fields: [],
        },
      ],
      views: [],
      migrations: { install: "migrations/install.sql", uninstallPolicy: "retain_data" },
    };

    const checks = await validateUpgrade(workspaceId, moduleId, manifest as any);

    const fails = checks.filter((c) => c.status === "fail");
    expect(fails.length).toBeGreaterThan(0);
    expect(fails.some((c) => c.name.includes("missing_object"))).toBe(true);
  });
});

// ── Rollback Tests ──

describe("rollbackUpgrade", () => {
  it("returns failed status when no snapshot exists", async () => {
    const targetId = genId("rtgt");
    const result = await rollbackUpgrade(targetId);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("No pre-upgrade snapshot");
  });

  it("returns not eligible when target has no snapshot", async () => {
    const rolloutId = genId("roll");
    await createReleaseRollout(rolloutId);
    const targetId = await createRolloutTarget(rolloutId, workspaceId, "version-1");

    const result = await canRollback(targetId);
    expect(result.eligible).toBe(false);
  });
});

// ── Contract Freeze Tests ──

describe("contract freeze", () => {
  it("captures a snapshot with all contract categories", async () => {
    const snapshot = await captureContractFreezeSnapshot();

    expect(snapshot.capturedAt).toBeDefined();
    expect(snapshot.contracts).toBeDefined();
    expect(snapshot.contracts.api_routes).toBeDefined();
    expect(snapshot.contracts.mcp_tools).toBeDefined();
    expect(snapshot.contracts.pack_manifests).toBeDefined();
    expect(snapshot.contracts.extension_contracts).toBeDefined();
    expect(snapshot.contracts.command_contracts).toBeDefined();
    expect(snapshot.contracts.permission_vocab).toBeDefined();
  });

  it("detects no violations when comparing identical snapshots", () => {
    const snapshot: any = {
      capturedAt: now(),
      contracts: {
        api_routes: [{ identifier: "GET /test", checksum: "abc123" }],
        mcp_tools: [],
        pack_manifests: [],
        extension_contracts: [],
        command_contracts: [],
        permission_vocab: [],
      },
    };

    const violations = compareSnapshots(snapshot, snapshot);
    expect(violations).toHaveLength(0);
  });

  it("detects added contracts as violations", () => {
    const frozen: any = {
      capturedAt: now(),
      contracts: {
        api_routes: [{ identifier: "GET /test", checksum: "abc123" }],
        mcp_tools: [],
        pack_manifests: [],
        extension_contracts: [],
        command_contracts: [],
        permission_vocab: [],
      },
    };

    const current: any = {
      capturedAt: now(),
      contracts: {
        api_routes: [
          { identifier: "GET /test", checksum: "abc123" },
          { identifier: "POST /new", checksum: "def456" },
        ],
        mcp_tools: [],
        pack_manifests: [],
        extension_contracts: [],
        command_contracts: [],
        permission_vocab: [],
      },
    };

    const violations = compareSnapshots(frozen, current);
    expect(violations).toHaveLength(1);
    expect(violations[0].changeType).toBe("added");
    expect(violations[0].identifier).toBe("POST /new");
  });

  it("detects removed contracts as violations", () => {
    const frozen: any = {
      capturedAt: now(),
      contracts: {
        api_routes: [
          { identifier: "GET /test", checksum: "abc123" },
          { identifier: "POST /old", checksum: "def456" },
        ],
        mcp_tools: [],
        pack_manifests: [],
        extension_contracts: [],
        command_contracts: [],
        permission_vocab: [],
      },
    };

    const current: any = {
      capturedAt: now(),
      contracts: {
        api_routes: [{ identifier: "GET /test", checksum: "abc123" }],
        mcp_tools: [],
        pack_manifests: [],
        extension_contracts: [],
        command_contracts: [],
        permission_vocab: [],
      },
    };

    const violations = compareSnapshots(frozen, current);
    expect(violations).toHaveLength(1);
    expect(violations[0].changeType).toBe("removed");
    expect(violations[0].identifier).toBe("POST /old");
  });

  it("detects modified contracts as violations", () => {
    const frozen: any = {
      capturedAt: now(),
      contracts: {
        api_routes: [{ identifier: "GET /test", checksum: "abc123" }],
        mcp_tools: [],
        pack_manifests: [],
        extension_contracts: [],
        command_contracts: [],
        permission_vocab: [],
      },
    };

    const current: any = {
      capturedAt: now(),
      contracts: {
        api_routes: [{ identifier: "GET /test", checksum: "changed789" }],
        mcp_tools: [],
        pack_manifests: [],
        extension_contracts: [],
        command_contracts: [],
        permission_vocab: [],
      },
    };

    const violations = compareSnapshots(frozen, current);
    expect(violations).toHaveLength(1);
    expect(violations[0].changeType).toBe("modified");
    expect(violations[0].detail).toContain("abc123");
    expect(violations[0].detail).toContain("changed789");
  });
});

// ── Policy Tests ──

describe("upgrade policy", () => {
  it("returns 4 default policies", () => {
    const policies = getDefaultPolicies();
    expect(policies).toHaveLength(4);
    expect(policies.map((p) => p.type)).toEqual([
      "compatibility",
      "upgrade",
      "deprecation",
      "known_boundaries",
    ]);
  });

  it("publishes and lists policies", async () => {
    const published = await publishDefaultPolicies({ userId: "test-user" });
    expect(published).toHaveLength(4);

    const listed = await listPolicies();
    expect(listed).toHaveLength(4);
    expect(listed.map((p) => p.type)).toContain("compatibility");
    expect(listed.map((p) => p.type)).toContain("upgrade");
    expect(listed.map((p) => p.type)).toContain("deprecation");
    expect(listed.map((p) => p.type)).toContain("known_boundaries");
  });

  it("filters policies by type", async () => {
    await publishDefaultPolicies({ userId: "test-user" });

    const upgradePolicies = await listPolicies("upgrade");
    expect(upgradePolicies).toHaveLength(1);
    expect(upgradePolicies[0].type).toBe("upgrade");
  });

  it("retrieves a single policy by ID", async () => {
    const [published] = await publishDefaultPolicies({ userId: "test-user" });
    const retrieved = await getPolicy(published.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe(published.title);
  });
});

// ── Vocabulary Unification Tests ──

describe("vocabulary unification", () => {
  it("generates a report with terms across all domains", async () => {
    const report = await generateVocabularyReport();

    expect(report.generatedAt).toBeDefined();
    expect(report.terms.length).toBeGreaterThan(0);

    const domains = new Set(report.terms.map((t) => t.domain));
    expect(domains.has("lifecycle")).toBe(true);
    expect(domains.has("error_handling")).toBe(true);
    expect(domains.has("ui")).toBe(true);
    expect(domains.has("agent_tools")).toBe(true);
  });

  it("includes lifecycle terms with aliases", async () => {
    const report = await generateVocabularyReport();

    const completed = report.terms.find((t) => t.canonical === "completed");
    expect(completed).toBeDefined();
    expect(completed!.aliases).toContain("done");
    expect(completed!.aliases).toContain("finished");
  });

  it("includes error handling terms", async () => {
    const report = await generateVocabularyReport();

    const notFound = report.terms.find((t) => t.canonical === "not_found");
    expect(notFound).toBeDefined();
    expect(notFound!.domain).toBe("error_handling");
  });

  it("reports duplicate capabilities if any", async () => {
    const report = await generateVocabularyReport();

    expect(report.duplicateCapabilities).toBeDefined();
    expect(typeof report.unifiedCount).toBe("number");
    expect(typeof report.remainingDuplicates).toBe("number");
  });
});

// ── Upgrade Execution Status Tests ──

describe("getUpgradeExecutionStatus", () => {
  it("returns zero counts for empty rollout", async () => {
    const rolloutId = genId("roll");
    await createReleaseRollout(rolloutId);

    const status = await getUpgradeExecutionStatus(rolloutId);

    expect(status.totalTargets).toBe(0);
    expect(status.succeededTargets).toBe(0);
    expect(status.failedTargets).toBe(0);
    expect(status.pendingTargets).toBe(0);
  });

  it("counts targets by status", async () => {
    const rolloutId = genId("roll");
    await createReleaseRollout(rolloutId);

    // Create targets with different workspaces (UNIQUE constraint on rollout_id + workspace_id)
    const ws2 = genId("ws");
    const ws3 = genId("ws");
    await createWorkspace(ws2, "Test Workspace 2");
    await createWorkspace(ws3, "Test Workspace 3");

    const t1 = await createRolloutTarget(rolloutId, workspaceId, "version-1");
    const t2 = await createRolloutTarget(rolloutId, ws2, "version-2");
    const t3 = await createRolloutTarget(rolloutId, ws3, "version-3");

    // Set statuses
    await execute(
      `UPDATE ${TABLES.rolloutTargets} SET status = 'succeeded' WHERE id = ?`,
      [t1],
    );
    await execute(
      `UPDATE ${TABLES.rolloutTargets} SET status = 'failed' WHERE id = ?`,
      [t2],
    );

    const status = await getUpgradeExecutionStatus(rolloutId);

    expect(status.totalTargets).toBe(3);
    expect(status.succeededTargets).toBe(1);
    expect(status.failedTargets).toBe(1);
    expect(status.pendingTargets).toBe(1);
  });
});
