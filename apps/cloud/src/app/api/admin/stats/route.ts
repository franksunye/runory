import { NextRequest } from "next/server";
import { isPlatformAdmin, queryOne, queryAll, TABLES, getTableNamespacePrefixes } from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import { successResponse, handleError, forbidden, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/admin/stats — returns platform-wide statistics (platform admins only)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal || !isPlatformAdmin(principal.email)) {
      return forbidden("Platform admin access required", requestId);
    }

    const countOf = async (sql: string): Promise<number> => {
      const row = await queryOne<{ count: number }>(sql);
      return row?.count ?? 0;
    };

    const migrationsTable = `${getTableNamespacePrefixes().system}schema_migrations`;

    const [
      organizations,
      users,
      workspaces,
      activeWorkspaces,
      activeSessions,
      installations,
      apiKeys,
      workspaceMemberships,
      organizationMemberships,
      packDistributionRows,
      demoDataRow,
      latestMigrationRow,
      auditEvents24h,
    ] = await Promise.all([
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.organizations}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.users}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.workspaces}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.workspaces} WHERE status = 'active'`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.sessions} WHERE status = 'active'`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.installations}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.apiKeys} WHERE status = 'active'`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.workspaceMemberships}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.organizationMemberships}`),
      queryAll<{ pack_id: string; count: number }>(
        `SELECT pack_id, COUNT(*) as count FROM ${TABLES.packInstallations} GROUP BY pack_id ORDER BY count DESC`
      ),
      queryOne<{ demo_loaded: number; demo_not_loaded: number }>(
        `SELECT
          SUM(CASE WHEN demo_data_status = 'loaded' THEN 1 ELSE 0 END) as demo_loaded,
          SUM(CASE WHEN demo_data_status != 'loaded' THEN 1 ELSE 0 END) as demo_not_loaded
        FROM ${TABLES.packInstallations}`
      ),
      queryOne<{ filename: string }>(
        `SELECT version || '_' || name || '.sql' as filename FROM ${migrationsTable} ORDER BY applied_at DESC LIMIT 1`
      ),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.auditLogs} WHERE created_at > datetime('now', '-1 day')`),
    ]);

    return successResponse(
      {
        organizations,
        users,
        workspaces,
        activeWorkspaces,
        activeSessions,
        installations,
        apiKeys,
        workspaceMemberships,
        organizationMemberships,
        packDistribution: packDistributionRows.map((r) => ({ packId: r.pack_id, count: r.count })),
        demoDataLoaded: demoDataRow?.demo_loaded ?? 0,
        demoDataNotLoaded: demoDataRow?.demo_not_loaded ?? 0,
        latestMigration: latestMigrationRow?.filename ?? null,
        auditEvents24h,
      },
      200,
      requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
