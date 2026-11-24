import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import {
  genId, now, queryOne, writeAuditEvent, TABLES, BusinessError, ERROR_CODES,
  type RequestContext,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";
import { createAttachmentStorage, compensateAttachmentWrite, type AttachmentStorage } from "@/lib/attachment-storage";
import { scanAttachment } from "@/lib/attachment-scan";
import { attachmentUploadPolicy } from "@/lib/attachment-upload-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AttachmentRow {
  id: string;
  workspace_id: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  uploaded_by: string | null;
  work_item_id: string | null;
  form_submission_id: string | null;
  created_at: string;
}

const SELECT_ATTACHMENT = `SELECT id, workspace_id, file_name, content_type, size_bytes,
  storage_path, uploaded_by, work_item_id, form_submission_id, created_at
  FROM ${TABLES.attachments}`;

function toAttachmentResponse(row: AttachmentRow) {
  return {
    attachmentId: row.id,
    fileName: row.file_name,
    contentType: row.content_type ?? "application/octet-stream",
    size: row.size_bytes ?? 0,
    uploadedAt: row.created_at,
  };
}

async function verifyExistingContent(storage: AttachmentStorage, workspaceId: string, row: AttachmentRow) {
  const body = row.storage_path ? await storage.get(workspaceId, row.storage_path) : null;
  if (!body) {
    throw new BusinessError(ERROR_CODES.INTERNAL_ERROR, "Previously uploaded attachment content is unavailable; storage repair is required", 503);
  }
  // A retry must not report success for a missing object or unmigrated local
  // file. Headers establish availability; no need to buffer the file again.
  await body.stream.cancel().catch(() => {});
}

