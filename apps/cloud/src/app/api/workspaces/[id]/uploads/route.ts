import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  genId,
  now,
  queryOne,
  execute,
  writeAuditEvent,
  TABLES,
  type RequestContext,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// ── Upload policy (Spec §7 Security Gates) ──
//
// "apply upload type/size limits and malware scanning policy before production
// pilot". The content-type whitelist and 10 MB ceiling are enforced here on
// the server, independent of any client-side hints, so a forged request cannot
// bypass them.

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
]);

// Directory where blobs are persisted on disk. Relative to the cloud app's
// working directory (apps/cloud), so it resolves to apps/cloud/data/uploads.
// `data/` is git-ignored, so uploaded blobs never leak into version control.
const UPLOADS_ROOT = resolve(process.cwd(), "data", "uploads");

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

function toAttachmentResponse(row: AttachmentRow) {
  return {
    attachmentId: row.id,
    fileName: row.file_name,
    contentType: row.content_type ?? "application/octet-stream",
    size: row.size_bytes ?? 0,
    uploadedAt: row.created_at,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  let ctx: RequestContext;
  let workspaceId: string;
  try {
    const { id } = await params;
    // Spec §7: "validate workspace membership on every mobile API and
    // attachment request". Uploading is a write → requires workspace member.
    const resolved = await requireWorkspaceContext(request, id, "member");
    ctx = resolved.ctx;
    workspaceId = resolved.workspaceId;
  } catch (e) {
    return handleError(e, requestId);
  }

  try {
    // Reject obviously oversized payloads before parsing the body. We compare
    // against the Content-Length header as an early gate; the real size check
    // happens on the parsed File.
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength && contentLength > MAX_FILE_SIZE_BYTES * 1.1 + 8192) {
      return invalidInput(
        `Upload exceeds the ${MAX_FILE_SIZE_BYTES} byte limit`,
        ctx.requestId
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return invalidInput(
        "Request must be multipart/form-data with a 'file' field",
        ctx.requestId
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return invalidInput(
        "Missing 'file' field in multipart form data",
        ctx.requestId
      );
    }

    // Spec §5.5: "Server verifies content type, size, authorization, and
    // integrity metadata."
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return invalidInput(
        `Unsupported content type '${contentType}'. Allowed: ${[
          ...ALLOWED_CONTENT_TYPES,
        ].join(", ")}`,
        ctx.requestId
      );
    }

    if (file.size <= 0) {
      return invalidInput("Uploaded file is empty", ctx.requestId);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return invalidInput(
        `File is ${file.size} bytes; the limit is ${MAX_FILE_SIZE_BYTES} bytes`,
        ctx.requestId
      );
    }

    // Optional subject association (Spec §5.5: evidence is associated with the
    // submission revision and the Visit/Work Item subject).
    const workItemId = stringOrNull(formData.get("workItemId"));
    const formSubmissionId = stringOrNull(formData.get("formSubmissionId"));

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Integrity metadata (sha256). Also the idempotency key: a retry of the
    // same content within a workspace resolves to the existing attachment
    // instead of duplicating storage (Spec §5.5: "Retrying an attachment
    // association MUST be idempotent").
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const existing = await queryOne<AttachmentRow>(
      `SELECT id, workspace_id, file_name, content_type, size_bytes,
              storage_path, uploaded_by, work_item_id, form_submission_id, created_at
       FROM ${TABLES.attachments}
       WHERE workspace_id = ? AND sha256 = ? AND deleted_at IS NULL
       LIMIT 1`,
      [workspaceId, sha256]
    );
    if (existing) {
      // Idempotent retry: same content already stored for this workspace.
      return successResponse(
        toAttachmentResponse(existing),
        200,
        ctx.requestId
      );
    }

    // Persist the blob to disk under a workspace-scoped directory.
    const attachmentId = genId("att");
    const dir = resolve(UPLOADS_ROOT, workspaceId);
    await mkdir(dir, { recursive: true });
    // Store under the attachment id (no user-supplied filename on disk) to
    // avoid path-traversal and filesystem-encoding issues. The original file
    // name is preserved as metadata in the attachments row.
    const storagePath = `${workspaceId}/${attachmentId}`;
    await writeFile(resolve(UPLOADS_ROOT, storagePath), bytes);

    const uploadedAt = now();
    const uploadedBy = ctx.principal?.userId ?? null;

    // Insert the metadata row. We populate both the canonical v0.5.1 columns
    // (size_bytes, storage_path, work_item_id, form_submission_id) and the
    // 0024-era columns (owner_type, owner_id, storage_key, byte_size, sha256)
    // so the table stays consistent for any consumer.
    await execute(
      `INSERT INTO ${TABLES.attachments}
        (id, workspace_id, file_name, content_type, size_bytes, storage_path,
         uploaded_by, work_item_id, form_submission_id, created_at,
         owner_type, owner_id, storage_key, byte_size, sha256, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        attachmentId,
        workspaceId,
        file.name,
        contentType,
        file.size,
        storagePath,
        uploadedBy,
        workItemId,
        formSubmissionId,
        uploadedAt,
        // 0024-era columns
        "evidence_block",
        formSubmissionId ?? workItemId ?? attachmentId,
        storagePath,
        file.size,
        sha256,
      ]
    );

    await writeAuditEvent({
      workspaceId,
      actorType: "user",
      actorId: uploadedBy ?? "unknown",
      action: "record.create",
      entityType: "attachment",
      entityId: attachmentId,
      after: {
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
        sha256,
        workItemId,
        formSubmissionId,
      },
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write attachment audit event:", err);
    });

    return successResponse(
      {
        attachmentId,
        fileName: file.name,
        contentType,
        size: file.size,
        uploadedAt,
      },
      201,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, ctx.requestId);
  }
}

function stringOrNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}
