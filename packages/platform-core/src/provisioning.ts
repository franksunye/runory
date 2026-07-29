/**
 * Workspace Provisioning Orchestrator (v0.9.0)
 *
 * Combines workspace creation, pack installation, extension configuration,
 * and demo data loading into a single repeatable operation. This is the
 * foundation of v0.9.0 repeatable delivery — a reference solution can be
 * applied to any workspace through a single declarative specification.
 *
 * Design principles:
 * - Resilient: a pack installation failure does not abort the entire run;
 *   remaining packs are still attempted and the result reports "partial".
 * - Idempotent: re-running with the same spec on an existing workspace
 *   will not fail (installPack and applyExtension are already idempotent).
 * - Observable: every step records duration, status, and error details.
 */

import { queryAll, queryOne } from "./db";
import { TABLES } from "./contracts";
import { createWorkspace, getWorkspace } from "./metadata";
import { installPack } from "./installer";
import { applyExtension } from "./extension";
import { inspectWorkspaceCommandContractRepair, repairWorkspaceCommandContracts } from "./command-contract-repair";
import type { ActorIdentity } from "./tenancy";
import type {
  ProvisioningSpec,
  ProvisioningResult,
  ProvisioningStepResult,
  ReferenceSolution,
} from "@runory/contracts";

// ── Helpers ──

function elapsed(start: number): number {
  return Date.now() - start;
}

function makeStep(step: string, start: number, status: ProvisioningStepResult["status"], error?: string, details?: Record<string, unknown>): ProvisioningStepResult {
  return { step, status, durationMs: elapsed(start), error, details };
}

function aggregateStatus(steps: ProvisioningStepResult[]): ProvisioningResult["status"] {
  if (steps.some((s) => s.status === "failed")) {
    return steps.every((s) => s.status === "failed") ? "failed" : "partial";
  }
  return "success";
}

// ── Provision Workspace ──

/**
 * Provision a workspace from a declarative specification.
 *
 * If `existingWorkspaceId` is provided, the orchestrator applies packs and
 * extensions to that workspace instead of creating a new one. This supports
 * both "new customer" and "apply reference solution to existing workspace"
 * workflows.
 *
 * The orchestrator does NOT seed the dev catalog — that is a platform-level
 * prerequisite (call `seedDevCatalog` before provisioning on a fresh
 * database). This keeps the orchestrator focused on workspace-level scope.
 */
export async function provisionWorkspace(
  spec: ProvisioningSpec,
  actor: ActorIdentity,
  options?: { existingWorkspaceId?: string },
): Promise<ProvisioningResult> {
  const runStart = Date.now();
  const steps: ProvisioningStepResult[] = [];
  const packsInstalled: string[] = [];
  const extensionsApplied: string[] = [];
  let demoRecordsCreated = 0;

  let workspaceId: string;
  let workspaceSlug: string;

  // ── Step 1: Create or resolve workspace ──
  const wsStart = Date.now();
  if (options?.existingWorkspaceId) {
    const existing = await getWorkspace(options.existingWorkspaceId);
    if (!existing) {
      steps.push(makeStep("resolve_workspace", wsStart, "failed", `Workspace not found: ${options.existingWorkspaceId}`));
      return {
        workspaceId: options.existingWorkspaceId,
        workspaceSlug: "",
        status: "failed",
        steps,
        totalDurationMs: elapsed(runStart),
        packsInstalled,
        extensionsApplied,
        demoRecordsCreated,
      };
    }
    workspaceId = existing.id;
    workspaceSlug = existing.slug;
    steps.push(makeStep("resolve_workspace", wsStart, "success", undefined, { workspaceId, workspaceSlug }));
  } else {
    try {
      const ws = await createWorkspace(spec.workspaceName, spec.templateId, actor);
      workspaceId = ws.id;
      workspaceSlug = ws.slug;
      steps.push(makeStep("create_workspace", wsStart, "success", undefined, { workspaceId, workspaceSlug }));
    } catch (e) {
      steps.push(makeStep("create_workspace", wsStart, "failed", e instanceof Error ? e.message : String(e)));
      return {
        workspaceId: "",
        workspaceSlug: "",
        status: "failed",
        steps,
        totalDurationMs: elapsed(runStart),
        packsInstalled,
        extensionsApplied,
        demoRecordsCreated,
      };
    }
  }

  // ── Step 2: Install packs ──
  for (const packSpec of spec.packs) {
    const packStart = Date.now();
    try {
      const result = await installPack(workspaceId, packSpec.packId, {
        includeDemoData: packSpec.includeDemoData ?? false,
      });
      packsInstalled.push(packSpec.packId);
      if (result.demoRecordsCreated > 0) {
        demoRecordsCreated += result.demoRecordsCreated;
      }
      steps.push(makeStep(`install_pack:${packSpec.packId}`, packStart, "success", undefined, {
        modulesInstalled: result.modulesInstalled,
        objectsCreated: result.objectsCreated,
        ddlExecuted: result.ddlExecuted,
        demoRecordsCreated: result.demoRecordsCreated,
      }));
    } catch (e) {
      steps.push(makeStep(`install_pack:${packSpec.packId}`, packStart, "failed", e instanceof Error ? e.message : String(e)));
      // Continue with remaining packs — partial success is reported
    }
  }

  // ── Step 3: Apply extensions ──
  for (const extSpec of spec.extensions ?? []) {
    const extStart = Date.now();
    try {
      const version = await applyExtension(workspaceId, extSpec.plan, actor.externalId);
      extensionsApplied.push(extSpec.name);
      steps.push(makeStep(`apply_extension:${extSpec.name}`, extStart, "success", undefined, {
        extensionId: version.extensionId,
        version: version.version,
      }));
    } catch (e) {
      steps.push(makeStep(`apply_extension:${extSpec.name}`, extStart, "failed", e instanceof Error ? e.message : String(e)));
      // Continue with remaining extensions
    }
  }

  // ── Step 4: Sync command contracts ──
  const syncStart = Date.now();
  try {
    const report = await inspectWorkspaceCommandContractRepair(workspaceId);
    const needsRepair = report.sources.some((s) => s.status === "missing" || s.status === "outdated" || s.status === "conflict");
    if (needsRepair) {
      await repairWorkspaceCommandContracts(workspaceId);
      steps.push(makeStep("sync_command_contracts", syncStart, "success", undefined, { repaired: true, sourcesChecked: report.sources.length }));
    } else {
      steps.push(makeStep("sync_command_contracts", syncStart, "skipped", undefined, { sourcesChecked: report.sources.length, allHealthy: true }));
    }
  } catch (e) {
    steps.push(makeStep("sync_command_contracts", syncStart, "failed", e instanceof Error ? e.message : String(e)));
  }

  return {
    workspaceId,
    workspaceSlug,
    status: aggregateStatus(steps),
    steps,
    totalDurationMs: elapsed(runStart),
    packsInstalled,
    extensionsApplied,
    demoRecordsCreated,
  };
}

