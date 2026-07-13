import { NextRequest } from "next/server";
import { getMigrationStatus } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/admin/migrations — returns migration status (platform admins only)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const status = await getMigrationStatus();

    return successResponse(status, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
