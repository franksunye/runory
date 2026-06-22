import { NextRequest } from "next/server";
import {
  promoteCatalogRelease,
  type ReleaseChannel,
} from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/platform/catalog/versions/[versionId]/promote — promote to channel
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { versionId } = await params;
    const body = (await request.json()) as {
      channel: ReleaseChannel;
      releaseNotes?: string;
    };
    const release = await promoteCatalogRelease(principal, {
      catalogVersionId: versionId,
      channel: body.channel,
      releaseNotes: body.releaseNotes,
    });

    return successResponse(release, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