// ── Apply Reference Solution ──

/**
 * Apply a versioned reference solution to a new or existing workspace.
 *
 * A reference solution is a declarative specification of packs, extensions,
 * and demo data that represents a complete product configuration (e.g.,
 * the canonical "reactive-service" solution for Reactive Repair / Callout).
 *
 * This is the primary entry point for repeatable delivery: the same
 * reference solution file can be applied to any workspace, proving that
 * the product can be delivered repeatedly without Core forks.
 */
export async function applyReferenceSolution(
  solution: ReferenceSolution,
  actor: ActorIdentity,
  options?: { existingWorkspaceId?: string },
): Promise<ProvisioningResult> {
  return provisionWorkspace(solution.spec, actor, options);
}

// ── List Provisioned Workspaces ──

/**
 * List workspaces that have been provisioned with pack installations.
 * Returns workspace metadata along with installed pack count and demo data
 * status, supporting the repeatability metrics dashboard.
 */
export async function listProvisionedWorkspaces(): Promise<Array<{
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  packsInstalled: number;
  demoDataLoaded: number;
  createdAt: string;
}>> {
  const rows = await queryAll<{
    id: string;
    name: string;
    slug: string;
    created_at: string;
    pack_count: number;
    demo_loaded: number;
  }>(
    `SELECT
       w.id, w.name, w.slug, w.created_at,
       COUNT(DISTINCT pi.pack_id) AS pack_count,
       SUM(CASE WHEN pi.demo_data_status = 'loaded' THEN 1 ELSE 0 END) AS demo_loaded
     FROM ${TABLES.workspaces} w
     LEFT JOIN ${TABLES.packInstallations} pi ON pi.workspace_id = w.id
     WHERE w.status = 'active'
     GROUP BY w.id, w.name, w.slug, w.created_at
     ORDER BY w.created_at DESC`,
  );
  return rows.map((r) => ({
    workspaceId: r.id,
    workspaceName: r.name,
    workspaceSlug: r.slug,
    packsInstalled: r.pack_count,
    demoDataLoaded: r.demo_loaded,
    createdAt: r.created_at,
  }));
}

// ── Get Provisioning Summary ──

/**
 * Get a summary of what is installed in a workspace, supporting the
 * 90/10 validation and configuration Diff in v0.9.1.
 */
export async function getWorkspaceProvisioningSummary(workspaceId: string): Promise<{
  workspaceId: string;
  packs: Array<{ packId: string; packVersion: string; demoDataStatus: string; installedAt: string }>;
  extensions: Array<{ name: string; currentVersion: number; status: string; createdAt: string }>;
  objects: number;
  fields: number;
  views: number;
  navigationItems: number;
}> {
  const [packs, extensions, objectCount, fieldCount, viewCount, navCount] = await Promise.all([
    queryAll<{ pack_id: string; pack_version: string; demo_data_status: string; installed_at: string }>(
      `SELECT pack_id, pack_version, demo_data_status, installed_at
       FROM ${TABLES.packInstallations}
       WHERE workspace_id = ?
       ORDER BY installed_at ASC`,
      [workspaceId],
    ),
    queryAll<{ name: string; current_version: number; status: string; created_at: string }>(
      `SELECT name, current_version, status, created_at
       FROM ${TABLES.extensionDefinitions}
       WHERE workspace_id = ?
       ORDER BY created_at ASC`,
      [workspaceId],
    ),
    queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM ${TABLES.objectDefinitions} WHERE workspace_id = ?`, [workspaceId]),
    queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM ${TABLES.fieldDefinitions} WHERE workspace_id = ?`, [workspaceId]),
    queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM ${TABLES.viewDefinitions} WHERE workspace_id = ?`, [workspaceId]),
    queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM ${TABLES.navigationItems} WHERE workspace_id = ?`, [workspaceId]),
  ]);

  return {
    workspaceId,
    packs: packs.map((p) => ({
      packId: p.pack_id,
      packVersion: p.pack_version,
      demoDataStatus: p.demo_data_status,
      installedAt: p.installed_at,
    })),
    extensions: extensions.map((e) => ({
      name: e.name,
      currentVersion: e.current_version,
      status: e.status,
      createdAt: e.created_at,
    })),
    objects: objectCount?.count ?? 0,
    fields: fieldCount?.count ?? 0,
    views: viewCount?.count ?? 0,
    navigationItems: navCount?.count ?? 0,
  };
}
