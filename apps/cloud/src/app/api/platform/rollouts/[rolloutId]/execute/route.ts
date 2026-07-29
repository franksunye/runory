import { NextRequest } from "next/server";
import { executeRollout, getUpgradeExecutionStatus } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/platform/rollouts/[rolloutId]/execute — execute a rollout
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rolloutId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { principal } = await requirePlatformAdmin(request);

    const { rolloutId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      maxTargets?: number;
    };
    const results = await executeRollout(rolloutId, {
      ...(typeof body.maxTargets === "number"
        ? { maxTargets: body.maxTargets }
        : {}),
    });

    return successResponse(results, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// GET /api/platform/rollouts/[rolloutId]/execute — get upgrade execution status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rolloutId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const { rolloutId } = await params;
    const status = await getUpgradeExecutionStatus(rolloutId);

    return successResponse(status, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
