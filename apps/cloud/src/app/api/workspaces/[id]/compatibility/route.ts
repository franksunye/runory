import { NextRequest } from "next/server";
import { generateCompatibilityReport } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/workspaces/[id]/compatibility — generate compatibility report
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
      "viewer"
    );

    const body = (await request.json()) as {
      catalogItemId: string;
      fromVersionId?: string;
      toVersionId: string;
    };

    const report = await generateCompatibilityReport(ctx.principal!, {
      workspaceId,
      catalogItemId: body.catalogItemId,
      fromVersionId: body.fromVersionId,
      toVersionId: body.toVersionId,
    });

    return successResponse(report, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
