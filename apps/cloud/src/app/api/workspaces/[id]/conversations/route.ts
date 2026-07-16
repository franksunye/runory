import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const conversations = await queryAll<Record<string, unknown>>(
      `SELECT c.*, (SELECT body_text FROM ${TABLES.messages} m WHERE m.workspace_id = c.workspace_id AND m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM ${TABLES.conversations} c WHERE c.workspace_id = ? ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 100`, [workspaceId],
    );
    const ids = conversations.map(row => String(row.id));
    const messages = ids.length ? await queryAll<Record<string, unknown>>(`SELECT * FROM ${TABLES.messages} WHERE workspace_id = ? AND conversation_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at ASC`, [workspaceId, ...ids]) : [];
    const messageIds = messages.map(row => String(row.id));
    const deliveries = messageIds.length ? await queryAll<Record<string, unknown>>(`SELECT * FROM ${TABLES.messageDeliveries} WHERE workspace_id = ? AND message_id IN (${messageIds.map(() => "?").join(",")})`, [workspaceId, ...messageIds]) : [];
    return successResponse({ conversations, messages, deliveries }, 200, ctx.requestId);
  } catch (error) { return handleError(error, requestId); }
}
