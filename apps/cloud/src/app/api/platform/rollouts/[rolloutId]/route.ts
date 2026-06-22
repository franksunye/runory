import { NextRequest } from "next/server";
import { getRollout, getRolloutProgress } from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/rollouts/[rolloutId] — get rollout detail + progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rolloutId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { rolloutId } = await params;
    const [rollout, progress] = await Promise.all([
      getRollout(rolloutId),
      getRolloutProgress(rolloutId),
    ]);

    return successResponse({ rollout, progress }, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
