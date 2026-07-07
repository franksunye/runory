// ── FSM Commands (v0.5 Slice 4) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.6 and §7:
// Work Order and Service Visit state transitions are governed commands.
// Each command goes through executeCommand() for idempotency, optimistic
// locking, and atomic persistence.
//
// Work Order FSM:
//   new → triaged → planned → in_progress → completed
//                    ↕             ↕
//                  blocked ← → (previous)
//   any non-terminal → cancelled
//   completed/cancelled → reopened
//
// Service Visit FSM:
//   scheduled → en_route → on_site → completed
//   any non-terminal → cancelled

import { genId, now, queryOne, queryAll, execute, batch as runBatch } from "./db";
import { TABLES, businessTable } from "./contracts";
import { BusinessError, NotFoundError, ConflictError } from "./context";
import { ERROR_CODES } from "./errors";
import {
  executeCommand,
  checkOptimisticLock,
  type CommandActor,
  type CommandHandlerResult,
} from "./command-runtime";
import { proposeAssignment, assignAssignment, acceptAssignment, releaseAssignment } from "./assignment";
import { planSchedule, confirmSchedule, cancelSchedule } from "./schedule";

// Re-export CommandActor so consumers of fsm-commands do not need to depend
// on command-runtime directly for the actor type.
export type { CommandActor } from "./command-runtime";

// ── Types ──

