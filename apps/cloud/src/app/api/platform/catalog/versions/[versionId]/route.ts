import { NextRequest } from "next/server";
import { getCatalogVersion } from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/catalog/versions/[versionId] — get version detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { versionId } = await params;
    const version = await getCatalogVersion(versionId);

    return successResponse(version, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
