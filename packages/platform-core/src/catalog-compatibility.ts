import { satisfies as semverSatisfies } from "semver";
import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import { type Principal, NotFoundError } from "./context";
import {
  getCatalogVersion,
  getCatalogItem,
  parseManifest,
  type CatalogVersion,
  type CatalogItem,
} from "./catalog-registry";
import { type ModuleManifest } from "@runory/contracts";

// ── Types ──

export type CompatibilityStatus = "compatible" | "warning" | "blocked";

export interface CompatibilityReport {
  id: string;
  workspaceId: string;
  catalogItemId: string;
  fromVersionId: string | null;
  toVersionId: string;
  status: CompatibilityStatus;
  coreCompatibility: Record<string, unknown> | null;
  dependencyDiff: Record<string, unknown> | null;
  permissionDiff: Record<string, unknown> | null;
  schemaDiff: Record<string, unknown> | null;
  extensionConflicts: Record<string, unknown> | null;
  migrationRisk: Record<string, unknown> | null;
  createdAt: string;
}

// ── DB Row Types (snake_case) ──

interface CompatibilityReportRow {
  id: string;
  workspace_id: string;
  catalog_item_id: string;
  from_version_id: string | null;
  to_version_id: string;
  status: string;
  core_compatibility_json: string | null;
  dependency_diff_json: string | null;
  permission_diff_json: string | null;
  schema_diff_json: string | null;
  extension_conflicts_json: string | null;
  migration_risk_json: string | null;
  created_at: string;
}

// ── Row → Object Mapper ──

function mapCompatibilityReport(row: CompatibilityReportRow): CompatibilityReport {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    catalogItemId: row.catalog_item_id,
    fromVersionId: row.from_version_id,
    toVersionId: row.to_version_id,
    status: row.status as CompatibilityStatus,
    coreCompatibility: row.core_compatibility_json
      ? JSON.parse(row.core_compatibility_json)
      : null,
    dependencyDiff: row.dependency_diff_json
      ? JSON.parse(row.dependency_diff_json)
      : null,
    permissionDiff: row.permission_diff_json
      ? JSON.parse(row.permission_diff_json)
      : null,
    schemaDiff: row.schema_diff_json
      ? JSON.parse(row.schema_diff_json)
      : null,
    extensionConflicts: row.extension_conflicts_json
      ? JSON.parse(row.extension_conflicts_json)
      : null,
    migrationRisk: row.migration_risk_json
      ? JSON.parse(row.migration_risk_json)
      : null,
    createdAt: row.created_at,
  };
}

// ── Constants ──

const PLATFORM_VERSION = "1.0.0";

// ── Helper: Compare Permissions (docs/09 §12.2) ──

export function comparePermissions(
  from: string[] | undefined,
  to: string[] | undefined
): { added: string[]; removed: string[]; status: "compatible" | "warning" } {
  const fromSet = new Set(from ?? []);
  const toSet = new Set(to ?? []);
  const added = [...toSet].filter((p) => !fromSet.has(p));
  const removed = [...fromSet].filter((p) => !toSet.has(p));
  const status: "compatible" | "warning" =
    added.length > 0 || removed.length > 0 ? "warning" : "compatible";
  return { added, removed, status };
}

// ── Helper: Compare Schema (objects and fields) ──

