import { NextRequest } from "next/server";
import { submitForm, getFormSubmissions } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST: Submit a form (creates an immutable, revisioned submission).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(
      request,
      id,
      "member"
    );

    const body = (await request.json()) as {
      formDefinitionId: string;
      subjectType?: string;
      subjectId?: string;
      workItemId?: string;
      bindingId?: string;
      formVersionId?: string;
      answers: Record<string, unknown>;
      supersedesSubmissionId?: string;
      draftSubmissionId?: string;
    };

    if (!body?.formDefinitionId || !body?.answers) {
      return invalidInput(
        "formDefinitionId and answers are required",
        ctx.requestId
      );
    }

    const userId = ctx.principal?.userId ?? "unknown";
    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
    const result = await submitForm(
      workspaceId,
      {
        formDefinitionId: body.formDefinitionId,
        subjectType: body.subjectType,
        subjectId: body.subjectId,
        workItemId: body.workItemId,
        bindingId: body.bindingId,
        formVersionId: body.formVersionId,
        answers: body.answers,
        submittedBy: userId,
        supersedesSubmissionId: body.supersedesSubmissionId,
        draftSubmissionId: body.draftSubmissionId,
      },
      idempotencyKey,
      ctx.requestId
    );

    return successResponse(result, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// GET: List form submissions (filter by subject_type, subject_id, status, etc.).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(
      request,
      id,
      "viewer"
    );

    const url = new URL(request.url);
    const subjectType = url.searchParams.get("subjectType") ?? undefined;
    const subjectId = url.searchParams.get("subjectId") ?? undefined;
    const workItemId = url.searchParams.get("workItemId") ?? undefined;
    const bindingId = url.searchParams.get("bindingId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    const submissions = await getFormSubmissions(workspaceId, {
      subjectType,
      subjectId,
      workItemId,
      bindingId,
      status,
    });

    return successResponse(submissions, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
