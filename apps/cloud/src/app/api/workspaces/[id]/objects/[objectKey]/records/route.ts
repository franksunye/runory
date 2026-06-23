import { NextRequest } from "next/server";
import { getRecords, createRecord, writeAuditEvent, enforceQuota, type GetRecordsOptions } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);

    const url = new URL(request.url);
    const sortOrderParam = url.searchParams.get("sortOrder");
    const options: GetRecordsOptions = {
      search: url.searchParams.get("search") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? undefined,
      sortOrder: sortOrderParam === "asc" || sortOrderParam === "desc" ? sortOrderParam : undefined,
      limit: parsePositiveInt(url.searchParams.get("limit")),
      offset: parsePositiveInt(url.searchParams.get("offset")),
    };

    const records = await getRecords(workspaceId, objectKey, options);
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
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return invalidInput("Record data must be an object", ctx.requestId);
    }
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
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
    return successResponse(record, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
