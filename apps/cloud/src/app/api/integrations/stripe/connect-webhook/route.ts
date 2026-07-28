import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { businessTable, queryOne } from "@runory/platform-core";

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
// This is a contract-level implementation: it verifies the signature, resolves
// the workspace, and returns 200. Actual event processing (account.updated,
// checkout completion, etc.) will be implemented with the full Stripe
// integration.
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing Stripe signature or connect webhook secret." },
      { status: 400 },
    );
  }

  const payload = await request.text();

  // The Stripe SDK constructor requires an API key, but webhook signature
  // verification (constructEvent) only uses the webhook secret — the API key is
  // never used for verification. We pass the webhook secret so this handler
  // depends solely on STRIPE_CONNECT_WEBHOOK_SECRET (Spec §9.5).
  const stripe = new Stripe(webhookSecret, {
    appInfo: { name: "Runory", version: "0.5" },
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
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

  const row = await queryOne<{ workspace_id: string }>(
    `SELECT workspace_id FROM ${table}
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

  // Contract-level implementation (Spec §9.5): signature verified and
  // workspace resolved from the connected-account id. Actual event processing
  // (account.updated, checkout completion, etc.) will be implemented with the
  // full Stripe integration.
  return NextResponse.json(
    { received: true, workspaceId: row.workspace_id },
    { status: 200 },
  );
}
