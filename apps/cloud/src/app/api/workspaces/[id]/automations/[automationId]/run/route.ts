import { NextRequest } from "next/server";
import {
  dryRunAutomation,
  runAutomation,
  getAutomationRuns,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/workspaces/[id]/automations/[automationId]/run
// Body: { triggerPayload?: Record<string, unknown>, dryRun?: boolean, triggerType?: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; automationId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, automationId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    const body = await request.json() as {
      triggerPayload?: Record<string, unknown>;
      dryRun?: boolean;
      triggerType?: string;
    };
    const actorId = ctx.principal?.userId ?? "unknown";
    const triggerPayload = body.triggerPayload ?? {};
    const dryRun = body.dryRun ?? false;
    const triggerType = body.triggerType ?? "manual";

    if (dryRun) {
      const result = await dryRunAutomation(workspaceId, automationId, triggerPayload);
      return successResponse(result, 200, ctx.requestId);
    }

    const run = await runAutomation(workspaceId, automationId, triggerType, triggerPayload, {
      dryRun: false,
      actorId,
    });
    return successResponse(run, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// GET /api/workspaces/[id]/automations/[automationId]/run?limit=50
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; automationId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, automationId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

    const runs = await getAutomationRuns(workspaceId, automationId, limit);
    return successResponse(runs, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
