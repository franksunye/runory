import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { queryOne, queryAll, execute, genId, now, db, validateIdentifier } from "./db";
import { TABLES, MODULES_DIR, PACKS_DIR, TEMPLATES_DIR, businessTable } from "./contracts";
import { getDeploymentMode, renderSqlWithPrefix, getBusinessTablePrefix, getTablePrefix } from "./platform-config";
import { createRecord, getRecords } from "./metadata";
import {
  moduleManifestSchema,
  packManifestSchema,
  templateManifestSchema,
  type ModuleManifest,
  type PackManifest,
  type TemplateManifest,
  type PackTerminologyEntry,
} from "@runory/contracts";

export function loadModuleManifest(moduleId: string): ModuleManifest {
  const manifestPath = resolve(MODULES_DIR, moduleId, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`Module manifest not found: ${manifestPath}`);
  }
  const raw = parseYaml(readFileSync(manifestPath, "utf-8"));
  return moduleManifestSchema.parse(raw);
}

export function loadPackManifest(packId: string): PackManifest {
  const manifestPath = resolve(PACKS_DIR, packId, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`Pack manifest not found: ${manifestPath}`);
  }
  const raw = parseYaml(readFileSync(manifestPath, "utf-8"));
  return packManifestSchema.parse(raw);
}

interface DemoRecord {
  object: string;
  alias?: string;
  match?: { field: string; value: string | number | boolean };
  data: Record<string, unknown>;
}

interface PackDemoData {
  records: DemoRecord[];
}

function readPackDemoDataFile(packId: string): PackDemoData | null {
  const demoPath = resolve(PACKS_DIR, packId, "demo-data.json");
  if (!existsSync(demoPath)) return null;
  const raw = JSON.parse(readFileSync(demoPath, "utf-8")) as PackDemoData;
  return { records: Array.isArray(raw.records) ? raw.records : [] };
}

/**
 * Check if a pack has demo data available (v0.3.4).
 */
export function hasPackDemoData(packId: string): boolean {
  return readPackDemoDataFile(packId) !== null;
}

export function loadTemplateManifest(templateId: string): TemplateManifest {
  const manifestPath = resolve(TEMPLATES_DIR, templateId, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`Template manifest not found: ${manifestPath}`);
  }
  const raw = parseYaml(readFileSync(manifestPath, "utf-8"));
  return templateManifestSchema.parse(raw);
}