export interface WorkOrderRecord {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  company_id: string | null;
  contact_id: string | null;
  service_site_id: string | null;
  asset_id: string | null;
  assigned_to: string | null;
  requested_at: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  completed_at: string | null;
  sla_due_at: string | null;
  source: string | null;
  notes: string | null;
  work_order_number: string | null;
  aggregate_version: number;
  source_type: string | null;
  source_id: string | null;
  source_snapshot_hash: string | null;
  owner_resource_id: string | null;
  cancelled_at: string | null;
  reopened_at: string | null;
  completion_reason: string | null;
  cancellation_reason: string | null;
  reopen_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceVisitRecord {
  id: string;
  workspace_id: string;
  title: string | null;
  work_order_id: string;
  technician_id: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  notes: string | null;
  aggregate_version: number;
  assignment_id: string | null;
  schedule_entry_id: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers: Read Records ──

async function readWorkOrder(workspaceId: string, workOrderId: string): Promise<WorkOrderRecord> {
  const row = await queryOne<WorkOrderRecord>(
    `SELECT * FROM ${businessTable("work_order")} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workOrderId]
  );
  if (!row) {
    throw new NotFoundError(`Work order not found: ${workOrderId}`);
  }
  return row;
}

async function readServiceVisit(workspaceId: string, visitId: string): Promise<ServiceVisitRecord> {
  const row = await queryOne<ServiceVisitRecord>(
    `SELECT * FROM ${businessTable("service_visit")} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, visitId]
  );
  if (!row) {
    throw new NotFoundError(`Service visit not found: ${visitId}`);
  }
  return row;
}

// ── Block/Unblock Marker Helper ──
//
// The work_order table has no dedicated previous_status column, so we encode
// the pre-block status in the notes field using a parseable marker.
// Format: [BLOCKED_FROM:<status>]

const BLOCK_MARKER_RE = /\[BLOCKED_FROM:([a-z_]+)\]/;

function encodeBlockedNotes(previousStatus: string, existingNotes: string | null): string {
  const marker = `[BLOCKED_FROM:${previousStatus}]`;
  return existingNotes ? `${marker} ${existingNotes}` : marker;
}

function decodeBlockedNotes(notes: string | null): { previousStatus: string; cleanNotes: string | null } {
  if (!notes) {
    return { previousStatus: "triaged", cleanNotes: null };
  }
  const match = notes.match(BLOCK_MARKER_RE);
  if (!match) {
    return { previousStatus: "triaged", cleanNotes: notes };
  }
  const previousStatus = match[1];
  const cleanNotes = notes.replace(BLOCK_MARKER_RE, "").trim() || null;
  return { previousStatus, cleanNotes };
}

// ── Work Order Commands ──

/**
 * work_order.triage: new → triaged
 * Dispatches a new work order by setting priority, company, and contact.
 */
export async function triageWorkOrder(
  workspaceId: string,
  workOrderId: string,
  actor: CommandActor,
  expectedVersion: number,
  dispatchData?: {
    priority?: string;
    companyId?: string;
    contactId?: string;
  },
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_order.triage",
      aggregateType: "work_order",
      aggregateId: workOrderId,
      expectedVersion,
      actor,
      input: { workOrderId, ...dispatchData },
      occurredAt: now(),
    },
    async () => {
      const wo = await readWorkOrder(workspaceId, workOrderId);
      checkOptimisticLock(wo.aggregate_version, expectedVersion);

      if (wo.status !== "new") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot triage work order in status '${wo.status}'. Only 'new' work orders can be triaged.`,
          409
        );
      }

      const ts = now();
      const newVersion = wo.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("work_order")}
                SET status = 'triaged',
                    priority = COALESCE(?, priority),
                    company_id = COALESCE(?, company_id),
                    contact_id = COALESCE(?, contact_id),
                    aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [
            dispatchData?.priority ?? null,
            dispatchData?.companyId ?? null,
            dispatchData?.contactId ?? null,
            newVersion, ts,
            workspaceId, workOrderId,
          ],
        },
      ];

      const updatedWo: Partial<WorkOrderRecord> = {
        ...wo,
        status: "triaged",
        priority: dispatchData?.priority ?? wo.priority,
        company_id: dispatchData?.companyId ?? wo.company_id,
        contact_id: dispatchData?.contactId ?? wo.contact_id,
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "work_order",
          aggregateId: workOrderId,
          eventType: "work_order.triaged",
          payload: { workOrderId, priority: dispatchData?.priority, companyId: dispatchData?.companyId, contactId: dispatchData?.contactId },
        }],
        audit: {
          action: "work_order.triage",
          entityType: "work_order",
          entityId: workOrderId,
          before: { status: wo.status, aggregate_version: wo.aggregate_version },
          after: { status: "triaged", aggregate_version: newVersion },
        },
        aggregate: updatedWo,
        newVersion,
      } as CommandHandlerResult<Partial<WorkOrderRecord>>;
    }
  );
}

/**
 * work_order.create_visit: triaged/planned → (creates service_visit)
 * Creates a service visit linked to the work order. Optionally assigns a
 * technician and plans a schedule entry.
 */
export async function createVisit(
  workspaceId: string,
  workOrderId: string,
  actor: CommandActor,
  expectedVersion: number,
  visitData?: {
    title?: string;
    technicianId?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
    notes?: string;
  },
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_order.create_visit",
      aggregateType: "work_order",
      aggregateId: workOrderId,
      expectedVersion,
      actor,
      input: { workOrderId, ...visitData },
      occurredAt: now(),
    },
    async () => {
      const wo = await readWorkOrder(workspaceId, workOrderId);
      checkOptimisticLock(wo.aggregate_version, expectedVersion);

      const allowedStatuses = ["triaged", "planned", "in_progress"];
      if (!allowedStatuses.includes(wo.status)) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot create visit for work order in status '${wo.status}'. Allowed: ${allowedStatuses.join(", ")}`,
          409
        );
      }

      const visitId = genId("visit");
      const ts = now();

      // Side effects: propose assignment and plan schedule if data is provided
      let assignmentId: string | null = null;
      let scheduleEntryId: string | null = null;

      if (visitData?.technicianId) {
        const result = await proposeAssignment(workspaceId, {
          subjectType: "service_visit",
          subjectId: visitId,
          resourceId: visitData.technicianId,
          proposedBy: actor.id,
        });
        assignmentId = result.assignmentId;
      }

      if (visitData?.scheduledStart) {
        const result = await planSchedule(workspaceId, {
          subjectType: "service_visit",
          subjectId: visitId,
          resourceId: visitData.technicianId ?? wo.owner_resource_id ?? "unassigned",
          startAt: visitData.scheduledStart,
          endAt: visitData.scheduledEnd ?? visitData.scheduledStart,
        });
        scheduleEntryId = result.scheduleEntryId;
      }

      const newVersion = wo.aggregate_version + 1;
      const newWoStatus = wo.status === "triaged" ? "planned" : wo.status;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        // Create the service visit (v1.1 schema with aggregate_version, assignment_id, schedule_entry_id, outcome)
        {
          sql: `INSERT INTO ${businessTable("service_visit")}
                (id, workspace_id, title, work_order_id, technician_id,
                 scheduled_start, scheduled_end, actual_start, actual_end,
                 status, notes, aggregate_version, assignment_id, schedule_entry_id, outcome,
                 created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'scheduled', ?, 1, ?, ?, NULL, ?, ?)`,
          args: [
            visitId, workspaceId,
            visitData?.title ?? wo.title,
            workOrderId,
            visitData?.technicianId ?? null,
            visitData?.scheduledStart ?? now(),
            visitData?.scheduledEnd ?? null,
            visitData?.notes ?? null,
            assignmentId,
            scheduleEntryId,
            ts, ts,
          ],
        },
        // Update work order (bump version, set to planned if was triaged)
        {
          sql: `UPDATE ${businessTable("work_order")}
                SET status = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [newWoStatus, newVersion, ts, workspaceId, workOrderId],
        },
      ];

      const updatedWo: Partial<WorkOrderRecord> = {
        ...wo,
        status: newWoStatus,
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "work_order",
          aggregateId: workOrderId,
          eventType: "work_order.visit_created",
          payload: { workOrderId, visitId, technicianId: visitData?.technicianId, assignmentId, scheduleEntryId },
        }],
        audit: {
          action: "work_order.create_visit",
          entityType: "work_order",
          entityId: workOrderId,
          before: { status: wo.status, aggregate_version: wo.aggregate_version },
          after: { status: newWoStatus, aggregate_version: newVersion, visitId },
        },
        aggregate: updatedWo,
        newVersion,
      } as CommandHandlerResult<Partial<WorkOrderRecord>>;
    }
  );
}

/**
 * work_order.block: any non-terminal → blocked
 * Stores the previous status in the notes field for later restoration.
 */
export async function blockWorkOrder(
  workspaceId: string,
  workOrderId: string,
  actor: CommandActor,
  expectedVersion: number,
  reason: string,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_order.block",
      aggregateType: "work_order",
      aggregateId: workOrderId,
      expectedVersion,
      actor,
      input: { workOrderId, reason },
      occurredAt: now(),
    },
    async () => {
      const wo = await readWorkOrder(workspaceId, workOrderId);
      checkOptimisticLock(wo.aggregate_version, expectedVersion);

      const terminalStatuses = ["completed", "cancelled"];
      if (terminalStatuses.includes(wo.status)) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot block work order in status '${wo.status}'. Terminal statuses cannot be blocked.`,
          409
        );
      }

      if (wo.status === "blocked") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Work order is already blocked.`,
          409
        );
      }

      const ts = now();
      const newVersion = wo.aggregate_version + 1;
      const blockedNotes = encodeBlockedNotes(wo.status, wo.notes);

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("work_order")}
                SET status = 'blocked', notes = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [blockedNotes, newVersion, ts, workspaceId, workOrderId],
        },
      ];

      const updatedWo: Partial<WorkOrderRecord> = {
        ...wo,
        status: "blocked",
        notes: blockedNotes,
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "work_order",
          aggregateId: workOrderId,
          eventType: "work_order.blocked",
          payload: { workOrderId, reason, previousStatus: wo.status },
        }],
        audit: {
          action: "work_order.block",
          entityType: "work_order",
          entityId: workOrderId,
          before: { status: wo.status, aggregate_version: wo.aggregate_version },
          after: { status: "blocked", aggregate_version: newVersion, reason },
        },
        aggregate: updatedWo,
        newVersion,
      } as CommandHandlerResult<Partial<WorkOrderRecord>>;
    }
  );
}

/**
 * work_order.unblock: blocked → (previous status)
 * Restores the work order to its pre-block status.
 */
export async function unblockWorkOrder(
  workspaceId: string,
  workOrderId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_order.unblock",
      aggregateType: "work_order",
      aggregateId: workOrderId,
      expectedVersion,
      actor,
      input: { workOrderId },
      occurredAt: now(),
    },
    async () => {
      const wo = await readWorkOrder(workspaceId, workOrderId);
      checkOptimisticLock(wo.aggregate_version, expectedVersion);

      if (wo.status !== "blocked") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot unblock work order in status '${wo.status}'. Only 'blocked' work orders can be unblocked.`,
          409
        );
      }

      const { previousStatus, cleanNotes } = decodeBlockedNotes(wo.notes);
      const ts = now();
      const newVersion = wo.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("work_order")}
                SET status = ?, notes = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [previousStatus, cleanNotes, newVersion, ts, workspaceId, workOrderId],
        },
      ];

      const updatedWo: Partial<WorkOrderRecord> = {
        ...wo,
        status: previousStatus,
        notes: cleanNotes,
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "work_order",
          aggregateId: workOrderId,
          eventType: "work_order.unblocked",
          payload: { workOrderId, restoredStatus: previousStatus },
        }],
        audit: {
          action: "work_order.unblock",
          entityType: "work_order",
          entityId: workOrderId,
          before: { status: "blocked", aggregate_version: wo.aggregate_version },
          after: { status: previousStatus, aggregate_version: newVersion },
        },
        aggregate: updatedWo,
        newVersion,
      } as CommandHandlerResult<Partial<WorkOrderRecord>>;
    }
  );
}

