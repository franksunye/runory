import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { queryOne, writeAuditEvent, TABLES, type RequestContext } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { handleError, notFound, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// Blobs live under apps/cloud/data/uploads (cwd-relative). See the upload
// route for the storage layout.
const UPLOADS_ROOT = resolve(process.cwd(), "data", "uploads");

interface AttachmentRow {
  id: string;
  workspace_id: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  let ctx: RequestContext;
  let workspaceId: string;
  try {
    const { id } = await params;
    // Spec §7: "validate workspace membership on every mobile API and
    // attachment request". Download is a read → viewer role is sufficient.
    const resolved = await requireWorkspaceContext(request, id, "viewer");
    ctx = resolved.ctx;
    workspaceId = resolved.workspaceId;
  } catch (e) {
    return handleError(e, requestId);
  }

  try {
    const { attachmentId } = await params;

    // Spec §7: validate the attachment belongs to this workspace. Querying by
    // (id, workspace_id) makes cross-workspace access impossible even if an
    // attacker guesses another workspace's attachment id.
    const row = await queryOne<AttachmentRow>(
      `SELECT id, workspace_id, file_name, content_type, size_bytes, storage_path
       FROM ${TABLES.attachments}
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
      [attachmentId, workspaceId]
    );

    if (!row || !row.storage_path) {
      return notFound(
        `Attachment ${attachmentId} not found in this workspace`,
        ctx.requestId
      );
    }

    // Resolve the blob path. storage_path is stored as
    // "<workspaceId>/<attachmentId>"; we resolve it strictly under the
    // uploads root to prevent path traversal.
    const uploadsRoot = UPLOADS_ROOT + sep;
    const blobPath = resolve(UPLOADS_ROOT, row.storage_path);
    if (!blobPath.startsWith(uploadsRoot)) {
      return notFound("Attachment not found", ctx.requestId);
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(blobPath);
    } catch {
      return notFound(
        `Attachment blob for ${attachmentId} is missing on disk`,
        ctx.requestId
      );
    }

    const contentType = row.content_type ?? "application/octet-stream";

    // Audit event — per v0.5.1 Spec §7: "audit evidence download, form submission,
    // Quote output generation, and governed commands."
    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "attachment.download",
      entityType: "attachment",
      entityId: attachmentId,
      before: null,
      after: { file_name: row.file_name, content_type: contentType, size: row.size_bytes },
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write attachment.download audit event:", err);
    });

    // Spec §5.3: attachments are network-only — never cached. Wrap the Buffer
    // in a Uint8Array so it satisfies the fetch BodyInit contract under the
    // DOM lib types.
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(
          row.size_bytes ?? bytes.byteLength
        ),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        // Inline disposition keeps images/PDFs renderable in the browser;
        // the filename is provided so "Save As" uses the original name.
        "Content-Disposition": `inline; filename="${encodeFilename(row.file_name)}"`,
        "x-request-id": ctx.requestId,
      },
    });
  } catch (e) {
    return handleError(e, ctx.requestId);
  }
}

// Encode a filename for the Content-Disposition header per RFC 6266. Falls
// back to ASCII when the name contains characters that would break the
// quoted-string form.
function encodeFilename(name: string): string {
  const safe = name.replace(/["\\]/g, "").replace(/[\r\n]/g, "").trim();
  return safe || "attachment";
}
