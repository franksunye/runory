import { NextRequest } from "next/server";
import { createCustomView, getViews } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/:workspaceId/views?objectKey=contact
// Returns all view definitions for the given object.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const objectKey = request.nextUrl.searchParams.get("objectKey");
    if (!objectKey) {
      return successResponse([], 200, ctx.requestId, "no-store");
    }
    const views = await getViews(workspaceId, objectKey);
    return successResponse(views, 200, ctx.requestId, "no-store");
  } catch (e) {
    return handleError(e, requestId);
  }
}

interface CreateViewBody {
  objectKey: string;
  label: string;
  config: Record<string, unknown>;
}

// POST /api/workspaces/:workspaceId/views
// Creates a custom (user-created) view definition.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as CreateViewBody;
    if (!body.objectKey || !body.label?.trim()) {
      return Response.json(
        { error: "objectKey and label are required" },
        { status: 400 },
      );
    }
    const view = await createCustomView(
      workspaceId,
      body.objectKey,
      body.label.trim(),
      body.config ?? {},
    );
    return successResponse(view, 201, ctx.requestId, "no-store");
  } catch (e) {
    return handleError(e, requestId);
  }
}
