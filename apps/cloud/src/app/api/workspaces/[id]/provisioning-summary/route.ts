import { NextRequest } from "next/server";
import { getWorkspaceProvisioningSummary, resolveWorkspaceId } from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspaces/[id]/provisioning-summary — summary of what is installed
 * in a workspace (packs, extensions, object/field/view/navigation counts).
 * Supports the 90/10 validation and configuration Diff in v0.9.1.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePrincipal(request);
    const { id } = await params;
    const workspaceId = await resolveWorkspaceId(id);
    const summary = await getWorkspaceProvisioningSummary(workspaceId);
    return successResponse(summary);
  } catch (e) {
    return handleError(e);
  }
}
