import { getDb, genId, now } from "./db";

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
export function createWorkspace(name: string, templateId?: string) {
  const db = getDb();
  const id = genId("ws");
  const slug = name.toLowerCase().replace(/\s+/g, "-") + "-" + id.slice(-6);
  db.prepare(`INSERT INTO workspaces (id, name, slug, template_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, name, slug, templateId ?? null, now(), now());
  return { id, name, slug, templateId };
}

export function getWorkspace(id: string) {
  const db = getDb();
  return db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id) as {
    id: string; name: string; slug: string; template_id: string | null;
    created_at: string; updated_at: string;
  } | undefined;
}

// ── Navigation ──
export function getNavigation(workspaceId: string): NavigationItem[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM navigation_items WHERE workspace_id = ? AND enabled = 1 ORDER BY sort_order`).all(workspaceId) as any[];
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, label: r.label, route: r.route,
    icon: r.icon, sortOrder: r.sort_order, moduleId: r.module_id, enabled: r.enabled === 1,
  }));
}

// ── Objects ──
export function getObjects(workspaceId: string): ObjectDefinition[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM object_definitions WHERE workspace_id = ? ORDER BY label`).all(workspaceId) as any[];
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, objectKey: r.object_key, label: r.label,
    moduleId: r.module_id, ownership: r.ownership,
  }));
}

export function getObject(workspaceId: string, objectKey: string): ObjectDefinition | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM object_definitions WHERE workspace_id = ? AND object_key = ?`).get(workspaceId, objectKey) as any;
  if (!row) return undefined;
  return {
    id: row.id, workspaceId: row.workspace_id, objectKey: row.object_key, label: row.label,
    moduleId: row.module_id, ownership: row.ownership,
  };
}

// ── Fields ──
export function getFields(workspaceId: string, objectKey: string): FieldDefinition[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM field_definitions WHERE workspace_id = ? AND object_key = ? ORDER BY created_at`).all(workspaceId, objectKey) as any[];
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, objectKey: r.object_key, fieldKey: r.field_key,
    label: r.label, type: r.type, ownership: r.ownership, required: r.required === 1,
    defaultValue: r.default_value, validation: r.validation_json ? JSON.parse(r.validation_json) : null,
    moduleId: r.module_id, extensionId: r.extension_id,
  }));
}

// ── Views ──
export function getViews(workspaceId: string, objectKey: string): ViewDefinition[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM view_definitions WHERE workspace_id = ? AND object_key = ?`).all(workspaceId, objectKey) as any[];
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, objectKey: r.object_key, viewKey: r.view_key,
    viewType: r.view_type, label: r.label, config: JSON.parse(r.config_json),
    moduleId: r.module_id, extensionId: r.extension_id,
  }));
}

export function getView(workspaceId: string, objectKey: string, viewKey: string): ViewDefinition | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM view_definitions WHERE workspace_id = ? AND object_key = ? AND view_key = ?`).get(workspaceId, objectKey, viewKey) as any;
  if (!row) return undefined;
  return {
    id: row.id, workspaceId: row.workspace_id, objectKey: row.object_key, viewKey: row.view_key,
    viewType: row.view_type, label: row.label, config: JSON.parse(row.config_json),
    moduleId: row.module_id, extensionId: row.extension_id,
  };
}

// ── Installations ──
export function getInstallations(workspaceId: string) {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM installations WHERE workspace_id = ?`).all(workspaceId) as any[];
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, moduleId: r.module_id,
    moduleVersion: r.module_version, packId: r.pack_id, status: r.status,
    installedAt: r.installed_at,
  }));
}

// ── Records (dynamic CRUD on business tables) ──
export function getRecords(workspaceId: string, objectKey: string): Record<string, unknown>[] {
  const db = getDb();
  // Get module-owned fields from business table
  const fields = getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const columnNames = ["id", ...moduleFields.map(f => f.fieldKey), "created_at", "updated_at"];
  const columns = columnNames.join(", ");

  const rows = db.prepare(`SELECT ${columns} FROM ${objectKey} WHERE workspace_id = ? ORDER BY created_at DESC`).all(workspaceId) as any[];

  // Merge extension field values
  const extFields = fields.filter(f => f.ownership === "workspace_extension");
  if (extFields.length === 0) return rows;

  return rows.map(row => {
    const extValues = db.prepare(`SELECT field_key, value_json FROM extension_field_values WHERE workspace_id = ? AND object_key = ? AND record_id = ?`).all(workspaceId, objectKey, row.id) as any[];
    const merged = { ...row };
    for (const ev of extValues) {
      merged[ev.field_key] = JSON.parse(ev.value_json);
    }
    return merged;
  });
}

