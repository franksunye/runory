import { NextRequest } from "next/server";
import { createFormBinding, listFormBindings } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST: Create a form binding.
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
      usageType: string;
      usageKey?: string;
      labelOverride?: string;
      timing?: Record<string, unknown>;
      requirementPolicy?: "optional" | "required";
      targetMapping?: Record<string, unknown>;
    };

    if (!body?.formDefinitionId || !body?.usageType) {
      return invalidInput(
        "formDefinitionId and usageType are required",
        ctx.requestId
      );
    }

    const result = await createFormBinding(workspaceId, body.formDefinitionId, {
      usageType: body.usageType,
      usageKey: body.usageKey,
      labelOverride: body.labelOverride,
      timing: body.timing,
      requirementPolicy: body.requirementPolicy,
      targetMapping: body.targetMapping,
    });

    return successResponse(result, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// GET: List form bindings (optional usage_type filter).
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
    const usageType = url.searchParams.get("usageType") ?? undefined;

    const bindings = await listFormBindings(workspaceId, usageType);
    return successResponse(bindings, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
