/**
 * v0.9.2 PWA Notification — Command push hooks (Slice B + C).
 *
 * Spec: v0.9 PWA Notification Technical Spec §2 (P0 value and events),
 *   §4 (One notification model), §8 (Privacy and content rules)
 *
 * Maps governed business commands to push notification dispatch calls.
 * Called AFTER the command succeeds — push dispatch is a side effect that
 * must never block or fail the business mutation.
 *
 * Slice B (system users): work_assignment, schedule_change, work_returned,
 *   approval_ready
 * Slice C (external users): customer_document, payment_status, service_status
 *
 * Privacy: titles and bodies contain no customer name, address, payment
 * amount, invoice details, or sensitive business content (Spec §8).
 */

import { TABLES, businessTable } from "./contracts";
import { queryOne, queryAll } from "./db";
import { dispatchPushNotification } from "./push-dispatch";
import type { PushCategory } from "./push-preferences";

// ── Types ──

export interface PushHookContext {
  workspaceId: string;
  commandType: string;
  /** The aggregate ID the command operated on */
  aggregateId?: string;
  /** The command result (from executeCommand or direct return) */
  result?: Record<string, unknown>;
  /** The original request body */
  input?: Record<string, unknown>;
}

// ── Recipient Resolution ──

/**
 * Resolve a resource ID to a workspace_membership ID.
 * Resources have a user_id; memberships link users to workspaces.
 */
async function resolveMembershipFromResource(
  workspaceId: string,
  resourceId: string,
): Promise<string | null> {
  const row = await queryOne<{ membership_id: string }>(
    `SELECT wm.id AS membership_id
     FROM ${TABLES.workspaceMemberships} wm
     INNER JOIN ${TABLES.resources} r
       ON r.user_id = wm.user_id AND r.workspace_id = wm.workspace_id
     WHERE r.workspace_id = ? AND r.id = ? AND wm.status = 'active'
     LIMIT 1`,
    [workspaceId, resourceId],
  );
  return row?.membership_id ?? null;
}

/**
 * Resolve the assigned resource from an assignment ID.
 */
async function resolveResourceFromAssignment(
  workspaceId: string,
  assignmentId: string,
): Promise<{ resourceId: string; subjectType: string; subjectId: string } | null> {
  const row = await queryOne<{ resource_id: string; subject_type: string; subject_id: string }>(
    `SELECT resource_id, subject_type, subject_id
     FROM ${TABLES.assignments}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, assignmentId],
  );
  if (!row) return null;
  return {
    resourceId: row.resource_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
  };
}

/**
 * Resolve the resource from a schedule entry.
 */
async function resolveResourceFromSchedule(
  workspaceId: string,
  scheduleEntryId: string,
): Promise<{ resourceId: string; subjectType: string; subjectId: string } | null> {
  const row = await queryOne<{ resource_id: string; subject_type: string; subject_id: string }>(
    `SELECT resource_id, subject_type, subject_id
     FROM ${TABLES.scheduleEntries}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, scheduleEntryId],
  );
  if (!row) return null;
  return {
    resourceId: row.resource_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
  };
}

/**
 * Resolve the assignee from a work item.
 */