export function createRecord(workspaceId: string, objectKey: string, data: Record<string, unknown>): Record<string, unknown> {
  const db = getDb();
  const id = genId("rec");
  const ts = now();
  const fields = getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const extFields = fields.filter(f => f.ownership === "workspace_extension");

  // Insert into business table (module-owned fields only)
  const moduleColumns = ["id", "workspace_id", ...moduleFields.map(f => f.fieldKey), "created_at", "updated_at"];
  const moduleValues = [id, workspaceId, ...moduleFields.map(f => data[f.fieldKey] ?? null), ts, ts];
  const placeholders = moduleColumns.map(() => "?").join(", ");
  db.prepare(`INSERT INTO ${objectKey} (${moduleColumns.join(", ")}) VALUES (${placeholders})`).run(...moduleValues);

  // Insert extension field values
  for (const extField of extFields) {
    if (data[extField.fieldKey] !== undefined) {
      db.prepare(`INSERT INTO extension_field_values (id, workspace_id, object_key, record_id, field_key, value_json, extension_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        genId("efv"), workspaceId, objectKey, id, extField.fieldKey,
        JSON.stringify(data[extField.fieldKey]), extField.extensionId, ts, ts
      );
    }
  }

  return { id, workspace_id: workspaceId, ...data, created_at: ts, updated_at: ts };
}

export function getRecord(workspaceId: string, objectKey: string, recordId: string): Record<string, unknown> | undefined {
  const db = getDb();
  const fields = getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const columnNames = ["id", ...moduleFields.map(f => f.fieldKey), "created_at", "updated_at"];
  const columns = columnNames.join(", ");

  const row = db.prepare(`SELECT ${columns} FROM ${objectKey} WHERE workspace_id = ? AND id = ?`).get(workspaceId, recordId) as any;
  if (!row) return undefined;

  // Merge extension field values
  const extFields = fields.filter(f => f.ownership === "workspace_extension");
  if (extFields.length === 0) return row;

  const extValues = db.prepare(`SELECT field_key, value_json FROM extension_field_values WHERE workspace_id = ? AND object_key = ? AND record_id = ?`).all(workspaceId, objectKey, recordId) as any[];
  for (const ev of extValues) {
    row[ev.field_key] = JSON.parse(ev.value_json);
  }
  return row;
}

export function updateRecord(workspaceId: string, objectKey: string, recordId: string, data: Record<string, unknown>): Record<string, unknown> | undefined {
  const db = getDb();
  const ts = now();
  const fields = getFields(workspaceId, objectKey);
  const moduleFields = fields.filter(f => f.ownership === "module_owned");
  const extFields = fields.filter(f => f.ownership === "workspace_extension");

  // Update module-owned fields in business table
  const updatableModuleFields = moduleFields.filter(f => data[f.fieldKey] !== undefined);
  if (updatableModuleFields.length > 0) {
    const setClauses = updatableModuleFields.map(f => `${f.fieldKey} = ?`).join(", ");
    const values = updatableModuleFields.map(f => data[f.fieldKey]);
    db.prepare(`UPDATE ${objectKey} SET ${setClauses}, updated_at = ? WHERE workspace_id = ? AND id = ?`).run(...values, ts, workspaceId, recordId);
  }

  // Update extension field values
  for (const extField of extFields) {
    if (data[extField.fieldKey] !== undefined) {
      db.prepare(`INSERT INTO extension_field_values (id, workspace_id, object_key, record_id, field_key, value_json, extension_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, object_key, record_id, field_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).run(
        genId("efv"), workspaceId, objectKey, recordId, extField.fieldKey,
        JSON.stringify(data[extField.fieldKey]), extField.extensionId, ts, ts
      );
    }
  }

  return getRecord(workspaceId, objectKey, recordId);
}
