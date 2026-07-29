import { NextRequest } from "next/server";
import {
  applyExtensionTemplate,
  previewExtensionTemplate,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/workspaces/[id]/extension-templates/[templateId]/apply — apply
 * an extension template to the workspace.
 *
 * Body options:
 *   - preview: boolean  If true, return a preview diff without applying
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, templateId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(
      request,
      id,
      "admin",
    );

    const body = await request.json().catch(() => ({})) as { preview?: boolean };

    if (body.preview) {
      const preview = await previewExtensionTemplate(workspaceId, templateId);
      return successResponse(preview, 200, ctx.requestId);
    }

    const result = await applyExtensionTemplate(
      workspaceId,
      templateId,
      {
        externalId: ctx.principal!.userId,
        email: ctx.principal!.email ?? undefined,
        displayName: ctx.principal!.displayName,
      },
    );

    return successResponse(result, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