/**
 * work_order.start: planned/reopened → in_progress
 * Marks a planned or reopened work order as actively being executed.
 */
export async function startWorkOrder(
  workspaceId: string,
  workOrderId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_order.start",
      aggregateType: "work_order",
      aggregateId: workOrderId,
      expectedVersion,
      actor,
      input: { workOrderId },
      occurredAt: now(),
    },
    async () => {
      const wo = await readWorkOrder(workspaceId, workOrderId);
      checkOptimisticLock(wo.aggregate_version, expectedVersion);

      const allowedStatuses = ["planned", "reopened"];
      if (!allowedStatuses.includes(wo.status)) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot start work order in status '${wo.status}'. Allowed: ${allowedStatuses.join(", ")}`,
          409
        );
      }

      const ts = now();
      const newVersion = wo.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("work_order")}
                SET status = 'in_progress',
                    aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [newVersion, ts, workspaceId, workOrderId],
        },
      ];

      const updatedWo: Partial<WorkOrderRecord> = {
        ...wo,
        status: "in_progress",
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "work_order",
          aggregateId: workOrderId,
          eventType: "work_order.started",
          payload: { workOrderId, startedAt: ts },
        }],
        audit: {
          action: "work_order.start",
          entityType: "work_order",
          entityId: workOrderId,
          before: { status: wo.status, aggregate_version: wo.aggregate_version },
          after: { status: "in_progress", aggregate_version: newVersion },
        },
        aggregate: updatedWo,
        newVersion,
      } as CommandHandlerResult<Partial<WorkOrderRecord>>;
    }
  );
}

/**
 * work_order.complete: in_progress → completed
 * Verifies all service visits are completed and no pending work items remain.
 */
export async function completeWorkOrder(
  workspaceId: string,
  workOrderId: string,
  actor: CommandActor,
  expectedVersion: number,
  completionReason?: string,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_order.complete",
      aggregateType: "work_order",
      aggregateId: workOrderId,
      expectedVersion,
      actor,
      input: { workOrderId, completionReason },
      occurredAt: now(),
    },
    async () => {
      const wo = await readWorkOrder(workspaceId, workOrderId);
      checkOptimisticLock(wo.aggregate_version, expectedVersion);

      if (wo.status !== "in_progress") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot complete work order in status '${wo.status}'. Only 'in_progress' work orders can be completed.`,
          409
        );
      }

      // Verify all service visits for this work order are completed or cancelled
      const incompleteVisits = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${businessTable("service_visit")}
         WHERE workspace_id = ? AND work_order_id = ?
           AND status NOT IN ('completed', 'cancelled')`,
        [workspaceId, workOrderId]
      );
      if (incompleteVisits && incompleteVisits.count > 0) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot complete work order with ${incompleteVisits.count} incomplete service visit(s). All visits must be completed or cancelled first.`,
          409
        );
      }

      // Verify no open (ready) work items
      const pendingWorkItems = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${TABLES.workItems}
         WHERE workspace_id = ? AND subject_type = 'work_order' AND subject_id = ?
           AND status = 'ready'`,
        [workspaceId, workOrderId]
      );
      if (pendingWorkItems && pendingWorkItems.count > 0) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot complete work order with ${pendingWorkItems.count} ready work item(s).`,
          409
        );
      }

      const ts = now();
      const newVersion = wo.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("work_order")}
                SET status = 'completed', completed_at = ?, completion_reason = ?,
                    aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [ts, completionReason ?? null, newVersion, ts, workspaceId, workOrderId],
        },
      ];

      const updatedWo: Partial<WorkOrderRecord> = {
        ...wo,
        status: "completed",
        completed_at: ts,
        completion_reason: completionReason ?? null,
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "work_order",
          aggregateId: workOrderId,
          eventType: "work_order.completed",
          payload: { workOrderId, completedAt: ts, completionReason },
        }],
        audit: {
          action: "work_order.complete",
          entityType: "work_order",
          entityId: workOrderId,
          before: { status: wo.status, aggregate_version: wo.aggregate_version },
          after: { status: "completed", completed_at: ts, completion_reason: completionReason },
        },
        aggregate: updatedWo,
        newVersion,
      } as CommandHandlerResult<Partial<WorkOrderRecord>>;
    }
  );
}

