import { beforeEach, describe, expect, it } from "vitest";
import {
  getBillingPrice,
  getRunoryBillingStripeConfig,
  resetRunoryBillingStripeConfigForTests,
  resolveBillingPlan,
} from "./config";

beforeEach(() => {
  process.env.RUNORY_BILLING_STRIPE_MODE = "test";
  process.env.RUNORY_BILLING_STRIPE_SECRET_KEY = "sk_test_runory_billing";
  process.env.RUNORY_BILLING_STRIPE_WEBHOOK_SECRET = "whsec_runory_billing";
  process.env.RUNORY_BILLING_STARTER_PRICE_ID = "price_runory_starter";
  process.env.RUNORY_BILLING_GROWTH_PRICE_ID = "price_runory_growth";
  process.env.RUNORY_BILLING_PRO_PRICE_ID = "price_runory_pro";
  resetRunoryBillingStripeConfigForTests();
});

describe("Runory Stripe Billing configuration", () => {
  it("allowlists each self-serve plan and rejects Enterprise", () => {
    expect(getBillingPrice("starter")).toBe("price_runory_starter");
    expect(getBillingPrice("growth")).toBe("price_runory_growth");
    expect(getBillingPrice("pro")).toBe("price_runory_pro");
    expect(() => getBillingPrice("enterprise")).toThrow("BILLING_PLAN_NOT_SELF_SERVE");
  });

  it("maps Stripe Price IDs back to the authoritative Runory plan", () => {
    expect(resolveBillingPlan("price_runory_starter")).toBe("starter");
    expect(resolveBillingPlan("price_runory_growth")).toBe("growth");
    expect(resolveBillingPlan("price_runory_pro")).toBe("pro");
    expect(() => resolveBillingPlan("price_browser_supplied")).toThrow("BILLING_PRICE_NOT_ALLOWLISTED");
  });

  it("rejects a live key in test mode", () => {
    process.env.RUNORY_BILLING_STRIPE_SECRET_KEY = "sk_live_wrong_mode";
    resetRunoryBillingStripeConfigForTests();
    expect(() => getRunoryBillingStripeConfig()).toThrow("BILLING_CONFIG_KEY_MODE_MISMATCH");
  });
});

