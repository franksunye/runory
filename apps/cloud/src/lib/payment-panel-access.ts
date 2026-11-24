// Presentation-only access. The server still authorizes every read and command.
// In particular, permission to view payment requests does not grant the
// financial context reads used to suggest a new request amount.
export interface PaymentPanelAccessSummary {
  workspaceRole?: string | null;
  accessSummary?: {
    permissions: string[];
    // Derived by the server's canonical object-read policy.
    paymentSourceReads?: { quote: boolean; invoice: boolean };
  } | null;
}
export function resolvePaymentPanelAccess(access: PaymentPanelAccessSummary | undefined) {
  const permissions = new Set(access?.accessSummary?.permissions ?? []);
  const admin = access?.workspaceRole === "admin";
  const has = (permission: string) => admin || permissions.has("*") || permissions.has(permission);
  const canRequest = (admin || access?.workspaceRole === "member") && has("payment.request");
  return {
    canView: has("payment.view"),
    canRequest,
    canSuggestInvoice: canRequest && access?.accessSummary?.paymentSourceReads?.invoice === true,
    canSuggestQuote: canRequest && access?.accessSummary?.paymentSourceReads?.quote === true,
  };
}
