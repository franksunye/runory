import { NextRequest } from "next/server";
import { getCatalogVersion } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
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
    await requirePlatformAdmin(request);

    const { versionId } = await params;
    const version = await getCatalogVersion(versionId);

    return successResponse(version, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
