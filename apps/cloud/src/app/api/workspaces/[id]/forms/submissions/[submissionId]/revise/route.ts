import { NextRequest } from "next/server";
import { requireBusinessPermission, reviseFormSubmission } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Start a new correction revision without mutating the submitted record. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, submissionId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    await requireBusinessPermission(ctx, "form.submit");
    const body = (await request.json()) as { reason?: string };
    const actorId = ctx.principal?.userId ?? "unknown";
    const result = await reviseFormSubmission(
      workspaceId,
      submissionId,
      actorId,
      body.reason,
      request.headers.get("idempotency-key") ?? undefined,
      ctx.requestId
    );
    return successResponse(result, 201, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
