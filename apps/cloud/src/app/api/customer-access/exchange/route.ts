import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCustomerAccessToken,
  CustomerAccessUnavailableError,
  CUSTOMER_ACCESS_COOKIE_NAME,
  CUSTOMER_ACCESS_RESPONSE_HEADERS,
  rateLimitFingerprint,
  tryLookupGrantForAudit,
  shouldSampleAccessDenied,
  auditCustomerAccessExchange,
  auditCustomerAccessDenied,
} from "@runory/platform-core";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/customer-access/exchange
 *
 * Per Tech Spec §6.2 / §8.2: Exchange a raw customer-access token for a signed
 * session cookie. The raw token is never persisted, logged, or returned.
 *
 * All failure cases collapse to a single generic 403 "UNAVAILABLE" response so
 * the caller cannot distinguish missing, expired, revoked, or mismatched
 * grants (Tech Spec §6.3).
 *
 * Per Tech Spec §12: successful exchange writes customer_access.exchange
 * audit; failed exchange writes customer_access.access_denied audit (sampled).
 */
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return unavailableResponse();
  }

  const token = typeof body.token === "string" ? body.token : "";

  // Rate-limit: IP + token fingerprint (Tech Spec §6.3).
  const fingerprint = rateLimitFingerprint(ip, token || "anonymous");
  const rateLimit = checkRateLimit(`customer-access:exchange:${fingerprint}`, 5, 60_000);
  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." } },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimit.resetAt),
        },
      },
    );
    applyProtectedHeaders(response);
    return response;
  }

  try {
    const result = await exchangeCustomerAccessToken(token);

    // Audit successful exchange (Tech Spec §12).
    await auditCustomerAccessExchange(
      result.grant.workspace_id,
      result.grant.id,
    );

    const response = NextResponse.json({ success: true });
    response.cookies.set(
      CUSTOMER_ACCESS_COOKIE_NAME,
      result.cookieValue,
      result.cookieOptions,
    );
    applyProtectedHeaders(response);
    return response;
  } catch (error) {
    // Audit access_denied (sampled per Tech Spec §12).
    if (shouldSampleAccessDenied(fingerprint)) {
      const grantInfo = await tryLookupGrantForAudit(token);
      if (grantInfo) {
        await auditCustomerAccessDenied(
          grantInfo.workspaceId,
          grantInfo.grantId,
        );
      }
    }

    // All failures collapse to a single generic 403 UNAVAILABLE.
    // Do NOT distinguish missing, expired, revoked, or mismatched grants.
    return unavailableResponse();
  }
}

function unavailableResponse(): NextResponse {
  const response = NextResponse.json(
    { success: false, error: { code: "UNAVAILABLE", message: "UNAVAILABLE" } },
    { status: 403 },
  );
  applyProtectedHeaders(response);
  return response;
}

function applyProtectedHeaders(response: NextResponse): void {
  for (const [k, v] of Object.entries(CUSTOMER_ACCESS_RESPONSE_HEADERS)) {
    response.headers.set(k, v);
  }
}
