import { queryAll, queryOne, execute, genId, now, validateIdentifier } from "./db";
import { TABLES, businessTable } from "./contracts";
import { provisionWorkspaceTenant, type ActorIdentity } from "./tenancy";

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
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, objectKey: r.object_key, fieldKey: r.field_key,
    label: r.label, type: r.type, ownership: r.ownership, required: r.required === 1,
    defaultValue: r.default_value, validation: r.validation_json ? JSON.parse(r.validation_json) : null,
    moduleId: r.module_id, extensionId: r.extension_id,
  }));
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
}

export async function getInstalledPacks(workspaceId: string): Promise<PackInstallationInfo[]> {
  const rows = await queryAll<{
    pack_id: string; pack_version: string; installed_at: string;
  }>(
    `SELECT pack_id, pack_version, installed_at FROM ${TABLES.packInstallations}
     WHERE workspace_id = ? ORDER BY installed_at ASC`,
    [workspaceId]
  );
  return rows.map(r => ({
    packId: r.pack_id,
    packVersion: r.pack_version,
    installedAt: r.installed_at,
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
}

const SEARCHABLE_FIELD_TYPES = new Set(["text", "email", "phone"]);

export async function getRecords(
  workspaceId: string,
  objectKey: string,
  options: GetRecordsOptions = {}
): Promise<Record<string, unknown>[]> {
  // Get module-owned fields from business table
  const fields = await getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const columnNames = ["id", ...moduleFields.map(f => validateIdentifier(f.fieldKey)), "created_at", "updated_at"];
  const columns = columnNames.join(", ");

  // Build WHERE clause (workspace filter + optional search across text fields)
  const whereClauses: string[] = ["workspace_id = ?"];
  const whereArgs: unknown[] = [workspaceId];

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
    `SELECT ${columns} FROM ${businessTable(objectKey)} WHERE ${whereClauses.join(" AND ")} ORDER BY ${orderBy}${limitSql}`,
    [...whereArgs, ...limitArgs]
  );

  // Merge extension field values
  const extFields = fields.filter(f => f.ownership === "workspace_extension");
  if (extFields.length === 0) return rows;

  const merged: Record<string, unknown>[] = [];
  for (const row of rows) {
    const extValues = await queryAll<{ field_key: string; value_json: string }>(
      `SELECT field_key, value_json FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND object_key = ? AND record_id = ?`,
      [workspaceId, objectKey, row.id]
    );
    const m = { ...row };
    for (const ev of extValues) {
      m[ev.field_key] = JSON.parse(ev.value_json);
    }
    merged.push(m);
  }
  return merged;
}

export async function createRecord(workspaceId: string, objectKey: string, data: Record<string, unknown>) {
  const id = genId("rec");
  const ts = now();
  const fields = await getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const extFields = fields.filter(f => f.ownership === "workspace_extension");

  // Insert into business table (module-owned fields only)
  const moduleColumns = ["id", "workspace_id", ...moduleFields.map(f => validateIdentifier(f.fieldKey)), "created_at", "updated_at"];
  const moduleValues: unknown[] = [id, workspaceId, ...moduleFields.map(f => data[f.fieldKey] ?? null), ts, ts];
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

  return { id, workspace_id: workspaceId, ...data, created_at: ts, updated_at: ts };
}

export async function getRecord(workspaceId: string, objectKey: string, recordId: string): Promise<Record<string, unknown> | undefined> {
  const fields = await getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const columnNames = ["id", ...moduleFields.map(f => validateIdentifier(f.fieldKey)), "created_at", "updated_at"];
  const columns = columnNames.join(", ");

  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${columns} FROM ${businessTable(objectKey)} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, recordId]
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

  return await getRecord(workspaceId, objectKey, recordId);
}

export async function deleteRecord(workspaceId: string, objectKey: string, recordId: string): Promise<boolean> {
  // Check record exists and belongs to workspace
  const existing = await getRecord(workspaceId, objectKey, recordId);
  if (!existing) return false;

  // Delete extension field values
  await execute(
    `DELETE FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND object_key = ? AND record_id = ?`,
    [workspaceId, objectKey, recordId]
  );

  // Delete from business table
  await execute(
    `DELETE FROM ${businessTable(objectKey)} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, recordId]
  );

  return true;
}