export function loadModuleMigration(moduleId: string, migrationPath: string): string {
  const fullPath = resolve(MODULES_DIR, moduleId, migrationPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Migration not found: ${fullPath}`);
  }
  const raw = readFileSync(fullPath, "utf-8");
  // Render business table prefix placeholders (e.g., {{BUSINESS_TABLE_PREFIX}}customer → business_customer)
  return renderSqlWithPrefix(raw, getTablePrefix(), getBusinessTablePrefix());
}

// ── Pack Installer ──

export interface InstallResult {
  packId: string;
  modulesInstalled: string[];
  objectsCreated: string[];
  viewsCreated: string[];
  navigationItemsCreated: number;
  ddlExecuted: boolean;
  demoRecordsCreated: number;
}

export interface InstallPackOptions {
  includeDemoData?: boolean;
}

/**
 * Ensure a business table has deleted_at and deleted_by columns (v0.3.6).
 * Called after pack migration SQL creates the table. Silently skips if
 * the table doesn't exist or the columns already exist.
 */
async function ensureSoftDeleteColumns(tableName: string): Promise<void> {
  const rows = await queryAll<{ name: string }>(`PRAGMA table_info(${tableName})`);
  if (rows.length === 0) return; // Table doesn't exist
  const columns = new Set(rows.map(r => r.name));
  if (!columns.has("deleted_at")) {
    await execute(`ALTER TABLE ${tableName} ADD COLUMN deleted_at TEXT`);
  }
  if (!columns.has("deleted_by")) {
    await execute(`ALTER TABLE ${tableName} ADD COLUMN deleted_by TEXT`);
  }
}

function resolveDemoValue(value: unknown, aliases: Map<string, Record<string, unknown>>): unknown {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  const match = /^\$([A-Za-z0-9_-]+)\.([A-Za-z0-9_]+)$/.exec(value);
  if (!match) return value;
  const [, alias, field] = match;
  return aliases.get(alias)?.[field] ?? value;
}

// ── Cross-pack demo data lookup (v0.2.3) ──
//
// Supports `$lookup` objects in demo data to reference records created by
// other packs. Example:
//   "company_id": { "$lookup": { "object": "company", "field": "domain", "value": "acme.example" } }
//
// This enables demo data from pack B to reference records seeded by pack A
// without coupling to pack A's internal aliases.

interface DemoLookup {
  $lookup: {
    object: string;
    field: string;
    value: string | number | boolean;
  };
}

function isDemoLookup(value: unknown): value is DemoLookup {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return "$lookup" in obj && typeof obj.$lookup === "object" && obj.$lookup !== null;
}

async function resolveDemoLookup(
  workspaceId: string,
  lookup: DemoLookup
): Promise<string | null> {
  const { object, field, value } = lookup.$lookup;
  validateIdentifier(object);
  validateIdentifier(field);
  // If the target object's table doesn't exist (e.g., FSM objects when only
  // CRM is installed), getRecords throws. Return null so optional cross-pack
  // fields remain empty instead of crashing the demo data seed.
  let records: Record<string, unknown>[];
  try {
    records = await getRecords(workspaceId, object);
  } catch {
    return null;
  }
  const found = records.find((r) => r[field] === value);
  return (found?.id as string) ?? null;
}

async function seedPackDemoData(workspaceId: string, packId: string): Promise<number> {
  const demo = readPackDemoDataFile(packId);
  if (!demo) return 0;

  let created = 0;
  const aliases = new Map<string, Record<string, unknown>>();

  for (const record of demo.records) {
    validateIdentifier(record.object);
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record.data)) {
      // Resolve $lookup first (cross-pack references), then $alias references.
      // If the lookup target is not installed (e.g., FSM objects when only CRM
      // is installed), store null so optional cross-pack fields remain empty.
      if (isDemoLookup(value)) {
        const lookedUp = await resolveDemoLookup(workspaceId, value);
        data[validateIdentifier(key)] = lookedUp;
      } else {
        data[validateIdentifier(key)] = resolveDemoValue(value, aliases);
      }
    }

    let existing: Record<string, unknown> | undefined;
    if (record.match) {
      validateIdentifier(record.match.field);
      const resolvedMatchValue = resolveDemoValue(record.match.value, aliases);
      existing = (await getRecords(workspaceId, record.object)).find(
        (row) => row[record.match!.field] === resolvedMatchValue
      );
    }

    const row = existing ?? (await createRecord(workspaceId, record.object, data));
    if (!existing) created++;
    if (record.alias) aliases.set(record.alias, row);
  }

  return created;
}

/**
 * Load demo data for a pack as a separate action (v0.3.4).
 * This is decoupled from installPack so users can choose when to load demo data.
 * Updates the pack's demo_data_status to 'loaded' on success.
 * Idempotent: re-running won't create duplicates (uses match-field dedup).
 */
export async function loadPackDemoData(
  workspaceId: string,
  packId: string
): Promise<{ recordsCreated: number }> {
  const created = await seedPackDemoData(workspaceId, packId);
  await updatePackDemoDataStatus(workspaceId, packId, "loaded");
  return { recordsCreated: created };
}

/**
 * Update the demo data status for a pack installation (v0.3.4).
 */
export async function updatePackDemoDataStatus(
  workspaceId: string,
  packId: string,
  status: "none" | "loaded" | "error",
  errorMessage?: string
): Promise<void> {
  const loadedAt = status === "loaded" ? now() : null;
  // Clear error message on success, set on error
  const errorMsg = status === "error" ? (errorMessage ?? "Unknown error") : null;
  await execute(
    `UPDATE ${TABLES.packInstallations}
     SET demo_data_status = ?, demo_data_loaded_at = COALESCE(?, demo_data_loaded_at),
         demo_data_error_message = ?
     WHERE workspace_id = ? AND pack_id = ?`,
    [status, loadedAt, errorMsg, workspaceId, packId]
  );
}

/**
 * Persist an install error message for a pack installation (v0.3.6 diagnostics).
 */
export async function updatePackInstallError(
  workspaceId: string,
  packId: string,
  errorMessage: string
): Promise<void> {
  await execute(
    `UPDATE ${TABLES.packInstallations}
     SET install_error_message = ?
     WHERE workspace_id = ? AND pack_id = ?`,
    [errorMessage, workspaceId, packId]
  );
}

/**
 * Clear the install error message on successful install (v0.3.6 diagnostics).
 */
export async function clearPackInstallError(
  workspaceId: string,
  packId: string
): Promise<void> {
  await execute(
    `UPDATE ${TABLES.packInstallations}
     SET install_error_message = NULL
     WHERE workspace_id = ? AND pack_id = ?`,
    [workspaceId, packId]
  );
}

// ── Topological Sort (Kahn's algorithm) ──
//
// Produces a correct install order for dependency graphs of any depth, unlike
// a pairwise comparator which only handles direct (one-level) dependencies.
// Dependencies that are not present in `items` are skipped gracefully (e.g.,
// a dependency on an external module not part of this pack).

function topologicalSort<T extends { id: string; dependencies?: string[] }>(items: T[]): T[] {
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();
  const itemMap = new Map<string, T>();

  // Initialize
  for (const item of items) {
    itemMap.set(item.id, item);
    inDegree.set(item.id, 0);
    graph.set(item.id, []);
  }

  // Build graph: edge dep → item means dep must come before item
  for (const item of items) {
    const deps = item.dependencies ?? [];
    for (const dep of deps) {
      // Only count dependencies that are themselves in the list; missing deps
      // (e.g., external modules) are ignored so install can proceed.
      if (itemMap.has(dep)) {
        graph.get(dep)!.push(item.id);
        inDegree.set(item.id, (inDegree.get(item.id) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm: start from nodes with no incoming edges
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: T[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(itemMap.get(id)!);
    for (const neighbor of graph.get(id) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // Detect cycles
  if (sorted.length !== items.length) {
    const remaining = items.filter(i => !sorted.find(s => s.id === i.id));
    throw new Error(`Circular dependency detected among: ${remaining.map(i => i.id).join(", ")}`);
  }

  return sorted;
}

export interface InstallModuleResult {
  moduleId: string;
  objectsCreated: string[];
  viewsCreated: string[];
  navigationItemsCreated: number;
  ddlExecuted: boolean;
  skipped: boolean;
}

// Install a single module standalone (not part of a pack). Useful for testing
// deprecated modules or installing modules outside the pack workflow.
export async function installModule(
  workspaceId: string,
  moduleId: string,
  packId: string = "standalone"
): Promise<InstallModuleResult> {
  const deploymentMode = getDeploymentMode();
  const manifest = loadModuleManifest(moduleId);

  const objectsCreated: string[] = [];
  const viewsCreated: string[] = [];
  let navigationItemsCreated = 0;
  let ddlExecuted = false;

  // Check if already installed (idempotent — skip if present)
  const already = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.installations} WHERE workspace_id = ? AND module_id = ?`,
    [workspaceId, moduleId]
  );
  if (already) {
    return { moduleId, objectsCreated, viewsCreated, navigationItemsCreated, ddlExecuted, skipped: true };
  }

  // ── Object Ownership Enforcement (v0.2.3) ──
  // One object key, one owning module. If another module already owns any of
  // the same object keys in this workspace, refuse to install.
  for (const obj of manifest.objects) {
    const existingOwner = await queryOne<{ module_id: string }>(
      `SELECT module_id FROM ${TABLES.objectDefinitions}
       WHERE workspace_id = ? AND object_key = ? AND module_id IS NOT NULL`,
      [workspaceId, obj.key]
    );
    if (existingOwner && existingOwner.module_id !== moduleId) {
      throw new Error(
        `Object key '${obj.key}' is already owned by module '${existingOwner.module_id}'. ` +
        `Module '${moduleId}' cannot claim ownership of the same object key.`
      );
    }
  }

  // Run migration (multi-statement DDL, e.g. CREATE TABLE)
  if (deploymentMode === "local") {
    const migrationSql = loadModuleMigration(moduleId, manifest.migrations.install);
    await db.executeMultiple(migrationSql);
    ddlExecuted = true;

    // Ensure soft-delete columns exist on all business tables created by this module (v0.3.6)
    for (const obj of manifest.objects) {
      await ensureSoftDeleteColumns(businessTable(obj.key));
    }
  }

  // Register installation
  await execute(
    `INSERT INTO ${TABLES.installations} (id, workspace_id, module_id, module_version, pack_id, status, installed_at)
     VALUES (?, ?, ?, ?, ?, 'installed', ?)`,
    [genId("inst"), workspaceId, moduleId, manifest.version, packId, now()]
  );

  // Insert object definitions
  for (const obj of manifest.objects) {
    await execute(
      `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at)
       VALUES (?, ?, ?, ?, ?, 'module_owned', ?)`,
      [genId("obj"), workspaceId, obj.key, obj.label, moduleId, now()]
    );
    objectsCreated.push(obj.key);

    // Insert field definitions
    for (const field of obj.fields) {
      validateIdentifier(field.key);

      await execute(
        `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          genId("fld"), workspaceId, obj.key, field.key, field.label, field.type,
          field.ownership, field.required ? 1 : 0, field.default_value ?? null,
          field.validation ? JSON.stringify(field.validation) : null, moduleId, now(),
        ]
      );
    }
  }

  // Insert view definitions
  for (const view of manifest.views) {
    await execute(
      `INSERT INTO ${TABLES.viewDefinitions} (id, workspace_id, object_key, view_key, view_type, label, config_json, module_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        genId("view"), workspaceId, view.object, view.key, view.type, view.label,
        JSON.stringify(view.config), moduleId, now(),
      ]
    );
    viewsCreated.push(view.key);
  }

  // Insert navigation items
  if (manifest.ui?.navigation) {
    for (const nav of manifest.ui.navigation) {
      await execute(
        `INSERT INTO ${TABLES.navigationItems} (id, workspace_id, label, route, icon, sort_order, module_id, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [genId("nav"), workspaceId, nav.label, nav.route, nav.icon, nav.sortOrder, moduleId]
      );
      navigationItemsCreated++;
    }
  }

  // Insert relation definitions (v0.3.2)
  if (manifest.relations) {
    for (const rel of manifest.relations) {
      await execute(
        `INSERT OR IGNORE INTO ${TABLES.relationDefinitions}
         (id, workspace_id, object_key, target_object_key, target_module_id, relation_type, foreign_key, label, module_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          genId("rel"),
          workspaceId,
          rel.object,
          rel.targetObject,
          rel.targetModule,
          rel.type,
          rel.foreignKey,
          rel.label ?? null,
          moduleId,
          now(),
        ]
      );
    }
  }

  return { moduleId, objectsCreated, viewsCreated, navigationItemsCreated, ddlExecuted, skipped: false };
}

export async function installPack(
  workspaceId: string,
  packId: string,
  options: InstallPackOptions = {}
): Promise<InstallResult> {
  const pack = loadPackManifest(packId);

  const modulesInstalled: string[] = [];
  const objectsCreated: string[] = [];
  const viewsCreated: string[] = [];
  let navigationItemsCreated = 0;
  let ddlExecuted = false;

  // Install modules in dependency order using a proper topological sort.
  // Load all manifests upfront (avoids re-reading during sort) and sort by
  // their dependency graph so deeper chains (A → B → C) install correctly.
  const moduleIds = pack.modules.map((m) => m.split(":")[0]);
  const manifests = moduleIds.map((id) => loadModuleManifest(id));
  const sortedModules = topologicalSort(manifests).map((m) => m.id);

  for (const moduleId of sortedModules) {
    const result = await installModule(workspaceId, moduleId, packId);
    if (!result.skipped) {
      modulesInstalled.push(moduleId);
      objectsCreated.push(...result.objectsCreated);
      viewsCreated.push(...result.viewsCreated);
      navigationItemsCreated += result.navigationItemsCreated;
      if (result.ddlExecuted) ddlExecuted = true;
    }
  }

  // ── Pack Installation Tracking (v0.2.3) ──
  // Record this pack installation (including terminology overlay) so the
  // navigation API can present pack-specific labels for shared objects.
  // Idempotent: if the pack is already tracked, update the terminology.
  const terminologyJson = pack.terminology
    ? JSON.stringify(pack.terminology)
    : null;
  const existingPack = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.packInstallations} WHERE workspace_id = ? AND pack_id = ?`,
    [workspaceId, packId]
  );
  if (existingPack) {
    await execute(
      `UPDATE ${TABLES.packInstallations}
       SET pack_version = ?, terminology_json = ?, installed_at = ?
       WHERE id = ?`,
      [pack.version, terminologyJson, now(), existingPack.id]
    );
  } else {
    await execute(
      `INSERT INTO ${TABLES.packInstallations}
       (id, workspace_id, pack_id, pack_version, terminology_json, installed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [genId("pkinst"), workspaceId, packId, pack.version, terminologyJson, now()]
    );
  }

  const demoRecordsCreated = options.includeDemoData
    ? await seedPackDemoData(workspaceId, packId)
    : 0;

  // v0.3.4 — Track demo data status
  if (options.includeDemoData && demoRecordsCreated >= 0) {
    await updatePackDemoDataStatus(workspaceId, packId, "loaded");
  }

  // v0.3.6 — Sync pack-aware permission groups
  if (pack.permissionGroups && pack.permissionGroups.length > 0) {
    const { syncPackPermissionGroups } = await import("./permission-groups");
    await syncPackPermissionGroups(workspaceId, packId, pack.permissionGroups);
  }

  return {
    packId,
    modulesInstalled,
    objectsCreated,
    viewsCreated,
    navigationItemsCreated,
    ddlExecuted,
    demoRecordsCreated,
  };
}
