import { NextRequest } from "next/server";
import {
  getRelease,
  createReleaseRollout,
  queryAll,
  TABLES,
  type ReleaseRollout,
  type RolloutTargetType,
} from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

interface ReleaseRolloutRow {
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
}

function mapRolloutRow(row: ReleaseRolloutRow): ReleaseRollout {
  return {
    id: row.id,
    catalogReleaseId: row.catalog_release_id,
    targetType: row.target_type as ReleaseRollout["targetType"],
    targetConfigJson: row.target_config_json,
    status: row.status as ReleaseRollout["status"],
    successThreshold: row.success_threshold,
    failureThreshold: row.failure_threshold,
    startedBy: row.started_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

// GET /api/platform/releases/[releaseId]/rollout — get rollouts for a release
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { releaseId } = await params;
    // Verify the release exists (throws NotFoundError if missing)
    await getRelease(releaseId);

    const rows = await queryAll<ReleaseRolloutRow>(
      `SELECT * FROM ${TABLES.releaseRollouts} WHERE catalog_release_id = ? ORDER BY created_at DESC`,
      [releaseId]
    );
    const rollouts = rows.map(mapRolloutRow);

    return successResponse(rollouts, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// POST /api/platform/releases/[releaseId]/rollout — create rollout
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { releaseId } = await params;
    const body = (await request.json()) as {
      targetType: RolloutTargetType;
      targetConfig: { workspaceIds?: string[]; percentage?: number };
      successThreshold?: number;
      failureThreshold?: number;
    };

    const rollout = await createReleaseRollout(principal, {
      catalogReleaseId: releaseId,
      targetType: body.targetType,
      targetConfig: body.targetConfig,
      successThreshold: body.successThreshold,
      failureThreshold: body.failureThreshold,
    });

    return successResponse(rollout, 201, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
