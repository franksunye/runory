import { NextRequest } from "next/server";
import { getFormDefinition } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  notFound,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET: Fetch a form definition with its active schema.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; formKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, formKey } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(
      request,
      id,
      "viewer"
    );

    const definition = await getFormDefinition(workspaceId, formKey);
    if (!definition) {
      return notFound(
        `Form definition not found: ${formKey}`,
        ctx.requestId
      );
    }

    return successResponse(definition, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
