import { NextRequest } from "next/server";
import {
  revokeCustomerAccessGrant,
  requireBusinessPermission,
  InvalidInputError,
  type CommandActor,
  type CustomerAccessGrantRecord,
} from "@runory/platform-core";
import type {
  CustomerAccessCapability,
  CustomerAccessRootObjectType,
  CustomerAccessSubjectType,
} from "@runory/contracts";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// ── Safe grant metadata projection (Tech Spec §8.1) ──
//
// The revoke response MUST NEVER expose `token_hash` (or the raw token). Only
// non-sensitive grant metadata is returned to the caller.

interface GrantMetadata {
  id: string;
  subject_type: CustomerAccessSubjectType;
  subject_id: string;
  root_object_type: CustomerAccessRootObjectType;
  root_record_id: string;
  capabilities: CustomerAccessCapability[];
  status: "active" | "revoked" | "expired";
  expires_at: string;
  first_accessed_at: string | null;
  last_accessed_at: string | null;
  revoked_at: string | null;
  created_by: string;
  aggregate_version: number;
  created_at: string;
}

function toGrantMetadata(grant: CustomerAccessGrantRecord): GrantMetadata {
  return {
    id: grant.id,
    subject_type: grant.subject_type,
    subject_id: grant.subject_id,
    root_object_type: grant.root_object_type,
    root_record_id: grant.root_record_id,
    capabilities: JSON.parse(grant.capabilities_json) as CustomerAccessCapability[],
    status: grant.status,
    expires_at: grant.expires_at,
    first_accessed_at: grant.first_accessed_at,
    last_accessed_at: grant.last_accessed_at,
    revoked_at: grant.revoked_at,
    created_by: grant.created_by,
    aggregate_version: grant.aggregate_version,
    created_at: grant.created_at,
  };
}

// ── POST: Revoke a grant (customer_access.manage) ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grantId: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, grantId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    await requireBusinessPermission(ctx, "customer_access.manage");

    const body = (await request.json()) as { expectedVersion?: unknown };

    if (typeof body.expectedVersion !== "number" || !Number.isFinite(body.expectedVersion)) {
      throw new InvalidInputError("expectedVersion must be a finite number");
    }

    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    const result = await revokeCustomerAccessGrant(
      workspaceId,
      grantId,
      actor,
      body.expectedVersion,
    );

    const grant = toGrantMetadata(result.aggregate);
    return successResponse(grant, 200, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
