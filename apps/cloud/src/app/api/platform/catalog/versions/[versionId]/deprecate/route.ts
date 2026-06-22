import { NextRequest } from "next/server";
import { z } from "zod";
import {
  deprecateCatalogVersion,
  getCatalogVersion,
} from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

const deprecateSchema = z.object({
  reason: z.string().min(1),
});

// POST /api/platform/catalog/versions/[versionId]/deprecate — deprecate version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { principal } = await requirePlatformAdmin(request);

    const { versionId } = await params;
    const body = (await request.json()) as { reason: string };
    const parsed = deprecateSchema.safeParse(body);
    if (!parsed.success) {
      return invalidInput(parsed.error.message, requestId);
    }
    await deprecateCatalogVersion(principal, versionId, parsed.data.reason);
    const version = await getCatalogVersion(versionId);

    return successResponse(version, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