/**
 * work_order.cancel: non-terminal → cancelled
 * Releases assignments, cancels schedule entries, and cancels pending visits.
 */
export async function cancelWorkOrder(
  workspaceId: string,
  workOrderId: string,
  actor: CommandActor,
  expectedVersion: number,
  reason: string,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_order.cancel",
      aggregateType: "work_order",
      aggregateId: workOrderId,
      expectedVersion,
      actor,
      input: { workOrderId, reason },
      occurredAt: now(),
    },
    async () => {
      const wo = await readWorkOrder(workspaceId, workOrderId);
      checkOptimisticLock(wo.aggregate_version, expectedVersion);

      const terminalStatuses = ["completed", "cancelled"];
      if (terminalStatuses.includes(wo.status)) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot cancel work order in status '${wo.status}'. Terminal statuses cannot be cancelled.`,
          409
        );
      }

      const ts = now();
      const newVersion = wo.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        // Cancel the work order
        {
          sql: `UPDATE ${businessTable("work_order")}
                SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?,
                    aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [ts, reason, newVersion, ts, workspaceId, workOrderId],
        },
        // Release assignments for this work order
        {
          sql: `UPDATE ${TABLES.assignments}
                SET status = 'released', effective_to = ?, version = version + 1, updated_at = ?
                WHERE workspace_id = ? AND subject_type = 'work_order' AND subject_id = ?
                  AND status IN ('proposed', 'assigned', 'accepted')`,
          args: [ts, ts, workspaceId, workOrderId],
        },
        // Cancel schedule entries for this work order
        {
          sql: `UPDATE ${TABLES.scheduleEntries}
                SET status = 'cancelled', version = version + 1, updated_at = ?
                WHERE workspace_id = ? AND subject_type = 'work_order' AND subject_id = ?
                  AND status IN ('tentative', 'confirmed')`,
          args: [ts, workspaceId, workOrderId],
        },
        // Cancel pending service visits for this work order
        {
          sql: `UPDATE ${businessTable("service_visit")}
                SET status = 'cancelled', aggregate_version = aggregate_version + 1, updated_at = ?
                WHERE workspace_id = ? AND work_order_id = ?
                  AND status NOT IN ('completed', 'cancelled')`,
          args: [ts, workspaceId, workOrderId],
        },
      ];

      const updatedWo: Partial<WorkOrderRecord> = {
        ...wo,
        status: "cancelled",
        cancelled_at: ts,
        cancellation_reason: reason,
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "work_order",
          aggregateId: workOrderId,
          eventType: "work_order.cancelled",
          payload: { workOrderId, reason, cancelledAt: ts },
        }],
        audit: {
          action: "work_order.cancel",
          entityType: "work_order",
          entityId: workOrderId,
          before: { status: wo.status, aggregate_version: wo.aggregate_version },
          after: { status: "cancelled", cancelled_at: ts, cancellation_reason: reason },
        },
        aggregate: updatedWo,
        newVersion,
      } as CommandHandlerResult<Partial<WorkOrderRecord>>;
    }
  );
}

