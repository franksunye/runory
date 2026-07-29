import { NextRequest } from "next/server";
import { generateVocabularyReport } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/vocabulary — get vocabulary unification report
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const report = await generateVocabularyReport();

    return successResponse(report, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
