// ── Outbox Message Queue (v0.5 Slice 0) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.3:
// Domain events are append-only. Outbox delivery is at least once;
// consumers MUST be idempotent. A command that commits business state
// and an outbox message is successful even if delivery is pending.
// Diagnostics MUST expose pending/failed outbox messages.

import { genId, now, queryAll, execute } from "./db";
import { TABLES } from "./contracts";

export interface OutboxMessage {
  id: string;
  workspaceId: string;
  messageType: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

/**
 * Enqueue an outbox message. This should be called as part of the same
 * batch transaction that commits the business state change, ensuring
 * the outbox message is committed atomically with the state change.
 *
 * Returns the statement to include in a batch() call.
 */
export function enqueueOutboxStatement(
  workspaceId: string,
  messageType: string,
  payload: Record<string, unknown>
): { sql: string; args: unknown[] } {
  const id = genId("obx");
  const ts = now();
  return {
    sql: `INSERT INTO ${TABLES.outboxMessages}
          (id, workspace_id, message_type, payload_json, status, attempts, created_at)
          VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
    args: [id, workspaceId, messageType, JSON.stringify(payload), ts],
  };
}

/**
 * Enqueue an outbox message as a standalone execute (non-batch).
 * Use this when the outbox message is not part of a command transaction.
 */
export async function enqueueOutboxMessage(
  workspaceId: string,
  messageType: string,
  payload: Record<string, unknown>
): Promise<string> {
  const id = genId("obx");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.outboxMessages}
     (id, workspace_id, message_type, payload_json, status, attempts, created_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
    [id, workspaceId, messageType, JSON.stringify(payload), ts]
  );
  return id;
}

/**
 * Get pending outbox messages for diagnostics.
 */
export async function getPendingOutboxMessages(
  workspaceId: string,
  limit = 50
): Promise<OutboxMessage[]> {
  const rows = await queryAll<{
    id: string;
    workspace_id: string;
    message_type: string;
    payload_json: string;
    status: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
    delivered_at: string | null;
  }>(
    `SELECT * FROM ${TABLES.outboxMessages}
     WHERE workspace_id = ? AND status = 'pending'
     ORDER BY created_at ASC LIMIT ?`,
    [workspaceId, limit]
  );
  return rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    messageType: r.message_type,
    payload: JSON.parse(r.payload_json),
    status: r.status as OutboxMessage["status"],
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at,
  }));
}

/**
 * Get outbox messages with optional status filter (for diagnostics).
 *
 * Unlike getPendingOutboxMessages (which only returns 'pending' messages),
 * this function supports filtering by any status ('pending', 'delivered',
 * 'failed') or returning all messages when no status is supplied. Results are
 * ordered oldest-first. Per Spec §5.3, diagnostics MUST expose pending/failed
 * outbox messages.
 */
export async function getOutboxMessages(
  workspaceId: string,
  filters?: { status?: string; limit?: number }
): Promise<Record<string, unknown>[]> {
  const limit = filters?.limit ?? 50;
  const status = filters?.status;

  const sql = status
    ? `SELECT * FROM ${TABLES.outboxMessages}
       WHERE workspace_id = ? AND status = ?
       ORDER BY created_at ASC LIMIT ?`
    : `SELECT * FROM ${TABLES.outboxMessages}
       WHERE workspace_id = ?
       ORDER BY created_at ASC LIMIT ?`;
  const args: unknown[] = status
    ? [workspaceId, status, limit]
    : [workspaceId, limit];

  const rows = await queryAll<{
    id: string;
    workspace_id: string;
    message_type: string;
    payload_json: string;
    status: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
    delivered_at: string | null;
  }>(sql, args);

  return rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    messageType: r.message_type,
    payload: JSON.parse(r.payload_json),
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at,
  }));
}

/**
 * Mark an outbox message as delivered.
 */
export async function markOutboxDelivered(messageId: string): Promise<void> {
  await execute(
    `UPDATE ${TABLES.outboxMessages}
     SET status = 'delivered', delivered_at = ? WHERE id = ?`,
    [now(), messageId]
  );
}

/**
 * Mark an outbox message as failed (for retry).
 */
export async function markOutboxFailed(
  messageId: string,
  error: string
): Promise<void> {
  await execute(
    `UPDATE ${TABLES.outboxMessages}
     SET status = 'failed', attempts = attempts + 1, last_error = ?
     WHERE id = ?`,
    [error, messageId]
  );
}
