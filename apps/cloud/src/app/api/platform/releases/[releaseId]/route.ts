import { NextRequest } from "next/server";
import { getRelease } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/releases/[releaseId] — get release detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const { releaseId } = await params;
    const release = await getRelease(releaseId);

    return successResponse(release, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
