import { NextRequest } from "next/server";
import { migrateV04ToV05, inventoryWorkspace } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST: Run the v0.4 → v0.5 migration (inventory → migrate → enable → verify)
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
      "admin"
    );

    const actorId = ctx.principal?.userId ?? "system";

    const result = await migrateV04ToV05(workspaceId, actorId);

    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// GET: Get migration inventory / status
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
      "admin"
    );

    const inventory = await inventoryWorkspace(workspaceId);

    return successResponse(inventory, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
