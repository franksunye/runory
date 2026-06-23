import { NextRequest } from "next/server";
import { z } from "zod";
import { getWorkspace, updateWorkspaceName, writeAuditEvent, NotFoundError } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, notFound, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx } = await requireWorkspaceContext(request, id, "viewer");
    const workspace = await getWorkspace(id);
    if (!workspace) {
      return notFound(`Workspace ${id} not found`, ctx.requestId);
    }
    return successResponse(
      {
        ...workspace,
        organizationId: ctx.organizationId,
        organizationRole: ctx.organizationRole,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = (await request.json()) as { name: string };
    const parsed = updateWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return invalidInput(parsed.error.message, ctx.requestId);
    }

    const before = await getWorkspace(workspaceId);
    if (!before) throw new NotFoundError("Workspace not found");

    const updated = await updateWorkspaceName(workspaceId, parsed.data.name, ctx.principal!.userId);

    await writeAuditEvent({
      workspaceId,
      actorType: "user",
      actorId: ctx.principal!.userId,
      action: "record.update",
      entityType: "workspace",
      entityId: workspaceId,
      before: { name: before.name },
      after: { name: updated.name },
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });

    return successResponse(
      {
        ...updated,
        organizationId: ctx.organizationId,
        organizationRole: ctx.organizationRole,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
