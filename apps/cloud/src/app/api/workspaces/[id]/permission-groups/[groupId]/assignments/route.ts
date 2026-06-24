import { NextRequest } from "next/server";
import {
  getPermissionGroupAssignments,
  assignPackPermissionGroup,
  removePackPermissionAssignment,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, notFound, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[id]/permission-groups/[groupId]/assignments — list members in a group (v0.3.6)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, groupId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const assignments = await getPermissionGroupAssignments(workspaceId, groupId);
    return successResponse(assignments, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// POST /api/workspaces/[id]/permission-groups/[groupId]/assignments — assign user to group (v0.3.6)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, groupId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as { userId: string };
    if (!body.userId) {
      return successResponse({ error: "userId is required" }, 400, ctx.requestId);
    }
    const result = await assignPackPermissionGroup(
      workspaceId,
      groupId,
      body.userId,
      ctx.principal?.userId ?? "unknown"
    );
    return successResponse(result, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// DELETE /api/workspaces/[id]/permission-groups/[groupId]/assignments — remove user from group (v0.3.6)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, groupId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return successResponse({ error: "userId query parameter is required" }, 400, ctx.requestId);
    }
    const result = await removePackPermissionAssignment(workspaceId, groupId, userId);
    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