async function resolveAssigneeFromWorkItem(
  workspaceId: string,
  workItemId: string,
): Promise<{ resourceId: string; subjectType: string; subjectId: string } | null> {
  const row = await queryOne<{ resource_id: string; subject_type: string; subject_id: string }>(
    `SELECT resource_id, subject_type, subject_id
     FROM ${TABLES.workItems}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId],
  );
  if (!row) return null;
  return {
    resourceId: row.resource_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
  };
}

// ── Privacy-safe message builders (system users) ──

function buildWorkAssignmentMessage(): { title: string; body: string } {
  return {
    title: "Work assigned",
    body: "You have been assigned new work. Open to review.",
  };
}

function buildWorkReassignedMessage(): { title: string; body: string } {
  return {
    title: "Work reassigned",
    body: "Your assignment has changed. Open to review.",
  };
}

function buildScheduleChangedMessage(): { title: string; body: string } {
  return {
    title: "Schedule updated",
    body: "A visit time has been changed. Open to view.",
  };
}

function buildScheduleCancelledMessage(): { title: string; body: string } {
  return {
    title: "Visit cancelled",
    body: "A scheduled visit has been cancelled. Open to view.",
  };
}

function buildWorkReturnedMessage(): { title: string; body: string } {
  return {
    title: "Work returned",
    body: "Submitted work was returned for correction. Open to review.",
  };
}

function buildApprovalReadyMessage(): { title: string; body: string } {
  return {
    title: "Approval needed",
    body: "A work item is ready for your review. Open to action.",
  };
}

// ── Privacy-safe message builders (external users) ──

function buildQuoteReadyMessage(): { title: string; body: string } {
  return {
    title: "Document ready",
    body: "A document is ready for your review. Open to view.",
  };
}

function buildInvoiceReadyMessage(): { title: string; body: string } {
  return {
    title: "Invoice ready",
    body: "An invoice is available. Open to view details.",
  };
}

function buildPaymentStatusMessage(): { title: string; body: string } {
  return {
    title: "Payment update",
    body: "A payment status has changed. Open to view.",
  };
}

function buildServiceCompletedMessage(): { title: string; body: string } {
  return {
    title: "Service update",
    body: "A service visit has been completed. Open to view.",
  };
}

function buildVisitCancelledExternalMessage(): { title: string; body: string } {
  return {
    title: "Schedule update",
    body: "A visit schedule has changed. Open to view.",
  };
}

// ── Deep link builders ──

function workItemRoute(workspaceId: string, workItemId: string): string {
  return `/m/w/${workspaceId}/work/${workItemId}`;
}

function visitRoute(workspaceId: string, visitId: string): string {
  return `/m/w/${workspaceId}/visits/${visitId}`;
}

function scheduleRoute(workspaceId: string): string {
  return `/m/w/${workspaceId}/schedule`;
}

/**
 * External users access through the customer access portal.
 * The deep link points to the access entry; the customer re-authenticates
 * with their token to see scoped content.
 */
function accessRoute(): string {
  return "/access";
}

// ── External user grant resolution ──

/**
 * Resolve active customer access grants for a root record.
 * Returns grant IDs that can be used as push principal IDs.
 */
async function resolveActiveGrantsForRoot(
  workspaceId: string,
  rootObjectType: "quote" | "work_order",
  rootRecordId: string,
): Promise<string[]> {
  const rows = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.customerAccessGrants}
     WHERE workspace_id = ? AND root_object_type = ? AND root_record_id = ?
       AND status = 'active'`,
    [workspaceId, rootObjectType, rootRecordId],
  );
  return rows.map((r) => r.id);
}

/**
 * Resolve the work order ID from a quote ID.
 */
async function resolveWorkOrderFromQuote(
  workspaceId: string,
  quoteId: string,
): Promise<string | null> {
  const row = await queryOne<{ work_order_id: string }>(
    `SELECT work_order_id FROM ${businessTable("quote")}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, quoteId],
  );
  return row?.work_order_id ?? null;
}

/**
 * Resolve the work order ID from a visit ID.
 */
async function resolveWorkOrderFromVisit(
  workspaceId: string,
  visitId: string,
): Promise<string | null> {
  const row = await queryOne<{ work_order_id: string }>(
    `SELECT work_order_id FROM ${businessTable("service_visit")}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, visitId],
  );
  return row?.work_order_id ?? null;
}

/**
 * Dispatch push to all active grants for a root record.
 */
async function dispatchToGrants(
  workspaceId: string,
  rootObjectType: "quote" | "work_order",
  rootRecordId: string,
  category: PushCategory,
  title: string,
  body: string,
  tag: string,
  sourceType: string,
  sourceId: string,
): Promise<number> {
  const grantIds = await resolveActiveGrantsForRoot(workspaceId, rootObjectType, rootRecordId);
  let dispatched = 0;
  for (const grantId of grantIds) {
    const result = await dispatchPushNotification({
      workspaceId,
      category,
      principalType: "customer_access_grant",
      principalId: grantId,
      title,
      body,
      route: accessRoute(),
      tag: `${tag}:${grantId}`,
      sourceType,
      sourceId,
    });
    dispatched += result.dispatched;
  }
  return dispatched;
}

// ── Hook dispatcher ──

/**
 * Trigger push notifications for a completed command.
 *
 * This function is fire-and-forget: all errors are caught and returned
 * as a summary. The caller should NOT await it in the critical path.
 */
