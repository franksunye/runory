import { NextRequest } from "next/server";
import { installPack, updatePackInstallError, clearPackInstallError } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  const { id, packId } = await params;
  try {
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json().catch(() => ({})) as { includeDemoData?: boolean };
    try {
      const result = await installPack(workspaceId, packId, {
        includeDemoData: body.includeDemoData === true,
      });
      // Clear any previous install error on success (v0.3.6 diagnostics)
      await clearPackInstallError(workspaceId, packId).catch(() => {});
      return successResponse(result, 201, ctx.requestId);
    } catch (e) {
      // Persist install error for diagnostics (v0.3.6)
      const errorMsg = e instanceof Error ? e.message : String(e);
      await updatePackInstallError(workspaceId, packId, errorMsg).catch(() => {});
      throw e;
    }
  } catch (e) {
    return handleError(e, requestId);
  }
}
