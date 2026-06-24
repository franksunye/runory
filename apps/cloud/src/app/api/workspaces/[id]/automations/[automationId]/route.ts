import { NextRequest } from "next/server";
import {
  getAutomation,
  updateAutomation,
  deleteAutomation,
  setAutomationEnabled,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  notFound,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; automationId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, automationId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const automation = await getAutomation(workspaceId, automationId);
    if (!automation) {
      return notFound(`Automation ${automationId} not found`, ctx.requestId);
    }
    return successResponse(automation, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; automationId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, automationId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as {
      updates?: Record<string, unknown>;
      enabled?: boolean;
    };
    const actorId = ctx.principal?.userId ?? "unknown";

    if (body.enabled !== undefined && body.updates === undefined) {
      // Toggle enabled only
      const result = await setAutomationEnabled(workspaceId, automationId, body.enabled, actorId);
      if (!result) {
        return notFound(`Automation ${automationId} not found`, ctx.requestId);
      }
      return successResponse(result, 200, ctx.requestId);
    }

    if (body.updates) {
      const result = await updateAutomation(workspaceId, automationId, body.updates, actorId);
      if (!result) {
        return notFound(`Automation ${automationId} not found`, ctx.requestId);
      }
      // Also handle enabled toggle if both provided
      if (body.enabled !== undefined) {
        const toggled = await setAutomationEnabled(workspaceId, automationId, body.enabled, actorId);
        return successResponse(toggled ?? result, 200, ctx.requestId);
      }
      return successResponse(result, 200, ctx.requestId);
    }

    return invalidInput("Provide 'updates' and/or 'enabled' in the request body", ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; automationId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, automationId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const actorId = ctx.principal?.userId ?? "unknown";
    const deleted = await deleteAutomation(workspaceId, automationId, actorId);
    if (!deleted) {
      return notFound(`Automation ${automationId} not found`, ctx.requestId);
    }
    return successResponse({ deleted: true }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
