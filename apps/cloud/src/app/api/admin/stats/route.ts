import { NextRequest } from "next/server";
import { isPlatformAdmin, queryOne, TABLES } from "@runory/platform-core";
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

    const [
      organizations,
      users,
      workspaces,
      activeSessions,
      installations,
      apiKeys,
      workspaceMemberships,
      organizationMemberships,
    ] = await Promise.all([
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.organizations}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.users}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.workspaces}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.sessions} WHERE status = 'active'`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.installations}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.apiKeys} WHERE status = 'active'`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.workspaceMemberships}`),
      countOf(`SELECT COUNT(*) as count FROM ${TABLES.organizationMemberships}`),
    ]);

    return successResponse(
      {
        organizations,
        users,
        workspaces,
        activeSessions,
        installations,
        apiKeys,
        workspaceMemberships,
        organizationMemberships,
      },
      200,
      requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
