import { NextRequest } from "next/server";
import { loadPackDemoData, hasPackDemoData, updatePackDemoDataStatus } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";
// Demo data loading involves many serial DB queries (record creation + workflow auto-start).
export const maxDuration = 300;

// POST /api/workspaces/[id]/packs/[packId]/demo-data
// Load demo data for an already-installed pack (v0.3.4).
// This is decoupled from install so users can choose when to load demo data.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, packId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");

    if (!hasPackDemoData(packId)) {
      return handleError(
        new Error(`Pack "${packId}" does not have demo data available`),
        requestId
      );
    }

    try {
      const result = await loadPackDemoData(workspaceId, packId);
      return successResponse(
        { packId, demoRecordsCreated: result.recordsCreated, demoDataStatus: "loaded" as const },
        200,
        ctx.requestId
      );
    } catch (e) {
      // Mark status as error and persist error message for diagnostics (v0.3.6)
      const errorMsg = e instanceof Error ? e.message : String(e);
      await updatePackDemoDataStatus(workspaceId, packId, "error", errorMsg).catch(() => {});
      throw e;
    }
  } catch (e) {
    return handleError(e, requestId);
  }
}
