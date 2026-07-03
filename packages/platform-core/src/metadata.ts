import { queryAll, queryOne, execute, genId, now, validateIdentifier } from "./db";
import { TABLES, businessTable } from "./contracts";
import { provisionWorkspaceTenant, type ActorIdentity } from "./tenancy";
import { assertNotGovernedUpdate } from "./governed-fields";
import { AsyncLocalStorage } from "node:async_hooks";

// ── Automation trigger recursion guard (v0.3.5) ──
// Prevents infinite recursion when automation actions call createRecord/updateRecord.
const _automationSuppress = new AsyncLocalStorage<boolean>();

async function fireAutomationTriggers(
  workspaceId: string,
  eventType: "record_created" | "record_updated",
  objectKey: string,
  record: Record<string, unknown>,
  changedFields?: string[]
): Promise<void> {
  // Skip if we're already inside an automation execution chain
  if (_automationSuppress.getStore()) return;
  try {
    const { findAutomationsForRecordEvent, runAutomation } = await import("./automation");
    // Fire record_created / record_updated triggers
    const automations = await findAutomationsForRecordEvent(workspaceId, eventType, objectKey);
    for (const auto of automations) {
      try {
        await _automationSuppress.run(true, () =>
          runAutomation(workspaceId, auto.id, eventType, { record }, { actorId: "record-lifecycle" })
        );
      } catch {
        // Automation failures should not block record operations
      }
    }
    // Fire record_field_changed triggers for each changed field (update only)
    if (eventType === "record_updated" && changedFields && changedFields.length > 0) {
      const fieldChangeAutomations = await findAutomationsForRecordEvent(
        workspaceId, "record_field_changed", objectKey
      );
      for (const auto of fieldChangeAutomations) {
        const watchedField = auto.definition.trigger.fieldKey;
        // If the automation watches a specific field, only fire when that field changed
        if (watchedField && !changedFields.includes(watchedField)) continue;
        try {
          await _automationSuppress.run(true, () =>
            runAutomation(workspaceId, auto.id, "record_field_changed", { record }, { actorId: "record-lifecycle" })
          );
        } catch {
          // Automation failures should not block record operations
        }
      }
    }
  } catch {
    // Automation module load failures should not block record operations
  }
}

// ── Soft-delete column detection (v0.3.6) ──
// Business tables may or may not have deleted_at/deleted_by columns
// depending on when they were created (migration 0019 adds them to core
// tables, and the installer adds them to pack-created tables). We
// introspect the schema and cache the result per table for the lifetime
// of the process — table structure does not change at runtime in
// production. Tests that drop/recreate tables call _clearSoftDeleteColumnCache().

const softDeleteColumnCache = new Map<string, { deletedAt: boolean; deletedBy: boolean }>();

async function checkSoftDeleteColumns(tableName: string): Promise<{ deletedAt: boolean; deletedBy: boolean }> {
  const cached = softDeleteColumnCache.get(tableName);
  if (cached) return cached;
  const rows = await queryAll<{ name: string }>(`PRAGMA table_info(${tableName})`);
  const columns = new Set(rows.map(r => r.name));
  const result = { deletedAt: columns.has("deleted_at"), deletedBy: columns.has("deleted_by") };
  softDeleteColumnCache.set(tableName, result);
  return result;
}

/** Clear the soft-delete column cache (kept for test compatibility). */
export function _clearSoftDeleteColumnCache(): void {
  softDeleteColumnCache.clear();
}

// ── Types ──
export interface ObjectDefinition {
  id: string;
  workspaceId: string;
  objectKey: string;
  label: string;
  moduleId: string | null;
  ownership: string;
}

export interface FieldDefinition {
  id: string;
  workspaceId: string;
  objectKey: string;
  fieldKey: string;
  label: string;
  type: string;
  ownership: string;
  required: boolean;
  defaultValue: string | null;
  validation: Record<string, unknown> | null;
  moduleId: string | null;
  extensionId: string | null;
}

export interface ViewDefinition {
  id: string;
  workspaceId: string;
  objectKey: string;
  viewKey: string;
  viewType: string;
  label: string;
  config: Record<string, unknown>;
  moduleId: string | null;
  extensionId: string | null;
}

