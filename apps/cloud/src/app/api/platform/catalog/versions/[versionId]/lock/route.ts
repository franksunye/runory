import { NextRequest } from "next/server";
import { resolvePackLock, getPackLock } from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/catalog/versions/[versionId]/lock — get pack lock
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { versionId } = await params;
    const locks = await getPackLock(versionId);

    return successResponse(locks, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// POST /api/platform/catalog/versions/[versionId]/lock — resolve pack lock
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const { versionId } = await params;
    const locks = await resolvePackLock(principal, versionId);

    return successResponse(locks, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
