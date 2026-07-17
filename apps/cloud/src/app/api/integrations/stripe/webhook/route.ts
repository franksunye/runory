import { NextRequest, NextResponse } from "next/server";
import {
  applyProviderPaymentEvent,
  hashProviderPayload,
} from "@runory/platform-core";
import { resolveStripeWebhookAccount } from "@/integrations/payments/config";
import { getPaymentProvider } from "@/integrations/payments/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Stripe signature is required." }, { status: 400 });
  }

  let rawBody: Uint8Array;
  try {
    rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength === 0 || rawBody.byteLength > 1_000_000) {
      return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
    }
    const { config } = await resolveStripeWebhookAccount();
    const event = await getPaymentProvider("stripe").parseWebhook({
      rawBody,
      signature,
      webhookSecret: config.webhookSecret,
      providerAccountId: config.providerAccountId,
      mode: config.mode,
    });
    if (!event) return NextResponse.json({ received: true, ignored: true });

    const result = await applyProviderPaymentEvent(
      config.workspaceId,
      config.providerAccountId,
      event,
      hashProviderPayload(rawBody),
    );
    return NextResponse.json({ received: true, commandId: result.commandId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const signatureFailure = message.toLowerCase().includes("signature");
    console.error("[stripe:webhook]", {
      code: signatureFailure ? "STRIPE_SIGNATURE_INVALID" : "STRIPE_WEBHOOK_REJECTED",
    });
    return NextResponse.json(
      { error: signatureFailure ? "Invalid Stripe signature." : "Webhook could not be accepted." },
      { status: signatureFailure ? 400 : 409 },
    );
  }
}
