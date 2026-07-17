import { NextRequest, NextResponse } from "next/server";
import { hashBillingPayload } from "@runory/platform-core";
import { getRunoryBillingStripeConfig } from "@/integrations/billing/stripe/config";
import { getRunoryBillingStripeClient } from "@/integrations/billing/stripe/client";
import { applyRunoryBillingStripeEvent } from "@/integrations/billing/stripe/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Stripe signature is required." }, { status: 400 });
  }
  try {
    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength === 0 || rawBody.byteLength > 1_000_000) {
      return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
    }
    const event = getRunoryBillingStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      getRunoryBillingStripeConfig().webhookSecret,
    );
    const result = await applyRunoryBillingStripeEvent(event, hashBillingPayload(rawBody));
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const invalidSignature = message.includes("signature");
    console.error("[stripe:billing-webhook]", {
      code: invalidSignature ? "STRIPE_SIGNATURE_INVALID" : "STRIPE_BILLING_WEBHOOK_REJECTED",
    });
    return NextResponse.json(
      { error: invalidSignature ? "Invalid Stripe signature." : "Webhook could not be accepted." },
      { status: invalidSignature ? 400 : 409 },
    );
  }
}
