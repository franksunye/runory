import { NextRequest } from "next/server";
import {
  listCatalogItems,
  importFromDevCatalog,
  type CatalogItemType,
} from "@runory/platform-core";
import { getCurrentPrincipal } from "@/lib/auth";
import {
  successResponse,
  handleError,
  forbidden,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/catalog — list catalog items (query: itemType, status)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const itemType = request.nextUrl.searchParams.get("itemType") as
      | CatalogItemType
      | null;
    const status = request.nextUrl.searchParams.get("status") as
      | "active"
      | "archived"
      | null;

    const items = await listCatalogItems({
      ...(itemType ? { itemType } : {}),
      ...(status ? { status } : {}),
    });

    return successResponse(items, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// POST /api/platform/catalog — import catalog candidate from dev catalog
export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await getCurrentPrincipal(request);
    if (!principal) return forbidden("Access denied", requestId);

    const body = (await request.json()) as {
      itemId: string;
      itemType: CatalogItemType;
    };
    const result = await importFromDevCatalog(
      principal,
      body.itemId,
      body.itemType
    );

    return successResponse(result, 201, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
