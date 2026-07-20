import { NextRequest } from "next/server";
import {
  requestPayment,
  listPaymentsForSource,
  requireBusinessPermission,
  InvalidInputError,
  type CommandActor,
  type PaymentPurpose,
  type PaymentSourceType,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";
import {
  ensureStripeProviderAccount,
  getStripePaymentConfiguration,
} from "@/integrations/payments/config";
import { processPaymentOutboxForAggregate } from "@/integrations/payments/outbox-processor";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    await requireBusinessPermission(ctx, "payment.view");
    const url = new URL(request.url);
    const sourceObjectType = url.searchParams.get("sourceObjectType");
    const sourceObjectId = url.searchParams.get("sourceObjectId");
    if (
      (sourceObjectType !== "quote" && sourceObjectType !== "work_order")
      || !sourceObjectId
    ) {
      throw new Error("PAYMENT_SOURCE_REQUIRED");
    }
    const payments = await listPaymentsForSource(
      workspaceId,
      sourceObjectType,
      sourceObjectId,
    );
    return successResponse(payments, 200, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    const body = await request.json() as {
      sourceObjectType: PaymentSourceType;
      sourceObjectId: string;
      purpose: PaymentPurpose;
      amountMinor: number;
      currency: string;
      customerContactId?: string;
      customerEmail?: string;
      description?: string;
      expiresAt?: string;
    };
    const config = getStripePaymentConfiguration();
    if (body.currency?.trim().toUpperCase() !== config.currency) {
      throw new InvalidInputError(
        `Payments are configured for ${config.currency}; received ${body.currency || "no currency"}.`,
      );
    }
    const providerAccount = await ensureStripeProviderAccount(workspaceId);
    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };
    const command = await requestPayment(workspaceId, {
      ...body,
      providerAccountId: providerAccount.id,
      successUrl: `${origin}/w/${id}/payment-requests?checkout=returned`,
      cancelUrl: `${origin}/w/${id}/payment-requests?checkout=cancelled`,
    }, actor, idempotencyKey, ctx.requestId);

    const paymentRequest = await processPaymentOutboxForAggregate(
      workspaceId,
      "payment.checkout.create",
      command.aggregate.id,
    );
    return successResponse({
      paymentRequest,
      paymentId: command.aggregate.paymentId,
      checkoutUrl: "checkout_url" in paymentRequest ? paymentRequest.checkout_url : null,
    }, 201, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
