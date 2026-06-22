import { NextRequest } from "next/server";
import { deleteUserAccount } from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const principal = await requirePrincipal(request);
    await deleteUserAccount(principal.userId);
    return successResponse({ success: true }, 200, requestId);
  } catch (e) { return handleError(e, requestId); }
}
