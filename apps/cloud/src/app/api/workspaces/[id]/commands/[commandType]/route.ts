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
  triageWorkOrder,
  createVisit,
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
  type CommandActor,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COMMAND_PERMISSIONS: Record<string, string> = {
  "quote.submit_for_approval": "quote.submit",
  "quote.approve": "quote.approve",
  "quote.reject": "quote.reject",
  "quote.return_for_changes": "quote.approve",
  "quote.withdraw": "quote.submit",
  "quote.mark_sent": "quote.submit",
  "quote.accept": "quote.accept",
  "quote.mark_declined": "quote.submit",
  "quote.expire": "quote.submit",
  "quote.recalculate": "quote.submit",
  "quote.create_revision": "quote.submit",
  "quote.convert_to_work_order": "quote.convert",

  // Work Order FSM commands
  "work_order.triage": "work_order.triage",
  "work_order.create_visit": "work_order.update",
  "work_order.block": "work_order.update",
  "work_order.unblock": "work_order.update",
  "work_order.complete": "work_order.complete",
  "work_order.cancel": "work_order.update",
  "work_order.reopen": "work_order.reopen",

  // Service Visit FSM commands
  "visit.start_travel": "visit.execute",
  "visit.arrive": "visit.execute",
  "visit.submit_work": "visit.execute",
  "visit.complete": "visit.execute",
  "visit.cancel": "visit.execute",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commandType: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, commandType } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");

    // Check business permission
    const requiredPermission = COMMAND_PERMISSIONS[commandType];
    if (requiredPermission) {
      const { requireBusinessPermission } = await import("@runory/platform-core");
      await requireBusinessPermission(ctx, requiredPermission);
    }

    const body = await request.json() as {
      aggregateId: string;
      expectedVersion?: number;
      [key: string]: unknown;
    };

    if (!body?.aggregateId) {
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

      default:
        return handleError(new Error(`Unknown command type: ${commandType}`), requestId);
    }

    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
