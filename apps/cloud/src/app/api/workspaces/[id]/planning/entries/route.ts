import { NextRequest } from "next/server";
import {
  getScheduleEntries,
  queryAll,
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

    // If multiple resource IDs are specified, query for each and merge
    let entries: ScheduleEntry[];
    if (resourceIds && resourceIds.length > 1) {
      const allEntries: ScheduleEntry[] = [];
      for (const resourceId of resourceIds) {
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
        resourceId: resourceIds?.[0],
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

    const enriched: ScheduleEntryWithResource[] = entries.map((entry) => {
      const resource = resourceMap.get(entry.resourceId);
      return {
        ...entry,
        resourceName: resource?.display_name ?? null,
        resourceType: resource?.resource_type ?? null,
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
