import { NextRequest } from "next/server";
import { queryOne, writeAuditEvent, TABLES, type RequestContext } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { handleError, notFound, getOrCreateRequestId } from "@/lib/http";
import { createAttachmentStorage } from "@/lib/attachment-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    // Storage is consulted only after the Workspace and metadata row have
    // passed authorization. Private Blob URLs never reach the browser.
    const body = await createAttachmentStorage().get(workspaceId, row.storage_path);
    if (!body) return notFound("Attachment content is unavailable", ctx.requestId);

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

    // Stream the server-authenticated body without buffering it in a Function.
    return new Response(body.stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.size),
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Pragma": "no-cache",
        "Expires": "0",
        // Inline disposition keeps images/PDFs renderable in the browser;
        // the filename is provided so "Save As" uses the original name.
        "Content-Disposition": contentDisposition(row.file_name),
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
function contentDisposition(name: string): string {
  const safe = name.replace(/["\\]/g, "").replace(/[\r\n]/g, "").trim();
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_") || "attachment";
  const encoded = encodeURIComponent(safe || "attachment").replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
