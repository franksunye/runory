import { NextRequest } from "next/server";
import { queryAll, TABLES, InvalidInputError } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// ── Unified Timeline Entry ──
//
// Per v0.5.1 Spec §6: Timeline entries use stable event IDs, event types,
// occurrence time, subject links, actor when authorized, and localized
// presentation data.

export interface TimelineEntry {
  id: string;
  event_type: string;
  occurred_at: string;
  subject_type: string;
  subject_id: string;
  actor_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
}

// ── Allowed subject types ──

const VALID_SUBJECT_TYPES = new Set([
  "company",
  "service_site",
  "asset",
  "work_order",
  "visit",
  "quote",
  "deal",
]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// ── GET /api/workspaces/{workspaceId}/timeline ──

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const url = new URL(request.url);

    // ── Parse & validate query params ──

    const subjectType = url.searchParams.get("subjectType");
    const subjectId = url.searchParams.get("subjectId");
    const cursor = url.searchParams.get("cursor");
    const limitRaw = url.searchParams.get("limit");

    if (!subjectType) {
      throw new InvalidInputError("subjectType is required");
    }
    if (!VALID_SUBJECT_TYPES.has(subjectType)) {
      throw new InvalidInputError(
        `Invalid subjectType '${subjectType}'. Must be one of: ${[...VALID_SUBJECT_TYPES].join(", ")}`
      );
    }
    if (!subjectId) {
      throw new InvalidInputError("subjectId is required");
    }

    const limit = Math.min(
      Math.max(limitRaw ? parseInt(limitRaw, 10) : DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    // ── Query each source table in parallel ──

    const [workflowEntries, auditEntries, formEntries, scheduleEntries] =
      await Promise.all([
        queryWorkflowEvents(workspaceId, subjectType, subjectId, cursor, limit),
        queryAuditEvents(workspaceId, subjectType, subjectId, cursor, limit),
        queryFormSubmissions(workspaceId, subjectType, subjectId, cursor, limit),
        queryScheduleEntries(workspaceId, subjectType, subjectId, cursor, limit),
      ]);

    // ── Merge, sort by occurred_at descending, apply limit ──

    const allEntries: TimelineEntry[] = [
      ...workflowEntries,
      ...auditEntries,
      ...formEntries,
      ...scheduleEntries,
    ];

    allEntries.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

    const entries = allEntries.slice(0, limit);

    // ── Derive next cursor from the last entry ──

    let nextCursor: string | null = null;
    if (entries.length === limit && allEntries.length > limit) {
      nextCursor = entries[entries.length - 1].occurred_at;
    }

    return successResponse(
      {
        entries,
        nextCursor,
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}

// ── Source 1: Workflow V2 Events ──
//
// Join workflow_events → workflow_instances_v2 to resolve object_type/record_id
// (the subject_type/subject_id of a workflow event is the instance's bound object).

async function queryWorkflowEvents(
  workspaceId: string,
  subjectType: string,
  subjectId: string,
  cursor: string | null,
  limit: number
): Promise<TimelineEntry[]> {
  const conditions = [
    "we.workspace_id = ?",
    "wi.object_type = ?",
    "wi.record_id = ?",
  ];
  const args: unknown[] = [workspaceId, subjectType, subjectId];

  if (cursor) {
    conditions.push("we.occurred_at < ?");
    args.push(cursor);
  }

  args.push(limit);

  const rows = await queryAll<{
    id: string;
    event_type: string;
    occurred_at: string;
    actor_id: string | null;
    actor_type: string | null;
    payload_json: string;
    object_type: string;
    record_id: string;
    instance_id: string;
  }>(
    `SELECT we.id, we.event_type, we.occurred_at, we.actor_id, we.actor_type,
            we.payload_json, wi.object_type, wi.record_id, wi.id AS instance_id
     FROM ${TABLES.workflowEvents} we
     JOIN ${TABLES.workflowInstancesV2} wi ON wi.id = we.instance_id AND wi.workspace_id = we.workspace_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY we.occurred_at DESC
     LIMIT ?`,
    args
  );

  return rows.map((r) => ({
    id: r.id,
    event_type: `workflow.${r.event_type}`,
    occurred_at: r.occurred_at,
    subject_type: r.object_type,
    subject_id: r.record_id,
    actor_id: r.actor_id,
    summary: r.event_type,
    metadata: {
      source: "workflow",
      instance_id: r.instance_id,
      actor_type: r.actor_type,
      payload: safeJsonParse(r.payload_json),
    },
  }));
}

// ── Source 2: Audit Events ──
//
// Audit logs use entity_type / entity_id as the subject reference.

async function queryAuditEvents(
  workspaceId: string,
  subjectType: string,
  subjectId: string,
  cursor: string | null,
  limit: number
): Promise<TimelineEntry[]> {
  const conditions = [
    "workspace_id = ?",
    "entity_type = ?",
    "entity_id = ?",
  ];
  const args: unknown[] = [workspaceId, subjectType, subjectId];

  if (cursor) {
    conditions.push("created_at < ?");
    args.push(cursor);
  }

  args.push(limit);

  const rows = await queryAll<{
    id: string;
    action: string;
    actor_type: string;
    actor_id: string;
    entity_type: string;
    entity_id: string;
    before_json: string | null;
    after_json: string | null;
    created_at: string;
  }>(
    `SELECT id, action, actor_type, actor_id, entity_type, entity_id,
            before_json, after_json, created_at
     FROM ${TABLES.auditLogs}
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT ?`,
    args
  );

  return rows.map((r) => ({
    id: r.id,
    event_type: `audit.${r.action}`,
    occurred_at: r.created_at,
    subject_type: r.entity_type,
    subject_id: r.entity_id,
    actor_id: r.actor_id,
    summary: r.action,
    metadata: {
      source: "audit",
      actor_type: r.actor_type,
      before: safeJsonParse(r.before_json),
      after: safeJsonParse(r.after_json),
    },
  }));
}

// ── Source 3: Form Submissions ──
//
// Form submissions have subject_type / subject_id columns directly.

async function queryFormSubmissions(
  workspaceId: string,
  subjectType: string,
  subjectId: string,
  cursor: string | null,
  limit: number
): Promise<TimelineEntry[]> {
  const conditions = [
    "workspace_id = ?",
    "subject_type = ?",
    "subject_id = ?",
  ];
  const args: unknown[] = [workspaceId, subjectType, subjectId];

  if (cursor) {
    conditions.push("created_at < ?");
    args.push(cursor);
  }

  args.push(limit);

  const rows = await queryAll<{
    id: string;
    status: string;
    subject_type: string | null;
    subject_id: string | null;
    form_definition_id: string;
    submitted_by: string | null;
    submitted_at: string | null;
    accepted_by: string | null;
    accepted_at: string | null;
    revision_number: number;
    created_at: string;
  }>(
    `SELECT id, status, subject_type, subject_id, form_definition_id,
            submitted_by, submitted_at, accepted_by, accepted_at,
            revision_number, created_at
     FROM ${TABLES.formSubmissions}
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT ?`,
    args
  );

  return rows.map((r) => ({
    id: r.id,
    event_type: `form.submission.${r.status}`,
    occurred_at: r.submitted_at ?? r.created_at,
    subject_type: r.subject_type ?? subjectType,
    subject_id: r.subject_id ?? subjectId,
    actor_id: r.submitted_by ?? r.accepted_by,
    summary: `Form submission ${r.status} (revision ${r.revision_number})`,
    metadata: {
      source: "form",
      form_definition_id: r.form_definition_id,
      status: r.status,
      revision_number: r.revision_number,
      submitted_by: r.submitted_by,
      submitted_at: r.submitted_at,
      accepted_by: r.accepted_by,
      accepted_at: r.accepted_at,
    },
  }));
}

// ── Source 4: Schedule Entries ──
//
// Schedule entries have subject_type / subject_id columns directly.
// The primary temporal field is start_at; created_at serves as fallback.

async function queryScheduleEntries(
  workspaceId: string,
  subjectType: string,
  subjectId: string,
  cursor: string | null,
  limit: number
): Promise<TimelineEntry[]> {
  const conditions = [
    "workspace_id = ?",
    "subject_type = ?",
    "subject_id = ?",
  ];
  const args: unknown[] = [workspaceId, subjectType, subjectId];

  if (cursor) {
    conditions.push("created_at < ?");
    args.push(cursor);
  }

  args.push(limit);

  const rows = await queryAll<{
    id: string;
    subject_type: string;
    subject_id: string;
    resource_id: string;
    start_at: string;
    end_at: string;
    status: string;
    conflict_state: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, subject_type, subject_id, resource_id,
            start_at, end_at, status, conflict_state,
            created_at, updated_at
     FROM ${TABLES.scheduleEntries}
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT ?`,
    args
  );

  return rows.map((r) => ({
    id: r.id,
    event_type: `schedule.${r.status}`,
    occurred_at: r.created_at,
    subject_type: r.subject_type,
    subject_id: r.subject_id,
    actor_id: null,
    summary: `Schedule ${r.status} (${r.start_at} – ${r.end_at})`,
    metadata: {
      source: "schedule",
      resource_id: r.resource_id,
      start_at: r.start_at,
      end_at: r.end_at,
      status: r.status,
      conflict_state: r.conflict_state,
      updated_at: r.updated_at,
    },
  }));
}

// ── Helpers ──

function safeJsonParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
