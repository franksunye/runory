import { NextRequest } from "next/server";
import {
  replayProviderEvent,
  requireBusinessPermission,
  type CommandActor,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    await requireBusinessPermission(ctx, "payment.reconcile");

    const body = await request.json() as {
      providerAccountId: string;
      event: {
        type: string;
        provider: string;
        providerEventId: string;
        providerAccountId?: string;
        providerPaymentId: string;
        paymentRequestRef?: string;
        amountMinor?: number;
        currency?: string;
        safeFailureCode?: string;
        occurredAt: string;
      };
      payloadHash?: string;
    };

    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    const result = await replayProviderEvent({
      workspaceId,
      providerAccountId: body.providerAccountId,
      event: body.event,
      payloadHash: body.payloadHash,
      actor,
    });

    return successResponse({
      reconciliationResultId: result.reconciliationResultId,
      alreadyProcessed: result.alreadyProcessed,
      replayResult: result.replayResult
        ? {
            commandId: result.replayResult.commandId,
            aggregateId: result.replayResult.aggregate?.id ?? null,
          }
        : null,
    }, 201, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
