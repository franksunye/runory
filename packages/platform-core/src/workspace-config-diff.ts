/**
 * Workspace Configuration Diff (v0.9.1)
 *
 * Compares two workspace configurations (or a workspace against a reference
 * solution baseline) to produce a structured diff. This is the core of the
 * v0.9.1 configuration Diff tool — it answers:
 *
 *   "What does this customer workspace have compared to the standard
 *    reference solution, and how much of it is standard vs. extension?"
 *
 * The diff covers 10 configuration categories: packs, extensions, objects,
 * fields, views, navigation, relations, automations, workflows, and forms.
 * Coverage metrics calculate the 90/10 ratio (standard product vs. extensions).
 *
 * Design principles:
 * - Safe: exports configuration metadata only — no business data or credentials
 * - Structured: every change has a category, type, identifier, and optional detail
 * - Reusable: the snapshot extraction is shared with diagnostics-package.ts patterns
 */

import { queryAll, queryOne } from "./db";
import { TABLES } from "./contracts";
import type {
  ConfigDiffEntry,
  ConfigDiffCategory,
  ConfigDiffSummary,
  CoverageMetrics,
  WorkspaceConfigDiff,
  WorkspaceCoverageEntry,
  CoverageValidationReport,
} from "@runory/contracts";

// ── Configuration Snapshot ──

interface PackEntry {
  packId: string;
  packVersion: string;
  demoDataStatus: string;
}

interface ExtensionEntry {
  name: string;
  currentVersion: number;
  status: string;
}

interface ObjectEntry {
  objectKey: string;
  label: string;
  moduleId: string | null;
  ownership: string;
}

interface FieldEntry {
  objectKey: string;
  fieldKey: string;
  label: string;
  type: string;
  ownership: string;
  required: boolean;
}

interface ViewEntry {
  objectKey: string;
  viewKey: string;
  viewType: string;
  label: string;
}

interface NavigationEntry {
  route: string;
  label: string;
  icon: string;
  sortOrder: number;
  enabled: boolean;
}

interface RelationEntry {
  objectKey: string;
  targetObjectKey: string;
  relationType: string;
  foreignKey: string;
}

interface AutomationEntry {
  name: string;
  enabled: boolean;
  automationId: string;
}

interface WorkflowEntry {
  workflowId: string;
  name: string;
  targetObject: string;
}

interface FormEntry {
  formKey: string;
  name: string;
  status: string;
}

export interface WorkspaceConfigSnapshot {
  workspaceId: string;
  packs: PackEntry[];
  extensions: ExtensionEntry[];
  objects: ObjectEntry[];
  fields: FieldEntry[];
  views: ViewEntry[];
  navigation: NavigationEntry[];
  relations: RelationEntry[];
  automations: AutomationEntry[];
  workflows: WorkflowEntry[];
  forms: FormEntry[];
}

// ── Snapshot Extraction ──

/**
 * Extract a complete configuration snapshot from a workspace.
 *
 * This captures the structural configuration (metadata) of a workspace —
 * what packs, objects, fields, views, etc. are installed — without any
 * business data. The snapshot is safe to share and compare.
 */
