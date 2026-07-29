import { NextRequest } from "next/server";
import {
  freezeContracts,
  loadFrozenSnapshot,
  generateFreezeReport,
} from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
  notFound,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/platform/contract-freeze — freeze contracts
export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { principal } = await requirePlatformAdmin(request);

    const snapshot = await freezeContracts(principal);

    return successResponse(snapshot, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// GET /api/platform/contract-freeze — get freeze report
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const frozen = await loadFrozenSnapshot();
    if (!frozen) {
      return notFound(
        "No frozen contract baseline has been enacted",
        requestId
      );
    }
    const report = await generateFreezeReport(frozen);

    return successResponse(report, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
