import { NextRequest } from "next/server";
import { getRecords, createRecord, writeAuditEvent, enforceQuota } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    const records = await getRecords(workspaceId, objectKey);
    return successResponse(records, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    const data = await request.json() as Record<string, unknown>;
    if (ctx.organizationId) await enforceQuota(ctx.organizationId, "records");
    const record = await createRecord(workspaceId, objectKey, data);
    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "record.create",
      entityType: objectKey,
      entityId: record.id,
      after: record as Record<string, unknown>,
      requestId: ctx.requestId,
    }).catch(() => {});
    return successResponse(record, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