export interface NavigationItem {
  id: string;
  workspaceId: string;
  label: string;
  route: string;
  icon: string;
  sortOrder: number;
  moduleId: string | null;
  enabled: boolean;
}

// ── Workspace ──
const SAFE_WORKSPACE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createWorkspaceSlug(name: string, id: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20)
    .replace(/-+$/g, "");
  const suffix = id.replace(/[^a-z0-9]/gi, "").slice(-10).toLowerCase();
  return `${base || "w"}-${suffix}`;
}

export async function createWorkspace(name: string, templateId?: string, actor?: ActorIdentity) {
  const id = genId("ws");
  const slug = createWorkspaceSlug(name, id);
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, template_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, slug, templateId ?? null, now(), now()]
  );
  if (actor) await provisionWorkspaceTenant(id, name, actor);
  return { id, name, slug, templateId };
}

export async function getWorkspace(reference: string) {
  const workspace = await queryOne<{
    id: string; name: string; slug: string; template_id: string | null;
    created_at: string; updated_at: string;
  }>(`SELECT * FROM ${TABLES.workspaces} WHERE id = ? OR slug = ?`, [reference, reference]);
  if (!workspace) return undefined;

  if (!SAFE_WORKSPACE_SLUG.test(workspace.slug) || workspace.slug.length > 32) {
    const slug = createWorkspaceSlug(workspace.name, workspace.id);
    await execute(
      `UPDATE ${TABLES.workspaces} SET slug = ?, updated_at = ? WHERE id = ?`,
      [slug, now(), workspace.id]
    );
    return { ...workspace, slug };
  }

  return workspace;
}

export async function resolveWorkspaceId(reference: string): Promise<string> {
  if (reference.startsWith("ws_")) return reference;
  const workspace = await getWorkspace(reference);
  if (!workspace) throw new Error(`Workspace ${reference} not found`);
  return workspace.id;
}

