import { NextRequest } from "next/server";
import {
  requestPaymentRefund,
  requireBusinessPermission,
  type CommandActor,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";
import { processPaymentOutboxForAggregate } from "@/integrations/payments/outbox-processor";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, paymentId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    await requireBusinessPermission(ctx, "payment.refund");
    const body = await request.json() as { amountMinor: number; reason?: string };
    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };
    const command = await requestPaymentRefund(
      workspaceId,
      paymentId,
      body.amountMinor,
      body.reason,
      actor,
      request.headers.get("idempotency-key") ?? undefined,
      ctx.requestId,
    );
    const refund = await processPaymentOutboxForAggregate(
      workspaceId,
      "payment.refund.create",
      command.aggregate.id,
    );
    return successResponse({ refund }, 202, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
