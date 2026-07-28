import { NextRequest } from "next/server";
import {
  getConnectProviderAccount,
  syncConnectAccount,
  NotFoundError,
  type PaymentProviderMode,
  type PaymentProviderAccountConnect,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[id]/integrations/stripe/connect/return
//
// Non-authoritative return surface for the Stripe-hosted onboarding flow
// (Tech Spec §9.3). This route does NOT mark onboarding complete from browser
// parameters — the authoritative account state is refreshed via the Stripe
// Connect webhook. Here we trigger a server-side sync using the currently
// known readiness values; a real refresh (with fresh Stripe data) is applied
// when the account.updated webhook arrives.
//
// The frontend settings page does not exist yet, so instead of redirecting to
// `/${locale}/w/${workspaceId}/settings/payments` we return a JSON ack.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);

    const mode = (process.env.STRIPE_PAYMENT_MODE ?? "test") as PaymentProviderMode;

    let account: PaymentProviderAccountConnect | null = null;
    try {
      account = await getConnectProviderAccount(workspaceId, mode);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }

    if (account) {
      // Re-sync with the currently-known values (no new authoritative data).
      // The actual refresh from Stripe is applied by the Connect webhook
      // handler (Spec §9.5).
      await syncConnectAccount(workspaceId, account.id, {
        details_submitted: account.details_submitted,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        requirements_status: account.requirements_status,
        requirements_json: account.requirements_json,
      });
    }

    return successResponse(
      { success: true, redirected: true },
      200,
      ctx.requestId,
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
