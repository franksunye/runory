import { NextRequest } from "next/server";
import { seedDevCatalog } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/platform/catalog/seed — import and publish all dev catalog items
//
// Development convenience: reads all manifests from catalog/ directory,
// imports them, freezes them, and promotes through internal → beta → stable
// channels so they appear on the workspace modules installation page.
export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  const startedAt = Date.now();
  try {
    const { principal } = await requirePlatformAdmin(request);
    console.info("[catalog:seed] started", { requestId, userId: principal.userId });
    const result = await seedDevCatalog(principal);
    console.info("[catalog:seed] completed", {
      requestId,
      durationMs: Date.now() - startedAt,
      imported: result.imported.length,
      published: result.published.length,
      skipped: result.skipped.length,
      errors: result.errors.length,
    });
    return successResponse(result, 200, requestId);
  } catch (e) {
    console.error("[catalog:seed] failed", {
      requestId,
      durationMs: Date.now() - startedAt,
    });
    return handleError(e, requestId);
  }
}
