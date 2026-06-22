import { NextRequest } from "next/server";
import { z } from "zod";
import { archiveWorkspace, scheduleWorkspaceDeletion } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

const lifecycleSchema = z.object({
  action: z.enum(["archive", "delete"]),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as { action: "archive" | "delete" };
    const parsed = lifecycleSchema.safeParse(body);
    if (!parsed.success) {
      return invalidInput(parsed.error.message, ctx.requestId);
    }
    if (parsed.data.action === "archive") {
      await archiveWorkspace(workspaceId, ctx.principal!.userId);
    } else if (parsed.data.action === "delete") {
      const job = await scheduleWorkspaceDeletion(workspaceId, ctx.organizationId ?? "", ctx.principal!.userId);
      return successResponse(job, 201, ctx.requestId);
    } else {
      return invalidInput("Action must be archive or delete", ctx.requestId);
    }
    return successResponse({ success: true }, 200, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}
