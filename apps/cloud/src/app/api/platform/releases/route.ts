import { NextRequest } from "next/server";
import {
  listReleases,
  type ReleaseChannel,
  type ReleaseStatus,
} from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/releases — list releases (query: channel, status, catalogVersionId)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const channel = request.nextUrl.searchParams.get("channel") as
      | ReleaseChannel
      | null;
    const status = request.nextUrl.searchParams.get("status") as
      | ReleaseStatus
      | null;
    const catalogVersionId = request.nextUrl.searchParams.get(
      "catalogVersionId"
    );

    const releases = await listReleases({
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
      ...(catalogVersionId ? { catalogVersionId } : {}),
    });

    return successResponse(releases, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
