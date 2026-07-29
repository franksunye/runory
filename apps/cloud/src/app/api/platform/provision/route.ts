import { NextRequest } from "next/server";
import {
  provisionWorkspace,
  applyReferenceSolution,
  listProvisionedWorkspaces,
} from "@runory/platform-core";
import { requirePlatformAdmin, getRequestActor } from "@/lib/auth";
import { successResponse, handleError, invalidInput } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/platform/provision — list provisioned workspaces with pack counts
 * and demo data status. Supports the repeatability metrics dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request);
    const workspaces = await listProvisionedWorkspaces();
    return successResponse({ workspaces });
  } catch (e) {
    const { requestId } = await requirePlatformAdmin(request).catch(() => ({ requestId: "" }));
    return handleError(e, requestId);
  }
}

/**
 * POST /api/platform/provision — provision a workspace from a declarative
 * specification. Combines workspace creation, pack installation, extension
 * configuration, and command contract sync into a single operation.
 *
 * Body options:
 *   - { mode: "spec", spec: ProvisioningSpec } — provision from inline spec
 *   - { mode: "reference", solution: ReferenceSolution } — apply a reference solution
 *   - { mode: "reference", solution: ReferenceSolution, existingWorkspaceId: string }
 *     — apply to an existing workspace
 */
export async function POST(request: NextRequest) {
  try {
    const { principal, requestId } = await requirePlatformAdmin(request);
    const body = await request.json();

    if (body.mode === "reference" && body.solution) {
      const actor = await getRequestActor(request);
      const result = await applyReferenceSolution(
        body.solution,
        actor,
        body.existingWorkspaceId ? { existingWorkspaceId: body.existingWorkspaceId } : undefined,
      );
      return successResponse(result, 201, requestId);
    }

    if (body.spec) {
      if (!body.spec.workspaceName || typeof body.spec.workspaceName !== "string") {
        return invalidInput("spec.workspaceName is required", requestId);
      }
      if (!Array.isArray(body.spec.packs)) {
        return invalidInput("spec.packs must be an array", requestId);
      }
      const actor = await getRequestActor(request);
      const result = await provisionWorkspace(
        body.spec,
        actor,
        body.existingWorkspaceId ? { existingWorkspaceId: body.existingWorkspaceId } : undefined,
      );
      return successResponse(result, 201, requestId);
    }

    return invalidInput("Provide either { mode: 'reference', solution: ... } or { spec: ... }", requestId);
  } catch (e) {
    try {
      const { requestId } = await requirePlatformAdmin(request);
      return handleError(e, requestId);
    } catch (e2) {
      return handleError(e2);
    }
  }
}
