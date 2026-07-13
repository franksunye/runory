import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/admin/rollouts — lists all catalog release rollouts (platform admins only)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const rows = await queryAll<{
      id: string;
      catalog_release_id: string;
      target_type: string;
      target_config_json: string;
      status: string;
      success_threshold: number;
      failure_threshold: number;
      started_by: string | null;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
    }>(`SELECT * FROM ${TABLES.releaseRollouts} ORDER BY created_at DESC LIMIT 200`);

    const rollouts = rows.map((r) => ({
      id: r.id,
      catalogReleaseId: r.catalog_release_id,
      targetType: r.target_type,
      targetConfigJson: r.target_config_json,
      status: r.status,
      successThreshold: r.success_threshold,
      failureThreshold: r.failure_threshold,
      startedBy: r.started_by,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
    }));

    return successResponse(rollouts, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
