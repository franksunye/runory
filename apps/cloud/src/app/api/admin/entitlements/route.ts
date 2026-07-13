import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/admin/entitlements — lists all organization entitlements (platform admins only)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const rows = await queryAll<{
      organization_id: string;
      plan: string;
      status: string;
      quotas_json: string;
      expires_at: string | null;
      organization_name: string | null;
      organization_slug: string | null;
    }>(
      `SELECT e.organization_id, e.plan, e.status, e.quotas_json, e.expires_at,
              o.name as organization_name, o.slug as organization_slug
       FROM ${TABLES.organizationEntitlements} e
       LEFT JOIN ${TABLES.organizations} o ON e.organization_id = o.id
       ORDER BY e.created_at DESC LIMIT 200`
    );

    const entitlements = rows.map((r) => ({
      organizationId: r.organization_id,
      plan: r.plan,
      status: r.status,
      quotasJson: r.quotas_json,
      expiresAt: r.expires_at,
      organizationName: r.organization_name,
      organizationSlug: r.organization_slug,
    }));

    return successResponse(entitlements, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