export function compareSchema(
  fromManifest: ModuleManifest | null,
  toManifest: ModuleManifest
): {
  addedObjects: string[];
  removedObjects: string[];
  addedFields: Array<{ object: string; field: string }>;
  removedFields: Array<{ object: string; field: string }>;
  changedFieldTypes: Array<{
    object: string;
    field: string;
    from: string;
    to: string;
  }>;
  status: "compatible" | "warning" | "blocked";
} {
  const addedObjects: string[] = [];
  const removedObjects: string[] = [];
  const addedFields: Array<{ object: string; field: string }> = [];
  const removedFields: Array<{ object: string; field: string }> = [];
  const changedFieldTypes: Array<{
    object: string;
    field: string;
    from: string;
    to: string;
  }> = [];

  // Build field maps: objectKey -> (fieldKey -> fieldType)
  const fromObjects = new Map<string, Map<string, string>>();
  if (fromManifest) {
    for (const obj of fromManifest.objects) {
      const fieldMap = new Map<string, string>();
      for (const f of obj.fields) {
        fieldMap.set(f.key, f.type);
      }
      fromObjects.set(obj.key, fieldMap);
    }
  }

  const toObjects = new Map<string, Map<string, string>>();
  for (const obj of toManifest.objects) {
    const fieldMap = new Map<string, string>();
    for (const f of obj.fields) {
      fieldMap.set(f.key, f.type);
    }
    toObjects.set(obj.key, fieldMap);
  }

  // Added / removed objects
  for (const key of toObjects.keys()) {
    if (!fromObjects.has(key)) addedObjects.push(key);
  }
  for (const key of fromObjects.keys()) {
    if (!toObjects.has(key)) removedObjects.push(key);
  }

  // Field diffs for objects present in both
  for (const [objKey, toFields] of toObjects.entries()) {
    const fromFields = fromObjects.get(objKey);
    if (!fromFields) continue; // added object — skip field-level diff

    for (const [fieldKey, toType] of toFields.entries()) {
      const fromType = fromFields.get(fieldKey);
      if (fromType === undefined) {
        addedFields.push({ object: objKey, field: fieldKey });
      } else if (fromType !== toType) {
        changedFieldTypes.push({
          object: objKey,
          field: fieldKey,
          from: fromType,
          to: toType,
        });
      }
    }
    for (const [fieldKey] of fromFields.entries()) {
      if (!toFields.has(fieldKey)) {
        removedFields.push({ object: objKey, field: fieldKey });
      }
    }
  }

  // Removed fields = blocked (data loss risk)
  // Removed objects = warning
  // Changed field types = warning
  let status: "compatible" | "warning" | "blocked" = "compatible";
  if (removedFields.length > 0) {
    status = "blocked";
  } else if (removedObjects.length > 0 || changedFieldTypes.length > 0) {
    status = "warning";
  }

  return {
    addedObjects,
    removedObjects,
    addedFields,
    removedFields,
    changedFieldTypes,
    status,
  };
}

// ── Helper: Dependency Diff ──

function diffDependencies(
  from: string[] | undefined,
  to: string[] | undefined
): {
  added: string[];
  removed: string[];
  changed: string[];
  status: "compatible" | "warning";
} {
  const fromSet = new Set(from ?? []);
  const toSet = new Set(to ?? []);
  const added = [...toSet].filter((d) => !fromSet.has(d));
  const removed = [...fromSet].filter((d) => !toSet.has(d));
  // Dependencies in this codebase are plain module names (e.g. "runory.customer");
  // there is no version-range component to detect "changed" entries.
  const changed: string[] = [];
  const status: "compatible" | "warning" =
    removed.length > 0 || changed.length > 0 ? "warning" : "compatible";
  return { added, removed, changed, status };
}

// ── Helper: Extension Conflict Check ──
//
// POC simplification (docs/09 §12.2): check if the workspace has any active
// extensions targeting the same module. Extension manifests live in
// extension_versions.manifest_json (ExtensionPlan shape with `targetModules`).

async function checkExtensionConflicts(
  workspaceId: string,
  moduleName: string
): Promise<{
  conflictingExtensions: Array<{
    id: string;
    name: string;
    targetModules: string[];
  }>;
  status: "compatible" | "warning";
}> {
  const rows = await queryAll<{ id: string; name: string; manifest_json: string }>(
    `SELECT ed.id, ed.name, ev.manifest_json
     FROM ${TABLES.extensionDefinitions} ed
     JOIN ${TABLES.extensionVersions} ev
       ON ev.extension_id = ed.id AND ev.version = ed.current_version
     WHERE ed.workspace_id = ? AND ed.status = 'active'`,
    [workspaceId]
  );

  const conflictingExtensions: Array<{
    id: string;
    name: string;
    targetModules: string[];
  }> = [];

  for (const row of rows) {
    try {
      const plan = JSON.parse(row.manifest_json) as { targetModules?: string[] };
      const targetModules = plan.targetModules ?? [];
      if (targetModules.includes(moduleName)) {
        conflictingExtensions.push({
          id: row.id,
          name: row.name,
          targetModules,
        });
      }
    } catch {
      // Skip extensions with unparseable manifests
    }
  }

  return {
    conflictingExtensions,
    status: conflictingExtensions.length > 0 ? "warning" : "compatible",
  };
}

