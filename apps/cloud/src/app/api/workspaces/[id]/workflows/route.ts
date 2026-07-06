import { NextRequest } from "next/server";
import {
  TABLES,
  queryAll,
  publishWorkflowDefinition,
  writeAuditEvent,
  type WorkflowDefinition,
} from "@runory/platform-core";
import type { WorkflowDefinitionV2 } from "@runory/contracts";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

interface V2DefinitionRow {
  id: string;
  workspace_id: string;
  workflow_key: string;
  name: string;
  target_object: string;
  active_version_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface V2VersionRow {
  id: string;
  definition_json: string;
  version_number: number;
}

/**
 * GET /api/workspaces/[id]/workflows
 *
 * V2-only: returns all published V2 workflow definitions for the workspace,
 * each with its active version's parsed step-based definition. Mirrors the
 * definitions-v2 route but is exposed on the canonical workflows path.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const rows = await queryAll<V2DefinitionRow>(
      `SELECT id, workspace_id, workflow_key, name, target_object,
              active_version_id, status, created_at, updated_at
       FROM ${TABLES.workflowDefinitionsV2}
       WHERE workspace_id = ?
       ORDER BY created_at ASC`,
      [workspaceId]
    );

    if (rows.length === 0) {
      return successResponse([], 200, ctx.requestId);
    }

    // Fetch the active version definition_json for each definition.
    const versionIds = rows
      .map((r) => r.active_version_id)
      .filter((v): v is string => Boolean(v));

    const versionRows = versionIds.length
      ? await queryAll<V2VersionRow>(
          `SELECT id, definition_json, version_number
           FROM ${TABLES.workflowDefinitionVersions}
           WHERE id IN (${versionIds.map(() => "?").join(", ")})`,
          versionIds
        )
      : [];

    const versionMap = new Map(versionRows.map((v) => [v.id, v]));

    const merged = rows
      .map((r) => {
        if (!r.active_version_id) return null;
        const version = versionMap.get(r.active_version_id);
        if (!version) return null;
        let definition: WorkflowDefinitionV2 | null = null;
        try {
          definition = JSON.parse(version.definition_json) as WorkflowDefinitionV2;
        } catch {
          definition = null;
        }
        if (!definition) return null;
        return {
          id: r.id,
          workspaceId: r.workspace_id,
          workflowKey: r.workflow_key,
          name: r.name,
          targetObject: r.target_object,
          status: r.status,
          versionNumber: version.version_number,
          definition,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    return successResponse(merged, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

/**
 * POST /api/workspaces/[id]/workflows
 *
 * V2-only: accepts a V2 step-based workflow definition
 * ({ workflowKey, name, targetObject, initialState, steps }) and publishes it
 * as a new (or updated) versioned V2 workflow definition.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidInput("Workflow definition must be an object", ctx.requestId);
    }

    const def = body as Partial<WorkflowDefinition>;
    if (
      typeof def.workflowKey !== "string" || !def.workflowKey ||
      typeof def.name !== "string" || !def.name ||
      typeof def.targetObject !== "string" || !def.targetObject ||
      typeof def.initialState !== "string" || !def.initialState ||
      !Array.isArray(def.steps)
    ) {
      return invalidInput(
        "Workflow definition must include workflowKey, name, targetObject, initialState, and steps",
        ctx.requestId
      );
    }

    const publishedBy = ctx.principal?.userId ?? null;
    const result = await publishWorkflowDefinition(
      workspaceId,
      def as WorkflowDefinition,
      publishedBy
    );

    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: result.versionNumber === 1 ? "workflow.definition.create" : "workflow.definition.update",
      entityType: "workflow_definition",
      entityId: result.definitionId,
      after: { ...result, workflowKey: def.workflowKey } as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });

    return successResponse(result, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
