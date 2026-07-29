import { NextRequest } from "next/server";
import { generateDiagnosticsPackage, resolveWorkspaceId } from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/workspaces/[id]/diagnostics — generate a comprehensive diagnostics
 * package for the workspace. Aggregates configuration, contract inventory,
 * rollout status, outbox failures, migration state, installation errors,
 * and a full health report into a single exportable structure.
 *
 * The package is safe to share — it contains configuration metadata and
 * status, but no business data records or credentials.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePrincipal(request);
    const { id } = await params;
    const workspaceId = await resolveWorkspaceId(id);
    const diagnostics = await generateDiagnosticsPackage(workspaceId);
    return successResponse(diagnostics);
  } catch (e) {
    return handleError(e);
  }
}
