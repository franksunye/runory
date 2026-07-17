import Stripe from "stripe";
import { getRunoryBillingStripeConfig } from "./config";

let client: Stripe | undefined;

export function getRunoryBillingStripeClient(): Stripe {
  if (!client) {
    client = new Stripe(getRunoryBillingStripeConfig().secretKey, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      typescript: true,
    });
  }
  return client;
}

export function resetRunoryBillingStripeClientForTests(): void {
  client = undefined;
}
