import { NextRequest } from "next/server";
import { extensionPlanSchema, type ExtensionPlan } from "@runory/contracts";
import { applyExtension, writeAuditEvent, enforceQuota } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as { plan?: ExtensionPlan; createdBy?: string };
    if (!body.plan || !body.createdBy) {
      return invalidInput("plan and createdBy are required", ctx.requestId);
    }
    const parsed = extensionPlanSchema.safeParse(body.plan);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return invalidInput(errors.join("; "), ctx.requestId);
    }
    const plan = parsed.data as ExtensionPlan;
    if (ctx.organizationId) await enforceQuota(ctx.organizationId, "agent_operations");
    const version = await applyExtension(workspaceId, plan, ctx.principal!.userId);
    writeAuditEvent({
      workspaceId,
      actorType: "agent",
      actorId: ctx.principal!.userId,
      action: "extension.apply",
      entityType: "extension",
      entityId: version.extensionId,
      after: {
        version: version.version,
        riskLevel: version.riskLevel,
        changeSummary: version.changeSummary,
      },
      extensionVersionId: version.id,
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });
    return successResponse(version, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
