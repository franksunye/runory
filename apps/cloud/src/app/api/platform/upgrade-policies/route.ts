import { NextRequest } from "next/server";
import {
  listPolicies,
  publishDefaultPolicies,
} from "@runory/platform-core";
import type { PolicyType } from "@runory/contracts";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/platform/upgrade-policies — list policies (query: type)
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const type = request.nextUrl.searchParams.get("type") as PolicyType | null;
    const policies = await listPolicies(type ?? undefined);

    return successResponse(policies, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// POST /api/platform/upgrade-policies — publish default policies
export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { principal } = await requirePlatformAdmin(request);

    const policies = await publishDefaultPolicies(principal);

    return successResponse(policies, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
