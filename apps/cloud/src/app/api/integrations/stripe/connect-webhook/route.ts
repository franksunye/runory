import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  applyProviderPaymentEvent,
  businessTable,
  hashProviderPayload,
  queryOne,
  updateConnectOnboardingStatus,
  resolveOnboardingStatus,
  type ConnectSyncData,
  type ConnectOnboardingStatus,
  type ConnectRequirementsStatus,
} from "@runory/platform-core";
import { mapStripeEvent } from "@/integrations/payments/stripe/mapper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/integrations/stripe/connect-webhook
//
// Stripe Connect webhook endpoint — separate from the SaaS billing webhook
// (Tech Spec §9.5). This is a raw webhook handler: it does NOT use
// requireWorkspaceContext. After signature verification, the workspace is
// resolved solely from the event's top-level connected-account id and the
// verified livemode flag.
//
// Event processing: the verified Stripe event is normalized via mapStripeEvent
// and dispatched to either:
//   - updateConnectOnboardingStatus (for account.updated events)
//   - applyProviderPaymentEvent (for payment/refund/dispute events)
//
// Both paths are idempotent via the provider_event_reference table.
//
// Error handling: idempotent conflicts (already processed) return 200.
// Genuine processing failures return 500 so Stripe retries the event.
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing Stripe signature or connect webhook secret." },
      { status: 400 },
    );
  }

  const rawBody = await request.text();

  // The Stripe SDK constructor requires an API key, but webhook signature
  // verification (constructEvent) only uses the webhook secret — the API key is
  // never used for verification. We pass the webhook secret so this handler
  // depends solely on STRIPE_CONNECT_WEBHOOK_SECRET (Spec §9.5).
  const stripe = new Stripe(webhookSecret, {
    appInfo: { name: "Runory", version: "0.5" },
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe:connect-webhook] signature verification failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Invalid Stripe signature." },
      { status: 400 },
    );
  }

  // Per Spec §9.5: resolve the workspace only from the event's top-level
  // connected-account id and the verified livemode flag. Do not trust any
  // browser/request-scoped parameters.
  const accountId = event.account;
  const livemode = event.livemode;

  if (!accountId) {
    return NextResponse.json(
      { error: "Stripe Connect event has no connected account." },
      { status: 400 },
    );
  }

  const mode: "test" | "live" = livemode ? "live" : "test";
  const table = businessTable("payment_provider_account");

  const row = await queryOne<{ workspace_id: string; id: string; onboarding_status: string }>(
    `SELECT workspace_id, id, onboarding_status FROM ${table}
     WHERE provider_account_ref = ? AND provider = 'stripe' AND mode = ?
     LIMIT 1`,
    [accountId, mode],
  );

  if (!row) {
    console.warn("[stripe:connect-webhook] workspace not resolvable", {
      accountId,
      mode,
    });
    return NextResponse.json(
      { error: "Workspace not resolvable for connected account." },
      { status: 400 },
    );
  }

  // Normalize the Stripe event into a provider-agnostic payment event.
  // Returns null for events we don't process.
  const normalized = mapStripeEvent(event as unknown as Parameters<typeof mapStripeEvent>[0]);

  if (!normalized) {
    // Event type is not relevant to payment processing — acknowledge and exit.
    return NextResponse.json(
      { received: true, workspaceId: row.workspace_id, processed: false },
      { status: 200 },
    );
  }

  const payloadHash = hashProviderPayload(Buffer.from(rawBody));

  // Handle account.updated events separately — these update the Connect
  // onboarding status, not payment state.
  if (normalized.type === "account.updated") {
    try {
      const syncData: ConnectSyncData = {
        details_submitted: normalized.detailsSubmitted,
        charges_enabled: normalized.chargesEnabled,
        payouts_enabled: normalized.payoutsEnabled,
        requirements_status: normalized.requirementsStatus as ConnectRequirementsStatus,
        requirements_json: normalized.requirementsJson,
      };
      const currentStatus = row.onboarding_status as ConnectOnboardingStatus;
      const newStatus = resolveOnboardingStatus(syncData, currentStatus);
      await updateConnectOnboardingStatus(
        row.workspace_id,
        row.id,
        newStatus,
        syncData,
      );
      return NextResponse.json(
        { received: true, workspaceId: row.workspace_id, processed: true, type: "account.updated" },
        { status: 200 },
      );
    } catch (error) {
      console.error("[stripe:connect-webhook] account.updated processing failed", {
        eventId: event.id,
        message: error instanceof Error ? error.message : String(error),
      });
      // Return 500 so Stripe retries — this is a genuine processing failure.
      return NextResponse.json(
        { received: true, workspaceId: row.workspace_id, processed: false, error: "account.update_failed" },
        { status: 500 },
      );
    }
  }

  // Handle dispute events — log and acknowledge for now; full dispute
  // workflow is deferred to v0.9.2 reconciliation.
  if (normalized.type === "dispute.created" || normalized.type === "dispute.closed") {
    console.info("[stripe:connect-webhook] dispute event received", {
      eventId: event.id,
      type: normalized.type,
      disputeId: normalized.disputeId,
      workspaceId: row.workspace_id,
    });
    return NextResponse.json(
      { received: true, workspaceId: row.workspace_id, processed: true, type: normalized.type },
      { status: 200 },
    );
  }

  // Process payment/refund events through the payment command handler.
  // This is idempotent: the provider_event_reference table deduplicates
  // by providerEventId.
  try {
    await applyProviderPaymentEvent(
      row.workspace_id,
      row.id,
      normalized,
      payloadHash,
    );

    return NextResponse.json(
      { received: true, workspaceId: row.workspace_id, processed: true },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Idempotent: if the event was already processed, the provider event
    // reference unique constraint will reject the insert. Return 200 so Stripe
    // does not retry.
    if (message.includes("UNIQUE") || message.includes("already") || message.includes("DUPLICATE")) {
      console.info("[stripe:connect-webhook] event already processed", {
        eventId: event.id,
        type: event.type,
      });
      return NextResponse.json(
        { received: true, workspaceId: row.workspace_id, processed: false, deduplicated: true },
        { status: 200 },
      );
    }

    // Genuine processing failure — return 500 so Stripe retries the event.
    console.error("[stripe:connect-webhook] event processing failed", {
      eventId: event.id,
      type: event.type,
      message,
    });
    return NextResponse.json(
      { received: true, workspaceId: row.workspace_id, processed: false, error: message },
      { status: 500 },
    );
  }
}
