import { NextRequest } from "next/server";
import { getCatalogItem } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/catalog/[itemId] — get catalog item by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const { itemId } = await params;
    const item = await getCatalogItem(itemId);

    return successResponse(item, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
