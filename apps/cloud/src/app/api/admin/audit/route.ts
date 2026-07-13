import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/admin/audit — lists recent audit events across all workspaces (platform admins only)
// Query params:
//   limit       — max events to return (default 100, clamped to 1–500)
//   action      — filter by action type (e.g., "workspace.create")
//   workspaceId — filter by workspace
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get("limit") ?? "100", 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 100, 1), 500);
    const action = searchParams.get("action");
    const workspaceId = searchParams.get("workspaceId");

    const conditions: string[] = [];
    const args: unknown[] = [];

    if (action) {
      conditions.push("action = ?");
      args.push(action);
    }
    if (workspaceId) {
      conditions.push("workspace_id = ?");
      args.push(workspaceId);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    args.push(limit);

    const rows = await queryAll<{
      id: string;
      workspace_id: string;
      action: string;
      actor_type: string;
      actor_id: string;
      entity_type: string;
      entity_id: string;
      label: string;
      created_at: string;
    }>(
      `SELECT id, workspace_id, action, actor_type, actor_id, entity_type, entity_id,
              action || ' ' || entity_type || ' ' || entity_id as label, created_at
       FROM ${TABLES.auditLogs}
       ${whereClause}
       ORDER BY created_at DESC LIMIT ?`,
      args
    );

    const events = rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      action: r.action,
      actorType: r.actor_type,
      actorId: r.actor_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      label: r.label,
      createdAt: r.created_at,
    }));

    return successResponse(events, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
