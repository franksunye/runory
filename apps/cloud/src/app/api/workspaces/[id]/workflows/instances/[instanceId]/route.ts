import { NextRequest } from "next/server";
import {
  getWorkflowInstance,
  transitionWorkflow,
  writeAuditEvent,
  type WorkflowActor,
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
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, instanceId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const instance = await getWorkflowInstance(workspaceId, instanceId);
    if (!instance) {
      return notFound(`Workflow instance ${instanceId} not found`, ctx.requestId);
    }
    return successResponse(instance, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, instanceId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    const body = await request.json() as { transitionId: string; comment?: string };
    if (!body?.transitionId) {
      return invalidInput("transitionId is required", ctx.requestId);
    }
    const actor: WorkflowActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      role: ctx.workspaceRole ?? "member",
    };
    const before = await getWorkflowInstance(workspaceId, instanceId);
    const instance = await transitionWorkflow(
      workspaceId,
      instanceId,
      body.transitionId,
      actor,
      body.comment
    );
    writeAuditEvent({
      workspaceId,
      actorType: actor.type as "user" | "api_key",
      actorId: actor.id,
      action: "record.update",
      entityType: "workflow_instance",
      entityId: instance.id,
      before: before as unknown as Record<string, unknown>,
      after: instance as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
    return successResponse(instance, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
