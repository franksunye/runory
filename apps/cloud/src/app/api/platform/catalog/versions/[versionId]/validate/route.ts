import { NextRequest } from "next/server";
import { runCatalogValidation, getValidationRuns } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/catalog/versions/[versionId]/validate — list validation runs for a version
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const { versionId } = await params;
    const runs = await getValidationRuns(versionId);

    return successResponse(runs, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// POST /api/platform/catalog/versions/[versionId]/validate — run validation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { principal } = await requirePlatformAdmin(request);

    const { versionId } = await params;
    const result = await runCatalogValidation(principal, versionId);

    return successResponse(result, 201, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
