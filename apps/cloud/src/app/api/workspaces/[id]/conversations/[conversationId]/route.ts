import { NextRequest } from "next/server";
import { queryAll, queryOne, TABLES } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; conversationId: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, conversationId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const conversation = await queryOne<Record<string, unknown>>(`SELECT * FROM ${TABLES.conversations} WHERE id = ? AND workspace_id = ?`, [conversationId, workspaceId]);
    if (!conversation) return successResponse(null, 404, ctx.requestId);
    const [participants, messages] = await Promise.all([
      queryAll<Record<string, unknown>>(`SELECT * FROM ${TABLES.conversationParticipants} WHERE workspace_id = ? AND conversation_id = ? ORDER BY created_at ASC`, [workspaceId, conversationId]),
      queryAll<Record<string, unknown>>(`SELECT * FROM ${TABLES.messages} WHERE workspace_id = ? AND conversation_id = ? ORDER BY created_at ASC`, [workspaceId, conversationId]),
    ]);
    const messageIds = messages.map(row => String(row.id));
    const deliveries = messageIds.length ? await queryAll<Record<string, unknown>>(`SELECT * FROM ${TABLES.messageDeliveries} WHERE workspace_id = ? AND message_id IN (${messageIds.map(() => "?").join(",")})`, [workspaceId, ...messageIds]) : [];
    return successResponse({ conversation, participants, messages, deliveries }, 200, ctx.requestId);
  } catch (error) { return handleError(error, requestId); }
}
