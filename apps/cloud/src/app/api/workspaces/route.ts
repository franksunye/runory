import { NextRequest } from "next/server";
import { createWorkspace, listUserWorkspaces, enforceQuota } from "@runory/platform-core";
import { getRequestActor, requirePrincipal } from "@/lib/auth";
import { successResponse, handleError, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces — list workspaces accessible to the current user
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    // requirePrincipal falls back to dev bootstrap in local dev, so MCP
    // clients (which carry no session cookie) can list workspaces. In
    // production, unauthenticated requests receive a 401.
    const principal = await requirePrincipal(request);
    const workspaces = await listUserWorkspaces(principal.userId);
    return successResponse({ workspaces }, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const body = (await request.json()) as { name?: string; templateId?: string; organizationId?: string };
    if (!body.name || typeof body.name !== "string") {
      return invalidInput("name is required", requestId);
    }
    if (body.organizationId) await enforceQuota(body.organizationId, "workspaces");
    const workspace = await createWorkspace(body.name, body.templateId, await getRequestActor(request));
    return successResponse(workspace, 201, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
