import Stripe from "stripe";

let stripeClient: Stripe | undefined;

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY_NOT_CONFIGURED");
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      appInfo: { name: "Runory", version: "0.5" },
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }
  return stripeClient;
}

export function resetStripeClientForTests(): void {
  stripeClient = undefined;
}