export async function updateWorkspaceName(
  workspaceId: string,
  name: string,
  userId: string
): Promise<{ id: string; name: string; slug: string; templateId: string | null; createdAt: string; updatedAt: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");
  if (trimmed.length > 100) throw new Error("Workspace name must be 100 characters or fewer");

  const existing = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM ${TABLES.workspaces} WHERE id = ?`,
    [workspaceId]
  );
  if (!existing) throw new Error("Workspace not found");

  const ts = now();
  await execute(
    `UPDATE ${TABLES.workspaces} SET name = ?, updated_at = ? WHERE id = ?`,
    [trimmed, ts, workspaceId]
  );

  const updated = await getWorkspace(workspaceId);
  return {
    id: updated!.id,
    name: updated!.name,
    slug: updated!.slug,
    templateId: updated!.template_id,
    createdAt: updated!.created_at,
    updatedAt: updated!.updated_at,
  };
}

// ── Navigation ──
export async function getNavigation(workspaceId: string): Promise<NavigationItem[]> {
  const rows = await queryAll<{
    id: string; workspace_id: string; label: string; route: string;
    icon: string; sort_order: number; module_id: string | null; enabled: number;
  }>(
    `SELECT * FROM ${TABLES.navigationItems} WHERE workspace_id = ? AND enabled = 1 ORDER BY sort_order`,
    [workspaceId]
  );

  // ── Pack Terminology Overlay (v0.2.3) ──
  // Merge terminology overlays from all installed packs. Later installations
  // take precedence (last pack wins) so the most recently installed pack can
  // relabel shared objects for its context.
  const packRows = await queryAll<{ terminology_json: string | null }>(
    `SELECT terminology_json FROM ${TABLES.packInstallations}
     WHERE workspace_id = ? AND terminology_json IS NOT NULL
     ORDER BY installed_at ASC`,
    [workspaceId]
  );

  // Build a route → navigationLabel override map.
  // Terminology entries can specify an explicit `route` to override. If `route`
  // is omitted, derive it from the object key (e.g., "task" → "/tasks").
  const routeLabelOverrides = new Map<string, string>();
  for (const row of packRows) {
    if (!row.terminology_json) continue;
    try {
      const entries = JSON.parse(row.terminology_json) as Array<{
        object: string;
        navigationLabel?: string;
        route?: string;
      }>;
      for (const entry of entries) {
        if (entry.navigationLabel) {
          const route = entry.route ?? `/${entry.object}s`;
          routeLabelOverrides.set(route, entry.navigationLabel);
        }
      }
    } catch {
      // Skip unparseable terminology
    }
  }

  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id,
    label: routeLabelOverrides.get(r.route) ?? r.label,
    route: r.route,
    icon: r.icon, sortOrder: r.sort_order, moduleId: r.module_id, enabled: r.enabled === 1,
  }));
}

// ── Objects ──
export async function getObjects(workspaceId: string): Promise<ObjectDefinition[]> {
  const rows = await queryAll<{
    id: string; workspace_id: string; object_key: string; label: string;
    module_id: string | null; ownership: string;
  }>(
    `SELECT * FROM ${TABLES.objectDefinitions} WHERE workspace_id = ? ORDER BY label`,
    [workspaceId]
  );
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, objectKey: r.object_key, label: r.label,
    moduleId: r.module_id, ownership: r.ownership,
  }));
}

export async function getObject(workspaceId: string, objectKey: string): Promise<ObjectDefinition | undefined> {
  const row = await queryOne<{
    id: string; workspace_id: string; object_key: string; label: string;
    module_id: string | null; ownership: string;
  }>(
    `SELECT * FROM ${TABLES.objectDefinitions} WHERE workspace_id = ? AND object_key = ?`,
    [workspaceId, objectKey]
  );
  if (!row) return undefined;
  return {
    id: row.id, workspaceId: row.workspace_id, objectKey: row.object_key, label: row.label,
    moduleId: row.module_id, ownership: row.ownership,
  };
}

// ── Fields ──
export async function getFields(workspaceId: string, objectKey: string): Promise<FieldDefinition[]> {
  const rows = await queryAll<{
    id: string; workspace_id: string; object_key: string; field_key: string;
    label: string; type: string; ownership: string; required: number;
    default_value: string | null; validation_json: string | null;
    module_id: string | null; extension_id: string | null;
  }>(
    `SELECT * FROM ${TABLES.fieldDefinitions} WHERE workspace_id = ? AND object_key = ? ORDER BY created_at`,
    [workspaceId, objectKey]
  );

  // ── Relation FK enrichment (v0.4) ──
  // Load outgoing relations and enrich any field whose fieldKey matches a
  // relation's foreignKey. This sets validation.targetObject and upgrades the
  // field type to "lookup" so the UI renders a searchable dropdown instead of
  // a plain text input showing raw record IDs.
  const relations = await getRelations(workspaceId, objectKey);
  const fkMap = new Map<string, string>();
  for (const rel of relations) {
    if (rel.relationType === "many_to_one") {
      fkMap.set(rel.foreignKey, rel.targetObjectKey);
    }
  }

  return rows.map(r => {
    const targetObject = fkMap.get(r.field_key) ?? null;
    const isLookup = targetObject !== null;
    const validation = r.validation_json ? JSON.parse(r.validation_json) as Record<string, unknown> : {};
    if (isLookup) {
      validation.targetObject = targetObject;
    }
    return {
      id: r.id, workspaceId: r.workspace_id, objectKey: r.object_key, fieldKey: r.field_key,
      label: r.label,
      type: isLookup ? "lookup" : r.type,
      ownership: r.ownership, required: r.required === 1,
      defaultValue: r.default_value,
      validation: Object.keys(validation).length > 0 ? validation : null,
      moduleId: r.module_id, extensionId: r.extension_id,
    };
  });
}

// ── Views ──
export async function getViews(workspaceId: string, objectKey: string): Promise<ViewDefinition[]> {
  const rows = await queryAll<{
    id: string; workspace_id: string; object_key: string; view_key: string;
    view_type: string; label: string; config_json: string;
    module_id: string | null; extension_id: string | null;
  }>(
    `SELECT * FROM ${TABLES.viewDefinitions} WHERE workspace_id = ? AND object_key = ?`,
    [workspaceId, objectKey]
  );
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, objectKey: r.object_key, viewKey: r.view_key,
    viewType: r.view_type, label: r.label, config: JSON.parse(r.config_json),
    moduleId: r.module_id, extensionId: r.extension_id,
  }));
}

export async function getView(workspaceId: string, objectKey: string, viewKey: string): Promise<ViewDefinition | undefined> {
  const row = await queryOne<{
    id: string; workspace_id: string; object_key: string; view_key: string;
    view_type: string; label: string; config_json: string;
    module_id: string | null; extension_id: string | null;
  }>(
    `SELECT * FROM ${TABLES.viewDefinitions} WHERE workspace_id = ? AND object_key = ? AND view_key = ?`,
    [workspaceId, objectKey, viewKey]
  );
  if (!row) return undefined;
  return {
    id: row.id, workspaceId: row.workspace_id, objectKey: row.object_key, viewKey: row.view_key,
    viewType: row.view_type, label: row.label, config: JSON.parse(row.config_json),
    moduleId: row.module_id, extensionId: row.extension_id,
  };
}

// ── Installations ──
export async function getInstallations(workspaceId: string) {
  const rows = await queryAll<{
    id: string; workspace_id: string; module_id: string; module_version: string;
    pack_id: string; status: string; installed_at: string;
  }>(`SELECT * FROM ${TABLES.installations} WHERE workspace_id = ?`, [workspaceId]);
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, moduleId: r.module_id,
    moduleVersion: r.module_version, packId: r.pack_id, status: r.status,
    installedAt: r.installed_at,
  }));
}

// ── Pack Installations (v0.3.0) ──
// Returns pack-level installation records for navigation grouping.
// Display names and categories are enriched by the API layer via loadPackManifest.
export interface PackInstallationInfo {
  packId: string;
  packVersion: string;
  installedAt: string;
  demoDataStatus: "none" | "loaded" | "error";
  demoDataLoadedAt: string | null;
  installErrorMessage: string | null;
  demoDataErrorMessage: string | null;
}

export async function getInstalledPacks(workspaceId: string): Promise<PackInstallationInfo[]> {
  const rows = await queryAll<{
    pack_id: string; pack_version: string; installed_at: string;
    demo_data_status: string; demo_data_loaded_at: string | null;
    install_error_message: string | null; demo_data_error_message: string | null;
  }>(
    `SELECT pack_id, pack_version, installed_at, demo_data_status, demo_data_loaded_at,
            install_error_message, demo_data_error_message
     FROM ${TABLES.packInstallations}
     WHERE workspace_id = ? ORDER BY installed_at ASC`,
    [workspaceId]
  );
  return rows.map(r => ({
    packId: r.pack_id,
    packVersion: r.pack_version,
    installedAt: r.installed_at,
    demoDataStatus: (r.demo_data_status as "none" | "loaded" | "error") ?? "none",
    demoDataLoadedAt: r.demo_data_loaded_at,
    installErrorMessage: r.install_error_message ?? null,
    demoDataErrorMessage: r.demo_data_error_message ?? null,
  }));
}

// ── Relation Definitions (v0.3.2) ──
// Relations are persisted at module install time from manifest.relations.
// getRelations returns outgoing relations (this object → target).
// getBacklinks returns incoming relations (other objects → this object).

export interface RelationDefinition {
  id: string;
  objectKey: string;
  targetObjectKey: string;
  targetModuleId: string;
  relationType: string;
  foreignKey: string;
  label: string | null;
  moduleId: string;
}

export async function getRelations(
  workspaceId: string,
  objectKey: string
): Promise<RelationDefinition[]> {
  const rows = await queryAll<{
    id: string; object_key: string; target_object_key: string;
    target_module_id: string; relation_type: string; foreign_key: string;
    label: string | null; module_id: string;
  }>(
    `SELECT id, object_key, target_object_key, target_module_id, relation_type,
            foreign_key, label, module_id
     FROM ${TABLES.relationDefinitions}
     WHERE workspace_id = ? AND object_key = ?
     ORDER BY foreign_key ASC`,
    [workspaceId, objectKey]
  );
  return rows.map(r => ({
    id: r.id,
    objectKey: r.object_key,
    targetObjectKey: r.target_object_key,
    targetModuleId: r.target_module_id,
    relationType: r.relation_type,
    foreignKey: r.foreign_key,
    label: r.label,
    moduleId: r.module_id,
  }));
}

export async function getBacklinks(
  workspaceId: string,
  objectKey: string
): Promise<RelationDefinition[]> {
  const rows = await queryAll<{
    id: string; object_key: string; target_object_key: string;
    target_module_id: string; relation_type: string; foreign_key: string;
    label: string | null; module_id: string;
  }>(
    `SELECT id, object_key, target_object_key, target_module_id, relation_type,
            foreign_key, label, module_id
     FROM ${TABLES.relationDefinitions}
     WHERE workspace_id = ? AND target_object_key = ?
     ORDER BY object_key ASC, foreign_key ASC`,
    [workspaceId, objectKey]
  );
  return rows.map(r => ({
    id: r.id,
    objectKey: r.object_key,
    targetObjectKey: r.target_object_key,
    targetModuleId: r.target_module_id,
    relationType: r.relation_type,
    foreignKey: r.foreign_key,
    label: r.label,
    moduleId: r.module_id,
  }));
}

// ── Records (dynamic CRUD on business tables) ──

export interface GetRecordsOptions {
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** Include soft-deleted records in results (v0.3.6). Default: false. */
  includeDeleted?: boolean;
  /** Only return soft-deleted records (v0.3.6). Default: false. */
  onlyDeleted?: boolean;
}

const SEARCHABLE_FIELD_TYPES = new Set(["text", "email", "phone"]);

export async function getRecords(
  workspaceId: string,
  objectKey: string,
  options: GetRecordsOptions = {}
): Promise<Record<string, unknown>[]> {
  const tableName = businessTable(objectKey);
  // Get module-owned fields from business table
  const fields = await getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const columnNames = ["id", ...moduleFields.map(f => validateIdentifier(f.fieldKey)), "created_at", "updated_at"];

  // Check soft-delete column availability (v0.3.6)
  const softDelete = await checkSoftDeleteColumns(tableName);
  // Include soft-delete columns in SELECT when available (for trash UI)
  if (softDelete.deletedAt) columnNames.push("deleted_at");
  if (softDelete.deletedBy) columnNames.push("deleted_by");
  const columns = columnNames.join(", ");

  // Build WHERE clause (workspace filter + optional search across text fields)
  // By default, exclude soft-deleted records unless includeDeleted is true
  const whereClauses: string[] = ["workspace_id = ?"];
  const whereArgs: unknown[] = [workspaceId];

  if (softDelete.deletedAt) {
    if (options.onlyDeleted) {
      whereClauses.push("deleted_at IS NOT NULL");
    } else if (!options.includeDeleted) {
      whereClauses.push("deleted_at IS NULL");
    }
  }

  if (options.search) {
    const searchableFields = moduleFields.filter(f => SEARCHABLE_FIELD_TYPES.has(f.type));
    if (searchableFields.length > 0) {
      const searchClauses = searchableFields.map(
        f => `${validateIdentifier(f.fieldKey)} LIKE ?`
      );
      whereClauses.push(`(${searchClauses.join(" OR ")})`);
      const term = `%${options.search}%`;
      whereArgs.push(...searchableFields.map(() => term));
    }
  }

  // Build ORDER BY (validate sort field exists; default created_at DESC)
  const sortableKeys = new Set([
    ...moduleFields.map(f => f.fieldKey),
    "created_at",
    "updated_at",
  ]);
  let orderBy = "created_at DESC";
  if (options.sortBy && sortableKeys.has(options.sortBy)) {
    const sortColumn = options.sortBy === "created_at" || options.sortBy === "updated_at"
      ? options.sortBy
      : validateIdentifier(options.sortBy);
    const direction = options.sortOrder === "asc" ? "ASC" : "DESC";
    orderBy = `${sortColumn} ${direction}`;
  }

  // Build LIMIT/OFFSET
  let limitSql = "";
  const limitArgs: unknown[] = [];
  if (options.limit !== undefined && options.limit > 0) {
    limitSql = " LIMIT ?";
    limitArgs.push(options.limit);
    if (options.offset !== undefined && options.offset > 0) {
      limitSql += " OFFSET ?";
      limitArgs.push(options.offset);
    }
  }

  const rows = await queryAll<Record<string, unknown>>(
    `SELECT ${columns} FROM ${tableName} WHERE ${whereClauses.join(" AND ")} ORDER BY ${orderBy}${limitSql}`,
    [...whereArgs, ...limitArgs]
  );

  // Merge extension field values (batched — single query for all rows,
  // eliminates the N+1 where each row triggered its own SELECT).
  const extFields = fields.filter(f => f.ownership === "workspace_extension");
  let resultRows: Record<string, unknown>[] = rows;

  if (extFields.length > 0 && rows.length > 0) {
    const recordIds = rows.map((r) => r.id as string).filter(Boolean);
    const extByRecord = new Map<string, Record<string, unknown>>();

    // SQLite variable limit guard — process in chunks of 500.
    const CHUNK = 500;
    for (let i = 0; i < recordIds.length; i += CHUNK) {
      const chunk = recordIds.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => "?").join(", ");
      const extRows = await queryAll<{ record_id: string; field_key: string; value_json: string }>(
        `SELECT record_id, field_key, value_json FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND object_key = ? AND record_id IN (${placeholders})`,
        [workspaceId, objectKey, ...chunk]
      );
      for (const ev of extRows) {
        let bucket = extByRecord.get(ev.record_id);
        if (!bucket) {
          bucket = {};
          extByRecord.set(ev.record_id, bucket);
        }
        try {
          bucket[ev.field_key] = JSON.parse(ev.value_json);
        } catch {
          bucket[ev.field_key] = ev.value_json;
        }
      }
    }

    resultRows = rows.map((row) => {
      const ext = extByRecord.get(row.id as string);
      return ext ? { ...row, ...ext } : row;
    });
  }

  // ── FK display enrichment (v0.4) ──
  // For each lookup field (enriched by getFields with validation.targetObject),
  // batch-resolve the referenced records' display values and merge them as
  // `{fkField}_display` properties. This makes list views, detail pages, and
  // API consumers show human-readable labels instead of raw record IDs.
  const lookupFields = fields.filter(
    (f) => f.type === "lookup" && f.validation?.targetObject
  );

  if (lookupFields.length > 0 && resultRows.length > 0) {
    // Cache target object display fields to avoid redundant getFields calls
    const displayFieldCache = new Map<string, string>();

    for (const field of lookupFields) {
      const targetObject = field.validation!.targetObject as string;

      // Collect unique non-null FK values from the current result set
      const fkValues = resultRows
        .map((r) => r[field.fieldKey])
        .filter((v): v is string => v !== null && v !== undefined && v !== "");
      if (fkValues.length === 0) continue;

      const uniqueIds = [...new Set(fkValues)];

      // Resolve the display field for the target object (cached)
      let displayField = displayFieldCache.get(targetObject);
      if (displayField === undefined) {
        const targetFields = await getFields(workspaceId, targetObject);
        displayField = resolveDisplayField(targetFields);
        displayFieldCache.set(targetObject, displayField);
      }

      // Batch-query the target table for display values
      const targetTable = businessTable(targetObject);
      const placeholders = uniqueIds.map(() => "?").join(", ");
      const displayRows = await queryAll<{ id: string; display: string | null }>(
        `SELECT id, ${validateIdentifier(displayField)} AS display FROM ${targetTable} WHERE id IN (${placeholders})`,
        uniqueIds
      );

      // Build ID → display label map
      const displayMap = new Map<string, string>();
      for (const dr of displayRows) {
        displayMap.set(dr.id, dr.display ?? dr.id);
      }

      // Merge display values into result rows
      for (const row of resultRows) {
        const fkValue = row[field.fieldKey];
        if (typeof fkValue === "string" && fkValue !== "") {
          row[`${field.fieldKey}_display`] = displayMap.get(fkValue) ?? fkValue;
        } else {
          row[`${field.fieldKey}_display`] = null;
        }
      }
    }
  }

  return resultRows;
}

// ── Display field resolution ──
// Convention-based resolution for the human-readable identifier of an object.
// Tries common display field names in priority order, falling back to "id".
// This mirrors the DISPLAY_FIELD_CANDIDATES pattern in ObjectDetailPage.tsx.
const DISPLAY_FIELD_CANDIDATES = [
  "name",
  "title",
  "subject",
  "summary",
  "number",
  "code",
  "email",
  "label",
];

function resolveDisplayField(fields: FieldDefinition[]): string {
  for (const candidate of DISPLAY_FIELD_CANDIDATES) {
    if (fields.some((f) => f.fieldKey === candidate)) {
      return candidate;
    }
  }
  return "id";
}

export async function createRecord(workspaceId: string, objectKey: string, data: Record<string, unknown>): Promise<Record<string, unknown> & { id: string }> {
  const id = genId("rec");
  const ts = now();
  const fields = await getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const extFields = fields.filter(f => f.ownership === "workspace_extension");

  // Insert into business table (module-owned fields only)
  // For fields not in data, use default_value if available, else null
  const moduleColumns = ["id", "workspace_id", ...moduleFields.map(f => validateIdentifier(f.fieldKey)), "created_at", "updated_at"];
  const moduleValues: unknown[] = [
    id,
    workspaceId,
    ...moduleFields.map(f => {
      if (data[f.fieldKey] !== undefined) return data[f.fieldKey];
      if (f.defaultValue) {
        // Parse default value based on field type
        if (f.type === "number") return Number(f.defaultValue);
        if (f.type === "boolean") return f.defaultValue === "true";
        return f.defaultValue;
      }
      return null;
    }),
    ts,
    ts,
  ];
  const placeholders = moduleColumns.map(() => "?").join(", ");
  await execute(
    `INSERT INTO ${businessTable(objectKey)} (${moduleColumns.join(", ")}) VALUES (${placeholders})`,
    moduleValues
  );

  // Insert extension field values
  for (const extField of extFields) {
    if (data[extField.fieldKey] !== undefined) {
      await execute(
        `INSERT INTO ${TABLES.extensionFieldValues} (id, workspace_id, object_key, record_id, field_key, value_json, extension_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [genId("efv"), workspaceId, objectKey, id, extField.fieldKey, JSON.stringify(data[extField.fieldKey]), extField.extensionId, ts, ts]
      );
    }
  }

  const created = { id, workspace_id: workspaceId, ...data, created_at: ts, updated_at: ts };

  // Fire automation triggers (v0.3.5: wire triggers into record lifecycle)
  await fireAutomationTriggers(workspaceId, "record_created", objectKey, created);

  return created;
}