/**
 * work_order.reopen: completed/cancelled → reopened
 * Reopens a completed or cancelled work order for further action.
 */
export async function reopenWorkOrder(
  workspaceId: string,
  workOrderId: string,
  actor: CommandActor,
  expectedVersion: number,
  reason: string,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "work_order.reopen",
      aggregateType: "work_order",
      aggregateId: workOrderId,
      expectedVersion,
      actor,
      input: { workOrderId, reason },
      occurredAt: now(),
    },
    async () => {
      const wo = await readWorkOrder(workspaceId, workOrderId);
      checkOptimisticLock(wo.aggregate_version, expectedVersion);

      const allowedStatuses = ["completed", "cancelled"];
      if (!allowedStatuses.includes(wo.status)) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot reopen work order in status '${wo.status}'. Only 'completed' or 'cancelled' work orders can be reopened.`,
          409
        );
      }

      const ts = now();
      const newVersion = wo.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("work_order")}
                SET status = 'reopened', reopened_at = ?, reopen_reason = ?,
                    aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [ts, reason, newVersion, ts, workspaceId, workOrderId],
        },
      ];

      const updatedWo: Partial<WorkOrderRecord> = {
        ...wo,
        status: "reopened",
        reopened_at: ts,
        reopen_reason: reason,
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "work_order",
          aggregateId: workOrderId,
          eventType: "work_order.reopened",
          payload: { workOrderId, reason, reopenedAt: ts },
        }],
        audit: {
          action: "work_order.reopen",
          entityType: "work_order",
          entityId: workOrderId,
          before: { status: wo.status, aggregate_version: wo.aggregate_version },
          after: { status: "reopened", reopened_at: ts, reopen_reason: reason },
        },
        aggregate: updatedWo,
        newVersion,
      } as CommandHandlerResult<Partial<WorkOrderRecord>>;
    }
  );
}

// ── Service Visit Commands ──

/**
 * visit.start_travel: scheduled → en_route
 * Technician begins traveling to the site.
 */
export async function startTravel(
  workspaceId: string,
  visitId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "visit.start_travel",
      aggregateType: "service_visit",
      aggregateId: visitId,
      expectedVersion,
      actor,
      input: { visitId },
      occurredAt: now(),
    },
    async () => {
      const visit = await readServiceVisit(workspaceId, visitId);
      checkOptimisticLock(visit.aggregate_version, expectedVersion);

      if (visit.status !== "scheduled") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot start travel for visit in status '${visit.status}'. Only 'scheduled' visits can start travel.`,
          409
        );
      }

      const ts = now();
      const newVersion = visit.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("service_visit")}
                SET status = 'en_route', actual_start = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [ts, newVersion, ts, workspaceId, visitId],
        },
      ];

      const updatedVisit: Partial<ServiceVisitRecord> = {
        ...visit,
        status: "en_route",
        actual_start: ts,
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "service_visit",
          aggregateId: visitId,
          eventType: "visit.travel_started",
          payload: { visitId, actualStart: ts },
        }],
        audit: {
          action: "visit.start_travel",
          entityType: "service_visit",
          entityId: visitId,
          before: { status: visit.status, aggregate_version: visit.aggregate_version },
          after: { status: "en_route", actual_start: ts },
        },
        aggregate: updatedVisit,
        newVersion,
      } as CommandHandlerResult<Partial<ServiceVisitRecord>>;
    }
  );
}

