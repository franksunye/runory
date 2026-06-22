import { NextRequest } from "next/server";
import { scheduleOrganizationDeletion } from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { principal, membership } = await requireOrganizationAccess(request, id);
    if (membership.role !== "owner") {
      return new Response(JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "Only organization owner can delete", requestId } }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
    const body = await request.json() as { confirmationCode: string };
    const job = await scheduleOrganizationDeletion(id, principal.userId, body.confirmationCode);
    return successResponse(job, 201, requestId);
  } catch (e) { return handleError(e, requestId); }
}