export async function getRecord(
  workspaceId: string,
  objectKey: string,
  recordId: string,
  options?: { includeDeleted?: boolean }
): Promise<Record<string, unknown> | undefined> {
  const tableName = businessTable(objectKey);
  const fields = await getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const columnNames = ["id", ...moduleFields.map(f => validateIdentifier(f.fieldKey)), "created_at", "updated_at"];
  const softDelete = await checkSoftDeleteColumns(tableName);
  if (softDelete.deletedAt) columnNames.push("deleted_at");
  if (softDelete.deletedBy) columnNames.push("deleted_by");
  const columns = columnNames.join(", ");

  const whereClauses = ["workspace_id = ?", "id = ?"];
  const whereArgs: unknown[] = [workspaceId, recordId];
  if (!options?.includeDeleted && softDelete.deletedAt) {
    whereClauses.push("deleted_at IS NULL");
  }

  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${columns} FROM ${tableName} WHERE ${whereClauses.join(" AND ")}`,
    whereArgs
  );
  if (!row) return undefined;

  // Merge extension field values
  const extFields = fields.filter(f => f.ownership === "workspace_extension");
  if (extFields.length === 0) return row;

  const extValues = await queryAll<{ field_key: string; value_json: string }>(
    `SELECT field_key, value_json FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND object_key = ? AND record_id = ?`,
    [workspaceId, objectKey, recordId]
  );
  const merged = { ...row };
  for (const ev of extValues) {
    merged[ev.field_key] = JSON.parse(ev.value_json);
  }
  return merged;
}

export async function updateRecord(workspaceId: string, objectKey: string, recordId: string, data: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  // v0.5 Guard: reject generic CRUD updates to governed fields.
  // Governed fields can only be changed through named commands (e.g. quote.approve).
  assertNotGovernedUpdate(objectKey, data);

  const ts = now();
  const fields = await getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const extFields = fields.filter(f => f.ownership === "workspace_extension");

  // Update module-owned fields in business table
  const updatableModuleFields = moduleFields.filter(f => data[f.fieldKey] !== undefined);
  if (updatableModuleFields.length > 0) {
    const setClauses = updatableModuleFields.map(f => `${validateIdentifier(f.fieldKey)} = ?`).join(", ");
    const values = updatableModuleFields.map(f => data[f.fieldKey]);
    await execute(
      `UPDATE ${businessTable(objectKey)} SET ${setClauses}, updated_at = ? WHERE workspace_id = ? AND id = ?`,
      [...values, ts, workspaceId, recordId]
    );
  }

  // Update extension field values
  for (const extField of extFields) {
    if (data[extField.fieldKey] !== undefined) {
      await execute(
        `INSERT INTO ${TABLES.extensionFieldValues} (id, workspace_id, object_key, record_id, field_key, value_json, extension_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, object_key, record_id, field_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [genId("efv"), workspaceId, objectKey, recordId, extField.fieldKey, JSON.stringify(data[extField.fieldKey]), extField.extensionId, ts, ts]
      );
    }
  }

  const updated = await getRecord(workspaceId, objectKey, recordId);

  // Fire automation triggers (v0.3.5: wire triggers into record lifecycle)
  if (updated) {
    const changedFields = Object.keys(data);
    await fireAutomationTriggers(workspaceId, "record_updated", objectKey, updated, changedFields);
  }

  return updated;
}

