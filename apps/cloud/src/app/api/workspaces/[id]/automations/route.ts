import { NextRequest } from "next/server";
import {
  getAutomations,
  createAutomation,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const automations = await getAutomations(workspaceId);
    return successResponse(automations, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidInput("Automation definition must be an object", ctx.requestId);
    }
    const actorId = ctx.principal?.userId ?? "unknown";
    const automation = await createAutomation(
      workspaceId,
      body as Parameters<typeof createAutomation>[1],
      actorId
    );
    return successResponse(automation, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
