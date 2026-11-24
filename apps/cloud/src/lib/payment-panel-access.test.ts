import { describe, expect, it } from "vitest";
import { resolvePaymentPanelAccess } from "./payment-panel-access";

describe("payment panel access", () => {
  it("does not request data before the caller's access is loaded", () => {
    expect(resolvePaymentPanelAccess(undefined)).toEqual({
      canView: false, canRequest: false, canSuggestInvoice: false, canSuggestQuote: false,
    });
  });
  it("dispatcher can view payment requests but must not fetch commercial suggestions", () => {
    expect(resolvePaymentPanelAccess({
      workspaceRole: "member",
      accessSummary: { permissions: ["payment.view", "invoice.read"], paymentSourceReads: { quote: false, invoice: true } },
    })).toEqual({ canView: true, canRequest: false, canSuggestInvoice: false, canSuggestQuote: false });
  });
  it("supervisor can request payment without acquiring quote read authority", () => {
    expect(resolvePaymentPanelAccess({
      workspaceRole: "member",
      accessSummary: { permissions: ["payment.view", "payment.request", "invoice.read"], paymentSourceReads: { quote: false, invoice: true } },
    })).toEqual({ canView: true, canRequest: true, canSuggestInvoice: true, canSuggestQuote: false });
  });
  it("owner can suggest from both sources once server read access is present", () => {
    expect(resolvePaymentPanelAccess({
      workspaceRole: "admin",
      accessSummary: { permissions: ["*"], paymentSourceReads: { quote: true, invoice: true } },
    })).toEqual({ canView: true, canRequest: true, canSuggestInvoice: true, canSuggestQuote: true });
  });
  it("does not promote a viewer to a payment writer or assume missing source permissions", () => {
    expect(resolvePaymentPanelAccess({
      workspaceRole: "viewer",
      accessSummary: { permissions: ["*"], paymentSourceReads: { quote: true, invoice: true } },
    })).toEqual({ canView: true, canRequest: false, canSuggestInvoice: false, canSuggestQuote: false });
    expect(resolvePaymentPanelAccess({
      workspaceRole: "member", accessSummary: { permissions: ["payment.request"] },
    })).toEqual({ canView: false, canRequest: true, canSuggestInvoice: false, canSuggestQuote: false });
  });
});
