// ── Schedule Runtime (v0.5 Slice 4) ──
//
// Per v0.5 Technical Spec §7: Schedule entries with conflict detection.
// A schedule entry reserves a time slot for a resource (technician) against
// a subject (service_visit or work_order).
//
// Schedule entry lifecycle:
//   tentative → confirmed → completed
//                       ↘ cancelled
//   Confirmed entries are checked for overlaps (conflict detection).

import { genId, now, queryOne, queryAll, execute, batch as runBatch } from "./db";
import { TABLES } from "./contracts";
import { BusinessError, NotFoundError } from "./context";
import { ERROR_CODES } from "./errors";

// ── Types ──

export interface ScheduleEntry {
  id: string;
  workspaceId: string;
  subjectType: string;
  subjectId: string;
  resourceId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: string;
  locationType: string | null;
  locationId: string | null;
  latitude: number | null;
  longitude: number | null;
  conflictState: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ── Row Mapper ──

interface ScheduleEntryRow {
  id: string;
  workspace_id: string;
  subject_type: string;
  subject_id: string;
  resource_id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  status: string;
  location_type: string | null;
  location_id: string | null;
  latitude: number | null;
  longitude: number | null;
  conflict_state: string;
  version: number;
  created_at: string;
  updated_at: string;
}

function mapScheduleEntry(row: ScheduleEntryRow): ScheduleEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    resourceId: row.resource_id,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    status: row.status,
    locationType: row.location_type,
    locationId: row.location_id,
    latitude: row.latitude,
    longitude: row.longitude,
    conflictState: row.conflict_state,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Conflict Detection ──

/**
 * Detect conflicts: find overlapping confirmed entries for the same resource.
 * Uses standard overlap detection: two intervals [s1, e1) and [s2, e2) overlap
 * iff s1 < e2 AND s2 < e1.
 * Excludes the given entry ID if provided (useful when rescheduling the same entry).
 */
export async function detectConflicts(
  workspaceId: string,
  resourceId: string,
  startAt: string,
  endAt: string,
  excludeEntryId?: string
): Promise<ScheduleEntry[]> {
  let sql = `SELECT * FROM ${TABLES.scheduleEntries}
             WHERE workspace_id = ? AND resource_id = ? AND status = 'confirmed'
               AND start_at < ? AND end_at > ?`;
  const args: unknown[] = [workspaceId, resourceId, endAt, startAt];

  if (excludeEntryId) {
    sql += ` AND id != ?`;
    args.push(excludeEntryId);
  }

  sql += ` ORDER BY start_at ASC`;

  const rows = await queryAll<ScheduleEntryRow>(sql, args);
  return rows.map(mapScheduleEntry);
}

// ── Commands ──

/**
 * Plan a schedule entry (tentative initially).
 * Creates a tentative schedule entry and runs conflict detection.
 * If conflicts are found, the entry is still created with conflict_state='conflict',
 * allowing the user to see conflicts and decide whether to confirm or reschedule.
 */
export async function planSchedule(
  workspaceId: string,
  params: {
    subjectType: string;
    subjectId: string;
    resourceId: string;
    startAt: string;
    endAt: string;
    timezone?: string;
    locationType?: string;
    locationId?: string;
    latitude?: number;
    longitude?: number;
  }
): Promise<{ scheduleEntryId: string; conflicts: ScheduleEntry[] }> {
  const scheduleEntryId = genId("sched");
  const ts = now();

  // Spec §5.5: end_at MUST be after start_at. Validate early so invalid input
  // yields a clean 400 (INVALID_INPUT) rather than a raw SQLITE_CONSTRAINT from
  // the table CHECK. String comparison is consistent with SQLite's TEXT ordering.
  if (params.endAt <= params.startAt) {
    throw new BusinessError(
      ERROR_CODES.INVALID_INPUT,
      `INVALID_INPUT: Schedule end_at (${params.endAt}) must be strictly after start_at (${params.startAt}).`,
      400
    );
  }

  // Detect conflicts against confirmed entries
  const conflicts = await detectConflicts(
    workspaceId,
    params.resourceId,
    params.startAt,
    params.endAt
  );

  const conflictState = conflicts.length > 0 ? "conflict" : "none";

  await execute(
    `INSERT INTO ${TABLES.scheduleEntries}
     (id, workspace_id, subject_type, subject_id, resource_id,
      start_at, end_at, timezone, status,
      location_type, location_id, latitude, longitude,
      conflict_state, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'tentative', ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      scheduleEntryId,
      workspaceId,
      params.subjectType,
      params.subjectId,
      params.resourceId,
      params.startAt,
      params.endAt,
      params.timezone ?? "UTC",
      params.locationType ?? null,
      params.locationId ?? null,
      params.latitude ?? null,
      params.longitude ?? null,
      conflictState,
      ts,
      ts,
    ]
  );

  return { scheduleEntryId, conflicts };
}

/**
 * Confirm a tentative schedule entry.
 * Transitions from tentative → confirmed and re-checks conflicts.
 */
export async function confirmSchedule(
  workspaceId: string,
  scheduleEntryId: string,
  confirmedBy: string
): Promise<void> {
  const entry = await getScheduleEntry(workspaceId, scheduleEntryId);
  if (!entry) {
    throw new NotFoundError(`Schedule entry not found: ${scheduleEntryId}`);
  }

  if (entry.status !== "tentative") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Cannot confirm schedule entry in status '${entry.status}'. Only 'tentative' entries can be confirmed.`,
      409
    );
  }

