import { NextRequest } from "next/server";
import { getExportJob } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, jobId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const job = await getExportJob(jobId, workspaceId);
    return successResponse(job, 200, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}
