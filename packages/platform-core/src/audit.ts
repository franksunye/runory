import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import { getObjects, getFields, getViews, getInstallations, getNavigation } from "./metadata";
import { getExtensions, getExtensionVersions } from "./extension";

// ── Audit Log ──

export interface AuditLog {
  id: string;
  workspaceId: string;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  extensionVersionId: string | null;
  createdAt: string;
}

export async function getAuditLogs(workspaceId: string): Promise<AuditLog[]> {
  const rows = await queryAll<{
    id: string; workspace_id: string; actor_type: string; actor_id: string;
    action: string; entity_type: string; entity_id: string;
    before_json: string | null; after_json: string | null;
    extension_version_id: string | null; created_at: string;
  }>(`SELECT * FROM ${TABLES.auditLogs} WHERE workspace_id = ? ORDER BY created_at DESC`, [workspaceId]);
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, actorType: r.actor_type, actorId: r.actor_id,
    action: r.action, entityType: r.entity_type, entityId: r.entity_id,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    extensionVersionId: r.extension_version_id, createdAt: r.created_at,
  }));
}

// ── Workspace Export ──

export async function exportWorkspace(workspaceId: string) {
  const workspace = await queryOne<{
    id: string; name: string; slug: string; template_id: string | null;
    created_at: string; updated_at: string;
  }>(`SELECT * FROM ${TABLES.workspaces} WHERE id = ?`, [workspaceId]);
  if (!workspace) throw new Error("Workspace not found");

  const installations = await getInstallations(workspaceId);
  const objects = await getObjects(workspaceId);
  const fields = (await Promise.all(objects.map(obj => getFields(workspaceId, obj.objectKey)))).flat();
  const views = (await Promise.all(objects.map(obj => getViews(workspaceId, obj.objectKey)))).flat();
  const navigation = await getNavigation(workspaceId);
  const extensions = await getExtensions(workspaceId);
  const extensionVersions = (await Promise.all(extensions.map(ext => getExtensionVersions(workspaceId, ext.id)))).flat();
  const auditLogs = await getAuditLogs(workspaceId);

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      templateId: workspace.template_id,
      createdAt: workspace.created_at,
      updatedAt: workspace.updated_at,
    },
    installations,
    objects,
    fields,
    views,
    navigation,
    extensions,
    extensionVersions,
    auditLogs,
    exportedAt: now(),
  };
}

// ── Workspace Import Validation (v0.3.6) ──

export interface WorkspaceExportData {
  workspace: {
    id: string;
    name: string;
    slug: string;
    templateId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  installations: unknown[];
  objects: unknown[];
  fields: unknown[];
  views: unknown[];
  navigation: unknown[];
  extensions: unknown[];
  extensionVersions: unknown[];
  auditLogs: unknown[];
  exportedAt: string;
}

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    objects: number;
    fields: number;
    views: number;
    navigation: number;
    installations: number;
    extensions: number;
    auditLogs: number;
  };
}

/**
 * Validate an export payload before importing (v0.3.6).
 * Checks structure, required fields, and data integrity without modifying anything.
 */
export function validateImport(data: unknown): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== "object") {
    return {
      valid: false,
      errors: ["Import data must be a JSON object"],
      warnings,
      stats: { objects: 0, fields: 0, views: 0, navigation: 0, installations: 0, extensions: 0, auditLogs: 0 },
    };
  }

  const payload = data as Partial<WorkspaceExportData>;

  // Required top-level structure
  if (!payload.workspace || typeof payload.workspace !== "object") {
    errors.push("Missing or invalid 'workspace' section");
  } else {
    const ws = payload.workspace;
    if (!ws.name || typeof ws.name !== "string") errors.push("workspace.name is required and must be a string");
    if (!ws.id || typeof ws.id !== "string") errors.push("workspace.id is required and must be a string");
  }

  // Validate arrays exist
  const arrayFields: Array<keyof WorkspaceExportData> = [
    "installations", "objects", "fields", "views", "navigation", "extensions", "extensionVersions", "auditLogs"
  ];
  for (const field of arrayFields) {
    if (payload[field] !== undefined && !Array.isArray(payload[field])) {
      errors.push(`'${field}' must be an array if present`);
    }
  }

  // Validate object definitions have required fields
  if (Array.isArray(payload.objects)) {
    for (let i = 0; i < payload.objects.length; i++) {
      const obj = payload.objects[i] as Record<string, unknown> | undefined;
      if (!obj || typeof obj !== "object") {
        errors.push(`objects[${i}] must be an object`);
        continue;
      }
      if (!obj.objectKey) errors.push(`objects[${i}].objectKey is required`);
    }
  }

  // Validate field definitions have required fields
  if (Array.isArray(payload.fields)) {
    for (let i = 0; i < payload.fields.length; i++) {
      const field = payload.fields[i] as Record<string, unknown> | undefined;
      if (!field || typeof field !== "object") {
        errors.push(`fields[${i}] must be an object`);
        continue;
      }
      if (!field.objectKey) errors.push(`fields[${i}].objectKey is required`);
      if (!field.fieldKey) errors.push(`fields[${i}].fieldKey is required`);
    }
  }

  const stats = {
    objects: Array.isArray(payload.objects) ? payload.objects.length : 0,
    fields: Array.isArray(payload.fields) ? payload.fields.length : 0,
    views: Array.isArray(payload.views) ? payload.views.length : 0,
    navigation: Array.isArray(payload.navigation) ? payload.navigation.length : 0,
    installations: Array.isArray(payload.installations) ? payload.installations.length : 0,
    extensions: Array.isArray(payload.extensions) ? payload.extensions.length : 0,
    auditLogs: Array.isArray(payload.auditLogs) ? payload.auditLogs.length : 0,
  };

  // Warnings for potentially risky imports
  if (stats.auditLogs > 1000) {
    warnings.push(`Large audit log count (${stats.auditLogs}). Import may be slow.`);
  }
  if (stats.objects > 50) {
    warnings.push(`Large object count (${stats.objects}). Verify all objects are expected.`);
  }

  return { valid: errors.length === 0, errors, warnings, stats };
}

