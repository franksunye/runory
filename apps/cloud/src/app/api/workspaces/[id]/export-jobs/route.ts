import { NextRequest } from "next/server";
import { createExportJob, runExportJob } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const job = await createExportJob(workspaceId, ctx.organizationId ?? "", ctx.principal!.userId);
    // Run export synchronously for now (in production this would be async)
    const completed = await runExportJob(job.id);
    return successResponse(completed, 201, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}
