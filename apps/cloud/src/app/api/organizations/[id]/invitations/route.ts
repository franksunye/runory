import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createInvitation,
  listOrganizationInvitations,
} from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  email: z.string().email(),
  organizationRole: z.enum(["member", "admin"]),
  workspaceGrants: z.array(z.object({
    workspaceId: z.string(),
    workspaceRole: z.enum(["admin", "member", "viewer"]),
  })).optional(),
});

// GET /api/organizations/:id/invitations — list invitations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const organizationId = (await params).id;
    const { membership } = await requireOrganizationAccess(request, organizationId);
    const invitations = await listOrganizationInvitations(
      organizationId,
      membership.role
    );
    return successResponse(invitations, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// POST /api/organizations/:id/invitations — create invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const organizationId = (await params).id;
    const { principal, membership } = await requireOrganizationAccess(
      request,
      organizationId
    );

    const body = (await request.json()) as {
      email: string;
      organizationRole: "member" | "admin";
      workspaceGrants?: Array<{ workspaceId: string; workspaceRole: "admin" | "member" | "viewer" }>;
    };
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return invalidInput(parsed.error.message, requestId);
    }

    const { invitation, token } = await createInvitation(
      organizationId,
      principal.userId,
      membership.role,
      {
        email: parsed.data.email,
        organizationRole: parsed.data.organizationRole,
        workspaceGrants: parsed.data.workspaceGrants,
      }
    );

    // In production: send email with the invitation link.
    // In dev: return the raw token for testing.
    const devToken = process.env.NODE_ENV !== "production" ? token : undefined;

    return successResponse(
      {
        id: invitation.id,
        email: invitation.emailNormalized,
        role: invitation.organizationRole,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        workspaceGrants: invitation.workspaceGrants,
        devToken,
      },
      201,
      requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
