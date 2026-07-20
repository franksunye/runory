import { NextRequest } from "next/server";
import {
  getOutboxMessages,
  retryOutboxMessage,
  execute,
  TABLES,
  now,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";
import { deliverWorkOrderConfirmation } from "@/integrations/email/resend-outbox";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspaces/[id]/outbox
 *
 * Returns outbox messages for diagnostics. Supports filtering by status.
 * Per v0.5 Spec §5.3: "Diagnostics MUST expose pending/failed outbox messages"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limit = url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!)
      : undefined;

    const messages = await getOutboxMessages(workspaceId, { status, limit });
    return successResponse(messages, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

/**
 * POST /api/workspaces/[id]/outbox
 *
 * Retry a failed outbox message by setting its status back to 'pending'.
 * Per project_memory constraint: "Outbox messages must have a diagnostic
 * interface for visualizing retryable failed messages"
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");
    const body = await request.json() as { messageId?: string; action?: string };

    if (!body?.messageId) {
      return handleError(
        new Error("messageId is required"),
        requestId
      );
    }

    if (body.action === "retry") {
      const reset = await retryOutboxMessage(workspaceId, body.messageId);
      if (!reset) {
        return successResponse({ retried: false, delivery: null }, 200, ctx.requestId);
      }
      const delivery = await deliverWorkOrderConfirmation(workspaceId, body.messageId);
      return successResponse({ retried: true, delivery }, 200, ctx.requestId);
    }

    if (body.action === "mark_delivered") {
      await execute(
        `UPDATE ${TABLES.outboxMessages}
         SET status = 'delivered', delivered_at = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?`,
        [now(), now(), body.messageId, workspaceId]
      );
      return successResponse({ delivered: true }, 200, ctx.requestId);
    }

    return handleError(
      new Error(`Unknown action: ${body.action}`),
      requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}