export async function deleteRecord(
  workspaceId: string,
  objectKey: string,
  recordId: string,
  options?: { hard?: boolean; deletedBy?: string }
): Promise<boolean> {
  const tableName = businessTable(objectKey);
  // Check record exists and belongs to workspace
  const existing = await getRecord(workspaceId, objectKey, recordId, { includeDeleted: true });
  if (!existing) return false;

  if (options?.hard) {
    // Hard delete: remove extension field values and the record itself
    await execute(
      `DELETE FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND object_key = ? AND record_id = ?`,
      [workspaceId, objectKey, recordId]
    );
    await execute(
      `DELETE FROM ${tableName} WHERE workspace_id = ? AND id = ?`,
      [workspaceId, recordId]
    );
  } else {
    // Soft delete: mark as deleted with timestamp (v0.3.6)
    // Falls back to hard delete if the table doesn't have deleted_at column.
    const softDelete = await checkSoftDeleteColumns(tableName);
    if (softDelete.deletedAt) {
      const ts = now();
      const setClauses = ["deleted_at = ?", "updated_at = ?"];
      const setArgs: unknown[] = [ts, ts];
      if (softDelete.deletedBy) {
        setClauses.unshift("deleted_by = ?");
        setArgs.unshift(options?.deletedBy ?? null);
      }
      await execute(
        `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE workspace_id = ? AND id = ?`,
        [...setArgs, workspaceId, recordId]
      );
    } else {
      // No soft-delete columns — fall back to hard delete
      await execute(
        `DELETE FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND object_key = ? AND record_id = ?`,
        [workspaceId, objectKey, recordId]
      );
      await execute(
        `DELETE FROM ${tableName} WHERE workspace_id = ? AND id = ?`,
        [workspaceId, recordId]
      );
    }
  }

  return true;
}

/**
 * Restore a soft-deleted record (v0.3.6).
 * Returns true if the record was restored, false if not found or not deleted.
 */
export async function restoreRecord(
  workspaceId: string,
  objectKey: string,
  recordId: string
): Promise<boolean> {
  const tableName = businessTable(objectKey);
  const softDelete = await checkSoftDeleteColumns(tableName);
  if (!softDelete.deletedAt) return false; // No soft-delete support

  // Check record exists and is soft-deleted
  const existing = await getRecord(workspaceId, objectKey, recordId, { includeDeleted: true });
  if (!existing) return false;
  if (!existing.deleted_at) return false; // Not deleted

  const ts = now();
  const setClauses = softDelete.deletedBy
    ? "deleted_at = NULL, deleted_by = NULL, updated_at = ?"
    : "deleted_at = NULL, updated_at = ?";
  await execute(
    `UPDATE ${tableName} SET ${setClauses} WHERE workspace_id = ? AND id = ?`,
    [ts, workspaceId, recordId]
  );
  return true;
}
