import { NextRequest } from "next/server";
import {
  AuthorizationError,
  getBillingCustomer,
  NotFoundError,
} from "@runory/platform-core";
import { requireOrganizationAccess } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";
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
    const { membership } = await requireOrganizationAccess(request, organizationId);
    if (membership.role !== "owner") throw new AuthorizationError("Organization owner required");
    const body = await request.json() as { returnPath?: string };
    const customer = await getBillingCustomer(organizationId);
    if (!customer) throw new NotFoundError("Billing customer not found");

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const session = await getRunoryBillingStripeClient().billingPortal.sessions.create({
      customer: customer.providerCustomerId,
      return_url: `${origin}${returnPath(body.returnPath)}`,
    });
    return successResponse({ portalUrl: session.url }, 201, requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
