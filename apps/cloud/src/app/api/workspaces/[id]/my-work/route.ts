import { NextRequest } from "next/server";
import {
  businessTable,
  getMyWork,
  hasOperationalTeamAccess,
  queryAll,
  TABLES,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

interface OperationalWorkItem {
  id: string;
  workspace_id: string;
  instance_id: "operational";
  step_id: string;
  kind: "human_task";
  status: "ready";
  subject_type: string | null;
  subject_id: string | null;
  assignee_type: "resource" | "team";
  assignee_id: string | null;
  candidate_rule_json: string | null;
  due_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  form_binding_id: string | null;
  input_snapshot_json: string | null;
  input_snapshot_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  title: string;
  description: string;
  resource_name: string | null;
  assignee_display: string | null;
  assignee_avatar_url: string | null;
  operational_source: "schedule";
}

interface OperationalScheduleRow {
  schedule_id: string;
  subject_type: string;
  subject_id: string;
  start_at: string;
  end_at: string;
  due_at: string | null;
  status: string;
  resource_id: string;
  resource_name: string;
  resource_avatar_url: string | null;
  subject_title: string | null;
  created_at: string;
  updated_at: string;
}

async function getOperationalWork(
  workspaceId: string,
  actorId: string,
  includeTeam: boolean,
  filters: {
    kind?: string;
    status?: string;
    subjectType?: string;
    dueBefore?: string;
    from?: string;
    to?: string;
    limit?: number;
  }
): Promise<OperationalWorkItem[]> {
  if (filters.kind && filters.kind !== "human_task") return [];
  if (filters.status && filters.status !== "ready" && filters.status !== "overdue") return [];

  const conditions = [
    "se.workspace_id = ?",
    "se.status IN ('scheduled', 'tentative', 'confirmed')",
    "r.active = 1",
  ];
  const args: unknown[] = [workspaceId];

  if (!includeTeam) {
    conditions.push(`r.user_id IN (
      SELECT id FROM ${TABLES.users}
      WHERE id = ? OR external_id = ?
    )`);
    args.push(actorId, actorId);
  }
  if (filters.subjectType) {
    conditions.push("se.subject_type = ?");
    args.push(filters.subjectType);
  }
  if (filters.dueBefore) {
    conditions.push("COALESCE(wo.sla_due_at, se.start_at) <= ?");
    args.push(filters.dueBefore);
  }
  if (filters.from) {
    conditions.push("se.start_at >= ?");
    args.push(filters.from);
  }
  if (filters.to) {
    conditions.push("se.start_at <= ?");
    args.push(filters.to);
  }

  const limit = Math.min(filters.limit ?? 50, 100);
  const rows = await queryAll<OperationalScheduleRow>(
    `SELECT
       se.id AS schedule_id,
       se.subject_type,
       se.subject_id,
       se.start_at,
       se.end_at,
       COALESCE(wo.sla_due_at, se.start_at) AS due_at,
       se.status,
       se.resource_id,
       r.display_name AS resource_name,
       u.avatar_url AS resource_avatar_url,
       COALESCE(wo.title, sv.title) AS subject_title,
       se.created_at,
       se.updated_at
     FROM ${TABLES.scheduleEntries} se
     JOIN ${TABLES.resources} r
       ON r.workspace_id = se.workspace_id AND r.id = se.resource_id
     LEFT JOIN ${TABLES.users} u ON u.id = r.user_id
     LEFT JOIN ${businessTable("work_order")} wo
       ON se.subject_type = 'work_order'
      AND wo.workspace_id = se.workspace_id
      AND wo.id = se.subject_id
     LEFT JOIN ${businessTable("service_visit")} sv
       ON se.subject_type = 'service_visit'
      AND sv.workspace_id = se.workspace_id
      AND sv.id = se.subject_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY se.start_at ASC, se.id ASC
     LIMIT ?`,
    [...args, limit]
  );

  return rows.map((row) => ({
    id: `op_schedule_${row.schedule_id}`,
    workspace_id: workspaceId,
    instance_id: "operational",
    step_id: "scheduled_work",
    kind: "human_task",
    status: "ready",
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    assignee_type: "resource",
    assignee_id: row.resource_id,
    assignee_display: row.resource_name,
    assignee_avatar_url: row.resource_avatar_url,
    candidate_rule_json: null,
    // My Work's Due is the business SLA when one exists. The schedule start
    // remains useful context, but it is not the same as the deadline.
    due_at: row.due_at,
    claimed_by: null,
    claimed_at: null,
    completed_at: null,
    form_binding_id: null,
    input_snapshot_json: null,
    input_snapshot_hash: null,
    version: 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    title: row.subject_title
      ? `${row.subject_title}`
      : `${row.subject_type.replace(/_/g, " ")} ${row.subject_id.slice(0, 8)}`,
    description: `${row.resource_name} · ${row.start_at}`,
    resource_name: row.resource_name,
    operational_source: "schedule",
  }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const url = new URL(request.url);
    const actorId = ctx.principal?.userId ?? "unknown";
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : undefined;
    const filters = {
      kind: url.searchParams.get("kind") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      subjectType: url.searchParams.get("subjectType") ?? undefined,
      dueBefore: url.searchParams.get("dueBefore") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit,
      offset: url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!) : undefined,
    };

    // Per v0.5.1 Spec §6: cursor-based pagination with from/to time window
    const result = await getMyWork(workspaceId, actorId, filters);
    // Team-wide queues are granted by dispatch/supervision permissions, never
    // by organization ownership alone.
    const includeTeam = ctx.principal
      ? await hasOperationalTeamAccess(workspaceId, {
          userId: ctx.principal.userId,
          role: ctx.workspaceRole,
          organizationRole: ctx.organizationRole,
        })
      : false;
    const operationalItems = await getOperationalWork(workspaceId, actorId, includeTeam, filters);

    const userAssigneeIds = [...new Set(result.items
      .filter((item) => item.assignee_type === "user" && item.assignee_id)
      .map((item) => item.assignee_id as string))];
    const permissionGroupIds = [...new Set(result.items
      .filter((item) => item.assignee_type === "permission_group" && item.assignee_id)
      .map((item) => item.assignee_id as string))];
    const userPlaceholders = userAssigneeIds.map(() => "?").join(",");
    const groupPlaceholders = permissionGroupIds.map(() => "?").join(",");
    const [assigneeUsers, assigneeGroups] = await Promise.all([
      userAssigneeIds.length === 0
        ? []
        : queryAll<{ id: string; external_id: string; display_name: string; avatar_url: string | null }>(
            `SELECT id, external_id, display_name, avatar_url FROM ${TABLES.users}
             WHERE id IN (${userPlaceholders}) OR external_id IN (${userPlaceholders})`,
            [...userAssigneeIds, ...userAssigneeIds]
          ),
      permissionGroupIds.length === 0
        ? []
        : queryAll<{ id: string; group_key: string; label: string }>(
            `SELECT id, group_key, label FROM ${TABLES.packPermissionGroups}
             WHERE workspace_id = ? AND (id IN (${groupPlaceholders}) OR group_key IN (${groupPlaceholders}))`,
            [workspaceId, ...permissionGroupIds, ...permissionGroupIds]
          ),
    ]);
    const assigneeLabels = new Map<string, string>();
    const assigneeAvatars = new Map<string, string>();
    for (const user of assigneeUsers) {
      assigneeLabels.set(user.id, user.display_name);
      assigneeLabels.set(user.external_id, user.display_name);
      if (user.avatar_url) {
        assigneeAvatars.set(user.id, user.avatar_url);
        assigneeAvatars.set(user.external_id, user.avatar_url);
      }
    }
    for (const group of assigneeGroups) {
      assigneeLabels.set(group.id, group.label);
      assigneeLabels.set(group.group_key, group.label);
    }
    const workflowItems = result.items.map((item) => ({
      ...item,
      assignee_display: item.assignee_id ? assigneeLabels.get(item.assignee_id) ?? null : null,
      assignee_avatar_url: item.assignee_id ? assigneeAvatars.get(item.assignee_id) ?? null : null,
    }));

    return successResponse(
      {
        items: [...workflowItems, ...operationalItems],
        total: result.total + operationalItems.length,
        nextCursor: result.nextCursor,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
