import { NextRequest } from "next/server";
import {
  getFormSubmission,
  acceptFormSubmission,
  returnFormSubmission,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET: Fetch a single form submission.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, submissionId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(
      request,
      id,
      "viewer"
    );

    const submission = await getFormSubmission(workspaceId, submissionId);
    return successResponse(submission, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// POST: Accept or return a submission (action=accept|return).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, submissionId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(
      request,
      id,
      "member"
    );

    const body = (await request.json()) as {
      action: "accept" | "return";
      returnReason?: string;
    };

    if (!body?.action || (body.action !== "accept" && body.action !== "return")) {
      return invalidInput(
        "action must be 'accept' or 'return'",
        ctx.requestId
      );
    }

    const userId = ctx.principal?.userId ?? "unknown";
    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;

    if (body.action === "accept") {
      const result = await acceptFormSubmission(
        workspaceId,
        submissionId,
        userId,
        idempotencyKey,
        ctx.requestId
      );
      return successResponse(result, 200, ctx.requestId);
    }

    // action === "return"
    const returnReason = body.returnReason ?? "Returned for revision";
    const result = await returnFormSubmission(
      workspaceId,
      submissionId,
      userId,
      returnReason,
      idempotencyKey,
      ctx.requestId
    );
    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
