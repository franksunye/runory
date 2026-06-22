import { NextRequest } from "next/server";
import { runCatalogValidation } from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/platform/catalog/versions/[versionId]/validate — run validation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { versionId } = await params;
    const result = await runCatalogValidation(principal, versionId);

    return successResponse(result, 201, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
