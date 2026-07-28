import { NextRequest } from "next/server";
import { renameCustomView, deleteCustomView } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

interface PatchViewBody {
  label?: string;
}

// PATCH /api/workspaces/:workspaceId/views/:viewId
// Renames a custom view. System views cannot be renamed.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, viewId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as PatchViewBody;
    if (!body.label?.trim()) {
      return Response.json(
        { error: "label is required" },
        { status: 400 },
      );
    }
    const view = await renameCustomView(workspaceId, viewId, body.label.trim());
    return successResponse(view, 200, ctx.requestId, "no-store");
  } catch (e) {
    return handleError(e, requestId);
  }
}

// DELETE /api/workspaces/:workspaceId/views/:viewId
// Deletes a custom view and its associated preferences.
// System views cannot be deleted.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, viewId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const deleted = await deleteCustomView(workspaceId, viewId);
    return successResponse({ deleted }, 200, ctx.requestId, "no-store");
  } catch (e) {
    return handleError(e, requestId);
  }
}