/**
 * visit.arrive: en_route → on_site
 * Technician has arrived at the site.
 */
export async function arriveOnSite(
  workspaceId: string,
  visitId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "visit.arrive",
      aggregateType: "service_visit",
      aggregateId: visitId,
      expectedVersion,
      actor,
      input: { visitId },
      occurredAt: now(),
    },
    async () => {
      const visit = await readServiceVisit(workspaceId, visitId);
      checkOptimisticLock(visit.aggregate_version, expectedVersion);

      if (visit.status !== "en_route") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot arrive on site for visit in status '${visit.status}'. Only 'en_route' visits can arrive.`,
          409
        );
      }

      const ts = now();
      const newVersion = visit.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("service_visit")}
                SET status = 'on_site', aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [newVersion, ts, workspaceId, visitId],
        },
      ];

      const updatedVisit: Partial<ServiceVisitRecord> = {
        ...visit,
        status: "on_site",
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "service_visit",
          aggregateId: visitId,
          eventType: "visit.arrived_on_site",
          payload: { visitId },
        }],
        audit: {
          action: "visit.arrive",
          entityType: "service_visit",
          entityId: visitId,
          before: { status: visit.status, aggregate_version: visit.aggregate_version },
          after: { status: "on_site" },
        },
        aggregate: updatedVisit,
        newVersion,
      } as CommandHandlerResult<Partial<ServiceVisitRecord>>;
    }
  );
}

/**
 * visit.submit_work: on_site (no status change)
 * Per v0.5 spec, submitting work does not transition the visit status — the
 * visit remains on_site. The service report form is submitted separately via
 * the forms runtime. This command validates the visit is on_site and records
 * the submission event without mutating visit status or version.
 */
export async function submitWork(
  workspaceId: string,
  visitId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "visit.submit_work",
      aggregateType: "service_visit",
      aggregateId: visitId,
      expectedVersion,
      actor,
      input: { visitId },
      occurredAt: now(),
    },
    async () => {
      const visit = await readServiceVisit(workspaceId, visitId);
      checkOptimisticLock(visit.aggregate_version, expectedVersion);

      if (visit.status !== "on_site") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot submit work for visit in status '${visit.status}'. Only 'on_site' visits can submit work.`,
          409
        );
      }

      // Per v0.5 spec: submit_work does not transition the visit status. The
      // visit stays on_site and its aggregate version is not bumped. The
      // service report form is submitted separately via the forms runtime.
      const newVersion = visit.aggregate_version;

      const updatedVisit: Partial<ServiceVisitRecord> = {
        ...visit,
        status: "on_site",
        aggregate_version: newVersion,
      };

      return {
        statements: [],
        events: [{
          aggregateType: "service_visit",
          aggregateId: visitId,
          eventType: "visit.work_submitted",
          payload: { visitId },
        }],
        audit: {
          action: "visit.submit_work",
          entityType: "service_visit",
          entityId: visitId,
          before: { status: visit.status, aggregate_version: visit.aggregate_version },
          after: { status: "on_site" },
        },
        aggregate: updatedVisit,
        newVersion,
      } as CommandHandlerResult<Partial<ServiceVisitRecord>>;
    }
  );
}

