import { NextRequest } from "next/server";
import { createApiKey, listApiKeys, writeAuditEvent } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const keys = await listApiKeys(workspaceId, ctx.principal!.userId);
    return successResponse(keys, 200, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as { name: string; scopes: string[]; expiresAt?: string | null };
    const key = await createApiKey(workspaceId, ctx.principal!.userId, body);
    writeAuditEvent({
      workspaceId,
      actorType: "user",
      actorId: ctx.principal!.userId,
      action: "api_key.create",
      entityType: "api_key",
      entityId: key.id,
      after: { name: key.name, scopes: key.scopes, keyPrefix: key.keyPrefix },
      requestId: ctx.requestId,
    }).catch(() => {});
    return successResponse(key, 201, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}
