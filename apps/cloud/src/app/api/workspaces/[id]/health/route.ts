import { NextRequest } from "next/server";
import { checkWorkspaceHealth, getWorkspaceHealthStatus } from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError } from "@/lib/http";
import { resolveWorkspaceId } from "@runory/platform-core";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspaces/[id]/health — comprehensive workspace health report.
 *
 * Query params:
 *   - summary=true — return only overall + category statuses (lightweight)
 *   - (default) — return full health report with detail items
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePrincipal(request);
    const { id } = await params;
    const workspaceId = await resolveWorkspaceId(id);
    const url = new URL(request.url);
    const summary = url.searchParams.get("summary") === "true";

    if (summary) {
      const result = await getWorkspaceHealthStatus(workspaceId);
      return successResponse(result);
    }

    const report = await checkWorkspaceHealth(workspaceId);
    return successResponse(report);
  } catch (e) {
    return handleError(e);
  }
}
