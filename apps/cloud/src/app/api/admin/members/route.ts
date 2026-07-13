import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/admin/members — lists all organization members across all orgs (platform admins only)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const rows = await queryAll<{
      id: string;
      email: string | null;
      display_name: string;
      external_id: string;
      org_role: "owner" | "admin" | "member";
      org_name: string | null;
      joined_at: string;
    }>(
      `SELECT u.id, u.email, u.display_name, u.external_id, om.role as org_role, o.name as org_name, om.created_at as joined_at
       FROM ${TABLES.users} u
       JOIN ${TABLES.organizationMemberships} om ON u.id = om.user_id
       LEFT JOIN ${TABLES.organizations} o ON om.organization_id = o.id
       ORDER BY om.created_at DESC LIMIT 500`
    );

    const members = rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      externalId: r.external_id,
      orgRole: r.org_role,
      orgName: r.org_name,
      joinedAt: r.joined_at,
    }));

    return successResponse(members, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
