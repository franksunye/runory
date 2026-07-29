import { NextRequest } from "next/server";
import { generateCoverageValidationReport } from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/coverage-validation — 90/10 coverage validation report across
 * all provisioned workspaces.
 *
 * Aggregates coverage metrics for every active workspace, showing which
 * workspaces meet the 90/10 target (>=90% standard product, <=10% extensions).
 */
export async function GET(request: NextRequest) {
  try {
    await requirePrincipal(request);
    const report = await generateCoverageValidationReport();
    return successResponse(report);
  } catch (e) {
    return handleError(e);
  }
}
