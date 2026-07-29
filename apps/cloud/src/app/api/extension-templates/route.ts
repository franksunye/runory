import { NextRequest } from "next/server";
import { listExtensionTemplates, listExtensionTemplatesByCategory, listExtensionTemplatesForSolution } from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/extension-templates — list available extension templates.
 *
 * Query params:
 *   - category=<category>    Filter by category (e.g., "customer", "field-service")
 *   - solutionType=<type>    Filter by compatible solution type
 */
export async function GET(request: NextRequest) {
  try {
    await requirePrincipal(request);
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const solutionType = url.searchParams.get("solutionType");

    let templates;
    if (category) {
      templates = listExtensionTemplatesByCategory(category);
    } else if (solutionType) {
      templates = listExtensionTemplatesForSolution(solutionType);
    } else {
      templates = listExtensionTemplates();
    }

    return successResponse(templates);
  } catch (e) {
    return handleError(e);
  }
}
