import { NextRequest } from "next/server";
import {
  withdrawCatalogVersion,
  getCatalogVersion,
} from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/platform/catalog/versions/[versionId]/withdraw — withdraw version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { principal } = await requirePlatformAdmin(request);

    const { versionId } = await params;
    const body = (await request.json()) as { reason: string };
    await withdrawCatalogVersion(principal, versionId, body.reason);
    const version = await getCatalogVersion(versionId);

    return successResponse(version, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
