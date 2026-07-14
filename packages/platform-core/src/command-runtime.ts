// ── Command Runtime (v0.5 Slice 0) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.3:
// Every governed business mutation is a named command with:
//   - A commandId (client-supplied, unique per workspace)
//   - An expectedVersion (optimistic concurrency)
//   - An actor (user or system)
//   - An input payload
//   - A handler that returns batch statements + result
//
// The runtime provides:
//   - Idempotency: same commandId + same input → same result
//   - Optimistic locking: expectedVersion check on aggregate
//   - Atomic persistence: business state + events + audit + outbox in one batch
//   - Diagnostics: command_executions table for replay/audit

import { genId, now, queryOne, queryAll, execute, batch as runBatch } from "./db";
import { TABLES } from "./contracts";
import { BusinessError } from "./context";
import { ERROR_CODES } from "./errors";
import { enqueueOutboxStatement } from "./outbox";
import {
  assertCommandHandlerMatchesContract,
  prepareCommandContractEffects,
  resolveRegisteredCommandPlan,
} from "./command-contracts";

// ── Types ──

export interface CommandActor {
  type: "user" | "api_key" | "system" | "agent";
  id: string;
}

export interface CommandEnvelope<TInput = Record<string, unknown>> {
  /** Client-supplied unique command ID (per-workspace unique) */
  commandId: string;
  workspaceId: string;
  commandType: string;
  aggregateType: string;
  aggregateId: string;
  /** Expected aggregate version for optimistic locking (null = create new) */
  expectedVersion: number | null;
  actor: CommandActor;
  input: TInput;
  occurredAt: string;
  requestId?: string | null;
}

export interface DomainEventStatement {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface CommandHandlerResult<TAggregate = Record<string, unknown>> {
  /** Batch statements to execute atomically (business state + version + events + audit + outbox) */
  statements: Array<{ sql: string; args?: unknown[] }>;
  /** Domain events to write (will be converted to batch statements) */
  events?: DomainEventStatement[];
  /** Outbox messages to enqueue (will be converted to batch statements) */
  outboxMessages?: Array<{ messageType: string; payload: Record<string, unknown> }>;
  /** Audit event to write (will be converted to batch statement) */
  audit?: {
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  };
  /** The resulting aggregate state */
  aggregate: TAggregate;
  /** New version of the aggregate */
  newVersion: number;
  /** IDs of created work items (if any) */
  workItemIds?: string[];
}

export interface CommandResult<TAggregate = Record<string, unknown>> {
  commandId: string;
  aggregate: TAggregate;
  newVersion: number;
  eventIds: string[];
  workItemIds: string[];
  status: "succeeded" | "failed";
}

// ── Helpers ──

/**
 * Create a stable hash of the command input for idempotency checking.
 * Uses JSON.stringify with sorted keys for determinism.
 */
export function hashInput(input: unknown): string {
  const crypto = require("node:crypto");
  const json = stableStringify(input);
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 32);
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`);
  return `{${pairs.join(",")}}`;
}

/**
 * Check optimistic lock. Throws VERSION_CONFLICT if version doesn't match.
 */
export function checkOptimisticLock(
  currentVersion: number,
  expectedVersion: number | null
): void {
  if (expectedVersion === null) return; // null = create new, skip check
  if (currentVersion !== expectedVersion) {
    throw new BusinessError(
      ERROR_CODES.VERSION_CONFLICT,
      `VERSION_CONFLICT: Expected version ${expectedVersion} but current version is ${currentVersion}. ` +
      `The aggregate was modified by another command. Please reload and retry.`,
      409
    );
  }
}

/**
 * Build a domain event batch statement.
 * Accepts a pre-generated event ID so the caller can track it.
 */
function domainEventStatement(
  workspaceId: string,
  event: DomainEventStatement,
  actor: CommandActor,
  occurredAt: string,
  eventId: string
): { sql: string; args: unknown[] } {
  return {
    sql: `INSERT INTO ${TABLES.domainEvents}
          (id, workspace_id, aggregate_type, aggregate_id, event_type, payload_json, actor_type, actor_id, occurred_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      eventId,
      workspaceId,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.payload),
      actor.type,
      actor.id,
      occurredAt,
      now(),
    ],
  };
}