// ── Helper: Migration Risk Assessment ──

function assessMigrationRisk(
  manifest: ModuleManifest
): {
  totalSteps: number;
  highRiskSteps: number;
  mediumRiskSteps: number;
  lowRiskSteps: number;
  steps: Array<{ from: string | undefined; to: string; risk: string }>;
  status: "compatible" | "warning";
} {
  const upgradeSteps = manifest.migrations.upgrade ?? [];
  const steps = upgradeSteps.map((s) => ({
    from: s.from,
    to: s.to,
    risk: s.risk,
  }));
  const highRiskSteps = steps.filter((s) => s.risk === "high").length;
  const mediumRiskSteps = steps.filter((s) => s.risk === "medium").length;
  const lowRiskSteps = steps.filter((s) => s.risk === "low").length;
  const status: "compatible" | "warning" =
    highRiskSteps > 0 || mediumRiskSteps > 0 ? "warning" : "compatible";
  return {
    totalSteps: steps.length,
    highRiskSteps,
    mediumRiskSteps,
    lowRiskSteps,
    steps,
    status,
  };
}

// ── Helper: Core Compatibility Check ──

function checkCoreCompatibility(
  manifest: ModuleManifest
): {
  platformVersion: string;
  range: string;
  satisfied: boolean;
  status: "compatible" | "blocked";
} {
  const range = manifest.coreCompatibility;
  let satisfied = true;
  try {
    satisfied = semverSatisfies(PLATFORM_VERSION, range);
  } catch {
    satisfied = false;
  }
  return {
    platformVersion: PLATFORM_VERSION,
    range,
    satisfied,
    status: satisfied ? "compatible" : "blocked",
  };
}

// ── Generate Compatibility Report (docs/09 §12.2) ──

