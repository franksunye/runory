import { NextRequest } from "next/server";
import { getRollout, getRolloutProgress } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
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
    await requirePlatformAdmin(request);

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
