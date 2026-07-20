// ── Outbox Message Queue (v0.5 Slice 0) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.3:
// Domain events are append-only. Outbox delivery is at least once;
// consumers MUST be idempotent. A command that commits business state
// and an outbox message is successful even if delivery is pending.
// Diagnostics MUST expose pending/failed outbox messages.

import { genId, now, queryAll, queryOne, execute } from "./db";
import { TABLES } from "./contracts";

export type OutboxStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "failed"
  | "dead_letter";

export interface OutboxMessage {
  id: string;
  workspaceId: string;
  messageType: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  lockedAt: string | null;
  correlationId: string | null;
  updatedAt: string;
}

interface OutboxRow {
  id: string;
  workspace_id: string;
  message_type: string;
  payload_json: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  locked_at: string | null;
  correlation_id: string | null;
  updated_at: string | null;
}

function mapOutboxMessage(row: OutboxRow): OutboxMessage {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    messageType: row.message_type,
    payload: JSON.parse(row.payload_json),
    status: row.status as OutboxStatus,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    nextAttemptAt: row.next_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    lockedAt: row.locked_at,
    correlationId: row.correlation_id,
    updatedAt: row.updated_at ?? row.created_at,
  };
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
  payload: Record<string, unknown>,
  options?: { correlationId?: string | null },
): { sql: string; args: unknown[] } {
  const id = genId("obx");
  const ts = now();
  return {
    sql: `INSERT INTO ${TABLES.outboxMessages}
          (id, workspace_id, message_type, payload_json, status, attempts,
           next_attempt_at, correlation_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
    args: [
      id,
      workspaceId,
      messageType,
      JSON.stringify(payload),
      ts,
      options?.correlationId ?? null,
      ts,
      ts,
    ],
  };
}

/**
 * Enqueue an outbox message as a standalone execute (non-batch).
 * Use this when the outbox message is not part of a command transaction.
 */
export async function enqueueOutboxMessage(
  workspaceId: string,
  messageType: string,
  payload: Record<string, unknown>,
  options?: { correlationId?: string | null },
): Promise<string> {
  const id = genId("obx");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.outboxMessages}
     (id, workspace_id, message_type, payload_json, status, attempts,
      next_attempt_at, correlation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      messageType,
      JSON.stringify(payload),
      ts,
      options?.correlationId ?? null,
      ts,
      ts,
    ],
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
  const rows = await queryAll<OutboxRow>(
    `SELECT * FROM ${TABLES.outboxMessages}
     WHERE workspace_id = ? AND status = 'pending'
     ORDER BY created_at ASC LIMIT ?`,
    [workspaceId, limit]
  );
  return rows.map(mapOutboxMessage);
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
): Promise<OutboxMessage[]> {
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
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

  return (await queryAll<OutboxRow>(sql, args)).map(mapOutboxMessage);
}

/**
 * Atomically claim one due message. Only one concurrent worker can win.
 */
export async function claimOutboxMessage(
  workspaceId: string,
  messageId: string,
  claimedAt = now(),
  leaseMs = 5 * 60_000,
): Promise<OutboxMessage | null> {
  const staleBefore = new Date(new Date(claimedAt).getTime() - leaseMs).toISOString();
  const row = await queryOne<OutboxRow>(
    `UPDATE ${TABLES.outboxMessages}
     SET status = 'processing', locked_at = ?, last_attempt_at = ?,
         updated_at = ?
     WHERE id = ? AND workspace_id = ?
       AND (
         (
           status IN ('pending', 'failed')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         )
         OR (status = 'processing' AND locked_at <= ?)
       )
     RETURNING *`,
    [
      claimedAt,
      claimedAt,
      claimedAt,
      messageId,
      workspaceId,
      claimedAt,
      staleBefore,
    ],
  );
  return row ? mapOutboxMessage(row) : null;
}

/**
 * Mark a claimed outbox message as delivered within its Workspace scope.
 */
export async function markOutboxDelivered(
  workspaceId: string,
  messageId: string,
): Promise<void> {
  await execute(
    `UPDATE ${TABLES.outboxMessages}
     SET status = 'delivered', delivered_at = ?, locked_at = NULL,
         next_attempt_at = NULL, last_error = NULL, updated_at = ?
     WHERE id = ? AND workspace_id = ? AND status = 'processing'`,
    [now(), now(), messageId, workspaceId],
  );
}

/**
 * Record a delivery failure with bounded exponential backoff and dead-letter
 * escalation. Attempts count actual provider calls, not administrative resets.
 */
export async function markOutboxFailed(
  workspaceId: string,
  messageId: string,
  error: string,
  options?: { maxAttempts?: number; failedAt?: string },
): Promise<void> {
  const failedAt = options?.failedAt ?? now();
  const maxAttempts = Math.max(options?.maxAttempts ?? 5, 1);
  const current = await queryOne<{ attempts: number }>(
    `SELECT attempts FROM ${TABLES.outboxMessages}
     WHERE id = ? AND workspace_id = ? AND status = 'processing'`,
    [messageId, workspaceId],
  );
  if (!current) return;
  const attempts = Number(current.attempts) + 1;
  const deadLetter = attempts >= maxAttempts;
  const nextAttemptAt = deadLetter
    ? null
    : new Date(
      new Date(failedAt).getTime() + Math.min(2 ** (attempts - 1) * 30_000, 3_600_000),
    ).toISOString();
  await execute(
    `UPDATE ${TABLES.outboxMessages}
     SET status = ?, attempts = ?, last_error = ?, locked_at = NULL,
         next_attempt_at = ?, updated_at = ?
     WHERE id = ? AND workspace_id = ? AND status = 'processing'`,
    [
      deadLetter ? "dead_letter" : "failed",
      attempts,
      error.slice(0, 500),
      nextAttemptAt,
      failedAt,
      messageId,
      workspaceId,
    ],
  );
}

export async function retryOutboxMessage(
  workspaceId: string,
  messageId: string,
): Promise<boolean> {
  const timestamp = now();
  const row = await queryOne<{ id: string }>(
    `UPDATE ${TABLES.outboxMessages}
     SET status = 'pending', next_attempt_at = ?, locked_at = NULL,
         last_error = NULL, updated_at = ?
     WHERE id = ? AND workspace_id = ? AND status IN ('failed', 'dead_letter')
     RETURNING id`,
    [timestamp, timestamp, messageId, workspaceId],
  );
  return Boolean(row);
}
