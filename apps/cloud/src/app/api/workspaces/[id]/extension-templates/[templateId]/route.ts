import { NextRequest } from "next/server";
import { loadExtensionTemplate } from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspaces/[id]/extension-templates/[templateId] — get template details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  try {
    await requirePrincipal(request);
    const { templateId } = await params;

    const template = loadExtensionTemplate(templateId);
    if (!template) {
      return handleError(new Error(`Extension template not found: ${templateId}`));
    }

    return successResponse(template);
  } catch (e) {
    return handleError(e);
  }
}
