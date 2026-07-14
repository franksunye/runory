// ── Assignment Runtime (v0.5 Slice 4) ──
//
// Per v0.5 Technical Spec §7: Assignment is a governed aggregate with lifecycle.
// An assignment links a resource (technician) to a subject (work_order or
// service_visit) and tracks the proposal → assignment → acceptance flow.
//
// Assignment lifecycle:
//   proposed → assigned → accepted
//                      ↘ rejected
//   accepted → released
//   assigned → released
//   proposed → released

import { genId, now, queryOne, queryAll, execute, batch as runBatch } from "./db";
import { TABLES, businessTable } from "./contracts";
import { BusinessError, NotFoundError } from "./context";
import { ERROR_CODES } from "./errors";

// ── Types ──

export interface Assignment {
  id: string;
  workspaceId: string;
  subjectType: string;
  subjectId: string;
  resourceId: string;
  roleKey: string | null;
  status: string;
  proposedBy: string | null;
  acceptedBy: string | null;
  rejectionReason: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ── Row Mapper ──

interface AssignmentRow {
  id: string;
  workspace_id: string;
  subject_type: string;
  subject_id: string;
  resource_id: string;
  role_key: string | null;
  status: string;
  proposed_by: string | null;
  accepted_by: string | null;
  rejection_reason: string | null;
  effective_from: string | null;
  effective_to: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function mapAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    resourceId: row.resource_id,
    roleKey: row.role_key,
    status: row.status,
    proposedBy: row.proposed_by,
    acceptedBy: row.accepted_by,
    rejectionReason: row.rejection_reason,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Commands ──

/**
 * Create a proposed assignment.
 * A proposed assignment is tentative and must be accepted (assigned) by a dispatcher
 * before the resource can accept or reject it.
 */
export async function proposeAssignment(
  workspaceId: string,
  params: {
    subjectType: string;
    subjectId: string;
    resourceId: string;
    roleKey?: string;
    proposedBy: string;
    effectiveFrom?: string;
  }
): Promise<{ assignmentId: string }> {
  const assignmentId = genId("asgn");
  const ts = now();

  await execute(
    `INSERT INTO ${TABLES.assignments}
     (id, workspace_id, subject_type, subject_id, resource_id, role_key,
      status, proposed_by, effective_from, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?, 1, ?, ?)`,
    [
      assignmentId,
      workspaceId,
      params.subjectType,
      params.subjectId,
      params.resourceId,
      params.roleKey ?? null,
      params.proposedBy,
      params.effectiveFrom ?? null,
      ts,
      ts,
    ]
  );

  return { assignmentId };
}

/**
 * Assign: proposed → assigned (by dispatcher).
 * Moves a proposed assignment into the assigned state so the resource can
 * accept or reject it.
 */
export async function assignAssignment(
  workspaceId: string,
  assignmentId: string,
  assignedBy: string
): Promise<void> {
  const assignment = await getAssignment(workspaceId, assignmentId);
  if (!assignment) {
    throw new NotFoundError(`Assignment not found: ${assignmentId}`);
  }

  if (assignment.status !== "proposed") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Cannot assign assignment in status '${assignment.status}'. Only 'proposed' assignments can be assigned.`,
      409
    );
  }

  const ts = now();
  const newVersion = assignment.version + 1;

  await execute(
    `UPDATE ${TABLES.assignments}
     SET status = 'assigned', version = ?, updated_at = ?
     WHERE workspace_id = ? AND id = ? AND version = ?`,
    [newVersion, ts, workspaceId, assignmentId, assignment.version]
  );
}

/**
 * Accept: assigned → accepted (by resource/technician).
 * The resource accepts the assignment, making it the active assignment.
 */
export async function acceptAssignment(
  workspaceId: string,
  assignmentId: string,
  acceptedBy: string
): Promise<void> {
  const assignment = await getAssignment(workspaceId, assignmentId);
  if (!assignment) {
    throw new NotFoundError(`Assignment not found: ${assignmentId}`);
  }

  if (assignment.status !== "assigned") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Cannot accept assignment in status '${assignment.status}'. Only 'assigned' assignments can be accepted.`,
      409
    );
  }

