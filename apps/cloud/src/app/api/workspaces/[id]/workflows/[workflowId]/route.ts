import { NextRequest } from "next/server";
import {
  getWorkflowDefinition,
  deleteWorkflowDefinition,
  updateWorkflowDefinition,
  writeAuditEvent,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  notFound,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; workflowId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, workflowId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const definition = await getWorkflowDefinition(workspaceId, workflowId);
    if (!definition) {
      return notFound(`Workflow ${workflowId} not found`, ctx.requestId);
    }
    return successResponse(definition, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; workflowId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, workflowId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const deleted = await deleteWorkflowDefinition(workspaceId, workflowId);
    if (!deleted) {
      return notFound(`Workflow ${workflowId} not found`, ctx.requestId);
    }
    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "workflow.definition.delete",
      entityType: "workflow_definition",
      entityId: workflowId,
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
    return successResponse({ deleted: true }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; workflowId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, workflowId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as Record<string, unknown>;
    const updated = await updateWorkflowDefinition(workspaceId, workflowId, body);
    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "workflow.definition.update",
      entityType: "workflow_definition",
      entityId: workflowId,
      after: updated as Record<string, unknown>,
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
    return successResponse(updated, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