/**
 * Build an audit batch statement.
 */
function auditStatement(
  workspaceId: string,
  actor: CommandActor,
  audit: NonNullable<CommandHandlerResult["audit"]>,
  requestId: string | null | undefined
): { sql: string; args: unknown[] } {
  const id = genId("aud");
  const ts = now();
  return {
    sql: `INSERT INTO ${TABLES.auditLogs}
          (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, extension_version_id, request_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    args: [
      id,
      workspaceId,
      actor.type,
      actor.id,
      audit.action,
      audit.entityType,
      audit.entityId,
      audit.before ? JSON.stringify(audit.before) : null,
      audit.after ? JSON.stringify(audit.after) : null,
      requestId ?? null,
      ts,
    ],
  };
}

/**
 * Build a command_execution record batch statement.
 */
function commandExecutionStatement(
  envelope: CommandEnvelope,
  inputHash: string,
  status: string,
  resultJson: string | null,
  errorCode: string | null
): { sql: string; args: unknown[] } {
  const id = genId("cmd");
  return {
    sql: `INSERT INTO ${TABLES.commandExecutions}
          (id, workspace_id, command_id, command_type, aggregate_type, aggregate_id,
           actor_type, actor_id, input_hash, status, result_json, error_code, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      envelope.workspaceId,
      envelope.commandId,
      envelope.commandType,
      envelope.aggregateType,
      envelope.aggregateId,
      envelope.actor.type,
      envelope.actor.id,
      inputHash,
      status,
      resultJson,
      errorCode,
      envelope.occurredAt,
      now(),
    ],
  };
}

// ── Main Execute Function ──

/**
 * Execute a command with idempotency, optimistic locking, and atomic persistence.
 *
 * The handler receives the envelope and should return:
 *   - statements: batch statements for business state changes
 *   - events: domain events to append
 *   - outboxMessages: messages to enqueue
 *   - audit: audit event to record
 *   - aggregate: the resulting aggregate state
 *   - newVersion: the new aggregate version
 *   - workItemIds: IDs of created work items (if any)
 *
 * All writes (business state + events + audit + outbox + command_execution)
 * are committed in a single atomic batch transaction.
 */
