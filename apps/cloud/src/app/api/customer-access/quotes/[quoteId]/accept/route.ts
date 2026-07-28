import { NextRequest, NextResponse } from "next/server";
import {
  resolveCustomerAccessSession,
  resolveCustomerQuoteAccept,
  acceptQuote,
  CUSTOMER_ACCESS_COOKIE_NAME,
  CUSTOMER_ACCESS_RESPONSE_HEADERS,
  verifyCustomerAccessSession,
  shouldSampleAccessDenied,
  auditCustomerAccessDenied,
} from "@runory/platform-core";

export const dynamic = "force-dynamic";

/**
 * POST /api/customer-access/quotes/:quoteId/accept
 *
 * Per Tech Spec §7.2 and §8.2: A customer can accept a Quote if:
 *   - they have an active customer-access session (cookie)
 *   - the grant includes the `quote.accept` capability
 *   - the Quote is reachable from the grant root
 *   - the Quote subject matches the grant subject
 *   - the Quote is in `sent` status
 *
 * The server derives the expected version and command ID — the browser cannot
 * submit actor, version, or any business input.
 *
 * Idempotency key (Tech Spec §7.3):
 *   customer-access:<grantId>:quote.accept:<quoteId>
 *
 * Per Tech Spec §12: quote.accept is audited via executeCommand with
 * actor_type=customer. Access denied on invalid session is audited (sampled).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ quoteId: string }> },
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

  const { quoteId } = await params;

  try {
    // Resolve the quote with full reachability + subject verification.
    const { quote, expectedVersion } = await resolveCustomerQuoteAccept(
      grant.workspace_id,
      grant.id,
      quoteId,
    );

    // Derive the idempotency key per Tech Spec §7.3.
    const commandId = `customer-access:${grant.id}:quote.accept:${quoteId}`;

    // Execute quote.accept with a customer actor.
    // The command runtime verifies the contract allows `customer` actors.
    await acceptQuote(
      grant.workspace_id,
      quote.id,
      { type: "customer", id: grant.id },
      expectedVersion,
      commandId,
    );

    const response = NextResponse.json({ success: true });
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