/**
 * visit.complete: on_site → completed
 * Verifies required forms are accepted before completing.
 */
export async function completeVisit(
  workspaceId: string,
  visitId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "visit.complete",
      aggregateType: "service_visit",
      aggregateId: visitId,
      expectedVersion,
      actor,
      input: { visitId },
      occurredAt: now(),
    },
    async () => {
      const visit = await readServiceVisit(workspaceId, visitId);
      checkOptimisticLock(visit.aggregate_version, expectedVersion);

      if (visit.status !== "on_site") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot complete visit in status '${visit.status}'. Only 'on_site' visits can be completed.`,
          409
        );
      }

      // Verify required forms are accepted (check for submitted-but-not-accepted forms)
      const pendingForms = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${TABLES.formSubmissions}
         WHERE workspace_id = ? AND subject_type = 'service_visit' AND subject_id = ?
           AND status = 'submitted'`,
        [workspaceId, visitId]
      );
      if (pendingForms && pendingForms.count > 0) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot complete visit with ${pendingForms.count} submitted-but-not-accepted form(s). All forms must be accepted first.`,
          409
        );
      }

      const ts = now();
      const newVersion = visit.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("service_visit")}
                SET status = 'completed', actual_end = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [ts, newVersion, ts, workspaceId, visitId],
        },
      ];

      const updatedVisit: Partial<ServiceVisitRecord> = {
        ...visit,
        status: "completed",
        actual_end: ts,
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "service_visit",
          aggregateId: visitId,
          eventType: "visit.completed",
          payload: { visitId, actualEnd: ts },
        }],
        audit: {
          action: "visit.complete",
          entityType: "service_visit",
          entityId: visitId,
          before: { status: visit.status, aggregate_version: visit.aggregate_version },
          after: { status: "completed", actual_end: ts },
        },
        aggregate: updatedVisit,
        newVersion,
      } as CommandHandlerResult<Partial<ServiceVisitRecord>>;
    }
  );
}

/**
 * visit.cancel: non-terminal → cancelled
 * Cancels a service visit that is not yet in a terminal state.
 */
export async function cancelVisit(
  workspaceId: string,
  visitId: string,
  actor: CommandActor,
  expectedVersion: number,
  reason: string,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "visit.cancel",
      aggregateType: "service_visit",
      aggregateId: visitId,
      expectedVersion,
      actor,
      input: { visitId, reason },
      occurredAt: now(),
    },
    async () => {
      const visit = await readServiceVisit(workspaceId, visitId);
      checkOptimisticLock(visit.aggregate_version, expectedVersion);

      const terminalStatuses = ["completed", "cancelled"];
      if (terminalStatuses.includes(visit.status)) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot cancel visit in status '${visit.status}'. Terminal statuses cannot be cancelled.`,
          409
        );
      }

      const ts = now();
      const newVersion = visit.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("service_visit")}
                SET status = 'cancelled', notes = COALESCE(notes, '') || CASE WHEN notes IS NULL THEN '' ELSE ' ' END || ?,
                    aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [`[CANCELLED: ${reason}]`, newVersion, ts, workspaceId, visitId],
        },
      ];

      const updatedVisit: Partial<ServiceVisitRecord> = {
        ...visit,
        status: "cancelled",
        aggregate_version: newVersion,
      };

      return {
        statements,
        events: [{
          aggregateType: "service_visit",
          aggregateId: visitId,
          eventType: "visit.cancelled",
          payload: { visitId, reason },
        }],
        audit: {
          action: "visit.cancel",
          entityType: "service_visit",
          entityId: visitId,
          before: { status: visit.status, aggregate_version: visit.aggregate_version },
          after: { status: "cancelled", reason },
        },
        aggregate: updatedVisit,
        newVersion,
      } as CommandHandlerResult<Partial<ServiceVisitRecord>>;
    }
  );
}
