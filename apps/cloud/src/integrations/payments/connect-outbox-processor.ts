import {
  attachConnectOnboardingUrl,
  claimOutboxMessage,
  getOutboxMessages,
  markOutboxDelivered,
  markOutboxFailed,
} from "@runory/platform-core";
import { getStripeClient } from "./stripe/client";

interface OnboardingLinkPayload {
  providerAccountId: string;
  providerAccountRef: string | null;
  mode: string;
  idempotencyKey: string;
}

function safeProviderError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return code && /^[A-Z0-9_-]{1,80}$/i.test(code)
    ? `PAYMENT_PROVIDER_ERROR:${code}`
    : "PAYMENT_PROVIDER_ERROR";
}

/**
 * Process a pending `payment.connect.onboarding_link.create` outbox message.
 *
 * Per Tech Spec §9.3: Creates a Stripe Connected Account (if none exists yet)
 * and an Account Link for the Stripe-hosted onboarding flow. The resulting URL
 * is written back to the `payment_provider_account` record.
 *
 * Returns the onboarding URL, or null if no pending message was found.
 */
export async function processConnectOnboardingOutbox(
  workspaceId: string,
  providerAccountId: string,
): Promise<string | null> {
  const messages = await getOutboxMessages(workspaceId, { limit: 100 });
  const message = messages.find(
    (m) =>
      m.messageType === "payment.connect.onboarding_link.create"
      && m.status !== "delivered"
      && (m.payload as Record<string, unknown>).providerAccountId === providerAccountId,
  );
  if (!message) return null;

  const claimed = await claimOutboxMessage(workspaceId, message.id);
  if (!claimed) return null;

  try {
    const payload = claimed.payload as unknown as OnboardingLinkPayload;
    const stripe = getStripeClient();
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // If no Stripe Connected Account exists yet, create one.
    let stripeAccountId = payload.providerAccountRef;
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        metadata: {
          workspace_id: workspaceId,
          provider_account_id: payload.providerAccountId,
          mode: payload.mode,
        },
      }, { idempotencyKey: payload.idempotencyKey });
      stripeAccountId = account.id;
    }

    // Create an Account Link for the Stripe-hosted onboarding flow.
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${origin}/w/${workspaceId}/settings?stripe_connect=refresh`,
      return_url: `${origin}/w/${workspaceId}/settings?stripe_connect=complete`,
      type: "account_onboarding",
    }, { idempotencyKey: `${payload.idempotencyKey}:link` });

    // Write back the onboarding URL and optionally the new Stripe account ref.
    await attachConnectOnboardingUrl(
      workspaceId,
      payload.providerAccountId,
      accountLink.url,
      !payload.providerAccountRef ? stripeAccountId : undefined,
    );

    await markOutboxDelivered(workspaceId, claimed.id);
    return accountLink.url;
  } catch (error) {
    await markOutboxFailed(workspaceId, claimed.id, safeProviderError(error));
    throw error;
  }
}
