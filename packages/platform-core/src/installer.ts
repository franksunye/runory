import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { queryOne, queryAll, execute, genId, now, db, validateIdentifier } from "./db";
import { TABLES, MODULES_DIR, PACKS_DIR, TEMPLATES_DIR, businessTable } from "./contracts";
import { renderSqlWithPrefix, getBusinessTablePrefix, getTablePrefix } from "./platform-config";
import { createRecord, getRecords } from "./metadata";
import { createAutomation, getAutomations } from "./automation";
import { publishWorkflowDefinition } from "./workflow-v2";
import {
  moduleManifestSchema,
  packManifestSchema,
  templateManifestSchema,
  automationDefinitionSchema,
  type ModuleManifest,
  type PackManifest,
  type TemplateManifest,
  type PackTerminologyEntry,
  type AutomationDefinition,
} from "@runory/contracts";
import { publishFormDefinition, createFormBinding, submitForm, type FormSchema } from "./forms-v2";
import { startWorkflowV2 } from "./workflow-v2";
import type { CommandActor } from "./command-runtime";
import { getOutboxMessages } from "./outbox";

// ── Manifest in-memory cache ──
// Manifest YAML files are static at runtime (they ship with the deploy and do
// not change between requests). Reading from disk + parsing YAML + running
// zod validation on every call is expensive — especially on serverless cold
// starts where getAvailableWidgets is invoked once per widget in addition to
// the layout/navigation routes. Cache by id for the lifetime of the process.

const moduleManifestCache = new Map<string, ModuleManifest>();
const packManifestCache = new Map<string, PackManifest>();

/** Clear the manifest cache. Intended for tests that swap manifest files. */
export function _clearManifestCache(): void {
  moduleManifestCache.clear();
  packManifestCache.clear();
}

export function loadModuleManifest(moduleId: string): ModuleManifest {
  const cached = moduleManifestCache.get(moduleId);
  if (cached) return cached;
  const manifestPath = resolve(MODULES_DIR, moduleId, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`Module manifest not found: ${manifestPath}`);
  }
  const raw = parseYaml(readFileSync(manifestPath, "utf-8"));
  const manifest = moduleManifestSchema.parse(raw);
  moduleManifestCache.set(moduleId, manifest);
  return manifest;
}

export function loadPackManifest(packId: string): PackManifest {
  const cached = packManifestCache.get(packId);
  if (cached) return cached;
  const manifestPath = resolve(PACKS_DIR, packId, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`Pack manifest not found: ${manifestPath}`);
  }
  const raw = parseYaml(readFileSync(manifestPath, "utf-8"));
  const manifest = packManifestSchema.parse(raw);
  packManifestCache.set(packId, manifest);
  return manifest;
}

interface DemoRecord {
  object: string;
  alias?: string;
  match?: { field: string; value: string | number | boolean };
  data: Record<string, unknown>;
}

interface DemoFormDefinition {
  formKey: string;
  name: string;
  schema: { blocks: unknown[] };
  bindings?: Array<{
    usageType: string;
    usageKey?: string;
    labelOverride?: string;
    requirementPolicy?: "optional" | "required";
    targetMapping?: Record<string, unknown>;
  }>;
}

interface DemoFormSubmission {
  formKey: string;
  subjectType?: string;
  subjectAlias?: string;
  status?: "draft" | "submitted" | "accepted" | "returned";
  answers: Record<string, unknown>;
  returnReason?: string;
}

interface DemoScheduleEntry {
  resourceAlias: string;
  subjectType: string;
  subjectAlias: string;
  startAt: string;
  endAt: string;
  status: string;
  notes?: string;
}

interface DemoResource {
  alias: string;
  displayName: string;
  resourceType: string;
  email?: string;
}

interface DemoOutboxMessage {
  messageType: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  lastError?: string;
}

interface DemoWorkflowInstance {
  workflowKey: string;
  recordAlias: string; // alias of a previously seeded record
  actorId?: string;    // defaults to "demo-seed"
}

interface PackDemoData {
  records: DemoRecord[];
  automations?: unknown[];
  // V1 workflows field removed — V2 definitions are published from module JSON files
  // v0.5 demo data extensions
  resources?: DemoResource[];
  formDefinitions?: DemoFormDefinition[];
  formSubmissions?: DemoFormSubmission[];
  scheduleEntries?: DemoScheduleEntry[];
  outboxMessages?: DemoOutboxMessage[];
  workflowInstances?: DemoWorkflowInstance[];
}

