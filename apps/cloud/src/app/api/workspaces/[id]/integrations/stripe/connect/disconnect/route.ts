import { NextRequest } from "next/server";
import {
  requireBusinessPermission,
  getConnectProviderAccount,
  disconnectConnectAccount,
  type CommandActor,
  type PaymentProviderMode,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { getOrCreateRequestId, handleError, successResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/workspaces/[id]/integrations/stripe/connect/disconnect
// Disconnect the Stripe Connect account for the active workspace/mode mapping
// (Tech Spec §9.3 — payment.connect.disconnect). Uses optimistic locking via
// `expectedVersion`; the account record is never deleted.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "member");
    await requireBusinessPermission(ctx, "payment.configure");

    const body = (await request.json()) as { expectedVersion: number };
    const mode = (process.env.STRIPE_PAYMENT_MODE ?? "test") as PaymentProviderMode;

    // Resolve the active provider account to obtain the aggregate id used by
    // the disconnect command.
    const account = await getConnectProviderAccount(workspaceId, mode);
    const actor: CommandActor = {
      id: ctx.principal?.userId ?? "unknown",
      type: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
    };

    const command = await disconnectConnectAccount(
      workspaceId,
      account.id,
      actor,
      body.expectedVersion,
    );

    return successResponse({ account: command.aggregate }, 200, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
