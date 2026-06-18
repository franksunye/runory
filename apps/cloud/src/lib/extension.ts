import { getDb, genId, now } from "./db";
import { getFields, getView } from "./metadata";
import { loadModuleManifest } from "./installer";
import type { ExtensionPlan, CustomFieldPlan } from "./manifest";

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

export function validateExtensionPlan(workspaceId: string, plan: ExtensionPlan): ValidationResult {
  const errors: string[] = [];

  for (const cf of plan.customFields) {
    // Check object exists
    const fields = getFields(workspaceId, cf.targetObject);
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

export function previewExtension(workspaceId: string, plan: ExtensionPlan): DiffPreview {
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

export function applyExtension(workspaceId: string, plan: ExtensionPlan, createdBy: string): ExtensionVersion {
  const db = getDb();
  const ts = now();

  // Validate first
  const validation = validateExtensionPlan(workspaceId, plan);
  if (!validation.valid) {
    throw new Error(`Invalid extension plan: ${validation.errors.join("; ")}`);
  }

  const diff = previewExtension(workspaceId, plan);

  return db.transaction(() => {
    // Find or create extension definition
    let extDef = db.prepare(`SELECT * FROM extension_definitions WHERE workspace_id = ? AND name = ?`).get(workspaceId, plan.name) as any;

    if (!extDef) {
      const extId = genId("ext");
      db.prepare(`INSERT INTO extension_definitions (id, workspace_id, name, namespace, status, current_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`).run(
        extId, workspaceId, plan.name, `ext_${plan.name.toLowerCase().replace(/\s+/g, "_")}`, ts, ts
      );
      extDef = { id: extId, workspace_id: workspaceId, name: plan.name, current_version: 0 };
    }

    const newVersion = extDef.current_version + 1;
    const versionId = genId("extv");

    // Create extension version
    db.prepare(`INSERT INTO extension_versions (id, extension_id, version, manifest_json, diff_json, risk_level, change_summary, created_by, approved_by, applied_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      versionId, extDef.id, newVersion, JSON.stringify(plan), JSON.stringify(diff),
      plan.riskLevel, plan.description ?? plan.name, createdBy, createdBy, ts, ts
    );

    // Apply each custom field
    for (const cf of plan.customFields) {
      // Insert field definition
      db.prepare(`INSERT INTO field_definitions (id, workspace_id, object_key, field_key, label, type, ownership, required, default_value, validation_json, extension_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'workspace_extension', ?, ?, ?, ?, ?)`).run(
        genId("fld"), workspaceId, cf.targetObject, cf.fieldKey, cf.label, cf.type,
        cf.required ? 1 : 0, null, cf.validation ? JSON.stringify(cf.validation) : null,
        extDef.id, ts
      );

      // Update view definitions if needed
      if (cf.ui?.listColumn) {
        const view = getView(workspaceId, cf.targetObject, `${cf.targetObject}_list`);
        if (view) {
          const config = view.config as any;
          if (!config.columns) config.columns = [];
          config.columns.push({ field: cf.fieldKey, label: cf.label });
          db.prepare(`UPDATE view_definitions SET config_json = ? WHERE id = ?`).run(
            JSON.stringify(config), view.id
          );
        }
      }

      if (cf.ui?.slot) {
        const view = getView(workspaceId, cf.targetObject, `${cf.targetObject}_form`);
        if (view) {
          const config = view.config as any;
          if (config.sections && config.sections.length > 0) {
            config.sections[0].fields.push({ field: cf.fieldKey, required: cf.required });
            db.prepare(`UPDATE view_definitions SET config_json = ? WHERE id = ?`).run(
              JSON.stringify(config), view.id
            );
          }
        }
      }
    }

    // Update extension current version
    db.prepare(`UPDATE extension_definitions SET current_version = ?, updated_at = ? WHERE id = ?`).run(
      newVersion, ts, extDef.id
    );

    // Create audit log
    db.prepare(`INSERT INTO audit_logs (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, extension_version_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      genId("aud"), workspaceId, "agent", createdBy, "extension.apply", "extension", extDef.id,
      null, JSON.stringify({ plan, version: newVersion }), versionId, ts
    );

    return {
      id: versionId,
      extensionId: extDef.id,
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
  })();
}

// ── Rollback Extension ──

export function rollbackExtension(workspaceId: string, extensionId: string, rolledBy: string): ExtensionVersion | null {
  const db = getDb();
  const ts = now();

  return db.transaction(() => {
    const extDef = db.prepare(`SELECT * FROM extension_definitions WHERE workspace_id = ? AND id = ?`).get(workspaceId, extensionId) as any;
    if (!extDef) throw new Error("Extension not found");

    const currentVersion = extDef.current_version;
    if (currentVersion === 0) throw new Error("No versions to rollback");

    const currentVer = db.prepare(`SELECT * FROM extension_versions WHERE extension_id = ? AND version = ?`).get(extensionId, currentVersion) as any;
    if (!currentVer) throw new Error("Current version not found");

    const plan = JSON.parse(currentVer.manifest_json) as ExtensionPlan;

    // Remove field definitions added by this version
    for (const cf of plan.customFields) {
      db.prepare(`DELETE FROM field_definitions WHERE workspace_id = ? AND object_key = ? AND field_key = ? AND ownership = 'workspace_extension'`).run(
        workspaceId, cf.targetObject, cf.fieldKey
      );

      // Remove from view definitions
      if (cf.ui?.listColumn) {
        const view = getView(workspaceId, cf.targetObject, `${cf.targetObject}_list`);
        if (view) {
          const config = view.config as any;
          if (config.columns) {
            config.columns = config.columns.filter((c: any) => c.field !== cf.fieldKey);
            db.prepare(`UPDATE view_definitions SET config_json = ? WHERE id = ?`).run(
              JSON.stringify(config), view.id
            );
          }
        }
      }

      if (cf.ui?.slot) {
        const view = getView(workspaceId, cf.targetObject, `${cf.targetObject}_form`);
        if (view) {
          const config = view.config as any;
          if (config.sections && config.sections.length > 0) {
            config.sections[0].fields = config.sections[0].fields.filter((f: any) => f.field !== cf.fieldKey);
            db.prepare(`UPDATE view_definitions SET config_json = ? WHERE id = ?`).run(
              JSON.stringify(config), view.id
            );
          }
        }
      }

      // Remove extension field values for this field
      db.prepare(`DELETE FROM extension_field_values WHERE workspace_id = ? AND object_key = ? AND field_key = ?`).run(
        workspaceId, cf.targetObject, cf.fieldKey
      );
    }

    // Create rollback version
    const newVersion = currentVersion + 1;
    const versionId = genId("extv");
    db.prepare(`INSERT INTO extension_versions (id, extension_id, version, manifest_json, diff_json, risk_level, change_summary, created_by, applied_at, rollback_of_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      versionId, extensionId, newVersion, JSON.stringify(plan), null, "low",
      `Rollback of version ${currentVersion}`, rolledBy, ts, currentVersion, ts
    );

    // Update extension current version
    db.prepare(`UPDATE extension_definitions SET current_version = ?, updated_at = ? WHERE id = ?`).run(
      newVersion, ts, extensionId
    );

    // Create audit log
    db.prepare(`INSERT INTO audit_logs (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, extension_version_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      genId("aud"), workspaceId, "agent", rolledBy, "extension.rollback", "extension", extensionId,
      JSON.stringify({ version: currentVersion }), JSON.stringify({ version: newVersion, rollbackOf: currentVersion }),
      versionId, ts
    );

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
  })();
}

// ── List Extensions ──

export function getExtensions(workspaceId: string): ExtensionDefinition[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM extension_definitions WHERE workspace_id = ?`).all(workspaceId) as any[];
  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, name: r.name, namespace: r.namespace,
    status: r.status, currentVersion: r.current_version, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export function getExtensionVersions(workspaceId: string, extensionId: string): ExtensionVersion[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM extension_versions WHERE extension_id = ? ORDER BY version DESC`).all(extensionId) as any[];
  return rows.map(r => ({
    id: r.id, extensionId: r.extension_id, version: r.version,
    manifest: JSON.parse(r.manifest_json), diff: r.diff_json ? JSON.parse(r.diff_json) : null,
    riskLevel: r.risk_level, changeSummary: r.change_summary, createdBy: r.created_by,
    approvedBy: r.approved_by, appliedAt: r.applied_at, rollbackOfVersion: r.rollback_of_version,
    createdAt: r.created_at,
  }));
}