function readPackDemoDataFile(packId: string): PackDemoData | null {
  const demoPath = resolve(PACKS_DIR, packId, "demo-data.json");
  if (!existsSync(demoPath)) return null;
  const raw = JSON.parse(readFileSync(demoPath, "utf-8")) as PackDemoData;
  return {
    records: Array.isArray(raw.records) ? raw.records : [],
    automations: Array.isArray(raw.automations) ? raw.automations : [],
    // v0.5 extensions
    resources: Array.isArray(raw.resources) ? raw.resources : [],
    formDefinitions: Array.isArray(raw.formDefinitions) ? raw.formDefinitions : [],
    formSubmissions: Array.isArray(raw.formSubmissions) ? raw.formSubmissions : [],
    scheduleEntries: Array.isArray(raw.scheduleEntries) ? raw.scheduleEntries : [],
    outboxMessages: Array.isArray(raw.outboxMessages) ? raw.outboxMessages : [],
    workflowInstances: Array.isArray(raw.workflowInstances) ? raw.workflowInstances : [],
  };
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
    if (record.alias) aliases.set(record.alias, { ...row, objectKey: record.object });
  }

  // Seed demo automations (idempotent — skip if automation_id already exists)
  if (demo.automations && demo.automations.length > 0) {
    const existingAutomations = await getAutomations(workspaceId);
    const existingIds = new Set(existingAutomations.map((a) => a.automationId));
    for (const raw of demo.automations) {
      const def = automationDefinitionSchema.parse(raw);
      if (existingIds.has(def.id)) continue;
      await createAutomation(workspaceId, def, "system");
      created++;
    }
  }

  // V1 workflow seeding removed — V2 workflow definitions are published
  // from module `workflows/*.workflow.json` files during installModule().

  // ── v0.5: Seed resources ──
  if (demo.resources && demo.resources.length > 0) {
    for (const res of demo.resources) {
      // Check if resource already exists by display_name
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.resources}
         WHERE workspace_id = ? AND display_name = ?`,
        [workspaceId, res.displayName]
      );
      if (existing) {
        aliases.set(res.alias, { id: existing.id, ...res });
        continue;
      }
      const id = genId("res");
      const ts = now();
      await execute(
        `INSERT INTO ${TABLES.resources}
         (id, workspace_id, resource_type, display_name, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [id, workspaceId, res.resourceType, res.displayName, ts, ts]
      );
      aliases.set(res.alias, { id, ...res });
      created++;
    }
  }

  // ── v0.5: Seed form definitions + bindings ──
  if (demo.formDefinitions && demo.formDefinitions.length > 0) {
    for (const fd of demo.formDefinitions) {
      try {
        // Check if form definition already exists by form_key
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM ${TABLES.formDefinitions}
           WHERE workspace_id = ? AND form_key = ?`,
          [workspaceId, fd.formKey]
        );
        if (existing) {
          // Skip — already created
          continue;
        }

        const result = await publishFormDefinition(
          workspaceId,
          {
            formKey: fd.formKey,
            name: fd.name,
            schema: fd.schema as never,
          },
          "demo-seed"
        );

        // Create bindings if specified
        if (fd.bindings && fd.bindings.length > 0) {
          for (const b of fd.bindings) {
            try {
              await createFormBinding(workspaceId, result.definitionId, {
                usageType: b.usageType,
                usageKey: b.usageKey,
                labelOverride: b.labelOverride,
                requirementPolicy: b.requirementPolicy ?? "required",
                targetMapping: b.targetMapping,
              });
              created++;
            } catch (err) {
              console.error(`[installer] Demo form binding for ${fd.formKey} failed:`, err);
            }
          }
        }
        created++;
      } catch (err) {
        console.error(`[installer] Demo form definition ${fd.formKey} failed:`, err);
      }
    }
  }

  // ── v0.5: Seed form submissions ──
  if (demo.formSubmissions && demo.formSubmissions.length > 0) {
    for (const fs of demo.formSubmissions) {
      try {
        // Resolve form definition ID by formKey
        const def = await queryOne<{ id: string }>(
          `SELECT id FROM ${TABLES.formDefinitions}
           WHERE workspace_id = ? AND form_key = ?`,
          [workspaceId, fs.formKey]
        );
        if (!def) {
          console.warn(`[installer] Demo form submission skipped: form definition "${fs.formKey}" not found`);
          continue;
        }

        // Check if submission already exists (by form_definition_id + subject_id + status)
        let subjectId: string | undefined;
        if (fs.subjectAlias && aliases.has(fs.subjectAlias)) {
          subjectId = aliases.get(fs.subjectAlias)!.id as string;
        }
        if (subjectId) {
          const existingSub = await queryOne<{ id: string }>(
            `SELECT id FROM ${TABLES.formSubmissions}
             WHERE workspace_id = ? AND form_definition_id = ? AND subject_id = ? AND status = ?`,
            [workspaceId, def.id, subjectId, fs.status ?? "submitted"]
          );
          if (existingSub) continue;
        }

        const result = await submitForm(workspaceId, {
          formDefinitionId: def.id,
          subjectType: fs.subjectType,
          subjectId,
          answers: fs.answers,
          submittedBy: "demo-seed",
        });

        // Apply status transition if not the default "submitted"
        if (result.submissionId && fs.status === "accepted") {
          const { acceptFormSubmission } = await import("./forms-v2");
          await acceptFormSubmission(workspaceId, result.submissionId, "demo-seed");
        } else if (result.submissionId && fs.status === "returned") {
          const { returnFormSubmission } = await import("./forms-v2");
          await returnFormSubmission(workspaceId, result.submissionId, "demo-seed", fs.returnReason ?? "Demo: returned for revision");
        }
        created++;
      } catch (err) {
        console.error(`[installer] Demo form submission for ${fs.formKey} failed:`, err);
      }
    }
  }

  // ── v0.5: Seed schedule entries ──
  if (demo.scheduleEntries && demo.scheduleEntries.length > 0) {
    for (const se of demo.scheduleEntries) {
      const resourceId = aliases.get(se.resourceAlias)?.id;
      const subjectId = aliases.get(se.subjectAlias)?.id;
      if (!resourceId || !subjectId) {
        console.warn(`[installer] Demo schedule entry skipped: missing alias resolution`);
        continue;
      }
      // Check for existing entry to avoid duplicates
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.scheduleEntries}
         WHERE workspace_id = ? AND resource_id = ? AND subject_id = ? AND start_at = ?`,
        [workspaceId, resourceId, subjectId, se.startAt]
      );
      if (existing) continue;

      const id = genId("sch");
      const ts = now();
      await execute(
        `INSERT INTO ${TABLES.scheduleEntries}
         (id, workspace_id, resource_id, subject_type, subject_id, start_at, end_at, status, conflict_state, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'none', 1, ?, ?)`,
        [id, workspaceId, resourceId, se.subjectType, subjectId, se.startAt, se.endAt, se.status, ts, ts]
      );
      created++;
    }
  }

  // ── v0.5: Seed outbox diagnostic messages ──
  if (demo.outboxMessages && demo.outboxMessages.length > 0) {
    for (const om of demo.outboxMessages) {
      // Check if outbox message already exists (by message_type + status to avoid duplicates)
      const payloadJson = JSON.stringify(om.payload);
      const existingMsg = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.outboxMessages}
         WHERE workspace_id = ? AND message_type = ? AND payload_json = ? AND status = ?`,
        [workspaceId, om.messageType, payloadJson, om.status]
      );
      if (existingMsg) continue;

      const id = genId("obx");
      const ts = now();
      await execute(
        `INSERT INTO ${TABLES.outboxMessages}
         (id, workspace_id, message_type, payload_json, status, attempts, last_error, created_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          workspaceId,
          om.messageType,
          payloadJson,
          om.status,
          om.status === "failed" ? 3 : 0,
          om.lastError ?? null,
          ts,
          om.status === "delivered" ? ts : null,
        ]
      );
      created++;
    }
  }

  // ── v0.5: Seed V2 workflow instances ──
  // After records are seeded and the alias map is populated, start V2 workflow
  // instances for records that should have an active approval/workflow process.
  // Idempotent: skips records that already have a running instance.
  if (demo.workflowInstances && demo.workflowInstances.length > 0) {
    for (const wi of demo.workflowInstances) {
      try {
        // Resolve record ID from alias
        const alias = aliases.get(wi.recordAlias);
        if (!alias) {
          console.warn(`[installer] Workflow instance skipped: alias "${wi.recordAlias}" not found`);
          continue;
        }
        const recordId = alias.id as string;

        // Check if instance already exists (idempotency)
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM ${TABLES.workflowInstancesV2}
           WHERE workspace_id = ? AND workflow_key = ? AND record_id = ? AND status = 'running'`,
          [workspaceId, wi.workflowKey, recordId]
        );
        if (existing) {
          continue; // Already started
        }

        // Start the workflow
        const actor: CommandActor = { type: "system", id: wi.actorId ?? "demo-seed" };
        const result = await startWorkflowV2(
          workspaceId,
          wi.workflowKey,
          alias.objectKey as string,
          recordId,
          actor
        );
        console.log(`[installer] Started workflow ${wi.workflowKey} for ${wi.recordAlias} → ${result.instanceId}`);
        created++;
      } catch (e) {
        console.warn(`[installer] Failed to seed workflow instance ${wi.workflowKey}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
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
  await updatePackDemoDataStatus(workspaceId, packId, "loading");
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
  status: "none" | "loading" | "loaded" | "error",
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
  const manifest = loadModuleManifest(moduleId);

  const objectsCreated: string[] = [];
  const viewsCreated: string[] = [];
  let navigationItemsCreated = 0;
  let ddlExecuted = false;

  // v0.4 — Skip retired modules.
  // A module whose manifest declares status "retired" is no longer installed
  // for new workspaces. If it was already installed in a previous version, its
  // existing tables are left in place and treated as read-only — we neither
  // re-run migrations nor alter/drop the data. This early return short-circuits
  // before the idempotency check below, so neither DDL nor metadata is touched.
  if (manifest.status === "retired") {
    console.warn(
      `[installer] Module "${moduleId}" is retired (retiredIn: ${manifest.retiredIn ?? "unknown"}). ` +
      `Skipping installation; existing tables are left read-only.`
    );
    return { moduleId, objectsCreated, viewsCreated, navigationItemsCreated, ddlExecuted, skipped: true };
  }

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

  // Run migration (multi-statement DDL, e.g. CREATE TABLE IF NOT EXISTS).
  // Always execute regardless of deployment mode — module migrations use
  // CREATE TABLE IF NOT EXISTS so they are idempotent and safe to re-run.
  // Previously cloud mode skipped this, but that caused business tables to be
  // missing when migration 0008 only pre-created a subset of CRM tables.
  const migrationSql = loadModuleMigration(moduleId, manifest.migrations.install);
  await db.executeMultiple(migrationSql);
  ddlExecuted = true;

  // Ensure soft-delete columns exist on all business tables created by this module (v0.3.6)
  for (const obj of manifest.objects) {
    await ensureSoftDeleteColumns(businessTable(obj.key));
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

  // ── Publish V2 workflow definitions (v0.5) ──
  // Check if the module ships workflow definition files and publish them.
  // Best-effort: failures are logged but do not fail module installation.
  const workflowsDir = join(MODULES_DIR, moduleId, "workflows");
  if (existsSync(workflowsDir)) {
    const files = readdirSync(workflowsDir).filter(f => f.endsWith(".workflow.json"));
    for (const file of files) {
      const filePath = join(workflowsDir, file);
      try {
        const raw = readFileSync(filePath, "utf-8");
        const def = JSON.parse(raw);
        await publishWorkflowDefinition(workspaceId, def, "system");
        console.log(`[installer] Published workflow "${def.workflowKey}" from module "${moduleId}"`);
      } catch (err) {
        console.warn(`[installer] Failed to publish workflow from "${file}" in module "${moduleId}":`, err);
      }
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
  } else if (options.includeDemoData) {
    await updatePackDemoDataStatus(workspaceId, packId, "error", "Demo data seeding failed");
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

// ── Pack Uninstall (v0.4) ──

export interface UninstallResult {
  packId: string;
  modulesRemoved: string[];
  tablesDropped: string[];
  sharedModulesKept: string[];
}

/**
 * Uninstall a pack from a workspace.
 *
 * Behavior:
 * - Modules exclusively owned by this pack (no other installed pack depends
 *   on them) have their business tables DROPPED and all metadata deleted.
 * - Shared modules (also installed by another pack) are kept — only the
 *   pack_installations record is removed.
 * - Dashboard layout overrides for the pack's modules are cleaned up.
 *
 * This is a destructive operation: business data in exclusively-owned tables
 * is permanently lost. The caller should confirm with the user.
 */
export async function uninstallPack(
  workspaceId: string,
  packId: string
): Promise<UninstallResult> {
  // Verify the pack is installed
  const installation = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.packInstallations} WHERE workspace_id = ? AND pack_id = ?`,
    [workspaceId, packId]
  );
  if (!installation) {
    throw new Error(`Pack "${packId}" is not installed in this workspace`);
  }

  const pack = loadPackManifest(packId);
  const packModuleIds = pack.modules.map((m) => m.split(":")[0]);

  // Find all other installed packs' modules to determine shared modules
  const otherPackModules = await queryAll<{ module_id: string }>(
    `SELECT DISTINCT module_id FROM ${TABLES.installations}
     WHERE workspace_id = ? AND pack_id != ? AND status = 'installed'`,
    [workspaceId, packId]
  );
  const sharedModuleSet = new Set(otherPackModules.map((r) => r.module_id));

  const modulesRemoved: string[] = [];
  const tablesDropped: string[] = [];
  const sharedModulesKept: string[] = [];

  for (const moduleId of packModuleIds) {
    const isShared = sharedModuleSet.has(moduleId);
    if (isShared) {
      // Shared module — keep tables and metadata, just remove this pack's installation record
      sharedModulesKept.push(moduleId);
      await execute(
        `DELETE FROM ${TABLES.installations}
         WHERE workspace_id = ? AND module_id = ? AND pack_id = ?`,
        [workspaceId, moduleId, packId]
      );
      continue;
    }

    // Exclusively owned — drop tables and clean up all metadata

    // 1. Find object keys owned by this module
    const objects = await queryAll<{ object_key: string }>(
      `SELECT object_key FROM ${TABLES.objectDefinitions}
       WHERE workspace_id = ? AND module_id = ? AND ownership = 'module_owned'`,
      [workspaceId, moduleId]
    );

    // 2. Drop business tables for each object
    for (const obj of objects) {
      const tableName = businessTable(obj.object_key);
      try {
        await execute(`DROP TABLE IF EXISTS ${tableName}`);
        tablesDropped.push(tableName);
      } catch {
        // Table may not exist if install was partial — continue
      }
    }

    // 3. Delete extension field values for these objects
    for (const obj of objects) {
      await execute(
        `DELETE FROM ${TABLES.extensionFieldValues}
         WHERE workspace_id = ? AND object_key = ?`,
        [workspaceId, obj.object_key]
      );
    }

    // 4. Delete metadata: field definitions, view definitions, navigation items,
    //    relation definitions, object definitions
    await execute(
      `DELETE FROM ${TABLES.fieldDefinitions}
       WHERE workspace_id = ? AND module_id = ?`,
      [workspaceId, moduleId]
    );
    await execute(
      `DELETE FROM ${TABLES.viewDefinitions}
       WHERE workspace_id = ? AND module_id = ?`,
      [workspaceId, moduleId]
    );
    await execute(
      `DELETE FROM ${TABLES.navigationItems}
       WHERE workspace_id = ? AND module_id = ?`,
      [workspaceId, moduleId]
    );
    await execute(
      `DELETE FROM ${TABLES.relationDefinitions}
       WHERE workspace_id = ? AND module_id = ?`,
      [workspaceId, moduleId]
    );
    await execute(
      `DELETE FROM ${TABLES.objectDefinitions}
       WHERE workspace_id = ? AND module_id = ?`,
      [workspaceId, moduleId]
    );

    // 5. Delete the installation record
    await execute(
      `DELETE FROM ${TABLES.installations}
       WHERE workspace_id = ? AND module_id = ? AND pack_id = ?`,
      [workspaceId, moduleId, packId]
    );

    modulesRemoved.push(moduleId);
  }

  // 6. Delete the pack installation record
  await execute(
    `DELETE FROM ${TABLES.packInstallations}
     WHERE workspace_id = ? AND pack_id = ?`,
    [workspaceId, packId]
  );

  // 7. Clean up dashboard layout overrides for removed modules
  for (const moduleId of modulesRemoved) {
    try {
      await execute(
        `DELETE FROM ${TABLES.workspaceDashboardLayout}
         WHERE workspace_id = ? AND module_id = ?`,
        [workspaceId, moduleId]
      );
    } catch {
      // Layout overrides table may not exist in all schemas — ignore
    }
  }

  // 8. Clean up pack permission group assignments
  try {
    await execute(
      `DELETE FROM ${TABLES.packPermissionAssignments}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, packId]
    );
  } catch {
    // Permission assignments table may not exist — ignore
  }

  return {
    packId,
    modulesRemoved,
    tablesDropped,
    sharedModulesKept,
  };
}
