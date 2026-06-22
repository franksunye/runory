import { NextRequest } from "next/server";
import { extensionPlanSchema, type ExtensionPlan } from "@runory/contracts";
import { previewExtension } from "@runory/platform-core";
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
    const { workspaceId } = await requireWorkspaceAccess(request, id, "admin");
    const body = await request.json();
    const parsed = extensionPlanSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return invalidInput(errors.join("; "), requestId);
    }
    const plan = parsed.data as ExtensionPlan;
    const preview = await previewExtension(workspaceId, plan);
    return successResponse(preview, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
