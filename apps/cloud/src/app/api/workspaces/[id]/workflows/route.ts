import { NextRequest } from "next/server";
import {
  createWorkflowDefinition,
  getWorkflowDefinitions,
  writeAuditEvent,
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
    const definitions = await getWorkflowDefinitions(workspaceId);
    return successResponse(definitions, 200, ctx.requestId);
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
      return invalidInput("Workflow definition must be an object", ctx.requestId);
    }
    const definition = await createWorkflowDefinition(workspaceId, body as Record<string, unknown> as Parameters<typeof createWorkflowDefinition>[1]);
    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "record.create",
      entityType: "workflow_definition",
      entityId: definition.id,
      after: definition as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
    return successResponse(definition, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
