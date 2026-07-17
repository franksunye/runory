import type { PaymentProvider, PaymentProviderName } from "./contracts";
import { StripePaymentProvider } from "./stripe/provider";

export function getPaymentProvider(name: PaymentProviderName): PaymentProvider {
  if (name === "stripe") return new StripePaymentProvider();
  throw new Error(`PAYMENT_PROVIDER_UNSUPPORTED:${name}`);
}
