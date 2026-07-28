import { NextRequest, NextResponse } from "next/server";
import {
  resolveCustomerAccessSession,
  resolveCustomerInvoiceCheckout,
  requestPayment,
  queryOne,
  businessTable,
  CUSTOMER_ACCESS_COOKIE_NAME,
  CUSTOMER_ACCESS_RESPONSE_HEADERS,
  verifyCustomerAccessSession,
  shouldSampleAccessDenied,
  auditCustomerAccessDenied,
} from "@runory/platform-core";
import { ensureStripeProviderAccount, getStripePaymentConfiguration } from "@/integrations/payments/config";
import { processPaymentOutboxForAggregate } from "@/integrations/payments/outbox-processor";

export const dynamic = "force-dynamic";

/**
 * POST /api/customer-access/invoices/:invoiceId/checkout
 *
 * Per Tech Spec §7.2, §7.3, and §8.2: A customer can initiate checkout for an
 * Invoice if:
 *   - they have an active customer-access session (cookie)
 *   - the grant includes the `invoice.pay` capability
 *   - the Invoice is reachable from the grant root
 *   - the Invoice subject matches the grant subject
 *   - the Invoice is in `issued` or `partially_paid` status with balance > 0
 *
 * The server derives: amount (current balance), currency, purpose ("final"),
 * customer contact, provider account, return URLs, and idempotency key.
 * The browser cannot submit any of these values.
 *
 * Idempotency key (Tech Spec §7.3):
 *   customer-access:<grantId>:invoice.checkout:<invoiceId>:<balanceMinor>
 *
 * If an eligible open Payment Request already exists, the route returns the
 * existing checkout URL rather than creating a duplicate.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const cookieValue = request.cookies.get(CUSTOMER_ACCESS_COOKIE_NAME)?.value;
  if (!cookieValue) {
    return unavailableResponse();
  }

  const grant = await resolveCustomerAccessSession(cookieValue);
  if (!grant) {
    const payload = verifyCustomerAccessSession(cookieValue);
    if (payload && shouldSampleAccessDenied(payload.grantId)) {
      await auditCustomerAccessDenied(payload.workspaceId, payload.grantId);
    }
    return unavailableResponse();
  }

  const { invoiceId } = await params;

  try {
    // Resolve the invoice with full reachability + subject verification.
    const { invoice } = await resolveCustomerInvoiceCheckout(
      grant.workspace_id,
      grant.id,
      invoiceId,
    );

    // Check if an eligible open Payment Request already exists (Tech Spec §7.3).
    const existingRequest = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM ${businessTable("payment_request")}
       WHERE workspace_id = ? AND source_object_type = 'invoice'
         AND source_object_id = ? AND status IN ('open', 'pending')
       ORDER BY created_at DESC LIMIT 1`,
      [grant.workspace_id, invoice.id],
    );

    if (existingRequest) {
      // Return/reprocess the existing open request.
      const processed = await processPaymentOutboxForAggregate(
        grant.workspace_id,
        "payment.checkout.create",
        existingRequest.id,
      );
      const checkoutUrl =
        processed && "checkout_url" in processed
          ? (processed.checkout_url as string)
          : null;

      const response = NextResponse.json({ success: true, data: { checkoutUrl } });
      for (const [k, v] of Object.entries(CUSTOMER_ACCESS_RESPONSE_HEADERS)) {
        response.headers.set(k, v);
      }
      return response;
    }

    // Derive all inputs server-side — nothing from the browser.
    const config = getStripePaymentConfiguration();
    const providerAccount = await ensureStripeProviderAccount(grant.workspace_id);

    // Derive customer contact from grant subject.
    let customerContactId: string | undefined;
    let customerEmail: string | undefined;
    if (grant.subject_type === "contact") {
      customerContactId = grant.subject_id;
      const contact = await queryOne<{ email: string | null }>(
        `SELECT email FROM ${businessTable("contact")}
         WHERE workspace_id = ? AND id = ?`,
        [grant.workspace_id, grant.subject_id],
      );
      customerEmail = contact?.email ?? undefined;
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

    // Idempotency key includes balance — changed balance produces a new key
    // only after the prior request is no longer open (Tech Spec §7.3).
    const idempotencyKey =
      `customer-access:${grant.id}:invoice.checkout:${invoice.id}:${invoice.balance_due_minor}`;

    // Execute payment.request with a customer actor.
    const command = await requestPayment(
      grant.workspace_id,
      {
        sourceObjectType: "invoice",
        sourceObjectId: invoice.id,
        purpose: "final",
        amountMinor: invoice.balance_due_minor,
        currency: invoice.currency,
        providerAccountId: providerAccount.id,
        customerContactId,
        customerEmail,
        successUrl: `${origin}/access?checkout=returned`,
        cancelUrl: `${origin}/access?checkout=cancelled`,
      },
      { type: "customer", id: grant.id },
      idempotencyKey,
    );

    // Process the outbox to create the Stripe Checkout Session.
    const paymentRequest = await processPaymentOutboxForAggregate(
      grant.workspace_id,
      "payment.checkout.create",
      command.aggregate.id,
    );

    const checkoutUrl =
      paymentRequest && "checkout_url" in paymentRequest
        ? (paymentRequest.checkout_url as string)
        : null;

    const response = NextResponse.json({ success: true, data: { checkoutUrl } });
    for (const [k, v] of Object.entries(CUSTOMER_ACCESS_RESPONSE_HEADERS)) {
      response.headers.set(k, v);
    }
    return response;
  } catch {
    // Audit access_denied for authorization failures (sampled, Tech Spec §12).
    if (shouldSampleAccessDenied(grant.id)) {
      await auditCustomerAccessDenied(grant.workspace_id, grant.id);
    }
    // All authorization failures collapse to UNAVAILABLE (Tech Spec §6.3).
    return unavailableResponse();
  }
}

function unavailableResponse(): NextResponse {
  const response = NextResponse.json(
    { success: false, error: { code: "UNAVAILABLE", message: "UNAVAILABLE" } },
    { status: 403 },
  );
  for (const [k, v] of Object.entries(CUSTOMER_ACCESS_RESPONSE_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}
