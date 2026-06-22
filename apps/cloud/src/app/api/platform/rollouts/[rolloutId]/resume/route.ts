import { NextRequest } from "next/server";
import { resumeReleaseRollout } from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/platform/rollouts/[rolloutId]/resume — resume rollout
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rolloutId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { rolloutId } = await params;
    const rollout = await resumeReleaseRollout(principal, rolloutId);

    return successResponse(rollout, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
