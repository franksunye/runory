import { NextRequest } from "next/server";
import {
  resolveWidgetsBatch,
  type WidgetBatchRequestItem,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/workspaces/[id]/widgets/batch
// Resolve data for many widgets in a single request, sharing the expensive
// lookups (installations, manifests, layout overrides) across all widgets.
// Body: { items: WidgetBatchRequestItem[] }
//   item: { moduleId, widgetKey, instance, zone }
// Response: { results: WidgetBatchResult[] }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const body = await request.json();
    const items: WidgetBatchRequestItem[] = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      return successResponse({ results: [] }, 200, ctx.requestId);
    }

    // Cap batch size to prevent abuse.
    const capped = items.slice(0, 50);

    const results = await resolveWidgetsBatch(workspaceId, capped);

    return successResponse({ results }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
