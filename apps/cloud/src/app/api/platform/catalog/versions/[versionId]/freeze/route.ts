import { NextRequest } from "next/server";
import { freezeCatalogVersion } from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/platform/catalog/versions/[versionId]/freeze — freeze version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { versionId } = await params;
    const version = await freezeCatalogVersion(principal, versionId);

    return successResponse(version, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