export async function extractWorkspaceConfig(workspaceId: string): Promise<WorkspaceConfigSnapshot> {
  const [packs, extensions, objects, fields, views, navItems, relations, automations, workflows, forms] = await Promise.all([
    queryAll<{ pack_id: string; pack_version: string; demo_data_status: string }>(
      `SELECT pack_id, pack_version, demo_data_status FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? ORDER BY pack_id`,
      [workspaceId],
    ),
    queryAll<{ name: string; current_version: number; status: string }>(
      `SELECT name, current_version, status FROM ${TABLES.extensionDefinitions}
       WHERE workspace_id = ? ORDER BY name`,
      [workspaceId],
    ),
    queryAll<{ object_key: string; label: string; module_id: string | null; ownership: string }>(
      `SELECT object_key, label, module_id, ownership FROM ${TABLES.objectDefinitions}
       WHERE workspace_id = ? ORDER BY object_key`,
      [workspaceId],
    ),
    queryAll<{ object_key: string; field_key: string; label: string; type: string; ownership: string; required: number }>(
      `SELECT object_key, field_key, label, type, ownership, required FROM ${TABLES.fieldDefinitions}
       WHERE workspace_id = ? ORDER BY object_key, field_key`,
      [workspaceId],
    ),
    queryAll<{ object_key: string; view_key: string; view_type: string; label: string }>(
      `SELECT object_key, view_key, view_type, label FROM ${TABLES.viewDefinitions}
       WHERE workspace_id = ? ORDER BY object_key, view_type`,
      [workspaceId],
    ),
    queryAll<{ route: string; label: string; icon: string; sort_order: number; enabled: number }>(
      `SELECT route, label, icon, sort_order, enabled FROM ${TABLES.navigationItems}
       WHERE workspace_id = ? ORDER BY sort_order`,
      [workspaceId],
    ),
    queryAll<{ object_key: string; target_object_key: string; relation_type: string; foreign_key: string }>(
      `SELECT object_key, target_object_key, relation_type, foreign_key FROM ${TABLES.relationDefinitions}
       WHERE workspace_id = ? ORDER BY object_key, foreign_key`,
      [workspaceId],
    ),
    queryAll<{ name: string; enabled: number; automation_id: string }>(
      `SELECT name, enabled, automation_id FROM ${TABLES.automationDefinitions}
       WHERE workspace_id = ? ORDER BY name`,
      [workspaceId],
    ),
    queryAll<{ workflow_id: string; name: string; target_object: string }>(
      `SELECT workflow_id, name, target_object FROM ${TABLES.workflowDefinitions}
       WHERE workspace_id = ? ORDER BY name`,
      [workspaceId],
    ),
    queryAll<{ form_key: string; name: string; status: string }>(
      `SELECT form_key, name, status FROM ${TABLES.formDefinitions}
       WHERE workspace_id = ? ORDER BY form_key`,
      [workspaceId],
    ),
  ]);

  return {
    workspaceId,
    packs: packs.map((p) => ({
      packId: p.pack_id,
      packVersion: p.pack_version,
      demoDataStatus: p.demo_data_status,
    })),
    extensions: extensions.map((e) => ({
      name: e.name,
      currentVersion: e.current_version,
      status: e.status,
    })),
    objects: objects.map((o) => ({
      objectKey: o.object_key,
      label: o.label,
      moduleId: o.module_id,
      ownership: o.ownership,
    })),
    fields: fields.map((f) => ({
      objectKey: f.object_key,
      fieldKey: f.field_key,
      label: f.label,
      type: f.type,
      ownership: f.ownership,
      required: f.required === 1,
    })),
    views: views.map((v) => ({
      objectKey: v.object_key,
      viewKey: v.view_key,
      viewType: v.view_type,
      label: v.label,
    })),
    navigation: navItems.map((n) => ({
      route: n.route,
      label: n.label,
      icon: n.icon,
      sortOrder: n.sort_order,
      enabled: n.enabled === 1,
    })),
    relations: relations.map((r) => ({
      objectKey: r.object_key,
      targetObjectKey: r.target_object_key,
      relationType: r.relation_type,
      foreignKey: r.foreign_key,
    })),
    automations: automations.map((a) => ({
      name: a.name,
      enabled: a.enabled === 1,
      automationId: a.automation_id,
    })),
    workflows: workflows.map((w) => ({
      workflowId: w.workflow_id,
      name: w.name,
      targetObject: w.target_object,
    })),
    forms: forms.map((f) => ({
      formKey: f.form_key,
      name: f.name,
      status: f.status,
    })),
  };
}

// ── Diff Helpers ──

function diffSimpleLists<T>(
  baseline: T[],
  target: T[],
  keyFn: (item: T) => string,
  labelFn: (item: T) => string,
  category: ConfigDiffCategory,
): ConfigDiffEntry[] {
  const entries: ConfigDiffEntry[] = [];
  const baselineMap = new Map(baseline.map((item) => [keyFn(item), item]));
  const targetMap = new Map(target.map((item) => [keyFn(item), item]));

  for (const [key, targetItem] of targetMap) {
    const baselineItem = baselineMap.get(key);
    if (!baselineItem) {
      entries.push({
        category,
        changeType: "added",
        identifier: key,
        label: labelFn(targetItem),
        after: targetItem as unknown as Record<string, unknown>,
      });
    } else {
      const beforeJson = JSON.stringify(baselineItem);
      const afterJson = JSON.stringify(targetItem);
      if (beforeJson !== afterJson) {
        entries.push({
          category,
          changeType: "modified",
          identifier: key,
          label: labelFn(targetItem),
          before: baselineItem as unknown as Record<string, unknown>,
          after: targetItem as unknown as Record<string, unknown>,
        });
      }
    }
  }

  for (const [key, baselineItem] of baselineMap) {
    if (!targetMap.has(key)) {
      entries.push({
        category,
        changeType: "removed",
        identifier: key,
        label: labelFn(baselineItem),
        before: baselineItem as unknown as Record<string, unknown>,
      });
    }
  }

  return entries;
}

