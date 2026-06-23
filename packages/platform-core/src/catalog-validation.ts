import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import {
  type Principal,
  InvalidInputError,
  ConflictError,
} from "./context";
import { writeAuditEvent } from "./audit-service";
import {
  getCatalogVersion,
  getCatalogItem,
  parseManifest,
  requirePlatformRole,
} from "./catalog-registry";
import {
  type ModuleManifest,
  type PackManifest,
  type TemplateManifest,
} from "@runory/contracts";
import { valid as semverValid, validRange as semverValidRange } from "semver";
import { validateModuleDashboard, validatePackDashboard } from "./dashboard";

// ── Types ──

export type ValidationStatus = "queued" | "running" | "passed" | "failed";

export interface ValidationCheck {
  name: string;
  status: "passed" | "failed" | "warning";
  message: string;
  details?: Record<string, unknown>;
}

export interface CatalogValidationResult {
  status: ValidationStatus;
  checks: ValidationCheck[];
  summary: string;
}

export interface ValidationRunRecord {
  id: string;
  status: ValidationStatus;
  validatorVersion: string | null;
  resultJson: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ── Constants ──

const VALIDATOR_VERSION = "1.0.0";
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

// ── SemVer Helpers ──

export function isValidSemVer(version: string): boolean {
  return semverValid(version) !== null;
}

export function isValidSemVerRange(range: string): boolean {
  return semverValidRange(range) !== null;
}

// ── Dependency Cycle Detection (DFS-based) ──

export function detectDependencyCycle(
  moduleId: string,
  dependencies: Record<string, string[]>
): boolean {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  function dfs(node: string): boolean {
    const nodeColor = color.get(node) ?? WHITE;
    if (nodeColor === GRAY) return true; // back edge → cycle
    if (nodeColor === BLACK) return false; // already fully processed
    color.set(node, GRAY);
    const deps = dependencies[node] ?? [];
    for (const dep of deps) {
      if (dfs(dep)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  return dfs(moduleId);
}

// ── Error-isolated check runner ──

async function runCheck(
  name: string,
  fn: () => Promise<ValidationCheck> | ValidationCheck
): Promise<ValidationCheck> {
  try {
    return await fn();
  } catch (err) {
    return {
      name,
      status: "failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Individual Validation Checks ──

type AnyManifest = ModuleManifest | PackManifest | TemplateManifest;

function checkArtifactChecksum(version: {
  artifactChecksum: string | null;
  artifactUri: string | null;
}): ValidationCheck {
  if (!version.artifactChecksum) {
    if (version.artifactUri) {
      return {
        name: "artifact_checksum",
        status: "warning",
        message: "Artifact URI is set but no checksum declared",
      };
    }
    return {
      name: "artifact_checksum",
      status: "passed",
      message: "No artifact checksum to verify (no artifact declared)",
    };
  }
  if (!SHA256_HEX_PATTERN.test(version.artifactChecksum)) {
    return {
      name: "artifact_checksum",
      status: "failed",
      message: `Artifact checksum is not a valid SHA-256 hex string: ${version.artifactChecksum}`,
    };
  }
  return {
    name: "artifact_checksum",
    status: "passed",
    message: "Artifact checksum is a valid SHA-256 hex string",
  };
}

function checkManifestSchema(
  parsedManifest: AnyManifest | null,
  manifestSchemaVersion: string,
  itemType: string
): ValidationCheck {
  if (parsedManifest === null) {
    return {
      name: "manifest_schema",
      status: "failed",
      message: "Manifest failed schema validation (parse error)",
    };
  }
  return {
    name: "manifest_schema",
    status: "passed",
    message: `Manifest parsed successfully as ${itemType} schema v${manifestSchemaVersion}`,
  };
}

function checkSemVer(versionString: string): ValidationCheck {
  if (!isValidSemVer(versionString)) {
    return {
      name: "semver",
      status: "failed",
      message: `Version '${versionString}' is not a valid SemVer string`,
    };
  }
  return {
    name: "semver",
    status: "passed",
    message: `Version '${versionString}' is valid SemVer`,
  };
}

function checkCoreCompatibility(parsedManifest: AnyManifest | null): ValidationCheck {
  if (!parsedManifest) {
    return {
      name: "core_compatibility",
      status: "failed",
      message: "Manifest not available for core compatibility check",
    };
  }
  // TemplateManifest does not declare coreCompatibility
  if (!("coreCompatibility" in parsedManifest)) {
    return {
      name: "core_compatibility",
      status: "passed",
      message: "Core compatibility not applicable for templates",
    };
  }
  const coreCompat = parsedManifest.coreCompatibility;
  if (!isValidSemVerRange(coreCompat)) {
    return {
      name: "core_compatibility",
      status: "failed",
      message: `coreCompatibility '${coreCompat}' is not a valid SemVer range`,
    };
  }
  return {
    name: "core_compatibility",
    status: "passed",
    message: `coreCompatibility '${coreCompat}' is a valid SemVer range`,
  };
}

async function checkDependencyGraph(
  manifest: ModuleManifest | null
): Promise<ValidationCheck> {
  if (!manifest) {
    return {
      name: "dependency_graph",
      status: "failed",
      message: "Manifest not available for dependency graph check",
    };
  }
  const deps = manifest.dependencies ?? [];
  if (deps.length === 0) {
    return {
      name: "dependency_graph",
      status: "passed",
      message: "No dependencies declared",
    };
  }

  const missing: string[] = [];
  const graph: Record<string, string[]> = {};
  graph[manifest.id] = deps;

  for (const depId of deps) {
    const depItem = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.catalogItems} WHERE name = ? AND status = 'active'`,
      [depId]
    );
    if (!depItem) {
      missing.push(depId);
      graph[depId] = [];
      continue;
    }
    // Load dependency's latest ready/deprecated version manifest to build graph
    const depVersion = await queryOne<{ manifest_json: string }>(
      `SELECT manifest_json FROM ${TABLES.catalogVersions}
       WHERE catalog_item_id = ? AND lifecycle_status IN ('ready', 'deprecated')
       ORDER BY created_at DESC LIMIT 1`,
      [depItem.id]
    );
    if (depVersion) {
      try {
        const depManifest = parseManifest(depVersion.manifest_json, "module") as ModuleManifest;
        graph[depId] = depManifest.dependencies ?? [];
      } catch {
        graph[depId] = [];
      }
    } else {
      graph[depId] = [];
    }
  }

  if (missing.length > 0) {
    return {
      name: "dependency_graph",
      status: "failed",
      message: `Missing catalog items for dependencies: ${missing.join(", ")}`,
      details: { missing },
    };
  }

  const hasCycle = detectDependencyCycle(manifest.id, graph);
  if (hasCycle) {
    return {
      name: "dependency_graph",
      status: "failed",
      message: "Dependency cycle detected",
      details: { graph },
    };
  }

  return {
    name: "dependency_graph",
    status: "passed",
    message: `${deps.length} dependency(ies) resolved, no cycles detected`,
  };
}

function checkPackDependencyResolution(
  manifest: PackManifest | null
): ValidationCheck {
  if (!manifest) {
    return {
      name: "pack_dependency_resolution",
      status: "failed",
      message: "Manifest not available for pack dependency resolution",
    };
  }
  const invalid: string[] = [];
  for (const moduleRef of manifest.modules) {
    const colonIdx = moduleRef.indexOf(":");
    if (colonIdx === -1) {
      invalid.push(`${moduleRef} (missing ':range' separator)`);
      continue;
    }
    const range = moduleRef.slice(colonIdx + 1);
    if (!isValidSemVerRange(range)) {
      invalid.push(`${moduleRef} (invalid range '${range}')`);
    }
  }
  if (invalid.length > 0) {
    return {
      name: "pack_dependency_resolution",
      status: "failed",
      message: `Invalid module references: ${invalid.join("; ")}`,
      details: { invalid },
    };
  }
  return {
    name: "pack_dependency_resolution",
    status: "passed",
    message: `${manifest.modules.length} module reference(s) parsed successfully`,
  };
}

function checkPermissionDeclaration(
  manifest: ModuleManifest | null
): ValidationCheck {
  if (!manifest) {
    return {
      name: "permission_declaration",
      status: "failed",
      message: "Manifest not available for permission declaration check",
    };
  }
  const permissions = manifest.permissions;
  if (!permissions || permissions.length === 0) {
    return {
      name: "permission_declaration",
      status: "passed",
      message: "No permissions declared",
    };
  }
  const nonStrings = permissions.filter((p) => typeof p !== "string");
  if (nonStrings.length > 0) {
    return {
      name: "permission_declaration",
      status: "failed",
      message: `Found ${nonStrings.length} non-string permission entry(ies)`,
    };
  }
  return {
    name: "permission_declaration",
    status: "passed",
    message: `${permissions.length} permission(s) declared, all valid strings`,
  };
}

function checkMigrationFile(manifest: ModuleManifest | null): ValidationCheck {
  if (!manifest) {
    return {
      name: "migration_file",
      status: "failed",
      message: "Manifest not available for migration file check",
    };
  }
  const installPath = manifest.migrations?.install;
  if (!installPath || installPath.trim() === "") {
    return {
      name: "migration_file",
      status: "failed",
      message: "migrations.install path is empty or missing",
    };
  }
  return {
    name: "migration_file",
    status: "passed",
    message: `migrations.install path: ${installPath}`,
  };
}

function checkKeyCollision(manifest: ModuleManifest | null): ValidationCheck {
  if (!manifest) {
    return {
      name: "key_collision",
      status: "failed",
      message: "Manifest not available for key collision check",
    };
  }
  const issues: string[] = [];

  const objectKeys = new Set<string>();
  for (const obj of manifest.objects) {
    if (objectKeys.has(obj.key)) {
      issues.push(`duplicate object key: ${obj.key}`);
    }
    objectKeys.add(obj.key);

    const fieldKeys = new Set<string>();
    for (const field of obj.fields) {
      if (fieldKeys.has(field.key)) {
        issues.push(`duplicate field key '${field.key}' in object '${obj.key}'`);
      }
      fieldKeys.add(field.key);
    }
  }

  const viewKeys = new Set<string>();
  for (const view of manifest.views) {
    if (viewKeys.has(view.key)) {
      issues.push(`duplicate view key: ${view.key}`);
    }
    viewKeys.add(view.key);
  }

  if (issues.length > 0) {
    return {
      name: "key_collision",
      status: "failed",
      message: `Key collisions detected: ${issues.join("; ")}`,
      details: { issues },
    };
  }
  return {
    name: "key_collision",
    status: "passed",
    message: `No key collisions (${manifest.objects.length} objects, ${manifest.views.length} views)`,
  };
}

function checkExtensionPointCompatibility(
  manifest: ModuleManifest | null
): ValidationCheck {
  if (!manifest) {
    return {
      name: "extension_point_compatibility",
      status: "failed",
      message: "Manifest not available for extension point check",
    };
  }
  const ep = manifest.extensionPoints;
  if (!ep) {
    return {
      name: "extension_point_compatibility",
      status: "passed",
      message: "No extension points declared",
    };
  }
  const issues: string[] = [];

  if (ep.views) {
    for (const view of ep.views) {
      const slotIds = new Set<string>();
      for (const slot of view.slots) {
        if (slotIds.has(slot.id)) {
          issues.push(`duplicate slot id '${slot.id}' in view '${view.view}'`);
        }
        slotIds.add(slot.id);
      }
    }
  }

  if (ep.entities) {
    for (const entity of ep.entities) {
      if (
        entity.customFields?.enabled &&
        entity.customFields.allowedTypes.length === 0
      ) {
        issues.push(
          `entity '${entity.entity}' has customFields enabled but no allowedTypes`
        );
      }
    }
  }

  if (issues.length > 0) {
    return {
      name: "extension_point_compatibility",
      status: "failed",
      message: `Extension point issues: ${issues.join("; ")}`,
      details: { issues },
    };
  }
  return {
    name: "extension_point_compatibility",
    status: "passed",
    message: "Extension points structure validated",
  };
}

// ── Dashboard Widget Validation (v0.2.1) ──

function checkModuleDashboardWidgets(
  manifest: ModuleManifest | null
): ValidationCheck {
  if (!manifest) {
    return {
      name: "dashboard_widgets",
      status: "failed",
      message: "Manifest not available for dashboard widget check",
    };
  }
  if (!manifest.dashboard?.widgets) {
    return {
      name: "dashboard_widgets",
      status: "passed",
      message: "No dashboard widgets declared",
    };
  }
  const errors = validateModuleDashboard(manifest);
  if (errors.length > 0) {
    return {
      name: "dashboard_widgets",
      status: "failed",
      message: `Dashboard widget issues: ${errors.join("; ")}`,
      details: { errors },
    };
  }
  return {
    name: "dashboard_widgets",
    status: "passed",
    message: `Dashboard widgets validated (${manifest.dashboard.widgets.length} widgets)`,
  };
}

function checkPackDashboardLayout(
  manifest: PackManifest | null
): ValidationCheck {
  if (!manifest) {
    return {
      name: "dashboard_layout",
      status: "failed",
      message: "Manifest not available for dashboard layout check",
    };
  }
  if (!manifest.dashboard?.defaultLayout) {
    return {
      name: "dashboard_layout",
      status: "passed",
      message: "No dashboard layout declared",
    };
  }
  const errors = validatePackDashboard(manifest);
  if (errors.length > 0) {
    return {
      name: "dashboard_layout",
      status: "failed",
      message: `Dashboard layout issues: ${errors.join("; ")}`,
      details: { errors },
    };
  }
  const totalWidgets = manifest.dashboard.defaultLayout.reduce(
    (sum, z) => sum + z.widgets.length, 0
  );
  return {
    name: "dashboard_layout",
    status: "passed",
    message: `Dashboard layout validated (${manifest.dashboard.defaultLayout.length} zones, ${totalWidgets} widgets)`,
  };
}

// ── Run Catalog Validation (docs/09 §9) ──

export async function runCatalogValidation(
  principal: Principal,
  versionId: string
): Promise<{ validationRunId: string; result: CatalogValidationResult }> {
  if (!versionId || !versionId.trim()) {
    throw new InvalidInputError("versionId is required");
  }

  // Require platform role (catalog_editor triggers validation per docs/09 §4)
  requirePlatformRole(principal, "catalog_editor");

  // Load catalog version (throws NotFoundError if missing)
  const version = await getCatalogVersion(versionId);

  // Must be in 'draft' status to validate
  if (version.lifecycleStatus !== "draft") {
    throw new ConflictError(
      `Catalog version must be in 'draft' status to validate (current: ${version.lifecycleStatus})`
    );
  }

  // Transition version to 'validating'
  await execute(
    `UPDATE ${TABLES.catalogVersions} SET lifecycle_status = 'validating' WHERE id = ?`,
    [versionId]
  );

  // Create validation run row
  const validationRunId = genId("val");
  const startedAt = now();
  await execute(
    `INSERT INTO ${TABLES.catalogValidationRuns}
     (id, catalog_version_id, status, validator_version, started_at, created_at)
     VALUES (?, ?, 'running', ?, ?, ?)`,
    [validationRunId, versionId, VALIDATOR_VERSION, startedAt, startedAt]
  );

  // Load catalog item to determine manifest type (throws NotFoundError if missing)
  const item = await getCatalogItem(version.catalogItemId);

  // Parse manifest (may fail — subsequent checks handle null)
  let parsedManifest: AnyManifest | null = null;
  try {
    parsedManifest = parseManifest(version.manifestJson, item.itemType);
  } catch {
    // Manifest parsing failed; checks depending on manifest will record failures
  }

  // Run validation checks in order (per docs/09 §9)
  const checks: ValidationCheck[] = [];

  // 1. Artifact checksum verification
  checks.push(
    await runCheck("artifact_checksum", () =>
      checkArtifactChecksum(version)
    )
  );

  // 2. Manifest schema validation
  checks.push(
    await runCheck("manifest_schema", () =>
      checkManifestSchema(parsedManifest, version.manifestSchemaVersion, item.itemType)
    )
  );

  // 3. SemVer validation
  checks.push(
    await runCheck("semver", () => checkSemVer(version.version))
  );

  // 4. Core compatibility check
  checks.push(
    await runCheck("core_compatibility", () =>
      checkCoreCompatibility(parsedManifest)
    )
  );

  // 5. Dependency graph check (modules only)
  if (item.itemType === "module") {
    checks.push(
      await runCheck("dependency_graph", () =>
        checkDependencyGraph(parsedManifest as ModuleManifest | null)
      )
    );
  }

  // 6. Pack dependency resolution (packs only)
  if (item.itemType === "pack") {
    checks.push(
      await runCheck("pack_dependency_resolution", () =>
        checkPackDependencyResolution(parsedManifest as PackManifest | null)
      )
    );
  }

  // 7. Permission declaration check (modules)
  if (item.itemType === "module") {
    checks.push(
      await runCheck("permission_declaration", () =>
        checkPermissionDeclaration(parsedManifest as ModuleManifest | null)
      )
    );
  }

  // 8. Migration file check (modules)
  if (item.itemType === "module") {
    checks.push(
      await runCheck("migration_file", () =>
        checkMigrationFile(parsedManifest as ModuleManifest | null)
      )
    );
  }

  // 9. Object/field/view key collision
  if (item.itemType === "module") {
    checks.push(
      await runCheck("key_collision", () =>
        checkKeyCollision(parsedManifest as ModuleManifest | null)
      )
    );
  }

  // 10. Extension point compatibility
  if (item.itemType === "module") {
    checks.push(
      await runCheck("extension_point_compatibility", () =>
        checkExtensionPointCompatibility(parsedManifest as ModuleManifest | null)
      )
    );
  }

  // 11. Dashboard widgets validation (modules, v0.2.1)
  if (item.itemType === "module") {
    checks.push(
      await runCheck("dashboard_widgets", () =>
        checkModuleDashboardWidgets(parsedManifest as ModuleManifest | null)
      )
    );
  }

  // 12. Dashboard layout validation (packs, v0.2.1)
  if (item.itemType === "pack") {
    checks.push(
      await runCheck("dashboard_layout", () =>
        checkPackDashboardLayout(parsedManifest as PackManifest | null)
      )
    );
  }

  // Determine overall status
  const failedCount = checks.filter((c) => c.status === "failed").length;
  const hasFailed = failedCount > 0;
  const status: ValidationStatus = hasFailed ? "failed" : "passed";
  const summary = hasFailed
    ? `${failedCount} of ${checks.length} checks failed`
    : `All ${checks.length} checks passed`;

  const result: CatalogValidationResult = { status, checks, summary };
  const completedAt = now();

  // Update validation run with result
  await execute(
    `UPDATE ${TABLES.catalogValidationRuns}
     SET status = ?, result_json = ?, completed_at = ?
     WHERE id = ?`,
    [status, JSON.stringify(result), completedAt, validationRunId]
  );

  // Update version lifecycle status:
  // - failed → rejected
  // - passed → back to draft (freeze is a separate step, per docs/09 §9)
  await execute(
    `UPDATE ${TABLES.catalogVersions} SET lifecycle_status = ? WHERE id = ?`,
    [hasFailed ? "rejected" : "draft", versionId]
  );

  // Write audit event
  await writeAuditEvent({
    workspaceId: "platform",
    actorType: principal.authMethod === "api_key" ? "api_key" : "user",
    actorId: principal.userId,
    action: "catalog.validation_run",
    entityType: "catalog_version",
    entityId: versionId,
    after: {
      validationRunId,
      status,
      checkCount: checks.length,
      failedCount,
    },
    requestId: null,
  });

  return { validationRunId, result };
}

// ── Get Validation Runs ──

export async function getValidationRuns(
  versionId: string
): Promise<ValidationRunRecord[]> {
  const rows = await queryAll<{
    id: string;
    status: string;
    validator_version: string | null;
    result_json: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
  }>(
    `SELECT id, status, validator_version, result_json, started_at, completed_at, created_at
     FROM ${TABLES.catalogValidationRuns}
     WHERE catalog_version_id = ?
     ORDER BY created_at DESC`,
    [versionId]
  );

  return rows.map((r) => ({
    id: r.id,
    status: r.status as ValidationStatus,
    validatorVersion: r.validator_version,
    resultJson: r.result_json,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  }));
}

// ── Get Latest Validation Run ──

export async function getLatestValidationRun(
  versionId: string
): Promise<ValidationRunRecord | null> {
  const rows = await queryAll<{
    id: string;
    status: string;
    validator_version: string | null;
    result_json: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
  }>(
    `SELECT id, status, validator_version, result_json, started_at, completed_at, created_at
     FROM ${TABLES.catalogValidationRuns}
     WHERE catalog_version_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [versionId]
  );

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    id: r.id,
    status: r.status as ValidationStatus,
    validatorVersion: r.validator_version,
    resultJson: r.result_json,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  };
}
