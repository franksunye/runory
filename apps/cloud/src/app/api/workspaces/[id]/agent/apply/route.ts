import { NextRequest } from "next/server";
import { extensionPlanSchema, type ExtensionPlan } from "@runory/contracts";
import { applyExtension } from "@runory/platform-core";
import { requireWorkspaceAccess } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { workspaceId, actor } = await requireWorkspaceAccess(request, id, "admin");
    const body = await request.json() as { plan?: ExtensionPlan; createdBy?: string };
    if (!body.plan || !body.createdBy) {
      return invalidInput("plan and createdBy are required", requestId);
    }
    const parsed = extensionPlanSchema.safeParse(body.plan);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return invalidInput(errors.join("; "), requestId);
    }
    const plan = parsed.data as ExtensionPlan;
    const version = await applyExtension(workspaceId, plan, actor.externalId);
    return successResponse(version, 201, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
