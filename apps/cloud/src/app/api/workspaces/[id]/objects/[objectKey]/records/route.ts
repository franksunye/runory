import { NextRequest } from "next/server";
import { getRecords, createRecord, canCreateRecord, writeAuditEvent, enforceQuota, type GetRecordsOptions, type VisibilityScope, ERROR_CODES } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, invalidInput, errorResponse, getOrCreateRequestId } from "@/lib/http";
import { enrichUserReferences, listUserReferenceFieldKeys } from "@/lib/identity";

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
    const filters: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      if (key.startsWith("filter.")) filters[key.slice("filter.".length)] = value;
    }

    // Build visibility scope from request context (v0.5.2)
    const visibilityScope: VisibilityScope | undefined = ctx.principal
      ? { userId: ctx.principal.userId, role: ctx.workspaceRole, organizationRole: ctx.organizationRole }
      : undefined;

    const options: GetRecordsOptions = {
      search: url.searchParams.get("search") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? undefined,
      sortOrder: sortOrderParam === "asc" || sortOrderParam === "desc" ? sortOrderParam : undefined,
      limit: parsePositiveInt(url.searchParams.get("limit")),
      offset: parsePositiveInt(url.searchParams.get("offset")),
      includeDeleted: url.searchParams.get("includeDeleted") === "true",
      onlyDeleted: url.searchParams.get("onlyDeleted") === "true",
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      visibilityScope,
    };

    const records = await getRecords(workspaceId, objectKey, options);
    const userFieldKeys = await listUserReferenceFieldKeys(workspaceId, objectKey);
    const enrichedRecords = await enrichUserReferences(records, userFieldKeys);
    return successResponse(enrichedRecords, 200, ctx.requestId);
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
    // A Service Visit is a governed execution aggregate. Creating it through
    // generic CRUD used to produce an unassigned, unscheduled Visit that could
    // be completed without evidence. The only supported entry point is the
    // atomic work_order.create_visit (Plan & dispatch) command.
    if (objectKey === "service_visit") {
      return invalidInput(
        "Service Visits are created through Plan & dispatch on a triaged work order.",
        ctx.requestId
      );
    }
    const canCreate = ctx.principal
      ? await canCreateRecord(workspaceId, objectKey, {
          userId: ctx.principal.userId,
          role: ctx.workspaceRole,
          organizationRole: ctx.organizationRole,
        })
      : false;
    if (!canCreate) {
      return errorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        `You do not have permission to create '${objectKey}' records.`,
        403,
        ctx.requestId
      );
    }
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
