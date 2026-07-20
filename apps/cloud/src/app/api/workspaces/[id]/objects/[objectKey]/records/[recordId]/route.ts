import { NextRequest } from "next/server";
import {
  getRecord,
  getGovernedPaymentRecord,
  requireBusinessPermission,
  updateRecord,
  deleteRecord,
  restoreRecord,
  writeAuditEvent,
  now,
  isManagedField,
  getManagedFieldCommand,
  ERROR_CODES,
  type VisibilityScope,
  type GovernedPaymentObjectKey,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, notFound, errorResponse, getOrCreateRequestId } from "@/lib/http";
import { enrichUserReferences, listUserReferenceFieldKeys } from "@/lib/identity";

export const dynamic = "force-dynamic";

const COMMAND_ONLY_OBJECTS = new Set([
  "invoice",
  "invoice_line",
  "invoice_payment_allocation",
  "payment_request",
  "payment",
  "refund",
  "payment_provider_account",
  "payment_provider_reference",
]);

function visibilityScopeFor(ctx: { principal: { userId: string } | null; workspaceRole: string | null; organizationRole: string | null }): VisibilityScope | undefined {
  return ctx.principal
    ? { userId: ctx.principal.userId, role: ctx.workspaceRole, organizationRole: ctx.organizationRole }
    : undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey, recordId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    if (objectKey.startsWith("invoice")) {
      await requireBusinessPermission(ctx, "invoice.read");
    } else if (COMMAND_ONLY_OBJECTS.has(objectKey)) {
      await requireBusinessPermission(ctx, "payment.view");
    }
    const url = new URL(request.url);
    const includeDeleted = url.searchParams.get("includeDeleted") === "true";
    if (COMMAND_ONLY_OBJECTS.has(objectKey) && !objectKey.startsWith("invoice")) {
      const record = await getGovernedPaymentRecord(
        workspaceId,
        objectKey as GovernedPaymentObjectKey,
        recordId,
        { includeDeleted },
      );
      if (!record) return notFound(`Record ${recordId} not found`, ctx.requestId);
      return successResponse(record, 200, ctx.requestId);
    }
    const record = await getRecord(workspaceId, objectKey, recordId, {
      includeDeleted,
      visibilityScope: visibilityScopeFor(ctx),
    });
    if (!record) {
      return notFound(`Record ${recordId} not found`, ctx.requestId);
    }
    const userFieldKeys = await listUserReferenceFieldKeys(workspaceId, objectKey);
    const [enrichedRecord] = await enrichUserReferences([record], userFieldKeys);
    return successResponse(enrichedRecord, 200, ctx.requestId);
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
    if (COMMAND_ONLY_OBJECTS.has(objectKey)) {
      return errorResponse(
        ERROR_CODES.GOVERNED_FIELD_REQUIRES_COMMAND,
        `'${objectKey}' is a governed financial object and can only be changed through named financial commands.`,
        409,
        ctx.requestId,
      );
    }
    const data = await request.json() as Record<string, unknown>;

    // ── Guard: managed lifecycle fields require a named command (v0.5.1 P0) ──
    // Generic record CRUD MUST NOT directly change managed lifecycle fields such
    // as status / stage / revision_number / snapshot_hash. Those can only be
    // mutated via the command directory. UI / API / automation / MCP / future
    // Agents all share that single entry point.
    const managedViolations: { field: string; command: string }[] = [];
    for (const field of Object.keys(data)) {
      if (isManagedField(objectKey, field)) {
        managedViolations.push({
          field,
          command: getManagedFieldCommand(objectKey, field) ?? "(see command directory)",
        });
      }
    }
    if (managedViolations.length > 0) {
      const message = managedViolations
        .map(
          (v) =>
            `Field '${v.field}' on '${objectKey}' is managed by command(s): ${v.command}. Use the command API instead of generic update.`
        )
        .join(" ");
      return errorResponse(
        ERROR_CODES.GOVERNED_FIELD_REQUIRES_COMMAND,
        message,
        409,
        ctx.requestId
      );
    }

    const before = await getRecord(workspaceId, objectKey, recordId, { visibilityScope: visibilityScopeFor(ctx) });
    if (!before) return notFound(`Record ${recordId} not found`, ctx.requestId);
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
    if (COMMAND_ONLY_OBJECTS.has(objectKey)) {
      return errorResponse(
        ERROR_CODES.GOVERNED_FIELD_REQUIRES_COMMAND,
        `'${objectKey}' is a governed financial object and cannot be deleted through generic record APIs.`,
        409,
        ctx.requestId,
      );
    }
    const url = new URL(request.url);
    const hard = url.searchParams.get("hard") === "true";
    const before = await getRecord(workspaceId, objectKey, recordId, {
      includeDeleted: true,
      visibilityScope: visibilityScopeFor(ctx),
    });
    if (!before) return notFound(`Record ${recordId} not found`, ctx.requestId);
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
    if (COMMAND_ONLY_OBJECTS.has(objectKey)) {
      return errorResponse(
        ERROR_CODES.GOVERNED_FIELD_REQUIRES_COMMAND,
        `'${objectKey}' is a governed financial object and can only be changed through Payment commands.`,
        409,
        ctx.requestId,
      );
    }
    const body = await request.json().catch(() => ({})) as { action?: string };

    // ── Restore action ──
    if (body.action === "restore") {
      const before = await getRecord(workspaceId, objectKey, recordId, {
        includeDeleted: true,
        visibilityScope: visibilityScopeFor(ctx),
      });
      if (!before) return notFound(`Record ${recordId} not found`, ctx.requestId);
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
        before,
        after: { restored: true },
        requestId: ctx.requestId,
      }).catch((err) => {
        console.error("[audit] Failed to write audit event:", err);
      });
      return successResponse({ restored: true }, 200, ctx.requestId);
    }

    // ── Publish action (v0.3.6: public content unpublish) ──
    if (body.action === "publish") {
      // Guard: if `status` is a managed field for this object, the publish
      // action cannot directly write it — the caller must use the command API.
      if (isManagedField(objectKey, "status")) {
        const cmd = getManagedFieldCommand(objectKey, "status") ?? "(see command directory)";
        return errorResponse(
          ERROR_CODES.GOVERNED_FIELD_REQUIRES_COMMAND,
          `Field 'status' on '${objectKey}' is managed by command(s): ${cmd}. Use the command API instead of publish action.`,
          409,
          ctx.requestId
        );
      }
      const before = await getRecord(workspaceId, objectKey, recordId, { visibilityScope: visibilityScopeFor(ctx) });
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
      // Guard: same as publish — managed `status` field cannot be written directly.
      if (isManagedField(objectKey, "status")) {
        const cmd = getManagedFieldCommand(objectKey, "status") ?? "(see command directory)";
        return errorResponse(
          ERROR_CODES.GOVERNED_FIELD_REQUIRES_COMMAND,
          `Field 'status' on '${objectKey}' is managed by command(s): ${cmd}. Use the command API instead of unpublish action.`,
          409,
          ctx.requestId
        );
      }
      const before = await getRecord(workspaceId, objectKey, recordId, { visibilityScope: visibilityScopeFor(ctx) });
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
