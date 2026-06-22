import { NextRequest } from "next/server";
import { z } from "zod";
import {
  listCatalogItems,
  importFromDevCatalog,
  type CatalogItemType,
} from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

const importCatalogSchema = z.object({
  itemId: z.string().min(1),
  itemType: z.enum(["module", "pack", "template"]),
});

// GET /api/platform/catalog — list catalog items (query: itemType, status)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { principal } = await requirePlatformAdmin(request);

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
    const { principal } = await requirePlatformAdmin(request);

    const body = (await request.json()) as {
      itemId: string;
      itemType: CatalogItemType;
    };
    const parsed = importCatalogSchema.safeParse(body);
    if (!parsed.success) {
      return invalidInput(parsed.error.message, requestId);
    }
    const result = await importFromDevCatalog(
      principal,
      parsed.data.itemId,
      parsed.data.itemType
    );

    return successResponse(result, 201, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
