import { NextRequest } from "next/server";
import {
  businessTable,
  getScheduleEntries,
  queryAll,
  resolveUserResourceIds,
  TABLES,
  type ScheduleEntry,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ScheduleEntryWithResource extends ScheduleEntry {
  resourceName: string | null;
  resourceType: string | null;
}

interface ResourceRow {
  id: string;
  display_name: string;
  resource_type: string;
}

interface SubjectRow {
  id: string;
  title: string | null;
}

interface SubjectInfo {
  name: string | null;
}

const PLANNING_SUBJECT_TABLES: Record<string, string> = {
  work_order: businessTable("work_order"),
  service_visit: businessTable("service_visit"),
};

// GET: Query schedule entries with filters (from, to, resourceIds, subjectType, status)
// Returns entries with resource info, subject info, status, location
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(
      request,
      id,
      "viewer"
    );

    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const subjectType = url.searchParams.get("subjectType") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const resourceIdsParam = url.searchParams.get("resourceIds") ?? undefined;

    // Parse comma-separated resource IDs
    const resourceIds = resourceIdsParam
      ? resourceIdsParam.split(",").map((r) => r.trim()).filter(Boolean)
      : undefined;

    // ── Row-level visibility (v0.5.2) ──
    // Non-admin/owner users only see schedule entries for their own resources
    // unless they explicitly request specific resource IDs (admin action).
    let effectiveResourceIds = resourceIds;
    const isAdmin = ctx.workspaceRole === "admin" || ctx.organizationRole === "owner";
    if (!isAdmin && ctx.principal && !resourceIdsParam) {
      const userResourceIds = await resolveUserResourceIds(workspaceId, ctx.principal.userId);
      if (userResourceIds.length > 0) {
        effectiveResourceIds = userResourceIds;
      } else {
        // No resource linked — see nothing
        return successResponse({ entries: [], total: 0 }, 200, ctx.requestId);
      }
    }

    // If multiple resource IDs are specified, query for each and merge
    let entries: ScheduleEntry[];
    if (effectiveResourceIds && effectiveResourceIds.length > 1) {
      const allEntries: ScheduleEntry[] = [];
      for (const resourceId of effectiveResourceIds) {
        const partial = await getScheduleEntries(workspaceId, {
          resourceId,
          subjectType,
          status,
          from,
          to,
        });
        allEntries.push(...partial);
      }
      // Sort merged results by start_at
      entries = allEntries.sort((a, b) => a.startAt.localeCompare(b.startAt));
    } else {
      entries = await getScheduleEntries(workspaceId, {
        resourceId: effectiveResourceIds?.[0],
        subjectType,
        status,
        from,
        to,
      });
    }

    // Enrich with resource info
    const resourceIdSet = new Set(entries.map((e) => e.resourceId));
    let resourceMap = new Map<string, ResourceRow>();

    if (resourceIdSet.size > 0) {
      const resourceIdsList = [...resourceIdSet];
      const placeholders = resourceIdsList.map(() => "?").join(",");
      const resourceRows = await queryAll<ResourceRow>(
        `SELECT id, display_name, resource_type FROM ${TABLES.resources}
         WHERE workspace_id = ? AND id IN (${placeholders})`,
        [workspaceId, ...resourceIdsList]
      );
      resourceMap = new Map(resourceRows.map((r) => [r.id, r]));
    }

    const subjectMap = new Map<string, SubjectInfo>();
    const subjectIdsByType = new Map<string, Set<string>>();
    for (const entry of entries) {
      if (!PLANNING_SUBJECT_TABLES[entry.subjectType] || !entry.subjectId) continue;
      const ids = subjectIdsByType.get(entry.subjectType) ?? new Set<string>();
      ids.add(entry.subjectId);
      subjectIdsByType.set(entry.subjectType, ids);
    }

    for (const [entrySubjectType, subjectIds] of subjectIdsByType) {
      const ids = [...subjectIds];
      if (ids.length === 0) continue;
      const table = PLANNING_SUBJECT_TABLES[entrySubjectType];
      const placeholders = ids.map(() => "?").join(",");
      const rows = await queryAll<SubjectRow>(
        `SELECT id, title FROM ${table}
         WHERE workspace_id = ? AND id IN (${placeholders})`,
        [workspaceId, ...ids]
      );
      for (const row of rows) {
        subjectMap.set(`${entrySubjectType}:${row.id}`, { name: row.title });
      }
    }

    const enriched: ScheduleEntryWithResource[] = entries.map((entry) => {
      const resource = resourceMap.get(entry.resourceId);
      const subject = subjectMap.get(`${entry.subjectType}:${entry.subjectId}`);
      return {
        ...entry,
        resourceName: resource?.display_name ?? null,
        resourceType: resource?.resource_type ?? null,
        subjectName: subject?.name ?? null,
      };
    });

    return successResponse(
      { entries: enriched, total: enriched.length },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