export async function triggerPushForCommand(
  ctx: PushHookContext,
): Promise<{ dispatched: number; errors: string[] }> {
  const errors: string[] = [];
  let dispatched = 0;

  try {
    switch (ctx.commandType) {
      // ── work_assignment: assignment.assign ──
      case "assignment.assign": {
        if (!ctx.aggregateId) break;
        const assignment = await resolveResourceFromAssignment(ctx.workspaceId, ctx.aggregateId);
        if (!assignment) break;
        const membershipId = await resolveMembershipFromResource(ctx.workspaceId, assignment.resourceId);
        if (!membershipId) break;

        const { title, body } = buildWorkAssignmentMessage();
        const route = assignment.subjectType === "service_visit"
          ? visitRoute(ctx.workspaceId, assignment.subjectId)
          : workItemRoute(ctx.workspaceId, assignment.subjectId);

        const result = await dispatchPushNotification({
          workspaceId: ctx.workspaceId,
          category: "work_assignment" as PushCategory,
          principalType: "workspace_membership",
          principalId: membershipId,
          title,
          body,
          route,
          tag: `assignment:${ctx.aggregateId}`,
          sourceType: "assignment",
          sourceId: ctx.aggregateId,
        });
        dispatched += result.dispatched;
        break;
      }

      // ── work_assignment: assignment.reassign ──
      case "assignment.reassign": {
        if (!ctx.aggregateId) break;
        // reassignAssignment returns { newAssignmentId }
        const newAssignmentId = ctx.result?.newAssignmentId as string;
        if (!newAssignmentId) break;

        const assignment = await resolveResourceFromAssignment(ctx.workspaceId, newAssignmentId);
        if (!assignment) break;
        const membershipId = await resolveMembershipFromResource(ctx.workspaceId, assignment.resourceId);
        if (!membershipId) break;

        const { title, body } = buildWorkReassignedMessage();
        const route = assignment.subjectType === "service_visit"
          ? visitRoute(ctx.workspaceId, assignment.subjectId)
          : workItemRoute(ctx.workspaceId, assignment.subjectId);

        const result = await dispatchPushNotification({
          workspaceId: ctx.workspaceId,
          category: "work_assignment" as PushCategory,
          principalType: "workspace_membership",
          principalId: membershipId,
          title,
          body,
          route,
          tag: `assignment:${newAssignmentId}`,
          sourceType: "assignment",
          sourceId: newAssignmentId,
        });
        dispatched += result.dispatched;
        break;
      }

      // ── schedule_change: schedule.reschedule ──
      case "schedule.reschedule": {
        if (!ctx.aggregateId) break;
        const schedule = await resolveResourceFromSchedule(ctx.workspaceId, ctx.aggregateId);
        if (!schedule) break;
        const membershipId = await resolveMembershipFromResource(ctx.workspaceId, schedule.resourceId);
        if (!membershipId) break;

        const { title, body } = buildScheduleChangedMessage();
        const route = schedule.subjectType === "service_visit"
          ? visitRoute(ctx.workspaceId, schedule.subjectId)
          : scheduleRoute(ctx.workspaceId);

        const result = await dispatchPushNotification({
          workspaceId: ctx.workspaceId,
          category: "schedule_change" as PushCategory,
          principalType: "workspace_membership",
          principalId: membershipId,
          title,
          body,
          route,
          tag: `schedule:${ctx.aggregateId}`,
          sourceType: "schedule_entry",
          sourceId: ctx.aggregateId,
        });
        dispatched += result.dispatched;
        break;
      }

      // ── schedule_change: schedule.cancel ──
      case "schedule.cancel": {
        if (!ctx.aggregateId) break;
        const schedule = await resolveResourceFromSchedule(ctx.workspaceId, ctx.aggregateId);
        if (!schedule) break;
        const membershipId = await resolveMembershipFromResource(ctx.workspaceId, schedule.resourceId);
        if (!membershipId) break;

        const { title, body } = buildScheduleCancelledMessage();
        const route = scheduleRoute(ctx.workspaceId);

        const result = await dispatchPushNotification({
          workspaceId: ctx.workspaceId,
          category: "schedule_change" as PushCategory,
          principalType: "workspace_membership",
          principalId: membershipId,
          title,
          body,
          route,
          tag: `schedule:${ctx.aggregateId}`,
          sourceType: "schedule_entry",
          sourceId: ctx.aggregateId,
        });
        dispatched += result.dispatched;
        break;
      }

      // ── work_returned: work_item.return ──
      case "work_item.return": {
        if (!ctx.aggregateId) break;
        const workItem = await resolveAssigneeFromWorkItem(ctx.workspaceId, ctx.aggregateId);
        if (!workItem?.resourceId) break;
        const membershipId = await resolveMembershipFromResource(ctx.workspaceId, workItem.resourceId);
        if (!membershipId) break;

        const { title, body } = buildWorkReturnedMessage();
        const route = workItemRoute(ctx.workspaceId, ctx.aggregateId);

        const result = await dispatchPushNotification({
          workspaceId: ctx.workspaceId,
          category: "work_returned" as PushCategory,
          principalType: "workspace_membership",
          principalId: membershipId,
          title,
          body,
          route,
          tag: `work-item:${ctx.aggregateId}`,
          sourceType: "work_item",
          sourceId: ctx.aggregateId,
        });
        dispatched += result.dispatched;
        break;
      }

      // ── approval_ready: approval.decide with outcome "returned" ──
      // When an approval is returned, the original submitter's work item
      // becomes actionable again.
      case "approval.decide": {
        if (!ctx.aggregateId) break;
        const outcome = ctx.input?.outcome as string | undefined;
        if (outcome !== "returned") break;

        // The aggregateId for approval.decide is the work item being decided
        const workItem = await resolveAssigneeFromWorkItem(ctx.workspaceId, ctx.aggregateId);
        if (!workItem?.resourceId) break;
        const membershipId = await resolveMembershipFromResource(ctx.workspaceId, workItem.resourceId);
        if (!membershipId) break;

        const { title, body } = buildWorkReturnedMessage();
        const route = workItemRoute(ctx.workspaceId, ctx.aggregateId);

        const result = await dispatchPushNotification({
          workspaceId: ctx.workspaceId,
          category: "work_returned" as PushCategory,
          principalType: "workspace_membership",
          principalId: membershipId,
          title,
          body,
          route,
          tag: `work-item:${ctx.aggregateId}`,
          sourceType: "approval",
          sourceId: ctx.aggregateId,
        });
        dispatched += result.dispatched;
        break;
      }

      // ── approval_ready: work_item.claim (work becomes actionable for the claimer) ──
      case "work_item.claim": {
        if (!ctx.aggregateId) break;
        const workItem = await resolveAssigneeFromWorkItem(ctx.workspaceId, ctx.aggregateId);
        if (!workItem?.resourceId) break;
        const membershipId = await resolveMembershipFromResource(ctx.workspaceId, workItem.resourceId);
        if (!membershipId) break;

        const { title, body } = buildApprovalReadyMessage();
        const route = workItemRoute(ctx.workspaceId, ctx.aggregateId);

        const result = await dispatchPushNotification({
          workspaceId: ctx.workspaceId,
          category: "approval_ready" as PushCategory,
          principalType: "workspace_membership",
          principalId: membershipId,
          title,
          body,
          route,
          tag: `work-item:${ctx.aggregateId}`,
          sourceType: "work_item",
          sourceId: ctx.aggregateId,
        });
        dispatched += result.dispatched;
        break;
      }

      // ──────────────────────────────────────────────────────────
      //  Slice C — External customer-access user P0 events
      // ──────────────────────────────────────────────────────────

      // ── customer_document: quote.mark_sent (Quote is ready for customer) ──
      case "quote.mark_sent": {
        if (!ctx.aggregateId) break;
        const msg = buildQuoteReadyMessage();
        // Try grants directly on the quote first
        dispatched += await dispatchToGrants(
          ctx.workspaceId, "quote", ctx.aggregateId,
          "customer_document", msg.title, msg.body,
          "quote", "quote", ctx.aggregateId,
        );
        // Also try grants on the linked work order (converted quotes)
        const woId = await resolveWorkOrderFromQuote(ctx.workspaceId, ctx.aggregateId);
        if (woId) {
          dispatched += await dispatchToGrants(
            ctx.workspaceId, "work_order", woId,
            "customer_document", msg.title, msg.body,
            "quote", "quote", ctx.aggregateId,
          );
        }
        break;
      }

      // ── customer_document: quote.accept (Quote acceptance state changed) ──
      case "quote.accept": {
        if (!ctx.aggregateId) break;
        const msg = buildQuoteReadyMessage();
        dispatched += await dispatchToGrants(
          ctx.workspaceId, "quote", ctx.aggregateId,
          "customer_document", msg.title, msg.body,
          "quote-accept", "quote", ctx.aggregateId,
        );
        break;
      }

      // ── payment_status: invoice.issue_from_work_order ──
      case "invoice.issue_from_work_order": {
        const workOrderId = ctx.input?.workOrderId as string;
        if (!workOrderId) break;
        const msg = buildInvoiceReadyMessage();
        dispatched += await dispatchToGrants(
          ctx.workspaceId, "work_order", workOrderId,
          "payment_status", msg.title, msg.body,
          "invoice", "invoice", workOrderId,
        );
        break;
      }

      // ── service_status: visit.complete ──
      case "visit.complete": {
        if (!ctx.aggregateId) break;
        const workOrderId = await resolveWorkOrderFromVisit(ctx.workspaceId, ctx.aggregateId);
        if (!workOrderId) break;
        const msg = buildServiceCompletedMessage();
        dispatched += await dispatchToGrants(
          ctx.workspaceId, "work_order", workOrderId,
          "service_status", msg.title, msg.body,
          "visit-complete", "visit", ctx.aggregateId,
        );
        break;
      }

      // ── service_status: visit.cancel ──
      case "visit.cancel": {
        if (!ctx.aggregateId) break;
        const workOrderId = await resolveWorkOrderFromVisit(ctx.workspaceId, ctx.aggregateId);
        if (!workOrderId) break;
        const msg = buildVisitCancelledExternalMessage();
        dispatched += await dispatchToGrants(
          ctx.workspaceId, "work_order", workOrderId,
          "service_status", msg.title, msg.body,
          "visit-cancel", "visit", ctx.aggregateId,
        );
        break;
      }

      default:
        // No push hook for this command type
        break;
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { dispatched, errors };
}
