import { queryOne, TABLES } from "@runory/platform-core";

// ── Work Item Idempotency Guard ──
//
// Per v0.5.1 Spec §5.4: "Retrying an attachment association MUST be idempotent."
// And §9 Gate 10: "Mobile and desktop actions produce the same command,
// permission, audit, and idempotency outcomes."
//
// Work item APIs that accept an `idempotencyKey` use this helper to check
// whether the same key has already been processed. If so, the previous result
// is returned without re-executing the command.

interface IdempotencyRecord {
  id: string;
  status: string;
  result_json: string | null;
}

/**
 * Check whether an idempotency key has already been used for this workspace.
 * Returns the stored result if found, or null if this is a new request.
 */
export async function checkIdempotency(
  workspaceId: string,
  idempotencyKey: string
): Promise<IdempotencyRecord | null> {
  const record = await queryOne<IdempotencyRecord>(
    `SELECT id, status, result_json
     FROM ${TABLES.commandExecutions}
     WHERE workspace_id = ? AND command_id = ?`,
    [workspaceId, idempotencyKey]
  );
  return record ?? null;
}

/**
 * Record an idempotency result for a work item operation.
 */
export async function recordIdempotencyResult(
  workspaceId: string,
  idempotencyKey: string,
  commandType: string,
  aggregateId: string,
  actorType: string,
  actorId: string,
  status: "succeeded" | "failed",
  result: Record<string, unknown> | null,
  errorCode?: string
): Promise<void> {
  const { genId, now } = await import("@runory/platform-core");
  await queryOne(
    `INSERT INTO ${TABLES.commandExecutions}
     (id, workspace_id, command_id, command_type, aggregate_type, aggregate_id,
      actor_type, actor_id, input_hash, status, result_json, error_code, created_at, completed_at)
     VALUES (?, ?, ?, ?, 'work_item', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      genId("cmd"),
      workspaceId,
      idempotencyKey,
      commandType,
      aggregateId,
      actorType,
      actorId,
      "", // input_hash — not used for work item APIs
      status,
      result ? JSON.stringify(result) : null,
      errorCode ?? null,
      now(),
      now(),
    ]
  );
}
