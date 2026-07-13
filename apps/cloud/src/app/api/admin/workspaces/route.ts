import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/admin/workspaces — lists all workspaces with lifecycle info (platform admins only)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const rows = await queryAll<{
      id: string;
      name: string;
      slug: string;
      status: string;
      organization_id: string | null;
      organization_name: string | null;
      created_at: string;
    }>(
      `SELECT w.id, w.name, w.slug, w.status, w.organization_id, o.name as organization_name, w.created_at
       FROM ${TABLES.workspaces} w
       LEFT JOIN ${TABLES.organizations} o ON w.organization_id = o.id
       ORDER BY w.created_at DESC LIMIT 500`
    );

    const workspaces = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      organizationId: r.organization_id,
      organizationName: r.organization_name,
      createdAt: r.created_at,
    }));

    return successResponse(workspaces, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