function diffFields(
  baseline: FieldEntry[],
  target: FieldEntry[],
): ConfigDiffEntry[] {
  return diffSimpleLists(
    baseline,
    target,
    (f) => `${f.objectKey}.${f.fieldKey}`,
    (f) => `${f.objectKey}.${f.fieldKey} (${f.label})`,
    "fields",
  );
}

function diffViews(
  baseline: ViewEntry[],
  target: ViewEntry[],
): ConfigDiffEntry[] {
  return diffSimpleLists(
    baseline,
    target,
    (v) => `${v.objectKey}.${v.viewKey}.${v.viewType}`,
    (v) => `${v.objectKey}/${v.viewKey} (${v.viewType})`,
    "views",
  );
}

function diffRelations(
  baseline: RelationEntry[],
  target: RelationEntry[],
): ConfigDiffEntry[] {
  return diffSimpleLists(
    baseline,
    target,
    (r) => `${r.objectKey}.${r.foreignKey}`,
    (r) => `${r.objectKey}.${r.foreignKey} → ${r.targetObjectKey}`,
    "relations",
  );
}

// ── Compute Diff ──

/**
 * Compare two workspace configuration snapshots and produce a structured diff.
 *
 * The baseline is typically a reference solution workspace; the target is the
 * customer workspace being evaluated. The diff shows what the target has
 * added, removed, or modified relative to the baseline.
 */
export function computeConfigDiff(
  baseline: WorkspaceConfigSnapshot,
  target: WorkspaceConfigSnapshot,
): WorkspaceConfigDiff {
  const entries: ConfigDiffEntry[] = [];

  // Packs
  entries.push(...diffSimpleLists(
    baseline.packs,
    target.packs,
    (p) => p.packId,
    (p) => p.packId,
    "packs",
  ));

  // Extensions
  entries.push(...diffSimpleLists(
    baseline.extensions,
    target.extensions,
    (e) => e.name,
    (e) => e.name,
    "extensions",
  ));

  // Objects
  entries.push(...diffSimpleLists(
    baseline.objects,
    target.objects,
    (o) => o.objectKey,
    (o) => o.label,
    "objects",
  ));

  // Fields
  entries.push(...diffFields(baseline.fields, target.fields));

  // Views
  entries.push(...diffViews(baseline.views, target.views));

  // Navigation
  entries.push(...diffSimpleLists(
    baseline.navigation,
    target.navigation,
    (n) => n.route,
    (n) => n.label,
    "navigation",
  ));

  // Relations
  entries.push(...diffRelations(baseline.relations, target.relations));

  // Automations
  entries.push(...diffSimpleLists(
    baseline.automations,
    target.automations,
    (a) => a.automationId,
    (a) => a.name,
    "automations",
  ));

  // Workflows
  entries.push(...diffSimpleLists(
    baseline.workflows,
    target.workflows,
    (w) => w.workflowId,
    (w) => w.name,
    "workflows",
  ));

  // Forms
  entries.push(...diffSimpleLists(
    baseline.forms,
    target.forms,
    (f) => f.formKey,
    (f) => f.name,
    "forms",
  ));

  // Build summary
  const summary = buildSummary(entries);

  // Compute coverage metrics
  const coverage = computeCoverageMetrics(target);

  return {
    baselineWorkspaceId: baseline.workspaceId,
    targetWorkspaceId: target.workspaceId,
    generatedAt: new Date().toISOString(),
    entries: entries.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.changeType !== b.changeType) return a.changeType.localeCompare(b.changeType);
      return a.identifier.localeCompare(b.identifier);
    }),
    summary,
    coverage,
  };
}

function buildSummary(entries: ConfigDiffEntry[]): ConfigDiffSummary {
  const categories: ConfigDiffCategory[] = [
    "packs", "extensions", "objects", "fields", "views",
    "navigation", "relations", "automations", "workflows", "forms",
  ];

  const byCategory = {} as ConfigDiffSummary["byCategory"];
  for (const cat of categories) {
    byCategory[cat] = { additions: 0, removals: 0, modifications: 0 };
  }

  let additions = 0;
  let removals = 0;
  let modifications = 0;

  for (const entry of entries) {
    const catStats = byCategory[entry.category];
    if (!catStats) continue;
    switch (entry.changeType) {
      case "added":
        additions++;
        catStats.additions++;
        break;
      case "removed":
        removals++;
        catStats.removals++;
        break;
      case "modified":
        modifications++;
        catStats.modifications++;
        break;
    }
  }

  return {
    totalChanges: entries.length,
    additions,
    removals,
    modifications,
    byCategory,
  };
}