/** The UI obtains the deployment's actual limit before sending file bytes. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx } = await requireWorkspaceContext(request, id, "viewer");
    return successResponse(attachmentUploadPolicy(), 200, ctx.requestId, "private, no-store");
  } catch (error) {
    return handleError(error, requestId);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  let ctx: RequestContext;
  let workspaceId: string;
  try {
    const { id } = await params;
    const resolved = await requireWorkspaceContext(request, id, "member");
    ctx = resolved.ctx;
    workspaceId = resolved.workspaceId;
  } catch (error) {
    return handleError(error, requestId);
  }

  try {
    const policy = attachmentUploadPolicy();
    const maxMiB = policy.maxFileSizeBytes / (1024 * 1024);
    const storage = createAttachmentStorage();
    const attachmentId = genId("att");
    // Misconfigured cloud deployments fail before parsing/scanning the upload.
    const stored = storage.prepare(workspaceId, attachmentId);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > policy.maxFileSizeBytes + 64 * 1024) {
      return invalidInput(`Upload exceeds the ${maxMiB} MiB file limit`, ctx.requestId);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return invalidInput("Request must be multipart/form-data with a 'file' field", ctx.requestId);
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return invalidInput("Missing 'file' field in multipart form data", ctx.requestId);
    }
    const contentType = file.type || "application/octet-stream";
    if (!policy.allowedContentTypes.includes(contentType)) {
      return invalidInput(`Unsupported content type '${contentType}'. Allowed: ${policy.allowedContentTypes.join(", ")}`, ctx.requestId);
    }
    if (file.size <= 0) return invalidInput("Uploaded file is empty", ctx.requestId);
    if (file.size > policy.maxFileSizeBytes) {
      return invalidInput(`File exceeds the ${maxMiB} MiB limit`, ctx.requestId);
    }

    const workItemId = stringOrNull(formData.get("workItemId"));
    const formSubmissionId = stringOrNull(formData.get("formSubmissionId"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    // A configured scanner must attest to these exact bytes. Errors fail closed.
    const scanStatus = await scanAttachment(bytes, contentType, sha256);
    const existing = await queryOne<AttachmentRow>(
      `${SELECT_ATTACHMENT} WHERE workspace_id = ? AND sha256 = ? AND deleted_at IS NULL LIMIT 1`,
      [workspaceId, sha256],
    );
    if (existing) {
      await verifyExistingContent(storage, workspaceId, existing);
      return successResponse(toAttachmentResponse(existing), 200, ctx.requestId);
    }

    try {
      await storage.put(workspaceId, stored, bytes, contentType);
    } catch (error) {
      // A failed request may have reached storage before the response was lost.
      // A pre-existing local path is never ours to remove.
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        await compensateAttachmentWrite(storage, workspaceId, stored.reference, ctx.requestId);
      }
      throw error;
    }

    const row: AttachmentRow = {
      id: attachmentId, workspace_id: workspaceId, file_name: file.name,
      content_type: contentType, size_bytes: file.size, storage_path: stored.reference,
      uploaded_by: ctx.principal?.userId ?? null,
      work_item_id: workItemId, form_submission_id: formSubmissionId, created_at: now(),
    };
    let outcome: { row: AttachmentRow; created: boolean };
    try {
      // The check and insert are one atomic SQL statement. This works across
      // instances and avoids concurrent long-lived write transactions in local
      // libsql. The losing retry cleans its own unique storage object below.
      const inserted = await queryOne<{ id: string }>(
          `INSERT INTO ${TABLES.attachments}
            (id, workspace_id, file_name, content_type, size_bytes, storage_path,
             uploaded_by, work_item_id, form_submission_id, created_at,
             owner_type, owner_id, storage_key, byte_size, sha256, deleted_at)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
            WHERE NOT EXISTS (SELECT 1 FROM ${TABLES.attachments}
              WHERE workspace_id = ? AND sha256 = ? AND deleted_at IS NULL)
            RETURNING id`,
          [row.id, workspaceId, row.file_name, contentType, file.size, stored.reference,
            row.uploaded_by, workItemId, formSubmissionId, row.created_at,
            "evidence_block", formSubmissionId ?? workItemId ?? row.id,
            stored.reference, file.size, sha256, workspaceId, sha256],
      );
      if (inserted) {
        outcome = { row, created: true };
      } else {
        const duplicate = await queryOne<AttachmentRow>(
          `${SELECT_ATTACHMENT} WHERE workspace_id = ? AND sha256 = ? AND deleted_at IS NULL LIMIT 1`,
          [workspaceId, sha256],
        );
        if (!duplicate) throw new Error("Attachment metadata changed during upload; retry the upload");
        outcome = { row: duplicate, created: false };
      }
    } catch (error) {
      // A remote database can commit and then lose the acknowledgement. Never
      // delete bytes referenced by a successful commit. If the DB is still
      // unavailable, retain the candidate and emit a reconciliation reference.
      let persisted: AttachmentRow | undefined;
      try {
        persisted = await queryOne<AttachmentRow>(
          `${SELECT_ATTACHMENT} WHERE id = ? AND workspace_id = ?`, [attachmentId, workspaceId],
        );
      } catch {
        console.error("[attachments:commit-reconciliation-required]", {
          workspaceId, attachmentId, reference: stored.reference, requestId: ctx.requestId,
        });
        throw error;
      }
      if (persisted?.storage_path === stored.reference) {
        outcome = { row: persisted, created: true };
      } else {
        await compensateAttachmentWrite(storage, workspaceId, stored.reference, ctx.requestId);
        throw error;
      }
    }

    if (!outcome.created) {
      await compensateAttachmentWrite(storage, workspaceId, stored.reference, ctx.requestId);
      await verifyExistingContent(storage, workspaceId, outcome.row);
      return successResponse(toAttachmentResponse(outcome.row), 200, ctx.requestId);
    }
    await writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: row.uploaded_by ?? "unknown", action: "record.create",
      entityType: "attachment", entityId: attachmentId,
      after: { fileName: file.name, contentType, sizeBytes: file.size, sha256, workItemId, formSubmissionId, scanStatus },
      requestId: ctx.requestId,
    }).catch(() => console.error("[audit] Failed to write attachment audit event", { requestId: ctx.requestId }));
    return successResponse(toAttachmentResponse(outcome.row), 201, ctx.requestId);
  } catch (error) {
    return handleError(error, ctx.requestId);
  }
}

function stringOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}
