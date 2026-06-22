import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiKey, listApiKeys, writeAuditEvent } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional().default([]),
  expiresAt: z.string().datetime().nullable().optional(),
});

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
    const parsed = createApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return invalidInput(parsed.error.message, ctx.requestId);
    }
    const key = await createApiKey(workspaceId, ctx.principal!.userId, parsed.data);
    writeAuditEvent({
      workspaceId,
      actorType: "user",
      actorId: ctx.principal!.userId,
      action: "api_key.create",
      entityType: "api_key",
      entityId: key.id,
      after: { name: key.name, scopes: key.scopes, keyPrefix: key.keyPrefix },
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
    return successResponse(key, 201, ctx.requestId);
  } catch (e) { return handleError(e, requestId); }
}
