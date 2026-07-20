import { NextRequest } from "next/server";
import {
  submitForApproval,
  approveQuote,
  rejectQuote,
  returnForChanges,
  withdrawQuote,
  markSent,
  acceptQuote,
  markDeclined,
  expireQuote,
  recalculateQuoteCommand,
  createRevision,
  convertToWorkOrder,
  createQuoteDraft,
  triageWorkOrder,
  createVisit,
  startWorkOrder,
  blockWorkOrder,
  unblockWorkOrder,
  completeWorkOrder,
  cancelWorkOrder,
  reopenWorkOrder,
  startTravel,
  arriveOnSite,
  submitWork,
  completeVisit,
  cancelVisit,
  proposeAssignment,
  assignAssignment,
  acceptAssignment,
  rejectAssignment,
  reassignAssignment,
  releaseAssignment,
  planSchedule,
  rescheduleSchedule,
  cancelSchedule,
  submitForm,
  saveFormDraft,
  reviseFormSubmission,
  returnFormSubmission,
  acceptFormSubmission,
  approvalDecide,
  claimWorkItem,
  releaseWorkItem,
  completeWorkItem,
  returnWorkItem,
  cancelWorkItem,
  cancelWorkflow,
  startWorkflow,
  type CommandActor,
  type CommandHandlerResult,
  issueInvoiceFromWorkOrder,
  voidInvoice,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// These commands have not moved onto the Contract Runtime yet. Governed
// commands derive authorization from their persisted Workspace Contract.
const LEGACY_COMMAND_PERMISSIONS: Record<string, string> = {
  "assignment.propose": "assignment.manage",
  "assignment.assign": "assignment.manage",
  "assignment.accept": "assignment.respond",
  "assignment.reject": "assignment.respond",
  "assignment.reassign": "assignment.manage",
  "assignment.release": "assignment.manage",

  // Schedule commands (§6.2)
  "schedule.plan": "schedule.manage",
  "schedule.reschedule": "schedule.manage",
  "schedule.cancel": "schedule.manage",

  "workflow.start": "workflow.manage",
  "workflow.cancel": "workflow.manage",
};

// Commands that create a brand-new aggregate and therefore do NOT require an
// `aggregateId` in the request body (they take their inputs as body fields).
const CREATE_COMMANDS = new Set([
  "assignment.propose",
  "schedule.plan",
  "form_submission.save_draft",
  "form_submission.submit",
  "quote.create_draft",
  "invoice.issue_from_work_order",
  "workflow.start",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commandType: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, commandType } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");

    // Check business permission
    const requiredPermission = LEGACY_COMMAND_PERMISSIONS[commandType];
    if (requiredPermission) {
      const { requireBusinessPermission } = await import("@runory/platform-core");
      await requireBusinessPermission(ctx, requiredPermission);
    }

    const body = await request.json() as {
      aggregateId: string;
      expectedVersion?: number;
      [key: string]: unknown;
    };

    // Create commands take their inputs as body fields, not an aggregateId.
    if (!CREATE_COMMANDS.has(commandType) && !body?.aggregateId) {
      return handleError(new Error("aggregateId is required"), requestId);
    }

    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
    const expectedVersion = body.expectedVersion ?? 1;

    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    let result;

    switch (commandType) {
      case "invoice.issue_from_work_order":
        result = await issueInvoiceFromWorkOrder(
          workspaceId,
          body.workOrderId as string,
          actor,
          {
            totalMinor: body.totalMinor as number | undefined,
            currency: body.currency as string | undefined,
            dueAt: body.dueAt as string | undefined,
            memo: body.memo as string | undefined,
          },
          idempotencyKey,
        );
        break;
      case "invoice.void":
        result = await voidInvoice(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          body.reason as string | undefined,
          idempotencyKey,
        );
        break;
      case "quote.submit_for_approval":
        result = await submitForApproval(workspaceId, body.aggregateId, actor, expectedVersion, idempotencyKey);
        break;
      case "quote.approve":
        result = await approveQuote(workspaceId, body.aggregateId, actor, expectedVersion, idempotencyKey);
        break;
      case "quote.reject":
        result = await rejectQuote(workspaceId, body.aggregateId, actor, expectedVersion, body.reason as string ?? "Rejected", idempotencyKey);
        break;
      case "quote.return_for_changes":
        result = await returnForChanges(workspaceId, body.aggregateId, actor, expectedVersion, body.comment as string | null ?? null, idempotencyKey);
        break;
      case "quote.withdraw":
        result = await withdrawQuote(workspaceId, body.aggregateId, actor, expectedVersion, idempotencyKey);
        break;
      case "quote.mark_sent":
        result = await markSent(workspaceId, body.aggregateId, actor, expectedVersion, idempotencyKey);
        break;
      case "quote.accept":
        result = await acceptQuote(workspaceId, body.aggregateId, actor, expectedVersion, idempotencyKey);
        break;
      case "quote.mark_declined":
        result = await markDeclined(workspaceId, body.aggregateId, actor, expectedVersion, body.reason as string | null, idempotencyKey);
        break;
      case "quote.expire":
        result = await expireQuote(workspaceId, body.aggregateId, actor, expectedVersion, idempotencyKey);
        break;
      case "quote.recalculate":
        result = await recalculateQuoteCommand(workspaceId, body.aggregateId, actor, expectedVersion, idempotencyKey);
        break;
      case "quote.create_revision":
        result = await createRevision(workspaceId, body.aggregateId, actor, expectedVersion, idempotencyKey);
        break;
      case "quote.convert_to_work_order":
        result = await convertToWorkOrder(workspaceId, body.aggregateId, actor, expectedVersion, idempotencyKey);
        break;

      // ── Work Order FSM Commands ──
      case "work_order.triage":
        result = await triageWorkOrder(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          {
            priority: body.priority as string | undefined,
            companyId: body.companyId as string | undefined,
            contactId: body.contactId as string | undefined,
          },
          idempotencyKey
        );
        break;

      case "work_order.create_visit":
        result = await createVisit(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          {
            title: body.title as string | undefined,
            technicianId: body.technicianId as string | undefined,
            scheduledStart: body.scheduledStart as string | undefined,
            scheduledEnd: body.scheduledEnd as string | undefined,
            notes: body.notes as string | undefined,
          },
          idempotencyKey
        );
        break;

      case "work_order.start":
        result = await startWorkOrder(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          idempotencyKey
        );
        break;

      case "work_order.block":
        result = await blockWorkOrder(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          body.reason as string,
          idempotencyKey
        );
        break;

      case "work_order.unblock":
        result = await unblockWorkOrder(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          idempotencyKey
        );
        break;

      case "work_order.complete":
        result = await completeWorkOrder(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          body.completionReason as string | undefined,
          idempotencyKey
        );
        break;

      case "work_order.cancel":
        result = await cancelWorkOrder(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          body.reason as string,
          idempotencyKey
        );
        break;

      case "work_order.reopen":
        result = await reopenWorkOrder(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          body.reason as string,
          idempotencyKey
        );
        break;

      // ── Service Visit FSM Commands ──
      case "visit.start_travel":
        result = await startTravel(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          idempotencyKey
        );
        break;

      case "visit.arrive":
        result = await arriveOnSite(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          idempotencyKey
        );
        break;

      case "visit.submit_work":
        result = await submitWork(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          idempotencyKey
        );
        break;

      case "visit.complete":
        result = await completeVisit(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          idempotencyKey
        );
        break;

      case "visit.cancel":
        result = await cancelVisit(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          body.reason as string,
          idempotencyKey
        );
        break;

      // ── Quote Create Draft (§6.1) ──
      case "quote.create_draft":
        result = await createQuoteDraft(
          workspaceId,
          {
            title: body.title as string | undefined,
            dealId: body.dealId as string | undefined,
            companyId: body.companyId as string | undefined,
            contactId: body.contactId as string | undefined,
            currency: body.currency as string | undefined,
            priceBookId: body.priceBookId as string | undefined,
          },
          actor,
          idempotencyKey
        );
        break;

      // ── Assignment Commands (§6.2) ──
      case "assignment.propose":
        result = await proposeAssignment(workspaceId, {
          subjectType: body.subjectType as string,
          subjectId: body.subjectId as string,
          resourceId: body.resourceId as string,
          roleKey: body.roleKey as string | undefined,
          proposedBy: actor.id,
          effectiveFrom: body.effectiveFrom as string | undefined,
        });
        break;

      case "assignment.assign":
        result = await assignAssignment(workspaceId, body.aggregateId, actor.id);
        break;

      case "assignment.accept":
        result = await acceptAssignment(workspaceId, body.aggregateId, actor.id);
        break;

      case "assignment.reject":
        result = await rejectAssignment(
          workspaceId,
          body.aggregateId,
          actor.id,
          body.reason as string
        );
        break;

      case "assignment.reassign":
        result = await reassignAssignment(
          workspaceId,
          body.aggregateId,
          body.resourceId as string,
          actor.id
        );
        break;

      case "assignment.release":
        result = await releaseAssignment(
          workspaceId,
          body.aggregateId,
          actor.id,
          body.reason as string | undefined
        );
        break;

      // ── Schedule Commands (§6.2) ──
      case "schedule.plan":
        result = await planSchedule(workspaceId, {
          subjectType: body.subjectType as string,
          subjectId: body.subjectId as string,
          resourceId: body.resourceId as string,
          startAt: body.startAt as string,
          endAt: body.endAt as string,
          timezone: body.timezone as string | undefined,
          locationType: body.locationType as string | undefined,
          locationId: body.locationId as string | undefined,
          latitude: body.latitude as number | undefined,
          longitude: body.longitude as number | undefined,
        });
        break;

      case "schedule.reschedule":
        result = await rescheduleSchedule(
          workspaceId,
          body.aggregateId,
          body.startAt as string,
          body.endAt as string,
          actor.id
        );
        break;

      case "schedule.cancel":
        result = await cancelSchedule(
          workspaceId,
          body.aggregateId,
          actor.id,
          body.reason as string | undefined
        );
        break;

      // ── Form Submission Commands (§6.2) ──
      case "form_submission.save_draft":
        result = await saveFormDraft(workspaceId, {
          formDefinitionId: body.formDefinitionId as string,
          subjectType: body.subjectType as string | undefined,
          subjectId: body.subjectId as string | undefined,
          workItemId: body.workItemId as string | undefined,
          bindingId: body.bindingId as string | undefined,
          answers: body.answers as Record<string, unknown>,
          submittedBy: actor.id,
        }, idempotencyKey, ctx.requestId);
        break;

      case "form_submission.submit":
        result = await submitForm(workspaceId, {
          formDefinitionId: body.formDefinitionId as string,
          subjectType: body.subjectType as string | undefined,
          subjectId: body.subjectId as string | undefined,
          workItemId: body.workItemId as string | undefined,
          bindingId: body.bindingId as string | undefined,
          formVersionId: body.formVersionId as string | undefined,
          answers: body.answers as Record<string, unknown>,
          submittedBy: actor.id,
          supersedesSubmissionId: body.supersedesSubmissionId as string | undefined,
          draftSubmissionId: body.draftSubmissionId as string | undefined,
        }, idempotencyKey, ctx.requestId);
        break;

      case "form_submission.return":
        result = await returnFormSubmission(
          workspaceId,
          body.aggregateId,
          actor.id,
          body.reason as string,
          idempotencyKey,
          ctx.requestId
        );
        break;

      case "form_submission.revise":
        result = await reviseFormSubmission(
          workspaceId,
          body.aggregateId,
          actor.id,
          body.reason as string | undefined,
          idempotencyKey,
          ctx.requestId
        );
        break;

      case "form_submission.accept":
        result = await acceptFormSubmission(
          workspaceId,
          body.aggregateId,
          actor.id,
          idempotencyKey,
          ctx.requestId
        );
        break;

      // ── Workflow / Approval Commands (§6.3) ──
      // Work item commands now use executeCommand() internally, so the
      // idempotencyKey header is passed as commandId for idempotency tracking.
      case "approval.decide":
        result = await approvalDecide(
          workspaceId,
          body.aggregateId,
          actor,
          body.outcome as "approved" | "rejected" | "returned",
          (body.comment as string | null) ?? null,
          expectedVersion,
          idempotencyKey,
          ctx.requestId
        );
        break;

      case "workflow.start":
        result = await startWorkflow(
          workspaceId,
          body.workflowKey as string,
          body.subjectType as string,
          body.subjectId as string,
          actor
        ) as unknown as CommandHandlerResult;
        break;

      case "workflow.cancel":
        result = await cancelWorkflow(
          workspaceId,
          body.aggregateId,
          actor,
          (body.reason as string) ?? "Cancelled"
        );
        break;

      case "work_item.claim":
        result = await claimWorkItem(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          idempotencyKey,
          ctx.requestId
        );
        break;

      case "work_item.release":
        result = await releaseWorkItem(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          idempotencyKey,
          ctx.requestId
        );
        break;

      case "work_item.complete":
        result = await completeWorkItem(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          body.formData as Record<string, unknown> | undefined,
          idempotencyKey,
          ctx.requestId
        );
        break;

      case "work_item.return":
        result = await returnWorkItem(
          workspaceId,
          body.aggregateId,
          actor,
          (body.reason as string | null) ?? null,
          expectedVersion,
          idempotencyKey,
          ctx.requestId
        );
        break;

      case "work_item.cancel":
        result = await cancelWorkItem(
          workspaceId,
          body.aggregateId,
          actor,
          expectedVersion,
          body.reason as string | undefined,
          idempotencyKey,
          ctx.requestId
        );
        break;

      default:
        return handleError(new Error(`Unknown command type: ${commandType}`), requestId);
    }

    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