export async function executeCommand<TAggregate = Record<string, unknown>>(
  envelope: CommandEnvelope,
  handler: (envelope: CommandEnvelope) => Promise<CommandHandlerResult<TAggregate>>
): Promise<CommandResult<TAggregate>> {
  const inputHash = hashInput(envelope.input);
  // Registered contracts fail closed before domain code runs. Commands that
  // have not yet migrated to a manifest contract continue through the legacy
  // compatibility path during the incremental rollout.
  const contractPlan = resolveRegisteredCommandPlan(envelope.commandType);

  // ── Idempotency check ──
  const existing = await queryOne<{
    id: string;
    status: string;
    input_hash: string;
    result_json: string | null;
    error_code: string | null;
  }>(
    `SELECT id, status, input_hash, result_json, error_code
     FROM ${TABLES.commandExecutions}
     WHERE workspace_id = ? AND command_id = ?`,
    [envelope.workspaceId, envelope.commandId]
  );

  if (existing) {
    if (existing.input_hash !== inputHash) {
      throw new BusinessError(
        ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        `IDEMPOTENCY_KEY_REUSED: Command ID "${envelope.commandId}" was already used with different input. ` +
        `Use a new command ID for a different request.`,
        409
      );
    }
    // Same command, same input → return stored result (idempotent)
    if (existing.status === "succeeded" && existing.result_json) {
      const stored = JSON.parse(existing.result_json) as CommandResult<TAggregate>;
      return stored;
    }
    // If previous attempt failed, allow retry by deleting the failed record
    if (existing.status === "failed") {
      await execute(
        `DELETE FROM ${TABLES.commandExecutions}
         WHERE workspace_id = ? AND command_id = ?`,
        [envelope.workspaceId, envelope.commandId]
      );
    }
  }

  // ── Execute handler ──
  const handlerResult = await handler(envelope);
  let contractStatements: Array<{ sql: string; args?: unknown[] }> = [];
  if (contractPlan) {
    assertCommandHandlerMatchesContract(
      contractPlan,
      envelope,
      handlerResult as CommandHandlerResult<unknown>,
    );
    contractStatements = await prepareCommandContractEffects(contractPlan, envelope);
  }

  // ── Build the complete batch ──
  const allStatements: Array<{ sql: string; args?: unknown[] }> = [
    ...handlerResult.statements,
    ...contractStatements,
  ];

  // Pre-generate event IDs so they match what gets persisted
  const eventIds = (handlerResult.events ?? []).map(() => genId("evt"));

  // Add domain events
  if (handlerResult.events) {
    for (let i = 0; i < handlerResult.events.length; i++) {
      allStatements.push(
        domainEventStatement(
          envelope.workspaceId,
          handlerResult.events[i],
          envelope.actor,
          envelope.occurredAt,
          eventIds[i]
        )
      );
    }
  }

  // Add outbox messages
  if (handlerResult.outboxMessages) {
    for (const msg of handlerResult.outboxMessages) {
      allStatements.push(
        enqueueOutboxStatement(
          envelope.workspaceId,
          msg.messageType,
          msg.payload
        )
      );
    }
  }

  // Add audit
  if (handlerResult.audit) {
    allStatements.push(
      auditStatement(
        envelope.workspaceId,
        envelope.actor,
        handlerResult.audit,
        envelope.requestId ?? null
      )
    );
  }

  // Build the result object
  const result: CommandResult<TAggregate> = {
    commandId: envelope.commandId,
    aggregate: handlerResult.aggregate,
    newVersion: handlerResult.newVersion,
    eventIds,
    workItemIds: handlerResult.workItemIds ?? [],
    status: "succeeded" as const,
  };

  // Add command execution record
  allStatements.push(
    commandExecutionStatement(
      envelope,
      inputHash,
      "succeeded",
      JSON.stringify(result),
      null
    )
  );

  // ── Execute atomically ──
  await runBatch(allStatements);

  return result;
}

// ── Query Functions ──

/**
 * Get command execution history for an aggregate.
 */
export async function getCommandHistory(
  workspaceId: string,
  aggregateType: string,
  aggregateId: string,
  limit = 50
): Promise<Array<{
  commandId: string;
  commandType: string;
  actorType: string;
  actorId: string;
  status: string;
  createdAt: string;
}>> {
  const rows = await queryAll<{
    command_id: string;
    command_type: string;
    actor_type: string;
    actor_id: string;
    status: string;
    created_at: string;
  }>(
    `SELECT command_id, command_type, actor_type, actor_id, status, created_at
     FROM ${TABLES.commandExecutions}
     WHERE workspace_id = ? AND aggregate_type = ? AND aggregate_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [workspaceId, aggregateType, aggregateId, limit]
  );
  return rows.map(r => ({
    commandId: r.command_id,
    commandType: r.command_type,
    actorType: r.actor_type,
    actorId: r.actor_id,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/**
 * Get domain events for an aggregate.
 */
export async function getDomainEvents(
  workspaceId: string,
  aggregateType: string,
  aggregateId: string,
  limit = 100
): Promise<Array<{
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  actorType: string | null;
  actorId: string | null;
  occurredAt: string;
}>> {
  // Import queryAll at module level
  const rows = await queryAll<{
    id: string;
    event_type: string;
    payload_json: string;
    actor_type: string | null;
    actor_id: string | null;
    occurred_at: string;
  }>(
    `SELECT id, event_type, payload_json, actor_type, actor_id, occurred_at
     FROM ${TABLES.domainEvents}
     WHERE workspace_id = ? AND aggregate_type = ? AND aggregate_id = ?
     ORDER BY occurred_at ASC LIMIT ?`,
    [workspaceId, aggregateType, aggregateId, limit]
  );
  return rows.map(r => ({
    id: r.id,
    eventType: r.event_type,
    payload: JSON.parse(r.payload_json),
    actorType: r.actor_type,
    actorId: r.actor_id,
    occurredAt: r.occurred_at,
  }));
}
