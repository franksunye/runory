import { NextRequest } from "next/server";
import {
  issueCustomerAccessGrant,
  requireBusinessPermission,
  queryAll,
  TABLES,
  type CommandActor,
  type CustomerAccessGrantRecord,
} from "@runory/platform-core";
import type {
  CustomerAccessCapability,
  CustomerAccessIssueInput,
  CustomerAccessRootObjectType,
  CustomerAccessSubjectType,
} from "@runory/contracts";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

// ── Safe grant metadata projection (Tech Spec §8.1) ──
//
// The list and issue responses MUST NEVER expose `token_hash` (or the raw
// token). Only non-sensitive grant metadata is returned to the caller.

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

// ── GET: List all grants for the workspace (customer_access.read) ──

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    await requireBusinessPermission(ctx, "customer_access.read");

    const rows = await queryAll<CustomerAccessGrantRecord>(
      `SELECT * FROM ${TABLES.customerAccessGrants}
       WHERE workspace_id = ?
       ORDER BY created_at DESC`,
      [workspaceId],
    );

    const grants = rows.map(toGrantMetadata);
    return successResponse(grants, 200, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}

// ── POST: Issue a new grant (customer_access.manage) ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    await requireBusinessPermission(ctx, "customer_access.manage");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidInput("Invalid request body", ctx.requestId);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidInput("Request body must be an object", ctx.requestId);
    }

    const b = body as {
      subjectType?: unknown;
      subjectId?: unknown;
      rootObjectType?: unknown;
      rootRecordId?: unknown;
      capabilities?: unknown;
      expiresAt?: unknown;
    };

    if (
      typeof b.subjectType !== "string" || !b.subjectType ||
      typeof b.subjectId !== "string" || !b.subjectId ||
      typeof b.rootObjectType !== "string" || !b.rootObjectType ||
      typeof b.rootRecordId !== "string" || !b.rootRecordId ||
      !Array.isArray(b.capabilities) || b.capabilities.length === 0 ||
      typeof b.expiresAt !== "string" || !b.expiresAt
    ) {
      return invalidInput(
        "subjectType, subjectId, rootObjectType, rootRecordId, capabilities (non-empty array), and expiresAt are required",
        ctx.requestId,
      );
    }

    const publicBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    const input: CustomerAccessIssueInput = {
      subjectType: b.subjectType as CustomerAccessSubjectType,
      subjectId: b.subjectId,
      rootObjectType: b.rootObjectType as CustomerAccessRootObjectType,
      rootRecordId: b.rootRecordId,
      capabilities: b.capabilities as CustomerAccessCapability[],
      expiresAt: b.expiresAt,
    };

    const result = await issueCustomerAccessGrant(
      workspaceId,
      actor,
      input,
      publicBaseUrl,
    );

    // accessUrl (carrying the raw token) is returned exactly once (Spec §8.1).
    const grant = toGrantMetadata(result.commandResult.aggregate);
    return successResponse({ grant, accessUrl: result.accessUrl }, 201, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
