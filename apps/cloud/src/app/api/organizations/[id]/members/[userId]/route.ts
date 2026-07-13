import { NextRequest } from "next/server";
import {
  _clearAccessCache,
  updateOrganizationMemberRole,
  removeOrganizationMember,
} from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// PATCH /api/organizations/:id/members/:userId — update role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const p = await params;
    const { principal, membership } = await requireOrganizationAccess(
      request,
      p.id
    );

    const body = (await request.json()) as { role: "member" | "admin" };
    if (body.role !== "member" && body.role !== "admin") {
      return invalidInput("Role must be member or admin", requestId);
    }

    await updateOrganizationMemberRole(
      p.id,
      p.userId,
      body.role,
      principal.userId,
      membership.role
    );
    _clearAccessCache();

    return successResponse({ success: true }, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// DELETE /api/organizations/:id/members/:userId — remove member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const p = await params;
    const { principal, membership } = await requireOrganizationAccess(
      request,
      p.id
    );

    await removeOrganizationMember(
      p.id,
      p.userId,
      principal.userId,
      membership.role
    );
    _clearAccessCache();

    return successResponse({ success: true }, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
