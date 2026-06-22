import { NextRequest } from "next/server";
import { getRecord, updateRecord, deleteRecord, writeAuditEvent } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, notFound, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey, recordId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    const record = await getRecord(workspaceId, objectKey, recordId);
    if (!record) {
      return notFound(`Record ${recordId} not found`, ctx.requestId);
    }
    return successResponse(record, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey, recordId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    const data = await request.json() as Record<string, unknown>;
    const before = await getRecord(workspaceId, objectKey, recordId);
    const record = await updateRecord(workspaceId, objectKey, recordId, data);
    if (!record) {
      return notFound(`Record ${recordId} not found`, ctx.requestId);
    }
    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "record.update",
      entityType: objectKey,
      entityId: recordId,
      before: before ?? null,
      after: record,
      requestId: ctx.requestId,
    }).catch(() => {});
    return successResponse(record, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey, recordId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    const before = await getRecord(workspaceId, objectKey, recordId);
    const deleted = await deleteRecord(workspaceId, objectKey, recordId);
    if (!deleted) {
      return notFound(`Record ${recordId} not found`, ctx.requestId);
    }
    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "record.delete",
      entityType: objectKey,
      entityId: recordId,
      before: before ?? null,
      after: null,
      requestId: ctx.requestId,
    }).catch(() => {});
    return successResponse({ deleted: true }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
