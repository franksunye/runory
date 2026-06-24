import { NextRequest } from "next/server";
import { getRecord, updateRecord, deleteRecord, restoreRecord, writeAuditEvent, now } from "@runory/platform-core";
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
    const url = new URL(request.url);
    const includeDeleted = url.searchParams.get("includeDeleted") === "true";
    const record = await getRecord(workspaceId, objectKey, recordId, { includeDeleted });
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
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
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
    const url = new URL(request.url);
    const hard = url.searchParams.get("hard") === "true";
    const before = await getRecord(workspaceId, objectKey, recordId, { includeDeleted: true });
    const deleted = await deleteRecord(workspaceId, objectKey, recordId, {
      hard,
      deletedBy: ctx.principal?.userId ?? "unknown",
    });
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
      after: { hard, softDeleted: !hard },
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
    return successResponse({ deleted: true, hard }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// ── Restore a soft-deleted record, or publish/unpublish public content (v0.3.6) ──
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey, recordId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    const body = await request.json().catch(() => ({})) as { action?: string };

    // ── Restore action ──
    if (body.action === "restore") {
      const restored = await restoreRecord(workspaceId, objectKey, recordId);
      if (!restored) {
        return notFound(`Record ${recordId} not found or not deleted`, ctx.requestId);
      }
      writeAuditEvent({
        workspaceId,
        actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
        actorId: ctx.principal?.userId ?? "unknown",
        action: "record.update",
        entityType: objectKey,
        entityId: recordId,
        before: { deleted: true },
        after: { restored: true },
        requestId: ctx.requestId,
      }).catch((err) => {
        console.error("[audit] Failed to write audit event:", err);
      });
      return successResponse({ restored: true }, 200, ctx.requestId);
    }

    // ── Publish action (v0.3.6: public content unpublish) ──
    if (body.action === "publish") {
      const before = await getRecord(workspaceId, objectKey, recordId);
      if (!before) return notFound(`Record ${recordId} not found`, ctx.requestId);
      const updateData: Record<string, unknown> = { status: "published" };
      // Auto-set published_at if the object has a published_at field and it's empty
      if (before.published_at === null || before.published_at === undefined || before.published_at === "") {
        updateData.published_at = now();
      }
      const record = await updateRecord(workspaceId, objectKey, recordId, updateData);
      writeAuditEvent({
        workspaceId,
        actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
        actorId: ctx.principal?.userId ?? "unknown",
        action: "record.update",
        entityType: objectKey,
        entityId: recordId,
        before,
        after: record ?? null,
        requestId: ctx.requestId,
      }).catch((err) => {
        console.error("[audit] Failed to write audit event:", err);
      });
      return successResponse({ published: true, record }, 200, ctx.requestId);
    }

    // ── Unpublish action (v0.3.6: public content unpublish) ──
    if (body.action === "unpublish") {
      const before = await getRecord(workspaceId, objectKey, recordId);
      if (!before) return notFound(`Record ${recordId} not found`, ctx.requestId);
      const record = await updateRecord(workspaceId, objectKey, recordId, { status: "unpublished" });
      writeAuditEvent({
        workspaceId,
        actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
        actorId: ctx.principal?.userId ?? "unknown",
        action: "record.update",
        entityType: objectKey,
        entityId: recordId,
        before,
        after: record ?? null,
        requestId: ctx.requestId,
      }).catch((err) => {
        console.error("[audit] Failed to write audit event:", err);
      });
      return successResponse({ unpublished: true, record }, 200, ctx.requestId);
    }

    return successResponse(
      { error: "Unsupported PATCH action. Use { action: 'restore' | 'publish' | 'unpublish' }." },
      400,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