// ── Coverage Metrics ──

/**
 * Calculate 90/10 coverage metrics for a workspace.
 *
 * The 90/10 rule states that >=90% of a customer workspace's configuration
 * should come from the standard product (module-owned), and <=10% from
 * workspace extensions. This function counts items by ownership to
 * determine the ratio.
 */
export function computeCoverageMetrics(snapshot: WorkspaceConfigSnapshot): CoverageMetrics {
  // Objects: module_owned = standard, workspace_extension = extension
  const standardObjects = snapshot.objects.filter((o) => o.ownership === "module_owned");
  const extensionObjects = snapshot.objects.filter((o) => o.ownership !== "module_owned");

  // Fields: module_owned = standard, workspace_extension = extension
  const standardFields = snapshot.fields.filter((f) => f.ownership === "module_owned");
  const extensionFields = snapshot.fields.filter((f) => f.ownership !== "module_owned");

  // Views: moduleId present = standard, null = extension/custom
  const standardViews = snapshot.views.filter((v) => {
    const obj = snapshot.objects.find((o) => o.objectKey === v.objectKey);
    return obj?.moduleId != null;
  });
  const extensionViews = snapshot.views.filter((v) => {
    const obj = snapshot.objects.find((o) => o.objectKey === v.objectKey);
    return obj?.moduleId == null;
  });

  // Navigation: moduleId present = standard, null = extension/custom
  // Navigation items don't have moduleId directly in the snapshot, so we
  // infer from pack ownership — packs are always standard, extensions add nav
  const standardNavigation = snapshot.navigation; // All navigation from packs is standard
  const extensionNavigation: NavigationEntry[] = []; // No direct extension nav tracking yet

  // Packs are always standard
  const totalPacks = snapshot.packs.length;

  // Extensions are by definition extension
  const totalExtensions = snapshot.extensions.length;

  // Calculate total standard vs extension items
  const standardCount =
    standardObjects.length + standardFields.length + standardViews.length + standardNavigation.length;
  const extensionCount =
    extensionObjects.length + extensionFields.length + extensionViews.length + extensionNavigation.length;
  const totalCount = standardCount + extensionCount;

  const standardCoveragePct = totalCount > 0
    ? Math.round((standardCount / totalCount) * 1000) / 10
    : 100;
  const extensionCoveragePct = totalCount > 0
    ? Math.round((extensionCount / totalCount) * 1000) / 10
    : 0;

  return {
    standardCoveragePct,
    extensionCoveragePct,
    standardObjectCount: standardObjects.length,
    extensionObjectCount: extensionObjects.length,
    standardFieldCount: standardFields.length,
    extensionFieldCount: extensionFields.length,
    standardViewCount: standardViews.length,
    extensionViewCount: extensionViews.length,
    standardNavigationCount: standardNavigation.length,
    extensionNavigationCount: extensionNavigation.length,
    meets90_10Target: standardCoveragePct >= 90,
  };
}

// ── High-level API: Diff Two Workspaces ──

/**
 * Compare two workspaces by extracting their configuration snapshots
 * and computing the diff.
 *
 * Usage: GET /api/workspaces/[id]/config-diff?baseline=<workspaceId>
 */
export async function diffWorkspaces(
  baselineWorkspaceId: string,
  targetWorkspaceId: string,
): Promise<WorkspaceConfigDiff> {
  const [baseline, target] = await Promise.all([
    extractWorkspaceConfig(baselineWorkspaceId),
    extractWorkspaceConfig(targetWorkspaceId),
  ]);

  return computeConfigDiff(baseline, target);
}

// ── High-level API: Diff Workspace Against Reference Solution ──

/**
 * Compare a reference solution spec against a target workspace.
 *
 * The reference solution defines the expected pack composition. The diff
 * shows what packs are present/missing/different in the target workspace,
 * along with full configuration coverage metrics.
 */
