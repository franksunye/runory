import { NextRequest } from "next/server";
import {
  requireBusinessPermission,
  startConnectOnboarding,
  type CommandActor,
  type PaymentProviderMode,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";
import { processConnectOnboardingOutbox } from "@/integrations/payments/connect-outbox-processor";

export const dynamic = "force-dynamic";

// POST /api/workspaces/[id]/integrations/stripe/connect/onboarding
// Start or resume the Stripe-managed Connect onboarding flow for the active
// workspace/mode mapping (Tech Spec §9.3 — payment.connect.start).
//
// The command writes an outbox message; this route then processes it to create
// a Stripe Connected Account (if needed) and an Account Link, returning the
// real onboarding URL.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    await requireBusinessPermission(ctx, "payment.configure");

    const mode = (process.env.STRIPE_PAYMENT_MODE ?? "test") as PaymentProviderMode;
    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    const command = await startConnectOnboarding(
      workspaceId,
      actor,
      mode,
      idempotencyKey,
      ctx.requestId,
    );

    // Process the onboarding outbox to create the Stripe Account Link.
    const onboardingUrl = await processConnectOnboardingOutbox(
      workspaceId,
      command.aggregate.id,
    );

    return successResponse(
      { onboardingUrl: onboardingUrl ?? command.aggregate.onboarding_url },
      200,
      ctx.requestId,
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
