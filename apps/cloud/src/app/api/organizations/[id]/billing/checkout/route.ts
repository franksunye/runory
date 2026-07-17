import { NextRequest } from "next/server";
import {
  getBillingCustomer,
  getBillingSubscription,
  upsertBillingCustomer,
  AuthorizationError,
  ConflictError,
  InvalidInputError,
} from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";
import { getBillingPrice } from "@/integrations/billing/stripe/config";
import { getRunoryBillingStripeClient } from "@/integrations/billing/stripe/client";

export const dynamic = "force-dynamic";

function returnPath(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  return /^\/w\/[A-Za-z0-9_-]+\/billing$/.test(path) ? path : "/account";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id: organizationId } = await params;
    const { principal, membership } = await requireOrganizationAccess(request, organizationId);
    if (membership.role !== "owner") throw new AuthorizationError("Organization owner required");
    const body = await request.json() as {
      plan?: string;
      priceId?: string;
      returnPath?: string;
    };
    if (body.priceId) throw new InvalidInputError("Client Price IDs are forbidden");
    if (body.plan !== "pro") throw new InvalidInputError("Plan is not self-serve");

    const existingSubscription = await getBillingSubscription(organizationId);
    if (
      existingSubscription
      && ["active", "trialing", "past_due"].includes(existingSubscription.status)
    ) {
      throw new ConflictError("An active subscription already exists");
    }

    const stripe = getRunoryBillingStripeClient();
    let customer = await getBillingCustomer(organizationId);
    if (!customer) {
      const created = await stripe.customers.create({
        email: principal.email?.trim() || undefined,
        name: principal.displayName,
        metadata: { organization_id: organizationId },
      }, {
        idempotencyKey: `runory-billing-customer:${organizationId}`,
      });
      customer = await upsertBillingCustomer({
        organizationId,
        providerCustomerId: created.id,
        email: created.email,
      });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const path = returnPath(body.returnPath);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.providerCustomerId,
      client_reference_id: organizationId,
      line_items: [{ price: getBillingPrice("pro"), quantity: 1 }],
      success_url: `${origin}${path}?billing=returned`,
      cancel_url: `${origin}${path}?billing=cancelled`,
      metadata: {
        organization_id: organizationId,
        plan_id: "pro",
      },
      subscription_data: {
        metadata: {
          organization_id: organizationId,
          plan_id: "pro",
        },
      },
    }, {
      idempotencyKey: request.headers.get("idempotency-key")
        ?? `runory-billing-checkout:${organizationId}:${Date.now()}`,
    });
    if (!session.url) throw new Error("BILLING_CHECKOUT_URL_MISSING");

    return successResponse({ checkoutUrl: session.url }, 201, requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
