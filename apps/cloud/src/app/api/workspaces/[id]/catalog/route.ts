import { NextRequest } from "next/server";
import {
  listCatalogItems,
  getActiveReleaseForItem,
  type CatalogItem,
  type CatalogRelease,
  type CatalogVersion,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
  METADATA_CACHE,
} from "@/lib/http";

export const dynamic = "force-dynamic";

interface AvailableCatalogItem {
  item: CatalogItem;
  release: CatalogRelease;
  version: CatalogVersion;
}

// GET /api/workspaces/[id]/catalog — list available catalog items
// (items with active releases in the stable channel)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx } = await requireWorkspaceContext(request, id, "viewer");

    const items = await listCatalogItems({ status: "active" });

    const available: AvailableCatalogItem[] = [];
    for (const item of items) {
      const active = await getActiveReleaseForItem(item.id, "stable");
      if (active) {
        available.push({
          item,
          release: active.release,
          version: active.version,
        });
      }
    }

    return successResponse(available, 200, ctx.requestId, METADATA_CACHE);
  } catch (e) {
    return handleError(e, requestId);
  }
}