  const ts = now();
  const newVersion = assignment.version + 1;

  await execute(
    `UPDATE ${TABLES.assignments}
     SET status = 'accepted', accepted_by = ?, version = ?, updated_at = ?
     WHERE workspace_id = ? AND id = ? AND version = ?`,
    [acceptedBy, newVersion, ts, workspaceId, assignmentId, assignment.version]
  );
}

/**
 * Reject: assigned → rejected (by resource/technician).
 * The resource declines the assignment with a reason.
 */
export async function rejectAssignment(
  workspaceId: string,
  assignmentId: string,
  rejectedBy: string,
  reason: string
): Promise<void> {
  const assignment = await getAssignment(workspaceId, assignmentId);
  if (!assignment) {
    throw new NotFoundError(`Assignment not found: ${assignmentId}`);
  }

  if (assignment.status !== "assigned") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Cannot reject assignment in status '${assignment.status}'. Only 'assigned' assignments can be rejected.`,
      409
    );
  }

  const ts = now();
  const newVersion = assignment.version + 1;

  await execute(
    `UPDATE ${TABLES.assignments}
     SET status = 'rejected', rejection_reason = ?, version = ?, updated_at = ?
     WHERE workspace_id = ? AND id = ? AND version = ?`,
    [reason, newVersion, ts, workspaceId, assignmentId, assignment.version]
  );
}

/**
 * Reassign: close old assignment + create new one in one transaction.
 * Releases the current accepted/assigned assignment and creates a new proposed
 * assignment for the new resource.
 */
export async function reassignAssignment(
  workspaceId: string,
  assignmentId: string,
  newResourceId: string,
  reassignedBy: string
): Promise<{ newAssignmentId: string }> {
  const assignment = await getAssignment(workspaceId, assignmentId);
  if (!assignment) {
    throw new NotFoundError(`Assignment not found: ${assignmentId}`);
  }

  if (!["accepted", "assigned", "proposed"].includes(assignment.status)) {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Cannot reassign assignment in status '${assignment.status}'.`,
      409
    );
  }

  const newResource = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.resources} WHERE workspace_id = ? AND id = ? AND active = 1`,
    [workspaceId, newResourceId]
  );
  if (!newResource) throw new NotFoundError(`Active resource not found: ${newResourceId}`);

  const schedule = assignment.subjectType === "service_visit"
    ? await queryOne<{ id: string; start_at: string; end_at: string }>(
        `SELECT id, start_at, end_at FROM ${TABLES.scheduleEntries}
         WHERE workspace_id = ? AND subject_type = 'service_visit' AND subject_id = ?
           AND status IN ('tentative', 'confirmed') ORDER BY created_at DESC LIMIT 1`,
        [workspaceId, assignment.subjectId]
      )
    : null;
  const conflicts = schedule
    ? await queryAll<{ id: string }>(
        `SELECT * FROM ${TABLES.scheduleEntries}
         WHERE workspace_id = ? AND resource_id = ? AND status = 'confirmed'
           AND start_at < ? AND end_at > ? AND id != ?`,
        [workspaceId, newResourceId, schedule.end_at, schedule.start_at, schedule.id]
      )
    : [];
  const technician = assignment.subjectType === "service_visit"
    ? await queryOne<{ id: string }>(
        `SELECT id FROM ${businessTable("technician")} WHERE workspace_id = ? AND resource_id = ? LIMIT 1`,
        [workspaceId, newResourceId]
      )
    : null;
  if (assignment.subjectType === "service_visit" && !technician) {
    throw new BusinessError(ERROR_CODES.INVALID_INPUT, "INVALID_INPUT: The new resource is not linked to a technician record.", 400);
  }

  const newAssignmentId = genId("asgn");
  const ts = now();
  const oldVersion = assignment.version + 1;

  await runBatch([
    // Release old assignment
    {
      sql: `UPDATE ${TABLES.assignments}
            SET status = 'released', effective_to = ?, version = ?, updated_at = ?
            WHERE workspace_id = ? AND id = ? AND version = ?`,
      args: [ts, oldVersion, ts, workspaceId, assignmentId, assignment.version],
    },
    // Create a dispatch-ready assignment for the new resource.
    {
      sql: `INSERT INTO ${TABLES.assignments}
            (id, workspace_id, subject_type, subject_id, resource_id, role_key,
             status, proposed_by, effective_from, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?, 1, ?, ?)`,
      args: [
        newAssignmentId,
        workspaceId,
        assignment.subjectType,
        assignment.subjectId,
        newResourceId,
        assignment.roleKey,
        reassignedBy,
        ts,
        ts,
        ts,
      ],
      },
    ...(schedule ? [{
      sql: `UPDATE ${TABLES.scheduleEntries}
            SET resource_id = ?, status = ?, conflict_state = ?, version = version + 1, updated_at = ?
            WHERE workspace_id = ? AND id = ?`,
      args: [newResourceId, conflicts.length > 0 ? "tentative" : "confirmed", conflicts.length > 0 ? "conflict" : "none", ts, workspaceId, schedule.id],
    }] : []),
    ...(assignment.subjectType === "service_visit" ? [
      {
        sql: `UPDATE ${businessTable("service_visit")}
              SET technician_id = ?, assignment_id = ?, updated_at = ?
              WHERE workspace_id = ? AND id = ?`,
        args: [technician!.id, newAssignmentId, ts, workspaceId, assignment.subjectId],
      },
      {
        sql: `UPDATE ${TABLES.visitExecutionItems}
              SET resource_id = ?, assignment_id = ?, updated_at = ?
              WHERE workspace_id = ? AND visit_id = ? AND status IN ('ready', 'active')`,
        args: [newResourceId, newAssignmentId, ts, workspaceId, assignment.subjectId],
      },
    ] : []),
  ]);

  return { newAssignmentId };
}

/**
 * Release: cancel current assignment.
 * Moves an accepted or assigned assignment to the released state.
 */
export async function releaseAssignment(
  workspaceId: string,
  assignmentId: string,
  releasedBy: string,
  reason?: string
): Promise<void> {
  const assignment = await getAssignment(workspaceId, assignmentId);
  if (!assignment) {
    throw new NotFoundError(`Assignment not found: ${assignmentId}`);
  }

  if (assignment.status === "released" || assignment.status === "rejected") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Cannot release assignment in status '${assignment.status}'.`,
      409
    );
  }

  const ts = now();
  const newVersion = assignment.version + 1;

  await execute(
    `UPDATE ${TABLES.assignments}
     SET status = 'released', effective_to = ?, rejection_reason = ?, version = ?, updated_at = ?
     WHERE workspace_id = ? AND id = ? AND version = ?`,
    [ts, reason ?? null, newVersion, ts, workspaceId, assignmentId, assignment.version]
  );
}

// ── Queries ──

/**
 * Get current active assignment for a subject.
 * Returns the most recently created assignment with status='accepted'.
 */
export async function getCurrentAssignment(
  workspaceId: string,
  subjectType: string,
  subjectId: string
): Promise<Assignment | undefined> {
  const row = await queryOne<AssignmentRow>(
    `SELECT * FROM ${TABLES.assignments}
     WHERE workspace_id = ? AND subject_type = ? AND subject_id = ? AND status = 'accepted'
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, subjectType, subjectId]
  );
  return row ? mapAssignment(row) : undefined;
}

/**
 * Get assignment by ID.
 */
export async function getAssignment(
  workspaceId: string,
  assignmentId: string
): Promise<Assignment | undefined> {
  const row = await queryOne<AssignmentRow>(
    `SELECT * FROM ${TABLES.assignments}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, assignmentId]
  );
  return row ? mapAssignment(row) : undefined;
}
