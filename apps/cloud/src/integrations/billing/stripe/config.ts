import type { BillingPlan } from "@runory/platform-core";

export interface RunoryBillingStripeConfig {
  secretKey: string;
  webhookSecret: string;
  mode: "test" | "live";
  prices: Record<BillingPlan, string | null>;
}

let cached: RunoryBillingStripeConfig | undefined;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`BILLING_CONFIG_MISSING:${name}`);
  return value;
}

export function getRunoryBillingStripeConfig(): RunoryBillingStripeConfig {
  if (cached) return cached;
  const mode = required("RUNORY_BILLING_STRIPE_MODE");
  if (mode !== "test" && mode !== "live") {
    throw new Error("BILLING_CONFIG_INVALID_MODE");
  }
  const secretKey = required("RUNORY_BILLING_STRIPE_SECRET_KEY");
  if (!secretKey.startsWith(mode === "test" ? "sk_test_" : "sk_live_")) {
    throw new Error("BILLING_CONFIG_KEY_MODE_MISMATCH");
  }
  const proPrice = required("RUNORY_BILLING_PRO_PRICE_ID");
  if (!proPrice.startsWith("price_")) throw new Error("BILLING_CONFIG_INVALID_PRO_PRICE");

  cached = {
    secretKey,
    webhookSecret: required("RUNORY_BILLING_STRIPE_WEBHOOK_SECRET"),
    mode,
    prices: {
      starter: null,
      pro: proPrice,
      enterprise: null,
    },
  };
  return cached;
}

export function getBillingPrice(plan: BillingPlan): string {
  const price = getRunoryBillingStripeConfig().prices[plan];
  if (!price) throw new Error("BILLING_PLAN_NOT_SELF_SERVE");
  return price;
}

export function resolveBillingPlan(priceId: string): BillingPlan {
  const entry = Object.entries(getRunoryBillingStripeConfig().prices)
    .find(([, configuredPrice]) => configuredPrice === priceId);
  if (!entry) throw new Error("BILLING_PRICE_NOT_ALLOWLISTED");
  return entry[0] as BillingPlan;
}

export function resetRunoryBillingStripeConfigForTests(): void {
  cached = undefined;
}
