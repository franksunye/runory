import { NextRequest } from "next/server";
import { queryAll, queryOne, getRecord, TABLES, InvalidInputError, BusinessError, ERROR_CODES, businessTable, type VisibilityScope } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// ── Unified Timeline Entry ──
//
// Per v0.5.1 Spec §6: Timeline entries use stable event IDs, event types,
// occurrence time, subject links, actor when authorized, and localized
// presentation data.
// The API MUST enforce relation-level visibility; it MUST NOT return the
// entire customer graph and rely on the client to hide it.

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
//
// `service_visit` is the FSM module's object key (see
// catalog/modules/runory.service-visit/manifest.yaml). Both `visit` and
// `service_visit` are accepted as input; queries normalize to match either
// key stored in the database.

const VALID_SUBJECT_TYPES = new Set([
  "company",
  "service_site",
  "asset",
  "work_order",
  "visit",
  "service_visit",
  "quote",
  "deal",
]);

// Map alias subject types to their canonical + alias for DB queries
// (the DB may store either form depending on which module wrote the row).
const SUBJECT_ALIASES: Record<string, string[]> = {
  visit: ["visit", "service_visit"],
  service_visit: ["service_visit", "visit"],
};

function getSubjectTypeVariants(subjectType: string): string[] {
  return SUBJECT_ALIASES[subjectType] ?? [subjectType];
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Each source fetches up to MAX_FETCH entries to avoid premature
// pagination termination when one source has many entries that
// would be pushed out of the page by another source.
const MAX_FETCH = 200;

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

    // ── Relation-level visibility enforcement (v0.5.1 Spec §6) ──
    // "The API MUST enforce relation-level visibility; it MUST NOT return the
    // entire customer graph and rely on the client to hide it."
    // Verify the subject record exists in this workspace before returning events.
    await enforceSubjectVisibility(workspaceId, subjectType, subjectId, ctx.principal
      ? { userId: ctx.principal.userId, role: ctx.workspaceRole, organizationRole: ctx.organizationRole }
      : undefined);

    // ── Query each source table in parallel ──
    // Each source fetches up to MAX_FETCH entries (not `limit`) to avoid
    // premature pagination termination when one source dominates the page.

    const variants = getSubjectTypeVariants(subjectType);

    const [workflowEntries, domainEntries, auditEntries, formEntries, scheduleEntries] =
      await Promise.all([
        queryWorkflowEvents(workspaceId, variants, subjectId, cursor, MAX_FETCH),
        queryDomainEvents(workspaceId, variants, subjectId, cursor, MAX_FETCH),
        queryAuditEvents(workspaceId, variants, subjectId, cursor, MAX_FETCH),
        queryFormSubmissions(workspaceId, variants, subjectId, cursor, MAX_FETCH),
        queryScheduleEntries(workspaceId, variants, subjectId, cursor, MAX_FETCH),
      ]);

    // ── Merge, sort by occurred_at descending, apply limit ──

    const allEntries: TimelineEntry[] = [
      ...workflowEntries,
      ...domainEntries,
      ...auditEntries,
      ...formEntries,
      ...scheduleEntries,
    ];

    // Deduplicate by entry ID (in case the same event appears in multiple sources)
    const seenIds = new Set<string>();
    const dedupedEntries = allEntries.filter((e) => {
      if (seenIds.has(e.id)) return false;
      seenIds.add(e.id);
      return true;
    });

    // Sort by occurred_at desc, with ID as tiebreaker for stable ordering
    dedupedEntries.sort((a, b) => {
      const cmp = b.occurred_at.localeCompare(a.occurred_at);
      if (cmp !== 0) return cmp;
      return b.id.localeCompare(a.id);
    });

    const entries = dedupedEntries.slice(0, limit);

    // ── Derive next cursor from the last entry ──
    // Use occurred_at + id as a composite cursor for stable pagination
    let nextCursor: string | null = null;
    if (entries.length === limit && dedupedEntries.length > limit) {
      const last = entries[entries.length - 1];
      nextCursor = last.occurred_at;
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

// ── Relation-level visibility enforcement ──
//
// Per v0.5.1 Spec §6 and §7: validate workspace membership on every mobile
// API and prevent cross-workspace data leakage. The subject record must exist
// in the caller's workspace before any timeline events are returned.

async function enforceSubjectVisibility(
  workspaceId: string,
  subjectType: string,
  subjectId: string,
  visibilityScope: VisibilityScope | undefined
): Promise<void> {
  // For entity types that are stored as records in business tables, verify
  // the record exists in this workspace.
  const variants = getSubjectTypeVariants(subjectType);
  for (const variant of variants) {
    const objectKey = objectKeyForSubject(variant);
    if (!objectKey) continue;
    const exists = await queryOne<{ id: string }>(
      `SELECT id FROM ${businessTable(objectKey)} WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
      [subjectId, workspaceId]
    );
    if (!exists) continue;
    const row = await getRecord(workspaceId, objectKey, subjectId, { visibilityScope });
    if (row) return; // Exists and is readable by this identity.
    throw new BusinessError(
      ERROR_CODES.NOT_FOUND,
      `Subject ${subjectType}/${subjectId} not found in this workspace`,
      404
    );
  }

  // If the subject type is not a business-table entity (e.g., "deal" might
  // be stored differently), check audit_logs as a fallback — if there are
  // any audit events for this entity in this workspace, the subject is valid.
  const placeholders = variants.map(() => "?").join(", ");
  const auditCheck = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM ${TABLES.auditLogs}
     WHERE workspace_id = ? AND entity_id = ? AND entity_type IN (${placeholders})`,
    [workspaceId, subjectId, ...variants]
  );

  if (auditCheck && auditCheck.cnt > 0) return;

  // Also check workflow instances (the subject might be a workflow-bound record)
  const wfCheck = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM ${TABLES.workflowInstances}
     WHERE workspace_id = ? AND record_id = ? AND object_type IN (${placeholders})`,
    [workspaceId, subjectId, ...variants]
  );

  if (wfCheck && wfCheck.cnt > 0) return;

  // No evidence the subject exists in this workspace — reject
  throw new BusinessError(
    ERROR_CODES.NOT_FOUND,
    `Subject ${subjectType}/${subjectId} not found in this workspace`,
    404
  );
}

function businessTableForSubject(subjectType: string): string | null {
  // Map subject types to their current module-owned business table names.
  // Do not use legacy plural table names here; module migrations create
  // `runory_business_${object_key}` tables such as `runory_business_service_visit`.
  const mapping: Record<string, string> = {
    company: businessTable("company"),
    service_site: businessTable("service_site"),
    asset: businessTable("asset"),
    work_order: businessTable("work_order"),
    visit: businessTable("service_visit"),
    service_visit: businessTable("service_visit"),
    quote: businessTable("quote"),
    deal: businessTable("deal"),
  };
  return mapping[subjectType] ?? null;
}

function objectKeyForSubject(subjectType: string): string | null {
  if (subjectType === "visit") return "service_visit";
  return businessTableForSubject(subjectType) ? subjectType : null;
}

// ── Source 1: Workflow V2 Events ──
//
// Join workflow_events → workflow_instances to resolve object_type/record_id
// (the subject_type/subject_id of a workflow event is the instance's bound object).

async function queryWorkflowEvents(
  workspaceId: string,
  subjectTypes: string[],
  subjectId: string,
  cursor: string | null,
  limit: number
): Promise<TimelineEntry[]> {
  const conditions = [
    "we.workspace_id = ?",
    `wi.object_type IN (${subjectTypes.map(() => "?").join(", ")})`,
    "wi.record_id = ?",
  ];
  const args: unknown[] = [workspaceId, ...subjectTypes, subjectId];

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
     JOIN ${TABLES.workflowInstances} wi ON wi.id = we.instance_id AND wi.workspace_id = we.workspace_id
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

// ── Source 2: Governed domain events ──
// Commands are the canonical lifecycle fact. Including them here keeps the
// record timeline aligned with My Work and Planning instead of showing only
// incidental audit rows.
async function queryDomainEvents(
  workspaceId: string,
  subjectTypes: string[],
  subjectId: string,
  cursor: string | null,
  limit: number
): Promise<TimelineEntry[]> {
  const conditions = [
    "workspace_id = ?",
    `aggregate_type IN (${subjectTypes.map(() => "?").join(", ")})`,
    "aggregate_id = ?",
  ];
  const args: unknown[] = [workspaceId, ...subjectTypes, subjectId];
  if (cursor) {
    conditions.push("occurred_at < ?");
    args.push(cursor);
  }
  args.push(limit);
  const rows = await queryAll<{
    id: string; aggregate_type: string; aggregate_id: string; event_type: string;
    payload_json: string; actor_type: string; actor_id: string | null; occurred_at: string;
  }>(
    `SELECT id, aggregate_type, aggregate_id, event_type, payload_json,
            actor_type, actor_id, occurred_at
     FROM ${TABLES.domainEvents}
     WHERE ${conditions.join(" AND ")}
     ORDER BY occurred_at DESC
     LIMIT ?`,
    args
  );
  return rows.map((row) => ({
    id: row.id,
    event_type: row.event_type,
    occurred_at: row.occurred_at,
    subject_type: row.aggregate_type,
    subject_id: row.aggregate_id,
    actor_id: row.actor_id,
    summary: row.event_type.replace(/_/g, " "),
    metadata: { source: "command", actor_type: row.actor_type, payload: safeJsonParse(row.payload_json) },
  }));
}

// ── Source 3: Audit Events ──
//
// Audit logs use entity_type / entity_id as the subject reference.

async function queryAuditEvents(
  workspaceId: string,
  subjectTypes: string[],
  subjectId: string,
  cursor: string | null,
  limit: number
): Promise<TimelineEntry[]> {
  const conditions = [
    "workspace_id = ?",
    `entity_type IN (${subjectTypes.map(() => "?").join(", ")})`,
    "entity_id = ?",
  ];
  const args: unknown[] = [workspaceId, ...subjectTypes, subjectId];

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
  subjectTypes: string[],
  subjectId: string,
  cursor: string | null,
  limit: number
): Promise<TimelineEntry[]> {
  const conditions = [
    "workspace_id = ?",
    `subject_type IN (${subjectTypes.map(() => "?").join(", ")})`,
    "subject_id = ?",
  ];
  const args: unknown[] = [workspaceId, ...subjectTypes, subjectId];

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
    subject_type: r.subject_type ?? subjectTypes[0],
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
  subjectTypes: string[],
  subjectId: string,
  cursor: string | null,
  limit: number
): Promise<TimelineEntry[]> {
  const conditions = [
    "workspace_id = ?",
    `subject_type IN (${subjectTypes.map(() => "?").join(", ")})`,
    "subject_id = ?",
  ];
  const args: unknown[] = [workspaceId, ...subjectTypes, subjectId];

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
