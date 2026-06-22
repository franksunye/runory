import { NextRequest } from "next/server";
import {
  listCatalogVersions,
  type VersionLifecycleStatus,
} from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/catalog/[itemId]/versions — list versions for an item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { itemId } = await params;
    const lifecycleStatus = request.nextUrl.searchParams.get(
      "lifecycleStatus"
    ) as VersionLifecycleStatus | null;

    const versions = await listCatalogVersions(itemId, {
      ...(lifecycleStatus ? { lifecycleStatus } : {}),
    });

    return successResponse(versions, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
