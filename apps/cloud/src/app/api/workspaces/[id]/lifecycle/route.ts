import { NextRequest } from "next/server";
import { archiveWorkspace, scheduleWorkspaceDeletion } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as { action: "archive" | "delete" };
    if (body.action === "archive") {
      await archiveWorkspace(workspaceId, ctx.principal!.userId);
    } else if (body.action === "delete") {
      const job = await scheduleWorkspaceDeletion(workspaceId, ctx.organizationId ?? "", ctx.principal!.userId);
      return successResponse(job, 201, ctx.requestId);
    } else {
      return new Response(JSON.stringify({ success: false, error: { code: "INVALID_INPUT", message: "Action must be archive or delete", requestId } }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    return successResponse({ success: true }, 200, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}
