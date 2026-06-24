import { NextRequest } from "next/server";
import { validateImport, importWorkspace, writeAuditEvent, type WorkspaceExportData } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/workspaces/[id]/import
// Validates and optionally imports a workspace export payload (v0.3.6).
// Body: { data: WorkspaceExportData, dryRun?: boolean }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as { data: unknown; dryRun?: boolean };

    if (!body.data) {
      return successResponse(
        { error: "Missing 'data' field in request body" },
        400,
        ctx.requestId
      );
    }

    // Step 1: Validate the import data
    const validation = validateImport(body.data);
    if (!validation.valid) {
      return successResponse(
        {
          valid: false,
          errors: validation.errors,
          warnings: validation.warnings,
          stats: validation.stats,
        },
        422,
        ctx.requestId
      );
    }

    // Step 2: Dry run returns validation result without applying
    if (body.dryRun) {
      return successResponse(
        {
          valid: true,
          dryRun: true,
          warnings: validation.warnings,
          stats: validation.stats,
          message: "Dry run completed. No changes were applied.",
        },
        200,
        ctx.requestId
      );
    }

    // Step 3: Apply the import
    const result = await importWorkspace(workspaceId, body.data as WorkspaceExportData, { dryRun: false });

    // Write audit event
    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "admin.import",
      entityType: "workspace",
      entityId: workspaceId,
      before: null,
      after: { imported: result.imported, stats: validation.stats },
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write import audit event:", err);
    });

    return successResponse(
      {
        valid: true,
        applied: true,
        imported: result.imported,
        warnings: validation.warnings,
        stats: validation.stats,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
