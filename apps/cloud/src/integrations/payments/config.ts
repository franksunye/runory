import {
  getPaymentProviderAccount,
  upsertPaymentProviderAccount,
  getConnectProviderAccount,
  assertConnectReady,
  type PaymentProviderAccount,
  type PaymentProviderMode,
  type PaymentProviderAccountConnect,
} from "@runory/platform-core";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

export interface StripePaymentConfiguration {
  workspaceId: string;
  providerAccountId: string;
  providerAccountRef: string;
  mode: PaymentProviderMode;
  currency: string;
  webhookSecret: string;
}

/**
 * Resolve the active Stripe Connect account for a workspace from the database.
 *
 * Per Tech Spec §9: all checkout/refund operations must execute as Direct
 * Charges on the workspace merchant's Connected Account, not the platform
 * account. This function resolves the Connect account and verifies readiness
 * before returning it.
 */
export async function resolveConnectProviderAccount(
  workspaceId: string,
  mode: PaymentProviderMode = "test",
): Promise<PaymentProviderAccountConnect> {
  const account = await getConnectProviderAccount(workspaceId, mode);
  assertConnectReady(account);
  return account;
}

export async function ensureStripeProviderAccount(
  workspaceId: string,
): Promise<PaymentProviderAccount> {
  const config = getStripePaymentConfiguration();
  if (config.workspaceId !== workspaceId) {
    throw new Error("STRIPE_WORKSPACE_NOT_CONFIGURED");
  }
  return upsertPaymentProviderAccount({
    workspaceId,
    id: config.providerAccountId,
    provider: "stripe",
    mode: config.mode,
    providerAccountRef: config.providerAccountRef,
  });
}

export function getStripePaymentConfiguration(): StripePaymentConfiguration {
  const mode = (process.env.STRIPE_PAYMENT_MODE ?? "test") as PaymentProviderMode;
  if (mode !== "test" && mode !== "live") throw new Error("STRIPE_PAYMENT_MODE_INVALID");
  const secretKey = required("STRIPE_SECRET_KEY");
  if ((mode === "test" && !secretKey.startsWith("sk_test_"))
    || (mode === "live" && !secretKey.startsWith("sk_live_"))) {
    throw new Error("STRIPE_PAYMENT_MODE_KEY_MISMATCH");
  }
  const currency = required("STRIPE_PAYMENT_CURRENCY").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("STRIPE_PAYMENT_CURRENCY_INVALID");
  return {
    workspaceId: required("STRIPE_PAYMENT_WORKSPACE_ID"),
    providerAccountId: required("STRIPE_PAYMENT_PROVIDER_ACCOUNT_ID"),
    // Prefer the merchant Connected Account id. STRIPE_ACCOUNT_ID remains a
    // legacy alias for older local .env files that only stored one acct_ ref.
    providerAccountRef: process.env.STRIPE_CONNECT_ACCOUNT_ID?.trim()
      || process.env.STRIPE_ACCOUNT_ID?.trim()
      || "stripe-platform-account",
    mode,
    currency,
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  };
}

export async function resolveStripeWebhookAccount(): Promise<{
  config: StripePaymentConfiguration;
  account: PaymentProviderAccount;
}> {
  const config = getStripePaymentConfiguration();
  const account = await getPaymentProviderAccount(
    config.workspaceId,
    config.providerAccountId,
  );
  if (
    account.mode !== config.mode
    || account.provider !== "stripe"
    || account.provider_account_ref !== config.providerAccountRef
  ) {
    throw new Error("STRIPE_PROVIDER_ACCOUNT_CONFIGURATION_MISMATCH");
  }
  return { config, account };
}
