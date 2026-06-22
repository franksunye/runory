import { queryAll, queryOne, execute, genId, now } from "./db";
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

// ── Navigation ──
export async function getNavigation(workspaceId: string): Promise<NavigationItem[]> {
  const rows = await queryAll<{
    id: string; workspace_id: string; label: string; route: string;
    icon: string; sort_order: number; module_id: string | null; enabled: number;
  }>(
    `SELECT * FROM ${TABLES.navigationItems} WHERE workspace_id = ? AND enabled = 1 ORDER BY sort_order`,
    [workspaceId]
  );
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, label: r.label, route: r.route,
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

// ── Records (dynamic CRUD on business tables) ──
export async function getRecords(workspaceId: string, objectKey: string): Promise<Record<string, unknown>[]> {
  // Get module-owned fields from business table
  const fields = await getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const columnNames = ["id", ...moduleFields.map(f => f.fieldKey), "created_at", "updated_at"];
  const columns = columnNames.join(", ");

  const rows = await queryAll<Record<string, unknown>>(
    `SELECT ${columns} FROM ${businessTable(objectKey)} WHERE workspace_id = ? ORDER BY created_at DESC`,
    [workspaceId]
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
  const moduleColumns = ["id", "workspace_id", ...moduleFields.map(f => f.fieldKey), "created_at", "updated_at"];
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
  const columnNames = ["id", ...moduleFields.map(f => f.fieldKey), "created_at", "updated_at"];
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
    const setClauses = updatableModuleFields.map(f => `${f.fieldKey} = ?`).join(", ");
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
