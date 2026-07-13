import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/admin/installations — lists all pack installations across workspaces (platform admins only)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const rows = await queryAll<{
      pack_id: string;
      workspace_id: string;
      workspace_name: string | null;
      status: string;
      demo_data_status: string;
      installed_at: string;
      error_message: string | null;
    }>(
      `SELECT pi.pack_id, pi.workspace_id, w.name as workspace_name,
              CASE WHEN pi.install_error_message IS NOT NULL THEN 'error' ELSE 'installed' END as status,
              pi.demo_data_status, pi.installed_at,
              COALESCE(pi.install_error_message, pi.demo_data_error_message) as error_message
       FROM ${TABLES.packInstallations} pi
       LEFT JOIN ${TABLES.workspaces} w ON pi.workspace_id = w.id
       ORDER BY pi.installed_at DESC LIMIT 500`
    );

    const installations = rows.map((r) => ({
      packId: r.pack_id,
      workspaceId: r.workspace_id,
      workspaceName: r.workspace_name,
      status: r.status,
      demoDataStatus: r.demo_data_status,
      installedAt: r.installed_at,
      errorMessage: r.error_message,
    }));

    return successResponse(installations, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
