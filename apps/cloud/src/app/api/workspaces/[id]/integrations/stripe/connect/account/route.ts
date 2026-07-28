import { NextRequest } from "next/server";
import {
  requireBusinessPermission,
  getConnectProviderAccount,
  NotFoundError,
  type PaymentProviderMode,
  type PaymentProviderAccountConnect,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

// ── Safe projection helpers ──
//
// Per Tech Spec §9.3, the account status surface must never leak provider
// secrets. Only the allowlisted readiness fields are returned, and the
// provider_account_ref (Stripe connected-account id) is masked.

function maskProviderAccountRef(ref: string): string | null {
  if (!ref) return null;
  if (ref.length <= 8) return "••••";
  return `${ref.slice(0, 4)}••••${ref.slice(-4)}`;
}

function toSafeProjection(account: PaymentProviderAccountConnect) {
  return {
    onboarding_status: account.onboarding_status,
    details_submitted: account.details_submitted,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    requirements_status: account.requirements_status,
    requirements_json: account.requirements_json,
    last_synced_at: account.last_synced_at,
    mode: account.mode,
    provider_account_ref: maskProviderAccountRef(account.provider_account_ref),
    disconnected_at: account.disconnected_at,
    aggregate_version: account.aggregate_version,
  };
}

// GET /api/workspaces/[id]/integrations/stripe/connect/account
// Return the Stripe Connect account status for the workspace.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id);
    await requireBusinessPermission(ctx, "payment.configure");

    const mode = (process.env.STRIPE_PAYMENT_MODE ?? "test") as PaymentProviderMode;

    // An active (non-disconnected) mapping may not exist yet — treat that as a
    // null account rather than a 404 so the settings UI can render the
    // "start onboarding" state.
    let account: PaymentProviderAccountConnect | null = null;
    try {
      account = await getConnectProviderAccount(workspaceId, mode);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }

    if (!account) {
      return successResponse({ account: null }, 200, ctx.requestId);
    }

    return successResponse(
      { account: toSafeProjection(account) },
      200,
      ctx.requestId,
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
