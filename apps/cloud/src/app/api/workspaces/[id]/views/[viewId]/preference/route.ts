import { NextRequest } from "next/server";
import { getViewPreference, setViewPreference } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/:workspaceId/views/:viewId/preference
// Returns the current user's preference for a list view, or null if none exists.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, viewId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const userId = ctx.principal!.userId;
    const preference = await getViewPreference(workspaceId, userId, viewId);
    return successResponse(preference, 200, ctx.requestId, "no-store");
  } catch (e) {
    return handleError(e, requestId);
  }
}

interface PutPreferenceBody {
  visibleFields?: string[];
  filters?: Array<{ field: string; operator: "eq"; value: string | number | boolean }>;
  sort?: { field: string; direction: "asc" | "desc" };
  pageSize?: number;
  expectedVersion?: number;
}

// PUT /api/workspaces/:workspaceId/views/:viewId/preference
// Creates or updates the current user's preference for a list view.
// Requires expectedVersion when updating an existing preference (optimistic concurrency).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, viewId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const userId = ctx.principal!.userId;
    const body = await request.json() as PutPreferenceBody;
    const preference = await setViewPreference(workspaceId, userId, viewId, {
      visibleFields: body.visibleFields,
      filters: body.filters,
      sort: body.sort,
      pageSize: body.pageSize,
      expectedVersion: body.expectedVersion,
    });
    return successResponse(preference, 200, ctx.requestId, "no-store");
  } catch (e) {
    return handleError(e, requestId);
  }
}
