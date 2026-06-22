import { queryAll, queryOne, batch, genId, now } from "./db";
import { TABLES } from "./contracts";
import { getFields, getView } from "./metadata";
import { loadModuleManifest } from "./installer";
import type { ExtensionPlan } from "@runory/contracts";

// ── Extension Runtime ──

export interface ExtensionVersion {
  id: string;
  extensionId: string;
  version: number;
  manifest: Record<string, unknown>;
  diff: Record<string, unknown> | null;
  riskLevel: string;
  changeSummary: string | null;
  createdBy: string;
  approvedBy: string | null;
  appliedAt: string | null;
  rollbackOfVersion: number | null;
  createdAt: string;
}

export interface ExtensionDefinition {
  id: string;
  workspaceId: string;
  name: string;
  namespace: string;
  status: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

// ── Validate Extension Plan ──

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export async function validateExtensionPlan(workspaceId: string, plan: ExtensionPlan): Promise<ValidationResult> {
  const errors: string[] = [];

  for (const cf of plan.customFields) {
    // Check object exists
    const fields = await getFields(workspaceId, cf.targetObject);
    if (fields.length === 0) {
      errors.push(`Object "${cf.targetObject}" not found or has no fields`);
      continue;
    }

    // Check field key uniqueness
    if (fields.some(f => f.fieldKey === cf.fieldKey)) {
      errors.push(`Field key "${cf.fieldKey}" already exists on object "${cf.targetObject}"`);
    }

    // Check against module extension points
    const moduleField = fields.find(f => f.ownership === "module_owned");
    if (moduleField?.moduleId) {
      try {
        const manifest = loadModuleManifest(moduleField.moduleId);
        const extPoints = manifest.extensionPoints?.entities?.find(e => e.entity === cf.targetObject);

        if (!extPoints?.customFields?.enabled) {
          errors.push(`Object "${cf.targetObject}" does not allow custom fields`);
        } else {
          // Check reserved keys
          if (extPoints.customFields.reservedKeys.includes(cf.fieldKey)) {
            errors.push(`Field key "${cf.fieldKey}" is reserved`);
          }
          // Check allowed types
          if (!extPoints.customFields.allowedTypes.includes(cf.type)) {
            errors.push(`Field type "${cf.type}" not allowed. Allowed: ${extPoints.customFields.allowedTypes.join(", ")}`);
          }
          // Check max fields
          if (extPoints.customFields.maxFields) {
            const currentExtCount = fields.filter(f => f.ownership === "workspace_extension").length;
            if (currentExtCount >= extPoints.customFields.maxFields) {
              errors.push(`Max custom fields (${extPoints.customFields.maxFields}) reached for "${cf.targetObject}"`);
            }
          }
        }
      } catch {
        // If we can't load manifest, skip extension point validation
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Preview (compute diff) ──

export interface DiffPreview {
  plan: ExtensionPlan;
  addedFields: Array<{
    object: string;
    fieldKey: string;
    label: string;
    type: string;
    listColumn: boolean;
    slot: string | null;
  }>;
  affectedViews: string[];
  riskLevel: string;
}

export async function previewExtension(workspaceId: string, plan: ExtensionPlan): Promise<DiffPreview> {
  const addedFields = plan.customFields.map(cf => ({
    object: cf.targetObject,
    fieldKey: cf.fieldKey,
    label: cf.label,
    type: cf.type,
    listColumn: cf.ui?.listColumn ?? false,
    slot: cf.ui?.slot ?? null,
  }));

  const affectedViews: string[] = [];
  for (const cf of plan.customFields) {
    if (cf.ui?.listColumn) {
      affectedViews.push(`${cf.targetObject}_list`);
    }
    if (cf.ui?.slot) {
      affectedViews.push(cf.ui.slot.split(".")[0] + "_" + cf.ui.slot.split(".")[1]);
    }
  }

  return {
    plan,
    addedFields,
    affectedViews: [...new Set(affectedViews)],
    riskLevel: plan.riskLevel,
  };
}

// ── Apply Extension ──

export async function applyExtension(workspaceId: string, plan: ExtensionPlan, createdBy: string): Promise<ExtensionVersion> {
  const ts = now();

  // Validate first
  const validation = await validateExtensionPlan(workspaceId, plan);
  if (!validation.valid) {
    throw new Error(`Invalid extension plan: ${validation.errors.join("; ")}`);
  }

  const diff = await previewExtension(workspaceId, plan);

  // Query phase: find or create extension definition
  const existingExtDef = await queryOne<{ id: string; current_version: number }>(
    `SELECT id, current_version FROM ${TABLES.extensionDefinitions} WHERE workspace_id = ? AND name = ?`,
    [workspaceId, plan.name]
  );

  let extId: string;
  let newVersion: number;

  const writes: Array<{ sql: string; args?: unknown[] }> = [];

  if (!existingExtDef) {
    extId = genId("ext");
    writes.push({
      sql: `INSERT INTO ${TABLES.extensionDefinitions} (id, workspace_id, name, namespace, status, current_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`,
      args: [extId, workspaceId, plan.name, `ext_${plan.name.toLowerCase().replace(/\s+/g, "_")}`, ts, ts],
    });
    newVersion = 1;
  } else {
    extId = existingExtDef.id;
    newVersion = existingExtDef.current_version + 1;
  }

  const versionId = genId("extv");

  // Create extension version
  writes.push({
    sql: `INSERT INTO ${TABLES.extensionVersions} (id, extension_id, version, manifest_json, diff_json, risk_level, change_summary, created_by, approved_by, applied_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [versionId, extId, newVersion, JSON.stringify(plan), JSON.stringify(diff),
      plan.riskLevel, plan.description ?? plan.name, createdBy, createdBy, ts, ts],
  });

  // Apply each custom field
  for (const cf of plan.customFields) {
    // Insert field definition
    writes.push({
      sql: `INSERT INTO ${TABLES.fieldDefinitions} (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, extension_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'workspace_extension', ?, ?, ?, ?, ?)`,
      args: [genId("fld"), workspaceId, cf.targetObject, cf.fieldKey, cf.label, cf.type,
        cf.required ? 1 : 0, null, cf.validation ? JSON.stringify(cf.validation) : null,
        extId, ts],
    });

    // Update view definitions if needed
    if (cf.ui?.listColumn) {
      const view = await getView(workspaceId, cf.targetObject, `${cf.targetObject}_list`);
      if (view) {
        const config = view.config as any;
        if (!config.columns) config.columns = [];
        config.columns.push({ field: cf.fieldKey, label: cf.label });
        writes.push({
          sql: `UPDATE ${TABLES.viewDefinitions} SET config_json = ? WHERE id = ? AND workspace_id = ?`,
          args: [JSON.stringify(config), view.id, workspaceId],
        });
      }
    }

    if (cf.ui?.slot) {
      const view = await getView(workspaceId, cf.targetObject, `${cf.targetObject}_form`);
      if (view) {
        const config = view.config as any;
        if (config.sections && config.sections.length > 0) {
          config.sections[0].fields.push({ field: cf.fieldKey, required: cf.required });
          writes.push({
            sql: `UPDATE ${TABLES.viewDefinitions} SET config_json = ? WHERE id = ? AND workspace_id = ?`,
            args: [JSON.stringify(config), view.id, workspaceId],
          });
        }
      }
    }
  }

  // Update extension current version
  writes.push({
    sql: `UPDATE ${TABLES.extensionDefinitions} SET current_version = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`,
    args: [newVersion, ts, extId, workspaceId],
  });

  // Create audit log
  writes.push({
    sql: `INSERT INTO ${TABLES.auditLogs} (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, extension_version_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [genId("aud"), workspaceId, "agent", createdBy, "extension.apply", "extension", extId,
      null, JSON.stringify({ plan, version: newVersion }), versionId, ts],
  });

  // Atomic write
  await batch(writes);

  return {
    id: versionId,
    extensionId: extId,
    version: newVersion,
    manifest: plan,
    diff: diff as unknown as Record<string, unknown>,
    riskLevel: plan.riskLevel,
    changeSummary: plan.description ?? plan.name,
    createdBy,
    approvedBy: createdBy,
    appliedAt: ts,
    rollbackOfVersion: null,
    createdAt: ts,
  };
}

// ── Rollback Extension ──

export async function rollbackExtension(workspaceId: string, extensionId: string, rolledBy: string): Promise<ExtensionVersion | null> {
  const ts = now();

  // Query phase
  const extDef = await queryOne<{ current_version: number }>(
    `SELECT current_version FROM ${TABLES.extensionDefinitions} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, extensionId]
  );
  if (!extDef) throw new Error("Extension not found");

  const currentVersion = extDef.current_version;
  if (currentVersion === 0) throw new Error("No versions to rollback");

  const currentVer = await queryOne<{ manifest_json: string }>(
    `SELECT ev.manifest_json FROM ${TABLES.extensionVersions} ev
     JOIN ${TABLES.extensionDefinitions} ed ON ed.id = ev.extension_id
     WHERE ev.extension_id = ? AND ev.version = ? AND ed.workspace_id = ?`,
    [extensionId, currentVersion, workspaceId]
  );
  if (!currentVer) throw new Error("Current version not found");

  const plan = JSON.parse(currentVer.manifest_json) as ExtensionPlan;

  const writes: Array<{ sql: string; args?: unknown[] }> = [];

  // Remove field definitions added by this version
  for (const cf of plan.customFields) {
    writes.push({
      sql: `DELETE FROM ${TABLES.fieldDefinitions} WHERE workspace_id = ? AND object_key = ? AND field_key = ? AND ownership = 'workspace_extension'`,
      args: [workspaceId, cf.targetObject, cf.fieldKey],
    });

    // Remove from view definitions
    if (cf.ui?.listColumn) {
      const view = await getView(workspaceId, cf.targetObject, `${cf.targetObject}_list`);
      if (view) {
        const config = view.config as any;
        if (config.columns) {
          config.columns = config.columns.filter((c: any) => c.field !== cf.fieldKey);
          writes.push({
            sql: `UPDATE ${TABLES.viewDefinitions} SET config_json = ? WHERE id = ? AND workspace_id = ?`,
            args: [JSON.stringify(config), view.id, workspaceId],
          });
        }
      }
    }

    if (cf.ui?.slot) {
      const view = await getView(workspaceId, cf.targetObject, `${cf.targetObject}_form`);
      if (view) {
        const config = view.config as any;
        if (config.sections && config.sections.length > 0) {
          config.sections[0].fields = config.sections[0].fields.filter((f: any) => f.field !== cf.fieldKey);
          writes.push({
            sql: `UPDATE ${TABLES.viewDefinitions} SET config_json = ? WHERE id = ? AND workspace_id = ?`,
            args: [JSON.stringify(config), view.id, workspaceId],
          });
        }
      }
    }

    // Remove extension field values for this field
    writes.push({
      sql: `DELETE FROM ${TABLES.extensionFieldValues} WHERE workspace_id = ? AND object_key = ? AND field_key = ?`,
      args: [workspaceId, cf.targetObject, cf.fieldKey],
    });
  }

  // Create rollback version
  const newVersion = currentVersion + 1;
  const versionId = genId("extv");
  writes.push({
    sql: `INSERT INTO ${TABLES.extensionVersions} (id, extension_id, version, manifest_json, diff_json, risk_level, change_summary, created_by, applied_at, rollback_of_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [versionId, extensionId, newVersion, JSON.stringify(plan), null, "low",
      `Rollback of version ${currentVersion}`, rolledBy, ts, currentVersion, ts],
  });

  // Update extension current version
  writes.push({
    sql: `UPDATE ${TABLES.extensionDefinitions} SET current_version = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`,
    args: [newVersion, ts, extensionId, workspaceId],
  });

  // Create audit log
  writes.push({
    sql: `INSERT INTO ${TABLES.auditLogs} (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, extension_version_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [genId("aud"), workspaceId, "agent", rolledBy, "extension.rollback", "extension", extensionId,
      JSON.stringify({ version: currentVersion }), JSON.stringify({ version: newVersion, rollbackOf: currentVersion }),
      versionId, ts],
  });

  // Atomic write
  await batch(writes);

  return {
    id: versionId,
    extensionId,
    version: newVersion,
    manifest: plan,
    diff: null,
    riskLevel: "low",
    changeSummary: `Rollback of version ${currentVersion}`,
    createdBy: rolledBy,
    approvedBy: null,
    appliedAt: ts,
    rollbackOfVersion: currentVersion,
    createdAt: ts,
  };
}

// ── List Extensions ──

export async function getExtensions(workspaceId: string): Promise<ExtensionDefinition[]> {
  const rows = await queryAll<{
    id: string; workspace_id: string; name: string; namespace: string;
    status: string; current_version: number; created_at: string; updated_at: string;
  }>(`SELECT * FROM ${TABLES.extensionDefinitions} WHERE workspace_id = ?`, [workspaceId]);
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, name: r.name, namespace: r.namespace,
    status: r.status, currentVersion: r.current_version, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export async function getExtensionVersions(workspaceId: string, extensionId: string): Promise<ExtensionVersion[]> {
  const rows = await queryAll<{
    id: string; extension_id: string; version: number; manifest_json: string;
    diff_json: string | null; risk_level: string; change_summary: string | null;
    created_by: string; approved_by: string | null; applied_at: string | null;
    rollback_of_version: number | null; created_at: string;
  }>(
    `SELECT ev.* FROM ${TABLES.extensionVersions} ev
     JOIN ${TABLES.extensionDefinitions} ed ON ed.id = ev.extension_id
     WHERE ev.extension_id = ? AND ed.workspace_id = ?
     ORDER BY ev.version DESC`,
    [extensionId, workspaceId]
  );
  return rows.map(r => ({
    id: r.id, extensionId: r.extension_id, version: r.version,
    manifest: JSON.parse(r.manifest_json), diff: r.diff_json ? JSON.parse(r.diff_json) : null,
    riskLevel: r.risk_level, changeSummary: r.change_summary, createdBy: r.created_by,
    approvedBy: r.approved_by, appliedAt: r.applied_at, rollbackOfVersion: r.rollback_of_version,
    createdAt: r.created_at,
  }));
}
