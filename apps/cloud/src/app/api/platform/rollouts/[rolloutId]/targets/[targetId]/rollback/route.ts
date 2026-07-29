import { NextRequest } from "next/server";
import { rollbackUpgrade, canRollback } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
  ConflictError,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/platform/rollouts/[rolloutId]/targets/[targetId]/rollback — rollback a target
export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ rolloutId: string; targetId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { principal } = await requirePlatformAdmin(request);

    const { rolloutId, targetId } = await params;

    const eligibility = await canRollback(targetId);
    if (!eligibility.eligible) {
      throw new ConflictError(
        eligibility.reason ?? "Target is not eligible for rollback"
      );
    }

    const result = await rollbackUpgrade(targetId);

    return successResponse(result, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
