import { NextRequest, NextResponse } from "next/server";
import {
  resolveCustomerAccessSession,
  resolveCustomerAccessContext,
  CUSTOMER_ACCESS_COOKIE_NAME,
  CUSTOMER_ACCESS_RESPONSE_HEADERS,
  verifyCustomerAccessSession,
  shouldSampleAccessDenied,
  auditCustomerAccessDenied,
} from "@runory/platform-core";

export const dynamic = "force-dynamic";

/**
 * GET /api/customer-access/context
 *
 * Per Tech Spec §8.2: Return the customer-safe journey context DTO assembled
 * from the grant root. Only capabilities included in the grant are surfaced.
 *
 * If no cookie is present or the session is invalid/expired/revoked, return a
 * generic 403 "UNAVAILABLE" with protected headers (Tech Spec §6.3).
 *
 * Per Tech Spec §12: invalid session attempts write customer_access.access_denied
 * audit (sampled) when the cookie signature is valid but the grant is no longer active.
 */
export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get(CUSTOMER_ACCESS_COOKIE_NAME)?.value;

  if (!cookieValue) {
    return unavailableResponse();
  }

  const grant = await resolveCustomerAccessSession(cookieValue);
  if (!grant) {
    // Audit access_denied if the cookie signature is valid but the grant
    // is revoked/expired (Tech Spec §12, sampled).
    const payload = verifyCustomerAccessSession(cookieValue);
    if (payload && shouldSampleAccessDenied(payload.grantId)) {
      await auditCustomerAccessDenied(payload.workspaceId, payload.grantId);
    }
    return unavailableResponse();
  }

  const context = await resolveCustomerAccessContext(grant);

  const response = NextResponse.json({ success: true, data: context });
  for (const [k, v] of Object.entries(CUSTOMER_ACCESS_RESPONSE_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
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
