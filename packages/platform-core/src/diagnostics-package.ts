/**
 * Support Diagnostics Package (v0.9.0)
 *
 * Aggregates all workspace diagnostic data into a single exportable package.
 * This is the "support diagnostic bundle" that an operator or support
 * engineer can generate to get a complete picture of a workspace's state
 * without running multiple separate diagnostic commands.
 *
 * The package includes:
 * - Workspace configuration (objects, fields, views, navigation, packs)
 * - Command contract inventory
 * - Compatibility report (if available)
 * - Rollout status
 * - Outbox failures
 * - Migration state
 * - Installation errors
 * - Comprehensive health report
 */

import { queryAll, queryOne } from "./db";
import { TABLES } from "./contracts";
import { getWorkspaceProvisioningSummary } from "./provisioning";
import { checkWorkspaceHealth } from "./workspace-health";
import { inspectWorkspaceCommandContractRepair } from "./command-contract-repair";
import { getOutboxMessages } from "./outbox";
import type { DiagnosticsPackage } from "@runory/contracts";

// ── Configuration Export ──

async function exportConfiguration(workspaceId: string): Promise<Record<string, unknown>> {
  const summary = await getWorkspaceProvisioningSummary(workspaceId);

  const [objects, fields, views, navItems, relations, automations, workflows, forms] = await Promise.all([
    queryAll<{ id: string; object_key: string; label: string; module_id: string }>(
      `SELECT id, object_key, label, module_id FROM ${TABLES.objectDefinitions} WHERE workspace_id = ? ORDER BY object_key`,
      [workspaceId],
    ),
    queryAll<{ id: string; field_key: string; label: string; object_key: string; type: string; ownership: string }>(
      `SELECT id, field_key, label, object_key, type, ownership FROM ${TABLES.fieldDefinitions} WHERE workspace_id = ? ORDER BY object_key, field_key`,
      [workspaceId],
    ),
    queryAll<{ id: string; object_key: string; view_key: string; view_type: string; label: string }>(
      `SELECT id, object_key, view_key, view_type, label FROM ${TABLES.viewDefinitions} WHERE workspace_id = ? ORDER BY object_key, view_type`,
      [workspaceId],
    ),
    queryAll<{ id: string; route: string; label: string; icon: string; sort_order: number; enabled: number }>(
      `SELECT id, route, label, icon, sort_order, enabled FROM ${TABLES.navigationItems} WHERE workspace_id = ? ORDER BY sort_order`,
      [workspaceId],
    ),
    queryAll<{ id: string; object_key: string; target_object_key: string; relation_type: string; foreign_key: string }>(
      `SELECT id, object_key, target_object_key, relation_type, foreign_key FROM ${TABLES.relationDefinitions} WHERE workspace_id = ?`,
      [workspaceId],
    ),
    queryAll<{ id: string; name: string; enabled: number; automation_id: string }>(
      `SELECT id, name, enabled, automation_id FROM ${TABLES.automationDefinitions} WHERE workspace_id = ?`,
      [workspaceId],
    ),
    queryAll<{ id: string; workflow_id: string; name: string; target_object: string }>(
      `SELECT id, workflow_id, name, target_object FROM ${TABLES.workflowDefinitions} WHERE workspace_id = ?`,
      [workspaceId],
    ),
    queryAll<{ id: string; form_key: string; name: string; status: string }>(
      `SELECT id, form_key, name, status FROM ${TABLES.formDefinitions} WHERE workspace_id = ?`,
      [workspaceId],
    ),
  ]);

  return {
    summary,
    objects: objects.map((o) => ({ id: o.id, objectKey: o.object_key, label: o.label, moduleId: o.module_id })),
    fields: fields.map((f) => ({ id: f.id, fieldKey: f.field_key, label: f.label, objectKey: f.object_key, type: f.type, ownership: f.ownership })),
    views: views.map((v) => ({ id: v.id, objectKey: v.object_key, viewKey: v.view_key, viewType: v.view_type, label: v.label })),
    navigation: navItems.map((n) => ({ id: n.id, route: n.route, label: n.label, icon: n.icon, sortOrder: n.sort_order, enabled: n.enabled === 1 })),
    relations: relations.map((r) => ({ id: r.id, objectKey: r.object_key, targetObjectKey: r.target_object_key, relationType: r.relation_type, foreignKey: r.foreign_key })),
    automations: automations.map((a) => ({ id: a.id, name: a.name, enabled: a.enabled === 1, automationId: a.automation_id })),
    workflows: workflows.map((w) => ({ id: w.id, workflowId: w.workflow_id, name: w.name, targetObject: w.target_object })),
    forms: forms.map((f) => ({ id: f.id, formKey: f.form_key, name: f.name, status: f.status })),
  };
}

// ── Contract Inventory ──

