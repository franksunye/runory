import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/admin/api-keys — lists all API keys across all workspaces (platform admins only)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const rows = await queryAll<{
      id: string;
      workspace_id: string;
      workspace_name: string | null;
      user_id: string;
      user_email: string | null;
      name: string;
      scopes_json: string;
      status: "active" | "revoked" | "expired";
      last_used_at: string | null;
      expires_at: string | null;
      created_at: string;
      revoked_at: string | null;
    }>(
      `SELECT k.id, k.workspace_id, w.name as workspace_name, k.user_id, u.email as user_email, k.name, k.scopes_json, k.status, k.last_used_at, k.expires_at, k.created_at, k.revoked_at
       FROM ${TABLES.apiKeys} k
       LEFT JOIN ${TABLES.workspaces} w ON k.workspace_id = w.id
       LEFT JOIN ${TABLES.users} u ON k.user_id = u.id
       ORDER BY k.created_at DESC LIMIT 500`
    );

    const apiKeys = rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      workspaceName: r.workspace_name,
      userId: r.user_id,
      userEmail: r.user_email,
      name: r.name,
      scopesJson: r.scopes_json,
      status: r.status,
      lastUsedAt: r.last_used_at,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
    }));

    return successResponse(apiKeys, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
