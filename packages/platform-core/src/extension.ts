import { queryAll, queryOne, batch, genId, now, validateIdentifier } from "./db";
import { TABLES } from "./contracts";
import { getFields, getView } from "./metadata";
import { loadModuleManifest } from "./installer";
import { InvalidInputError } from "./context";
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

export interface ExtensionValidationResult {
  valid: boolean;
  errors: string[];
}

export async function validateExtensionPlan(workspaceId: string, plan: ExtensionPlan): Promise<ExtensionValidationResult> {
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

  // Validate view modifications
  for (const vm of plan.viewModifications ?? []) {
    // Check targetObject exists
    const fields = await getFields(workspaceId, vm.targetObject);
    if (fields.length === 0) {
      errors.push(`Object "${vm.targetObject}" not found or has no fields`);
      continue;
    }

    // Check viewKey exists
    const view = await getView(workspaceId, vm.targetObject, vm.viewKey);
    if (!view) {
      errors.push(`View "${vm.viewKey}" not found for object "${vm.targetObject}"`);
      continue;
    }

    const config = view.config as Record<string, unknown>;
    const fieldKeys = new Set(fields.map(f => f.fieldKey));

    // Load extension point permissions for this view
    let allowReorder = false, allowFilters = false, allowAddSection = false, allowAddAction = false, allowPageSizeChange = false;
    if (view.moduleId) {
      try {
        const manifest = loadModuleManifest(view.moduleId);
        const viewExtPoint = manifest.extensionPoints?.views?.find(v => v.view === vm.viewKey);
        if (viewExtPoint) {
          allowReorder = viewExtPoint.allowReorder;
          allowFilters = viewExtPoint.allowFilters;
          allowAddSection = viewExtPoint.allowAddSection;
          allowAddAction = viewExtPoint.allowAddAction;
          allowPageSizeChange = viewExtPoint.allowPageSizeChange;
        }
      } catch {
        // If we can't load manifest, skip extension point validation
      }
    }

    const mods = vm.modifications;

    // Validate reorderColumns
    if (mods.reorderColumns) {
      if (!allowReorder) {
        errors.push(`View "${vm.viewKey}" does not allow column reordering`);
      }
      const currentColumns = ((config.columns as Array<{ field: string }>) ?? []).map(c => c.field);
      const currentSet = new Set(currentColumns);
      const reorderSet = new Set(mods.reorderColumns);

      // Check all reorderColumns exist in current columns
      for (const col of mods.reorderColumns) {
        if (!currentSet.has(col)) {
          errors.push(`Column "${col}" not found in view "${vm.viewKey}"`);
        }
      }

      // Check reorderColumns includes ALL existing columns
      for (const col of currentColumns) {
        if (!reorderSet.has(col)) {
          errors.push(`reorderColumns must include all existing columns. Missing: "${col}"`);
        }
      }
    }

    // Validate addFilters
    if (mods.addFilters) {
      if (!allowFilters) {
        errors.push(`View "${vm.viewKey}" does not allow adding filters`);
      }
      for (const filter of mods.addFilters) {
        if (!fieldKeys.has(filter.field)) {
          errors.push(`Filter field "${filter.field}" not found in object "${vm.targetObject}"`);
        }
      }
    }

    // Validate addSection
    if (mods.addSection) {
      if (!allowAddSection) {
        errors.push(`View "${vm.viewKey}" does not allow adding sections`);
      }
      for (const sf of mods.addSection.fields) {
        if (!fieldKeys.has(sf.field)) {
          errors.push(`Section field "${sf.field}" not found in object "${vm.targetObject}"`);
        }
      }
    }

    // Validate addAction
    if (mods.addAction && !allowAddAction) {
      errors.push(`View "${vm.viewKey}" does not allow adding actions`);
    }

    // Validate pageSize
    if (mods.pageSize !== undefined && !allowPageSizeChange) {
      errors.push(`View "${vm.viewKey}" does not allow page size changes`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Preview (compute diff) ──

export interface ViewModificationDiff {
  targetObject: string;
  viewKey: string;
  modifications: Array<{
    type: "reorderColumns" | "addFilters" | "addSection" | "addAction" | "pageSize";
    details: Record<string, unknown>;
  }>;
  before: Record<string, unknown> | null;
}

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
  viewModifications: ViewModificationDiff[];
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
      const slotParts = cf.ui.slot.split(".");
      if (slotParts.length < 2) {
        throw new InvalidInputError(`Invalid slot format: ${cf.ui.slot}. Expected "objectKey.viewKey"`);
      }
      affectedViews.push(slotParts[0] + "_" + slotParts[1]);
    }
  }

  // Compute view modification diffs
  const viewModifications: ViewModificationDiff[] = [];
  for (const vm of plan.viewModifications ?? []) {
    const view = await getView(workspaceId, vm.targetObject, vm.viewKey);
    const before = view ? JSON.parse(JSON.stringify(view.config)) as Record<string, unknown> : null;

    const modifications: ViewModificationDiff["modifications"] = [];
    if (vm.modifications.reorderColumns) {
      modifications.push({ type: "reorderColumns", details: { columns: vm.modifications.reorderColumns } });
    }
    if (vm.modifications.addFilters) {
      modifications.push({ type: "addFilters", details: { filters: vm.modifications.addFilters } });
    }
    if (vm.modifications.addSection) {
      modifications.push({ type: "addSection", details: { section: vm.modifications.addSection } });
    }
    if (vm.modifications.addAction) {
      modifications.push({ type: "addAction", details: { action: vm.modifications.addAction } });
    }
    if (vm.modifications.pageSize !== undefined) {
      modifications.push({ type: "pageSize", details: { pageSize: vm.modifications.pageSize } });
    }

    viewModifications.push({
      targetObject: vm.targetObject,
      viewKey: vm.viewKey,
      modifications,
      before,
    });

    affectedViews.push(vm.viewKey);
  }

  return {
    plan,
    addedFields,
    affectedViews: [...new Set(affectedViews)],
    viewModifications,
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
    // Validate field key before inserting (defense in depth against SQL injection)
    validateIdentifier(cf.fieldKey);

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

  // Apply view modifications
  // Use a cache so multiple modifications to the same view are merged correctly
  const viewConfigCache = new Map<string, { id: string; config: Record<string, unknown> }>();

  for (const vm of plan.viewModifications ?? []) {
    const cacheKey = `${vm.targetObject}:${vm.viewKey}`;
    let viewEntry = viewConfigCache.get(cacheKey);

    if (!viewEntry) {
      const view = await getView(workspaceId, vm.targetObject, vm.viewKey);
      if (!view) continue;
      viewEntry = {
        id: view.id,
        config: JSON.parse(JSON.stringify(view.config)) as Record<string, unknown>,
      };
      viewConfigCache.set(cacheKey, viewEntry);
    }

    const config = viewEntry.config;
    const mods = vm.modifications;

    if (mods.reorderColumns) {
      const currentColumns = (config.columns as Array<{ field: string; label?: string }>) ?? [];
      const colMap = new Map(currentColumns.map(c => [c.field, c]));
      config.columns = mods.reorderColumns
        .map(field => colMap.get(field))
        .filter((c): c is { field: string; label?: string } => c !== undefined);
    }

    if (mods.addFilters) {
      if (!config.filters) config.filters = [];
      (config.filters as unknown[]).push(...mods.addFilters);
    }

    if (mods.addSection) {
      if (!config.sections) config.sections = [];
      const sections = config.sections as Array<{ title: string; fields: Array<{ field: string; required?: boolean }> }>;
      if (mods.addSection.afterSection) {
        const idx = sections.findIndex(s => s.title === mods.addSection!.afterSection);
        if (idx >= 0) {
          sections.splice(idx + 1, 0, mods.addSection);
        } else {
          sections.push(mods.addSection);
        }
      } else {
        sections.push(mods.addSection);
      }
    }

    if (mods.addAction) {
      if (!config.actions) config.actions = [];
      (config.actions as string[]).push(mods.addAction);
    }

    if (mods.pageSize !== undefined) {
      config.pageSize = mods.pageSize;
    }
  }

  // Write all modified views as part of the same atomic batch
  for (const viewEntry of viewConfigCache.values()) {
    writes.push({
      sql: `UPDATE ${TABLES.viewDefinitions} SET config_json = ? WHERE id = ? AND workspace_id = ?`,
      args: [JSON.stringify(viewEntry.config), viewEntry.id, workspaceId],
    });
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

  const currentVer = await queryOne<{ manifest_json: string; diff_json: string | null }>(
    `SELECT ev.manifest_json, ev.diff_json FROM ${TABLES.extensionVersions} ev
     JOIN ${TABLES.extensionDefinitions} ed ON ed.id = ev.extension_id
     WHERE ev.extension_id = ? AND ev.version = ? AND ed.workspace_id = ?`,
    [extensionId, currentVersion, workspaceId]
  );
  if (!currentVer) throw new Error("Current version not found");

  const plan = JSON.parse(currentVer.manifest_json) as ExtensionPlan;
  const diff = currentVer.diff_json ? JSON.parse(currentVer.diff_json) as DiffPreview : null;

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

  // Reverse view modifications
  // Use a cache so multiple modifications to the same view are merged correctly
  const rollbackViewCache = new Map<string, { id: string; config: Record<string, unknown> }>();

  for (const vm of plan.viewModifications ?? []) {
    const cacheKey = `${vm.targetObject}:${vm.viewKey}`;
    let viewEntry = rollbackViewCache.get(cacheKey);

    if (!viewEntry) {
      const view = await getView(workspaceId, vm.targetObject, vm.viewKey);
      if (!view) continue;
      viewEntry = {
        id: view.id,
        config: JSON.parse(JSON.stringify(view.config)) as Record<string, unknown>,
      };
      rollbackViewCache.set(cacheKey, viewEntry);
    }

    const config = viewEntry.config;
    const mods = vm.modifications;

    // Find the before config from the diff for restoring original values
    const vmDiff = diff?.viewModifications?.find(v => v.targetObject === vm.targetObject && v.viewKey === vm.viewKey);
    const before = vmDiff?.before;

    if (mods.reorderColumns && before) {
      // Restore original column order
      config.columns = before.columns ?? config.columns;
    }

    if (mods.addFilters) {
      // Remove filters that were added (match by field + operator)
      const filters = (config.filters as Array<{ field: string; operator: string; value: unknown }>) ?? [];
      config.filters = filters.filter(f =>
        !mods.addFilters!.some(af => af.field === f.field && af.operator === f.operator)
      );
    }

    if (mods.addSection) {
      // Remove the section that was added (match by title)
      const sections = (config.sections as Array<{ title: string }>) ?? [];
      config.sections = sections.filter(s => s.title !== mods.addSection!.title);
    }

    if (mods.addAction) {
      // Remove the action that was added
      const actions = (config.actions as string[]) ?? [];
      config.actions = actions.filter(a => a !== mods.addAction);
    }

    if (mods.pageSize !== undefined && before) {
      // Restore original page size
      config.pageSize = before.pageSize ?? config.pageSize;
    }
  }

  // Write all restored views as part of the same atomic batch
  for (const viewEntry of rollbackViewCache.values()) {
    writes.push({
      sql: `UPDATE ${TABLES.viewDefinitions} SET config_json = ? WHERE id = ? AND workspace_id = ?`,
      args: [JSON.stringify(viewEntry.config), viewEntry.id, workspaceId],
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

// ── Business-Language Diff Rendering (v0.3.5) ──

export interface DiffSummaryLine {
  category: "field" | "view" | "risk";
  icon: string;
  message: string;
  detail?: string;
}

export interface DiffSummary {
  lines: DiffSummaryLine[];
  riskLabel: string;
  overallSummary: string;
}

const RISK_LABELS: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const VIEW_MOD_LABELS: Record<string, string> = {
  reorderColumns: "调整列顺序",
  addFilters: "添加筛选条件",
  addSection: "添加分组",
  addAction: "添加操作按钮",
  pageSize: "调整分页大小",
};

/**
 * Convert a DiffPreview (JSON-shaped) into human-readable business-language
 * summary lines. This is the primary approval experience — JSON remains
 * available for debugging but is not the default view.
 */
export function renderDiffPreview(diff: DiffPreview): DiffSummary {
  const lines: DiffSummaryLine[] = [];

  // Field additions
  for (const field of diff.addedFields) {
    const parts: string[] = [
      `在「${field.object}」对象上新增字段「${field.label}」(${field.fieldKey})`,
      `类型: ${field.type}`,
    ];
    if (field.listColumn) {
      parts.push("显示在列表中");
    }
    if (field.slot) {
      parts.push(`位置: ${field.slot}`);
    }
    lines.push({
      category: "field",
      icon: "plus",
      message: `新增字段: ${field.label}`,
      detail: parts.join(" · "),
    });
  }

  // View modifications
  for (const vm of diff.viewModifications) {
    const modDescriptions = vm.modifications.map(m => {
      const label = VIEW_MOD_LABELS[m.type] ?? m.type;
      switch (m.type) {
        case "reorderColumns":
          return `${label}: ${(m.details.columns as string[])?.join(" → ") ?? ""}`;
        case "addFilters":
          return `${label}: ${JSON.stringify(m.details.filters)}`;
        case "addSection":
          return `${label}: ${(m.details.section as { title?: string })?.title ?? "新分组"}`;
        case "addAction":
          return `${label}: ${(m.details.action as { label?: string })?.label ?? "新操作"}`;
        case "pageSize":
          return `${label}: ${m.details.pageSize}`;
        default:
          return label;
      }
    });

    lines.push({
      category: "view",
      icon: "layout",
      message: `修改视图: ${vm.targetObject}/${vm.viewKey}`,
      detail: modDescriptions.join(" · "),
    });
  }

  // Affected views summary (if any not already covered by viewModifications)
  const coveredViews = new Set(diff.viewModifications.map(vm => `${vm.targetObject}/${vm.viewKey}`));
  for (const view of diff.affectedViews) {
    if (!coveredViews.has(view)) {
      lines.push({
        category: "view",
        icon: "eye",
        message: `影响视图: ${view}`,
      });
    }
  }

  // Risk
  lines.push({
    category: "risk",
    icon: "shield",
    message: `风险等级: ${RISK_LABELS[diff.riskLevel] ?? diff.riskLevel}`,
  });

  // Overall summary
  const fieldCount = diff.addedFields.length;
  const viewCount = diff.viewModifications.length;
  const summaryParts: string[] = [];
  if (fieldCount > 0) {
    summaryParts.push(`新增 ${fieldCount} 个字段`);
  }
  if (viewCount > 0) {
    summaryParts.push(`修改 ${viewCount} 个视图`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push("无实质性变更");
  }
  const overallSummary = `${summaryParts.join("，")}（${RISK_LABELS[diff.riskLevel] ?? diff.riskLevel}）`;

  return {
    lines,
    riskLabel: RISK_LABELS[diff.riskLevel] ?? diff.riskLevel,
    overallSummary,
  };
}