  // Re-check conflicts against confirmed entries
  const conflicts = await detectConflicts(
    workspaceId,
    entry.resourceId,
    entry.startAt,
    entry.endAt,
    scheduleEntryId
  );

  const conflictState = conflicts.length > 0 ? "conflict" : "none";
  const ts = now();
  const newVersion = entry.version + 1;

  await execute(
    `UPDATE ${TABLES.scheduleEntries}
     SET status = 'confirmed', conflict_state = ?, version = ?, updated_at = ?
     WHERE workspace_id = ? AND id = ? AND version = ?`,
    [conflictState, newVersion, ts, workspaceId, scheduleEntryId, entry.version]
  );
}

/**
 * Reschedule: update start/end, preserve history via version increment.
 * Re-runs conflict detection on the new time window.
 */
export async function rescheduleSchedule(
  workspaceId: string,
  scheduleEntryId: string,
  newStartAt: string,
  newEndAt: string,
  rescheduledBy: string
): Promise<void> {
  const entry = await getScheduleEntry(workspaceId, scheduleEntryId);
  if (!entry) {
    throw new NotFoundError(`Schedule entry not found: ${scheduleEntryId}`);
  }

  if (entry.status === "cancelled" || entry.status === "completed") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Cannot reschedule schedule entry in status '${entry.status}'.`,
      409
    );
  }

  // Re-check conflicts on the new time window
  const conflicts = await detectConflicts(
    workspaceId,
    entry.resourceId,
    newStartAt,
    newEndAt,
    scheduleEntryId
  );

  const conflictState = conflicts.length > 0 ? "conflict" : "none";
  const ts = now();
  const newVersion = entry.version + 1;

  await execute(
    `UPDATE ${TABLES.scheduleEntries}
     SET start_at = ?, end_at = ?, conflict_state = ?, version = ?, updated_at = ?
     WHERE workspace_id = ? AND id = ? AND version = ?`,
    [newStartAt, newEndAt, conflictState, newVersion, ts, workspaceId, scheduleEntryId, entry.version]
  );
}

/**
 * Cancel a schedule entry.
 * Moves the entry to the 'cancelled' status.
 */
export async function cancelSchedule(
  workspaceId: string,
  scheduleEntryId: string,
  cancelledBy: string,
  reason?: string
): Promise<void> {
  const entry = await getScheduleEntry(workspaceId, scheduleEntryId);
  if (!entry) {
    throw new NotFoundError(`Schedule entry not found: ${scheduleEntryId}`);
  }

  if (entry.status === "cancelled" || entry.status === "completed") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Cannot cancel schedule entry in status '${entry.status}'.`,
      409
    );
  }

  const ts = now();
  const newVersion = entry.version + 1;

  await execute(
    `UPDATE ${TABLES.scheduleEntries}
     SET status = 'cancelled', version = ?, updated_at = ?
     WHERE workspace_id = ? AND id = ? AND version = ?`,
    [newVersion, ts, workspaceId, scheduleEntryId, entry.version]
  );
}

// ── Queries ──

/**
 * Query schedule entries with filters.
 */
export async function getScheduleEntries(
  workspaceId: string,
  filters: {
    resourceId?: string;
    subjectType?: string;
    subjectId?: string;
    status?: string;
    from?: string;
    to?: string;
  }
): Promise<ScheduleEntry[]> {
  const conditions: string[] = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (filters.resourceId) {
    conditions.push("resource_id = ?");
    args.push(filters.resourceId);
  }
  if (filters.subjectType) {
    conditions.push("subject_type = ?");
    args.push(filters.subjectType);
  }
  if (filters.subjectId) {
    conditions.push("subject_id = ?");
    args.push(filters.subjectId);
  }
  if (filters.status) {
    conditions.push("status = ?");
    args.push(filters.status);
  }
  if (filters.from) {
    conditions.push("start_at >= ?");
    args.push(filters.from);
  }
  if (filters.to) {
    conditions.push("end_at <= ?");
    args.push(filters.to);
  }

  const sql = `SELECT * FROM ${TABLES.scheduleEntries}
               WHERE ${conditions.join(" AND ")}
               ORDER BY start_at ASC`;
  const rows = await queryAll<ScheduleEntryRow>(sql, args);
  return rows.map(mapScheduleEntry);
}

/**
 * Get schedule entry by ID.
 */
export async function getScheduleEntry(
  workspaceId: string,
  scheduleEntryId: string
): Promise<ScheduleEntry | undefined> {
  const row = await queryOne<ScheduleEntryRow>(
    `SELECT * FROM ${TABLES.scheduleEntries}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, scheduleEntryId]
  );
  return row ? mapScheduleEntry(row) : undefined;
}
