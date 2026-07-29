import { NextRequest } from "next/server";
import {
  reconcilePayment,
  getPaymentRecord,
  getPaymentProviderAccount,
  requireBusinessPermission,
  type CommandActor,
  type ProviderSnapshotInput,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";
import { getPaymentProvider } from "@/integrations/payments/registry";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, paymentId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    await requireBusinessPermission(ctx, "payment.reconcile");

    const body = await request.json().catch(() => ({})) as {
      providerSnapshot?: ProviderSnapshotInput;
    };

    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    // If the caller already has a provider snapshot, use it directly.
    // Otherwise, retrieve it from the provider SDK.
    let providerSnapshot: ProviderSnapshotInput;

    if (body.providerSnapshot) {
      providerSnapshot = body.providerSnapshot;
    } else {
      // Load the payment record to resolve provider info
      const payment = await getPaymentRecord(workspaceId, paymentId);

      if (!payment.provider_payment_id) {
        return handleError(
          new Error("PAYMENT_MISSING_PROVIDER_ID: Cannot reconcile a payment without a provider payment ID."),
          requestId,
        );
      }

      // Load the provider account to get the providerAccountRef
      const providerAccount = await getPaymentProviderAccount(
        workspaceId,
        payment.provider_account_id,
      );

      // Retrieve the live snapshot from the provider
      const snapshot = await getPaymentProvider(payment.provider).retrievePayment({
        providerAccountId: providerAccount.id,
        providerAccountRef: providerAccount.provider_account_ref,
        providerPaymentId: payment.provider_payment_id,
      });

      providerSnapshot = {
        provider: snapshot.provider,
        providerAccountId: snapshot.providerAccountId,
        providerPaymentId: snapshot.providerPaymentId,
        status: snapshot.status,
        amountMinor: snapshot.amountMinor,
        refundedAmountMinor: snapshot.refundedAmountMinor,
        currency: snapshot.currency,
      };
    }

    const command = await reconcilePayment({
      workspaceId,
      paymentId,
      providerSnapshot,
      actor,
    });

    return successResponse(command.aggregate, 201, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
