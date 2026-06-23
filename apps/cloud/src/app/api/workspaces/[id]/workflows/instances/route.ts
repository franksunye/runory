import { NextRequest } from "next/server";
import {
  getWorkflowInstances,
  startWorkflow,
  writeAuditEvent,
  type WorkflowActor,
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
    const url = new URL(request.url);
    const objectType = url.searchParams.get("objectType") ?? undefined;
    const recordId = url.searchParams.get("recordId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const instances = await getWorkflowInstances(workspaceId, objectType, recordId, status);
    return successResponse(instances, 200, ctx.requestId);
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
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    const body = await request.json() as {
      workflowId: string;
      objectType: string;
      recordId: string;
    };
    if (!body?.workflowId || !body?.objectType || !body?.recordId) {
      return invalidInput("workflowId, objectType, and recordId are required", ctx.requestId);
    }
    const actor: WorkflowActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      role: ctx.workspaceRole ?? "member",
    };
    const instance = await startWorkflow(
      workspaceId,
      body.workflowId,
      body.objectType,
      body.recordId,
      actor
    );
    writeAuditEvent({
      workspaceId,
      actorType: actor.type as "user" | "api_key",
      actorId: actor.id,
      action: "record.create",
      entityType: "workflow_instance",
      entityId: instance.id,
      after: instance as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
    return successResponse(instance, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