export async function generateCompatibilityReport(
  principal: Principal,
  params: {
    workspaceId: string;
    catalogItemId: string;
    fromVersionId?: string | null;
    toVersionId: string;
  }
): Promise<CompatibilityReport> {
  const { workspaceId, catalogItemId, toVersionId } = params;
  const fromVersionId = params.fromVersionId ?? null;

  // Load target version and catalog item
  const toVersion = await getCatalogVersion(toVersionId);
  const catalogItem = await getCatalogItem(catalogItemId);

  // Load from version if provided (null = fresh install)
  let fromVersion: CatalogVersion | null = null;
  if (fromVersionId) {
    fromVersion = await getCatalogVersion(fromVersionId);
  }

  // Parse manifests — full compatibility checks apply to modules only
  let toManifest: ModuleManifest | null = null;
  let fromManifest: ModuleManifest | null = null;
  if (catalogItem.itemType === "module") {
    toManifest = parseManifest(toVersion.manifestJson, "module") as ModuleManifest;
    if (fromVersion) {
      fromManifest = parseManifest(
        fromVersion.manifestJson,
        "module"
      ) as ModuleManifest;
    }
  }

  // Run compatibility checks (module-only; non-module items get null diffs)
  let coreCompatibilityResult: Record<string, unknown> | null = null;
  let dependencyDiffResult: Record<string, unknown> | null = null;
  let permissionDiffResult: Record<string, unknown> | null = null;
  let schemaDiffResult: Record<string, unknown> | null = null;
  let extensionConflictsResult: Record<string, unknown> | null = null;
  let migrationRiskResult: Record<string, unknown> | null = null;

  const statuses: CompatibilityStatus[] = [];

  if (toManifest) {
    // 1. Core compatibility
    const core = checkCoreCompatibility(toManifest);
    coreCompatibilityResult = core;
    statuses.push(core.status);

    // 2. Dependency diff
    const depDiff = diffDependencies(
      fromManifest?.dependencies,
      toManifest.dependencies
    );
    dependencyDiffResult = depDiff;
    statuses.push(depDiff.status);

    // 3. Permission diff
    const permDiff = comparePermissions(
      fromManifest?.permissions,
      toManifest.permissions
    );
    permissionDiffResult = permDiff;
    statuses.push(permDiff.status);

    // 4. Schema diff
    const schemaDiff = compareSchema(fromManifest, toManifest);
    schemaDiffResult = schemaDiff;
    statuses.push(schemaDiff.status);

    // 5. Extension conflicts
    const extConflicts = await checkExtensionConflicts(
      workspaceId,
      catalogItem.name
    );
    extensionConflictsResult = extConflicts;
    statuses.push(extConflicts.status);

    // 6. Migration risk
    const migRisk = assessMigrationRisk(toManifest);
    migrationRiskResult = migRisk;
    statuses.push(migRisk.status);
  } else {
    // Non-module items: all checks pass (no module-specific constraints)
    statuses.push("compatible");
  }

  // Determine overall status
  let overall: CompatibilityStatus = "compatible";
  if (statuses.includes("blocked")) {
    overall = "blocked";
  } else if (statuses.includes("warning")) {
    overall = "warning";
  }

  // Insert compatibility_reports row
  const reportId = genId("compat");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.compatibilityReports}
     (id, workspace_id, catalog_item_id, from_version_id, to_version_id, status,
      core_compatibility_json, dependency_diff_json, permission_diff_json,
      schema_diff_json, extension_conflicts_json, migration_risk_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reportId,
      workspaceId,
      catalogItemId,
      fromVersionId,
      toVersionId,
      overall,
      coreCompatibilityResult ? JSON.stringify(coreCompatibilityResult) : null,
      dependencyDiffResult ? JSON.stringify(dependencyDiffResult) : null,
      permissionDiffResult ? JSON.stringify(permissionDiffResult) : null,
      schemaDiffResult ? JSON.stringify(schemaDiffResult) : null,
      extensionConflictsResult ? JSON.stringify(extensionConflictsResult) : null,
      migrationRiskResult ? JSON.stringify(migrationRiskResult) : null,
      ts,
    ]
  );

  return {
    id: reportId,
    workspaceId,
    catalogItemId,
    fromVersionId,
    toVersionId,
    status: overall,
    coreCompatibility: coreCompatibilityResult,
    dependencyDiff: dependencyDiffResult,
    permissionDiff: permissionDiffResult,
    schemaDiff: schemaDiffResult,
    extensionConflicts: extensionConflictsResult,
    migrationRisk: migrationRiskResult,
    createdAt: ts,
  };
}

// ── Get Compatibility Report ──

export async function getCompatibilityReport(
  reportId: string
): Promise<CompatibilityReport> {
  const row = await queryOne<CompatibilityReportRow>(
    `SELECT * FROM ${TABLES.compatibilityReports} WHERE id = ?`,
    [reportId]
  );
  if (!row) {
    throw new NotFoundError(`Compatibility report not found: ${reportId}`);
  }
  return mapCompatibilityReport(row);
}

// ── Get Latest Compatibility Report ──

export async function getLatestCompatibilityReport(
  workspaceId: string,
  catalogItemId: string
): Promise<CompatibilityReport | null> {
  const row = await queryOne<CompatibilityReportRow>(
    `SELECT * FROM ${TABLES.compatibilityReports}
     WHERE workspace_id = ? AND catalog_item_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, catalogItemId]
  );
  return row ? mapCompatibilityReport(row) : null;
}

// ── List Compatibility Reports ──

export async function listCompatibilityReports(
  workspaceId: string,
  catalogItemId?: string
): Promise<CompatibilityReport[]> {
  const conditions = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];
  if (catalogItemId) {
    conditions.push("catalog_item_id = ?");
    args.push(catalogItemId);
  }
  const rows = await queryAll<CompatibilityReportRow>(
    `SELECT * FROM ${TABLES.compatibilityReports}
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    args
  );
  return rows.map(mapCompatibilityReport);
}
