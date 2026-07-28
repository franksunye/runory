import { NextRequest, NextResponse } from "next/server";
import {
  CUSTOMER_ACCESS_COOKIE_NAME,
  expiredCustomerAccessCookieOptions,
  CUSTOMER_ACCESS_RESPONSE_HEADERS,
  verifyCustomerAccessSession,
  auditCustomerAccessLogout,
} from "@runory/platform-core";

export const dynamic = "force-dynamic";

/**
 * POST /api/customer-access/session/logout
 *
 * Per Tech Spec §8.2: Clear the customer access session cookie. This is a
 * client-side logout — it expires the cookie immediately. The grant itself is
 * not revoked (revocation is a separate Workspace-managed operation).
 *
 * Per Tech Spec §12: write customer_access.logout audit if the session
 * cookie was valid (so we have grant/workspace context).
 */
export async function POST(request: NextRequest) {
  const cookieValue = request.cookies.get(CUSTOMER_ACCESS_COOKIE_NAME)?.value;

  // If a valid session cookie exists, audit the logout (Tech Spec §12).
  if (cookieValue) {
    const payload = verifyCustomerAccessSession(cookieValue);
    if (payload) {
      await auditCustomerAccessLogout(payload.workspaceId, payload.grantId);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    CUSTOMER_ACCESS_COOKIE_NAME,
    "",
    expiredCustomerAccessCookieOptions(),
  );
  for (const [k, v] of Object.entries(CUSTOMER_ACCESS_RESPONSE_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}