async function exportContractInventory(workspaceId: string): Promise<Record<string, unknown>> {
  const report = await inspectWorkspaceCommandContractRepair(workspaceId);

  return {
    requiresRepair: report.requiresRepair,
    sourceCount: report.sources.length,
    orphanedSourceCount: report.orphanedSources.length,
    sources: report.sources.map((s) => ({
      sourceKind: s.sourceKind,
      sourceId: s.sourceId,
      status: s.status,
      expectedVersion: s.expectedVersion,
      actualVersions: s.actualVersions,
      commandCount: s.expectedCommandKeys.length,
      missingCommands: s.missingCommandKeys.length,
      unexpectedCommands: s.unexpectedCommandKeys.length,
      conflicts: s.conflictingCommands.length,
    })),
    orphanedSources: report.orphanedSources.map((s) => ({
      sourceKind: s.sourceKind,
      sourceId: s.sourceId,
      sourceVersions: s.sourceVersions,
      commandKeys: s.commandKeys,
    })),
  };
}

// ── Rollout Status ──

async function exportRolloutStatus(workspaceId: string): Promise<Record<string, unknown>[]> {
  // Check if the workspace has any active rollouts
  try {
    const rollouts = await queryAll<{
      id: string;
      release_id: string;
      status: string;
      target_count: number;
      success_count: number;
      failure_count: number;
      created_at: string;
    }>(
      `SELECT r.id, r.release_id, r.status, r.target_count, r.success_count, r.failure_count, r.created_at
       FROM ${TABLES.workspaces} w
       LEFT JOIN rr_release_rollouts r ON 1=1
       WHERE w.id = ? AND r.status IN ('active', 'paused')
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [workspaceId],
    );
    return rollouts.map((r) => ({
      rolloutId: r.id,
      releaseId: r.release_id,
      status: r.status,
      targetCount: r.target_count,
      successCount: r.success_count,
      failureCount: r.failure_count,
      createdAt: r.created_at,
    }));
  } catch {
    // Rollout tables might not exist in all deployments
    return [];
  }
}

// ── Outbox Failures ──

async function exportOutboxFailures(workspaceId: string): Promise<Record<string, unknown>[]> {
  const messages = await getOutboxMessages(workspaceId, { status: "failed", limit: 100 });
  return messages.map((m) => ({
    id: m.id,
    messageType: m.messageType,
    status: m.status,
    attempts: m.attempts,
    lastError: m.lastError,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }));
}

// ── Migration State ──

async function exportMigrationState(workspaceId: string): Promise<Record<string, unknown>> {
  const installations = await queryAll<{
    module_id: string;
    pack_id: string;
    module_version: string;
    installed_at: string;
  }>(
    `SELECT module_id, pack_id, module_version, installed_at
     FROM ${TABLES.installations}
     WHERE workspace_id = ?
     ORDER BY installed_at ASC`,
    [workspaceId],
  );

  const packInstalls = await queryAll<{
    pack_id: string;
    pack_version: string;
    demo_data_status: string;
    installed_at: string;
  }>(
    `SELECT pack_id, pack_version, demo_data_status, installed_at
     FROM ${TABLES.packInstallations}
     WHERE workspace_id = ?
     ORDER BY installed_at ASC`,
    [workspaceId],
  );

  return {
    modules: installations.map((i) => ({
      moduleId: i.module_id,
      packId: i.pack_id,
      version: i.module_version,
      installedAt: i.installed_at,
    })),
    packs: packInstalls.map((p) => ({
      packId: p.pack_id,
      version: p.pack_version,
      demoDataStatus: p.demo_data_status,
      installedAt: p.installed_at,
    })),
  };
}

// ── Installation Errors ──

async function exportInstallationErrors(workspaceId: string): Promise<Record<string, unknown>[]> {
  const errors = await queryAll<{
    pack_id: string;
    demo_data_status: string;
    demo_data_error_message: string | null;
  }>(
    `SELECT pack_id, demo_data_status, demo_data_error_message
     FROM ${TABLES.packInstallations}
     WHERE workspace_id = ? AND demo_data_status = 'error'`,
    [workspaceId],
  );

  return errors.map((e) => ({
    packId: e.pack_id,
    status: e.demo_data_status,
    error: e.demo_data_error_message,
  }));
}

// ── Generate Diagnostics Package ──

/**
 * Generate a comprehensive diagnostics package for a workspace.
 *
 * This aggregates all diagnostic data into a single structured export
 * that can be downloaded by an operator or sent to support. The package
 * is safe to share — it contains configuration metadata and status, but
 * no business data records or credentials.
 */
export async function generateDiagnosticsPackage(workspaceId: string): Promise<DiagnosticsPackage> {
  const workspace = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM ${TABLES.workspaces} WHERE id = ?`,
    [workspaceId],
  );

  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const [configuration, contractInventory, rolloutStatus, outboxFailures, migrationState, installationErrors, healthReport] = await Promise.all([
    exportConfiguration(workspaceId),
    exportContractInventory(workspaceId),
    exportRolloutStatus(workspaceId),
    exportOutboxFailures(workspaceId),
    exportMigrationState(workspaceId),
    exportInstallationErrors(workspaceId),
    checkWorkspaceHealth(workspaceId),
  ]);

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    generatedAt: new Date().toISOString(),
    configuration,
    contractInventory,
    rolloutStatus,
    outboxFailures,
    migrationState,
    installationErrors,
    healthReport,
  };
}
