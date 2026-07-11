import { NextRequest } from "next/server";
import {
  TABLES,
  queryAll,
  publishWorkflowDefinition,
  writeAuditEvent,
} from "@runory/platform-core";
import type { WorkflowDefinition } from "@runory/contracts";
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
  workflow_id: string;
  name: string;
  target_object: string;
  definition_json: string;
  created_at: string;
  updated_at: string;
}

interface V2VersionRow {
  id: string;
  workflow_definition_id: string;
  definition_json: string;
  version_number: number;
}

function parseDefinition(raw: string): WorkflowDefinition | null {
  try {
    return JSON.parse(raw) as WorkflowDefinition;
  } catch {
    return null;
  }
}

/**
 * GET /api/workspaces/[id]/workflows
 *
 * Returns all published workflow definitions for the workspace,
 * each with its active version's parsed step-based definition. Mirrors the
 * definitions route but is exposed on the canonical workflows path.
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
      `SELECT id, workspace_id, workflow_id, name, target_object,
              definition_json, created_at, updated_at
       FROM ${TABLES.workflowDefinitions}
       WHERE workspace_id = ?
       ORDER BY created_at ASC`,
      [workspaceId]
    );

    if (rows.length === 0) {
      return successResponse([], 200, ctx.requestId);
    }

    // The local v0.5 database stores the latest definition JSON on the
    // definition row, and keeps published snapshots in a versions table.
    // There is intentionally no `workflow_key` or `active_version_id` column
    // in this schema, so resolve the latest version by definition id.
    const versionRows = await queryAll<V2VersionRow>(
      `SELECT id, workflow_definition_id, definition_json, version_number
       FROM ${TABLES.workflowDefinitionVersions}
       WHERE workspace_id = ?
       ORDER BY workflow_definition_id ASC, version_number DESC`,
      [workspaceId]
    );

    const latestVersionByDefinitionId = new Map<string, V2VersionRow>();
    for (const version of versionRows) {
      if (!latestVersionByDefinitionId.has(version.workflow_definition_id)) {
        latestVersionByDefinitionId.set(version.workflow_definition_id, version);
      }
    }

    const merged = rows
      .map((r) => {
        const version = latestVersionByDefinitionId.get(r.id);
        const definition = parseDefinition(version?.definition_json ?? r.definition_json);
        if (!definition) return null;
        return {
          id: r.id,
          workspaceId: r.workspace_id,
          workflowKey: definition.workflowKey ?? r.workflow_id,
          name: definition.name ?? r.name,
          targetObject: definition.targetObject ?? r.target_object,
          status: "active",
          versionNumber: version?.version_number ?? 1,
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
 * Accepts a step-based workflow definition
 * ({ workflowKey, name, targetObject, initialState, steps }) and publishes it
 * as a new (or updated) versioned workflow definition.
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

    await writeAuditEvent({
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
