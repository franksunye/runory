/**
 * Workspace Health Check (v0.9.0)
 *
 * Extends the existing command-contract repair diagnostics with additional
 * health categories: schema drift, view integrity, entitlement, extension
 * consistency, and installation status. This provides a comprehensive
 * workspace health report that supports the support diagnostics package
 * and the repeatability metrics dashboard.
 */

import { queryAll, queryOne } from "./db";
import { TABLES, businessTable } from "./contracts";
import { inspectWorkspaceCommandContractRepair } from "./command-contract-repair";
import { getOutboxMessages } from "./outbox";
import type {
  WorkspaceHealthReport,
  HealthCheckItem,
  HealthCheckCategory,
} from "@runory/contracts";

// ── Individual Health Checks ──

async function checkCommandContracts(workspaceId: string): Promise<HealthCheckItem[]> {
  const items: HealthCheckItem[] = [];
  try {
    const report = await inspectWorkspaceCommandContractRepair(workspaceId);
    const problems = report.sources.filter((s) => s.status !== "in_sync");
    const conflicts = report.sources.filter((s) => s.status === "conflict");
    const missing = report.sources.filter((s) => s.status === "missing");
    const outdated = report.sources.filter((s) => s.status === "outdated");

    if (problems.length === 0) {
      items.push({
        category: "command_contracts",
        status: "healthy",
        message: `${report.sources.length} command contract sources in sync`,
      });
    } else {
      const parts: string[] = [];
      if (missing.length > 0) parts.push(`${missing.length} missing`);
      if (outdated.length > 0) parts.push(`${outdated.length} outdated`);
      if (conflicts.length > 0) parts.push(`${conflicts.length} conflicting`);
      items.push({
        category: "command_contracts",
        status: conflicts.length > 0 ? "error" : "warning",
        message: `Command contract issues: ${parts.join(", ")}`,
        detail: {
          missing: missing.map((s) => s.sourceId),
          outdated: outdated.map((s) => s.sourceId),
          conflicts: conflicts.map((s) => s.sourceId),
        },
      });
    }
  } catch (e) {
    items.push({
      category: "command_contracts",
      status: "error",
      message: `Failed to check command contracts: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return items;
}

async function checkSchemaDrift(workspaceId: string): Promise<HealthCheckItem[]> {
  const items: HealthCheckItem[] = [];
  try {
    // Check that every object_definition has its business table
    const objects = await queryAll<{ object_key: string; label: string }>(
      `SELECT object_key, label FROM ${TABLES.objectDefinitions} WHERE workspace_id = ?`,
      [workspaceId],
    );

    const missingTables: string[] = [];
    for (const obj of objects) {
      try {
        const tableName = businessTable(obj.object_key);
        const result = await queryOne<{ count: number }>(
          `SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = ?`,
          [tableName],
        );
        if (!result || result.count === 0) {
          missingTables.push(obj.object_key);
        }
      } catch {
        missingTables.push(obj.object_key);
      }
    }

    if (missingTables.length === 0) {
      items.push({
        category: "schema_drift",
        status: "healthy",
        message: `${objects.length} object definitions have matching business tables`,
      });
    } else {
      items.push({
        category: "schema_drift",
        status: "error",
        message: `${missingTables.length} object definitions missing business tables`,
        detail: { missingTables },
      });
    }
  } catch (e) {
    items.push({
      category: "schema_drift",
      status: "error",
      message: `Failed to check schema drift: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return items;
}

async function checkViewIntegrity(workspaceId: string): Promise<HealthCheckItem[]> {
  const items: HealthCheckItem[] = [];
  try {
    // Check that views reference valid objects
    const views = await queryAll<{ id: string; object_key: string; view_type: string }>(
      `SELECT id, object_key, view_type FROM ${TABLES.viewDefinitions} WHERE workspace_id = ?`,
      [workspaceId],
    );

    const objectKeys = new Set(
      (await queryAll<{ object_key: string }>(
        `SELECT object_key FROM ${TABLES.objectDefinitions} WHERE workspace_id = ?`,
        [workspaceId],
      )).map((o) => o.object_key),
    );

    const orphanedViews = views.filter((v) => !objectKeys.has(v.object_key));

    if (orphanedViews.length === 0) {
      items.push({
        category: "view_integrity",
        status: "healthy",
        message: `${views.length} views reference valid objects`,
      });
    } else {
      items.push({
        category: "view_integrity",
        status: "warning",
        message: `${orphanedViews.length} views reference non-existent objects`,
        detail: { orphanedViews: orphanedViews.map((v) => ({ id: v.id, objectKey: v.object_key })) },
      });
    }
  } catch (e) {
    items.push({
      category: "view_integrity",
      status: "error",
      message: `Failed to check view integrity: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return items;
}

async function checkEntitlement(workspaceId: string): Promise<HealthCheckItem[]> {
  const items: HealthCheckItem[] = [];
  try {
    // Check workspace has an active entitlement
    const tenant = await queryOne<{ organization_id: string }>(
      `SELECT organization_id FROM ${TABLES.workspaceTenants} WHERE workspace_id = ?`,
      [workspaceId],
    );

    if (!tenant) {
      items.push({
        category: "entitlement",
        status: "error",
        message: "Workspace has no tenant organization",
      });
      return items;
    }

    const entitlement = await queryOne<{ plan: string; status: string }>(
      `SELECT plan, status FROM ${TABLES.organizationEntitlements}
       WHERE organization_id = ? AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [tenant.organization_id],
    );

    if (!entitlement) {
      items.push({
        category: "entitlement",
        status: "warning",
        message: "Organization has no active entitlement",
      });
    } else {
      items.push({
        category: "entitlement",
        status: "healthy",
        message: `Active entitlement: ${entitlement.plan}`,
        detail: { plan: entitlement.plan, status: entitlement.status },
      });
    }
  } catch (e) {
    items.push({
      category: "entitlement",
      status: "error",
      message: `Failed to check entitlement: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return items;
}

async function checkExtensionConsistency(workspaceId: string): Promise<HealthCheckItem[]> {
  const items: HealthCheckItem[] = [];
  try {
    const extensions = await queryAll<{ id: string; name: string; status: string; current_version: number }>(
      `SELECT id, name, status, current_version FROM ${TABLES.extensionDefinitions}
       WHERE workspace_id = ?`,
      [workspaceId],
    );

    const inactive = extensions.filter((e) => e.status !== "active");

    // Check that extension fields still have matching object definitions
    const extFields = await queryAll<{ field_key: string; object_key: string }>(
      `SELECT DISTINCT field_key, object_key
       FROM ${TABLES.fieldDefinitions}
       WHERE workspace_id = ? AND ownership = 'workspace_extension'`,
      [workspaceId],
    );

    if (extensions.length === 0) {
      items.push({
        category: "extension_consistency",
        status: "healthy",
        message: "No workspace extensions installed",
      });
    } else if (inactive.length === 0) {
      items.push({
        category: "extension_consistency",
        status: "healthy",
        message: `${extensions.length} extensions active, ${extFields.length} extension fields`,
        detail: { extensionCount: extensions.length, fieldCount: extFields.length },
      });
    } else {
      items.push({
        category: "extension_consistency",
        status: "warning",
        message: `${inactive.length} inactive extensions out of ${extensions.length}`,
        detail: { inactive: inactive.map((e) => ({ name: e.name, status: e.status })) },
      });
    }
  } catch (e) {
    items.push({
      category: "extension_consistency",
      status: "error",
      message: `Failed to check extension consistency: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return items;
}

async function checkInstallation(workspaceId: string): Promise<HealthCheckItem[]> {
  const items: HealthCheckItem[] = [];
  try {
    // Check for packs with installation errors
    const packs = await queryAll<{
      pack_id: string;
      pack_version: string;
      demo_data_status: string;
      demo_data_error_message: string | null;
    }>(
      `SELECT pack_id, pack_version, demo_data_status, demo_data_error_message
       FROM ${TABLES.packInstallations}
       WHERE workspace_id = ?`,
      [workspaceId],
    );

    const errorPacks = packs.filter((p) => p.demo_data_status === "error");

    // Check for failed outbox messages
    const failedMessages = await getOutboxMessages(workspaceId, { status: "failed", limit: 50 });

    if (errorPacks.length === 0 && failedMessages.length === 0) {
      items.push({
        category: "installation",
        status: "healthy",
        message: `${packs.length} packs installed, 0 failed outbox messages`,
        detail: { packCount: packs.length },
      });
    } else {
      const parts: string[] = [];
      if (errorPacks.length > 0) parts.push(`${errorPacks.length} packs with demo data errors`);
      if (failedMessages.length > 0) parts.push(`${failedMessages.length} failed outbox messages`);
      items.push({
        category: "installation",
        status: "warning",
        message: `Installation issues: ${parts.join(", ")}`,
        detail: {
          errorPacks: errorPacks.map((p) => ({ packId: p.pack_id, error: p.demo_data_error_message })),
          failedOutboxCount: failedMessages.length,
        },
      });
    }
  } catch (e) {
    items.push({
      category: "installation",
      status: "error",
      message: `Failed to check installation status: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return items;
}

// ── Comprehensive Health Check ──

/**
 * Run a comprehensive health check on a workspace, covering:
 * - Command contract synchronization
 * - Schema drift (object definitions vs business tables)
 * - View integrity (views referencing valid objects)
 * - Entitlement status
 * - Extension consistency
 * - Installation and outbox errors
 *
 * Returns a structured report that can be included in the support
 * diagnostics package or displayed to an operator.
 */
export async function checkWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealthReport> {
  const checks: Array<Promise<HealthCheckItem[]>> = [
    checkCommandContracts(workspaceId),
    checkSchemaDrift(workspaceId),
    checkViewIntegrity(workspaceId),
    checkEntitlement(workspaceId),
    checkExtensionConsistency(workspaceId),
    checkInstallation(workspaceId),
  ];

  const results = await Promise.all(checks);
  const items = results.flat();

  const hasErrors = items.some((i) => i.status === "error");
  const hasWarnings = items.some((i) => i.status === "warning");
  const overallStatus: WorkspaceHealthReport["overallStatus"] = hasErrors
    ? "error"
    : hasWarnings
      ? "warning"
      : "healthy";

  return {
    workspaceId,
    overallStatus,
    items,
    checkedAt: new Date().toISOString(),
  };
}

// ── Quick Health Status ──

/**
 * Return a lightweight health status without full detail items.
 * Useful for dashboards and list views.
 */
export async function getWorkspaceHealthStatus(workspaceId: string): Promise<{
  workspaceId: string;
  overallStatus: "healthy" | "warning" | "error";
  categoryStatuses: Record<HealthCheckCategory, "healthy" | "warning" | "error" | "unknown">;
}> {
  const report = await checkWorkspaceHealth(workspaceId);
  const categoryStatuses = {} as Record<HealthCheckCategory, "healthy" | "warning" | "error" | "unknown">;

  const categories: HealthCheckCategory[] = [
    "command_contracts",
    "schema_drift",
    "view_integrity",
    "entitlement",
    "extension_consistency",
    "installation",
  ];

  for (const cat of categories) {
    const catItems = report.items.filter((i) => i.category === cat);
    if (catItems.length === 0) {
      categoryStatuses[cat] = "unknown";
    } else if (catItems.some((i) => i.status === "error")) {
      categoryStatuses[cat] = "error";
    } else if (catItems.some((i) => i.status === "warning")) {
      categoryStatuses[cat] = "warning";
    } else {
      categoryStatuses[cat] = "healthy";
    }
  }

  return {
    workspaceId,
    overallStatus: report.overallStatus,
    categoryStatuses,
  };
}