export async function diffWorkspaceAgainstReference(
  referenceSpec: { name: string; packs: Array<{ packId: string; includeDemoData?: boolean }> },
  targetWorkspaceId: string,
): Promise<WorkspaceConfigDiff> {
  const target = await extractWorkspaceConfig(targetWorkspaceId);

  // Build a synthetic baseline snapshot from the reference solution spec
  const baseline: WorkspaceConfigSnapshot = {
    workspaceId: `reference:${referenceSpec.name}`,
    packs: referenceSpec.packs.map((p) => ({
      packId: p.packId,
      packVersion: "", // Version not known at spec level
      demoDataStatus: p.includeDemoData ? "loaded" : "not_requested",
    })),
    extensions: [],
    objects: [],
    fields: [],
    views: [],
    navigation: [],
    relations: [],
    automations: [],
    workflows: [],
    forms: [],
  };

  const diff = computeConfigDiff(baseline, target);

  // For reference comparison, coverage is always computed from the target
  return diff;
}

// ── 90/10 Coverage Validation Report ──

/**
 * Generate a 90/10 coverage validation report across all provisioned workspaces.
 *
 * This aggregates coverage metrics for every active workspace that has pack
 * installations, producing a report that answers:
 *
 *   "Across all customer workspaces, what percentage of configuration is
 *    standard product vs. extension, and how many meet the 90/10 target?"
 *
 * The report supports the v0.9.1 repeatability validation by proving that
 * the same product can be delivered repeatedly with minimal customization.
 */
export async function generateCoverageValidationReport(): Promise<CoverageValidationReport> {
  // Get all workspaces that have at least one pack installation
  const workspaces = await queryAll<{ id: string; name: string; slug: string }>(
    `SELECT DISTINCT w.id, w.name, w.slug
     FROM ${TABLES.workspaces} w
     INNER JOIN ${TABLES.packInstallations} pi ON pi.workspace_id = w.id
     WHERE w.status = 'active'
     ORDER BY w.created_at DESC`,
  );

  const entries: WorkspaceCoverageEntry[] = [];

  for (const ws of workspaces) {
    const snapshot = await extractWorkspaceConfig(ws.id);
    const coverage = computeCoverageMetrics(snapshot);

    entries.push({
      workspaceId: ws.id,
      workspaceName: ws.name,
      workspaceSlug: ws.slug,
      coverage,
      packCount: snapshot.packs.length,
      extensionCount: snapshot.extensions.length,
      meetsTarget: coverage.meets90_10Target,
    });
  }

  const passingWorkspaces = entries.filter((e) => e.meetsTarget);
  const failingWorkspaces = entries.filter((e) => !e.meetsTarget);
  const totalWorkspaces = entries.length;

  const averageStandardCoverage = totalWorkspaces > 0
    ? Math.round(
        (entries.reduce((sum, e) => sum + e.coverage.standardCoveragePct, 0) / totalWorkspaces) * 10,
      ) / 10
    : 100;
  const averageExtensionCoverage = totalWorkspaces > 0
    ? Math.round(
        (entries.reduce((sum, e) => sum + e.coverage.extensionCoveragePct, 0) / totalWorkspaces) * 10,
      ) / 10
    : 0;

  const passRate = totalWorkspaces > 0
    ? Math.round((passingWorkspaces.length / totalWorkspaces) * 1000) / 10
    : 100;

  return {
    generatedAt: new Date().toISOString(),
    totalWorkspaces,
    passingWorkspaces: passingWorkspaces.length,
    failingWorkspaces: failingWorkspaces.length,
    passRate,
    averageStandardCoverage,
    averageExtensionCoverage,
    overallMeetsTarget: passRate >= 90,
    workspaces: entries.sort((a, b) => a.coverage.standardCoveragePct - b.coverage.standardCoveragePct),
  };
}

/**
 * Generate a 90/10 coverage validation report for a single workspace.
 * Useful for per-workspace detailed analysis.
 */
export async function generateWorkspaceCoverageReport(
  workspaceId: string,
): Promise<WorkspaceCoverageEntry> {
  const ws = await queryOne<{ id: string; name: string; slug: string }>(
    `SELECT id, name, slug FROM ${TABLES.workspaces} WHERE id = ?`,
    [workspaceId],
  );

  if (!ws) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const snapshot = await extractWorkspaceConfig(ws.id);
  const coverage = computeCoverageMetrics(snapshot);

  return {
    workspaceId: ws.id,
    workspaceName: ws.name,
    workspaceSlug: ws.slug,
    coverage,
    packCount: snapshot.packs.length,
    extensionCount: snapshot.extensions.length,
    meetsTarget: coverage.meets90_10Target,
  };
}