/**
 * Import a validated export payload into a workspace (v0.3.6).
 * Only imports metadata (objects, fields, views, navigation) — not business records.
 * Use dryRun=true to preview without applying.
 */
export async function importWorkspace(
  workspaceId: string,
  data: WorkspaceExportData,
  options: { dryRun?: boolean } = {}
): Promise<{ applied: boolean; imported: { objects: number; fields: number; views: number; navigation: number } }> {
  const validation = validateImport(data);
  if (!validation.valid) {
    throw new Error(`Invalid import data: ${validation.errors.join("; ")}`);
  }

  if (options.dryRun) {
    return {
      applied: false,
      imported: {
        objects: validation.stats.objects,
        fields: validation.stats.fields,
        views: validation.stats.views,
        navigation: validation.stats.navigation,
      },
    };
  }

  let importedObjects = 0;
  let importedFields = 0;
  let importedViews = 0;
  let importedNavigation = 0;

  // Import object definitions (skip if already exists)
  if (Array.isArray(data.objects)) {
    for (const objRaw of data.objects) {
      const obj = objRaw as Record<string, unknown>;
      const objectKey = obj.objectKey as string;
      if (!objectKey) continue;

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.objectDefinitions} WHERE workspace_id = ? AND object_key = ?`,
        [workspaceId, objectKey]
      );
      if (existing) continue;

      await execute(
        `INSERT INTO ${TABLES.objectDefinitions} (id, workspace_id, object_key, label, module_id, ownership, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [genId("obj"), workspaceId, objectKey, (obj.label as string) ?? objectKey, (obj.moduleId as string) ?? null, (obj.ownership as string) ?? "imported", now()]
      );
      importedObjects++;
    }
  }

  // Import field definitions
  if (Array.isArray(data.fields)) {
    for (const fieldRaw of data.fields) {
      const field = fieldRaw as Record<string, unknown>;
      const objectKey = field.objectKey as string;
      const fieldKey = field.fieldKey as string;
      if (!objectKey || !fieldKey) continue;

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.fieldDefinitions} WHERE workspace_id = ? AND object_key = ? AND field_key = ?`,
        [workspaceId, objectKey, fieldKey]
      );
      if (existing) continue;

      await execute(
        `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, module_id, extension_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          genId("fld"), workspaceId, objectKey, fieldKey,
          (field.label as string) ?? fieldKey,
          (field.type as string) ?? "text",
          (field.ownership as string) ?? "imported",
          (field.required as number) ?? 0,
          (field.defaultValue as string) ?? null,
          field.validation ? JSON.stringify(field.validation) : null,
          (field.moduleId as string) ?? null,
          (field.extensionId as string) ?? null,
          now(),
        ]
      );
      importedFields++;
    }
  }

  // Import view definitions
  if (Array.isArray(data.views)) {
    for (const viewRaw of data.views) {
      const view = viewRaw as Record<string, unknown>;
      const objectKey = view.objectKey as string;
      const viewKey = view.viewKey as string;
      if (!objectKey || !viewKey) continue;

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.viewDefinitions} WHERE workspace_id = ? AND object_key = ? AND view_key = ?`,
        [workspaceId, objectKey, viewKey]
      );
      if (existing) continue;

      await execute(
        `INSERT INTO ${TABLES.viewDefinitions} (id, workspace_id, object_key, view_key, view_type, label, config_json, module_id, extension_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          genId("view"), workspaceId, objectKey, viewKey,
          (view.viewType as string) ?? "list",
          (view.label as string) ?? viewKey,
          view.config ? JSON.stringify(view.config) : "{}",
          (view.moduleId as string) ?? null,
          (view.extensionId as string) ?? null,
        ]
      );
      importedViews++;
    }
  }

  // Import navigation items
  if (Array.isArray(data.navigation)) {
    for (const navRaw of data.navigation) {
      const nav = navRaw as Record<string, unknown>;
      const route = nav.route as string;
      if (!route) continue;

      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM ${TABLES.navigationItems} WHERE workspace_id = ? AND route = ?`,
        [workspaceId, route]
      );
      if (existing) continue;

      await execute(
        `INSERT INTO ${TABLES.navigationItems} (id, workspace_id, label, route, icon, sort_order, module_id, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          genId("nav"), workspaceId,
          (nav.label as string) ?? "Imported",
          route,
          (nav.icon as string) ?? "file",
          (nav.sortOrder as number) ?? 100,
          (nav.moduleId as string) ?? null,
          1,
        ]
      );
      importedNavigation++;
    }
  }

  return {
    applied: true,
    imported: {
      objects: importedObjects,
      fields: importedFields,
      views: importedViews,
      navigation: importedNavigation,
    },
  };
}
