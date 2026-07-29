/**
 * v0.9.3 Payment Reconciliation — reconcile + replay_event commands.
 *
 * Spec: v0.9 Repeatable Delivery Execution Plan §3.4,
 *   Payment Technical Spec §6.7
 *
 * Compares Runory Payment canonical state with a provider snapshot.
 * Produces an auditable ReconciliationResult (consistent | divergent | unknown).
 * Supports idempotent replay of missed provider events.
 *
 * Privacy: diagnostic details never expose credentials or sensitive payloads.
 * Invariants: tenant, provider-account, currency, allocation, refund, audit.
 */

import { businessTable, TABLES } from "./contracts";
import { BusinessError, NotFoundError } from "./context";
import { genId, now, queryAll, queryOne } from "./db";
import {
  executeCommand,
  type CommandActor,
  type CommandResult,
} from "./command-runtime";
import { ERROR_CODES } from "./errors";
import { applyProviderPaymentEvent, type PaymentRecord } from "./payment-commands";

// ── Types ──

export type ReconciliationStatus = "consistent" | "divergent" | "unknown";

export type DivergenceField =
  | "provider_account"
  | "provider_payment_id"
  | "currency"
  | "amount"
  | "payment_status"
  | "refunded_amount";

export interface Divergence {
  field: DivergenceField;
  canonicalValue: string | number | null;
  providerValue: string | number | null;
  severity: "warning" | "error";
}

export interface ProviderSnapshotInput {
  provider: string;
  providerAccountId: string;
  providerPaymentId: string;
  status: string;
  amountMinor: number;
  refundedAmountMinor: number;
  currency: string;
}

export interface ReconciliationResult {
  id: string;
  workspaceId: string;
  paymentId: string;
  provider: string;
  providerAccountId: string;
  providerPaymentId: string | null;
  status: ReconciliationStatus;
  divergences: Divergence[];
  replayAttempted: boolean;
  reconciledBy: string;
  reconciledAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReconcilePaymentInput {
  workspaceId: string;
  paymentId: string;
  providerSnapshot: ProviderSnapshotInput;
  actor: CommandActor;
}

export interface ReplayEventInput {
  workspaceId: string;
  providerAccountId: string;
  event: {
    type: string;
    provider: string;
    providerEventId: string;
    providerAccountId?: string;
    providerPaymentId: string;
    paymentRequestRef?: string;
    amountMinor?: number;
    currency?: string;
    safeFailureCode?: string;
    occurredAt: string;
  };
  payloadHash?: string;
  actor: CommandActor;
}

// ── Status mapping ──

/**
 * Map a provider status to Runory's canonical payment status vocabulary.
 * This handles provider-specific status naming (e.g., Stripe "succeeded" vs
 * provider-specific terms) and returns the Runory equivalent.
 */
function mapProviderStatus(status: string): string {
  const normalized = status.toLowerCase();
  const statusMap: Record<string, string> = {
    // Stripe / common provider statuses → Runory canonical
    succeeded: "succeeded",
    succeeded_payment: "succeeded",
    paid: "succeeded",
    requires_capture: "processing",
    processing: "processing",
    pending: "pending",
    failed: "failed",
    canceled: "cancelled",
    cancelled: "cancelled",
    expired: "failed",
    refunded: "refunded",
    partially_refunded: "partially_refunded",
  };
  return statusMap[normalized] ?? normalized;
}

// ── Core reconciliation logic ──

/**
 * Compare the Runory canonical payment record with a provider snapshot.
 * Returns divergences found, or empty array if consistent.
 */
export function comparePaymentWithSnapshot(
  payment: PaymentRecord,
  snapshot: ProviderSnapshotInput,
): Divergence[] {
  const divergences: Divergence[] = [];

  // 1. Provider account must match
  if (payment.provider_account_id !== snapshot.providerAccountId) {
    divergences.push({
      field: "provider_account",
      canonicalValue: payment.provider_account_id,
      providerValue: snapshot.providerAccountId,
      severity: "error",
    });
  }

  // 2. Provider payment ID must match (if both present)
  if (
    payment.provider_payment_id &&
    snapshot.providerPaymentId &&
    payment.provider_payment_id !== snapshot.providerPaymentId
  ) {
    divergences.push({
      field: "provider_payment_id",
      canonicalValue: payment.provider_payment_id,
      providerValue: snapshot.providerPaymentId,
      severity: "error",
    });
  }

  // 3. Currency must match
  if (payment.currency !== snapshot.currency) {
    divergences.push({
      field: "currency",
      canonicalValue: payment.currency,
      providerValue: snapshot.currency,
      severity: "error",
    });
  }

  // 4. Amount must match
  if (payment.amount_minor !== snapshot.amountMinor) {
    divergences.push({
      field: "amount",
      canonicalValue: payment.amount_minor,
      providerValue: snapshot.amountMinor,
      severity: "error",
    });
  }

  // 5. Payment status must match (after mapping)
  const mappedProviderStatus = mapProviderStatus(snapshot.status);
  if (payment.status !== mappedProviderStatus) {
    divergences.push({
      field: "payment_status",
      canonicalValue: payment.status,
      providerValue: mappedProviderStatus,
      severity: "error",
    });
  }

  // 6. Refunded amount must match
  if (payment.refunded_amount_minor !== snapshot.refundedAmountMinor) {
    divergences.push({
      field: "refunded_amount",
      canonicalValue: payment.refunded_amount_minor,
      providerValue: snapshot.refundedAmountMinor,
      severity: "warning",
    });
  }

  return divergences;
}

// ── Reconcile command ──

/**
 * Execute the `payment.reconcile` command.
 *
 * Compares the Runory canonical payment state with the provided provider
 * snapshot, persists a ReconciliationResult, and returns it.
 *
 * The provider snapshot is retrieved by the API layer (which has access to
 * the provider SDK) and passed in — this keeps platform-core pure.
 */
export async function reconcilePayment(
  input: ReconcilePaymentInput,
): Promise<CommandResult<ReconciliationResult>> {
  const { workspaceId, paymentId, providerSnapshot, actor } = input;

  // 1. Load the canonical payment record
  const payment = await queryOne<PaymentRecord>(
    `SELECT * FROM ${businessTable("payment")}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, paymentId],
  );

  if (!payment) {
    throw new NotFoundError(`Payment not found: ${paymentId}`);
  }

  // 2. Validate provider account ownership
  if (payment.provider_account_id !== providerSnapshot.providerAccountId) {
    throw new BusinessError(
      ERROR_CODES.INVALID_INPUT,
      "INVALID_INPUT: Provider snapshot account does not match payment's provider account.",
      400,
    );
  }

  // 3. Compare canonical state with provider snapshot
  const divergences = comparePaymentWithSnapshot(payment, providerSnapshot);

  // 4. Determine reconciliation status
  let status: ReconciliationStatus;
  if (divergences.length === 0) {
    status = "consistent";
  } else if (divergences.every((d) => d.severity === "warning")) {
    // Only warnings (e.g., refunded amount mismatch) → divergent but recoverable
    status = "divergent";
  } else if (divergences.some((d) => d.severity === "error")) {
    status = "divergent";
  } else {
    status = "unknown";
  }

  // 5. Build safe snapshots (no credentials)
  const canonicalSnapshot = {
    paymentId: payment.id,
    status: payment.status,
    amountMinor: payment.amount_minor,
    refundedAmountMinor: payment.refunded_amount_minor,
    currency: payment.currency,
    provider: payment.provider,
    providerAccountId: payment.provider_account_id,
    providerPaymentId: payment.provider_payment_id,
    aggregateVersion: payment.aggregate_version,
  };

  const providerSnapshotSafe = {
    provider: providerSnapshot.provider,
    providerAccountId: providerSnapshot.providerAccountId,
    providerPaymentId: providerSnapshot.providerPaymentId,
    status: providerSnapshot.status,
    amountMinor: providerSnapshot.amountMinor,
    refundedAmountMinor: providerSnapshot.refundedAmountMinor,
    currency: providerSnapshot.currency,
  };

  const comparison = {
    canonicalStatus: payment.status,
    providerStatus: mapProviderStatus(providerSnapshot.status),
    canonicalAmount: payment.amount_minor,
    providerAmount: providerSnapshot.amountMinor,
    canonicalRefunded: payment.refunded_amount_minor,
    providerRefunded: providerSnapshot.refundedAmountMinor,
  };

  const resultId = genId("recon");
  const ts = now();

  // 6. Persist ReconciliationResult via executeCommand for audit + idempotency
  return executeCommand(
    {
      commandId: genId("cmd"),
      workspaceId,
      commandType: "payment.reconcile",
      aggregateType: "payment_reconciliation_result",
      aggregateId: resultId,
      expectedVersion: null,
      actor,
      input: {
        paymentId,
        providerSnapshot: providerSnapshotSafe,
      },
      occurredAt: ts,
    },
    async (envelope) => {
      const statements = [
        {
          sql: `INSERT INTO ${businessTable("payment_reconciliation_result")}
            (id, workspace_id, payment_id, provider, provider_account_id, provider_payment_id,
             status, comparison_json, provider_snapshot_json, canonical_snapshot_json,
             divergences_json, replay_attempted, reconciled_by, reconciled_at,
             aggregate_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?, ?)`,
          args: [
            resultId, workspaceId, paymentId,
            providerSnapshot.provider, providerSnapshot.providerAccountId,
            providerSnapshot.providerPaymentId,
            status,
            JSON.stringify(comparison),
            JSON.stringify(providerSnapshotSafe),
            JSON.stringify(canonicalSnapshot),
            JSON.stringify(divergences),
            actor.id, ts, ts, ts,
          ],
          expectedRowsAffected: 1,
        },
      ];

      const aggregate: ReconciliationResult = {
        id: resultId,
        workspaceId,
        paymentId,
        provider: providerSnapshot.provider,
        providerAccountId: providerSnapshot.providerAccountId,
        providerPaymentId: providerSnapshot.providerPaymentId,
        status,
        divergences,
        replayAttempted: false,
        reconciledBy: actor.id,
        reconciledAt: ts,
        createdAt: ts,
        updatedAt: ts,
      };

      return {
        statements,
        events: [
          {
            aggregateType: "payment_reconciliation_result",
            aggregateId: resultId,
            eventType: "payment.reconciled",
            payload: {
              paymentId,
              status,
              divergenceCount: divergences.length,
            },
          },
        ],
        audit: {
          action: "payment.reconcile",
          entityType: "payment_reconciliation_result",
          entityId: resultId,
          after: {
            paymentId,
            status,
            divergenceCount: divergences.length,
            divergences: divergences.map((d) => ({
              field: d.field,
              severity: d.severity,
            })),
          },
        },
        aggregate,
        newVersion: 1,
      };
    },
  );
}

// ── Replay event command ──

/**
 * Execute the `payment.replay_event` command.
 *
 * Re-applies a provider event that was missed or delivered out of order.
 * Uses the existing `applyProviderPaymentEvent` infrastructure, which is
 * already idempotent via commandId deduplication.
 *
 * The command only allows named, idempotent replay actions — it does not
 * create a new mutation path. It simply re-dispatches through the existing
 * provider event handler, which enforces all legal state transitions.
 */
export async function replayProviderEvent(
  input: ReplayEventInput,
): Promise<{
  reconciliationResultId: string;
  replayResult: CommandResult<Record<string, unknown>> | null;
  alreadyProcessed: boolean;
}> {
  const { workspaceId, providerAccountId, event, payloadHash, actor } = input;

  // 1. Check if this event was already processed (idempotency check)
  const existingRef = await queryOne<{ id: string; processed_status: string }>(
    `SELECT id, processed_status FROM ${businessTable("payment_provider_reference")}
     WHERE workspace_id = ? AND provider = ? AND provider_account_id = ?
       AND provider_event_id = ?`,
    [workspaceId, event.provider, providerAccountId, event.providerEventId],
  );

  if (existingRef && existingRef.processed_status === "processed") {
    // Event was already successfully processed — return idempotent no-op
    return {
      reconciliationResultId: "",
      replayResult: null,
      alreadyProcessed: true,
    };
  }

  // 2. Validate that the provider account belongs to this workspace
  const account = await queryOne<{ id: string; provider: string; provider_account_ref: string }>(
    `SELECT id, provider, provider_account_ref FROM ${businessTable("payment_provider_account")}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, providerAccountId],
  );

  if (!account) {
    throw new NotFoundError(`Provider account not found: ${providerAccountId}`);
  }

  if (account.provider !== event.provider) {
    throw new BusinessError(
      ERROR_CODES.INVALID_INPUT,
      "INVALID_INPUT: Event provider does not match account provider.",
      400,
    );
  }

  if (event.providerAccountId && event.providerAccountId !== account.provider_account_ref) {
    throw new BusinessError(
      ERROR_CODES.INVALID_INPUT,
      "INVALID_INPUT: Event provider account does not match workspace account.",
      400,
    );
  }

  // 3. Dispatch through the existing provider event handler
  // This enforces all legal state transitions and invoice allocation invariants.
  const replayResult = await applyProviderPaymentEvent(
    workspaceId,
    providerAccountId,
    event as Parameters<typeof applyProviderPaymentEvent>[2],
    payloadHash,
  );

  // 4. Create a reconciliation result recording the replay via executeCommand
  //    for audit trail and event emission.
  const resultId = genId("recon");
  const ts = now();
  const paymentId = replayResult.aggregate?.id ?? event.providerPaymentId;

  await executeCommand({
      commandId: genId("cmd"),
      workspaceId,
      commandType: "payment.replay_event",
      aggregateType: "payment_reconciliation_result",
      aggregateId: resultId,
      expectedVersion: null,
      actor,
      input: {
        providerAccountId,
        event,
      },
      occurredAt: ts,
    },
    async () => {
      const statements = [
        {
          sql: `INSERT INTO ${businessTable("payment_reconciliation_result")}
            (id, workspace_id, payment_id, provider, provider_account_id, provider_payment_id,
             status, comparison_json, provider_snapshot_json, canonical_snapshot_json,
             divergences_json, replay_attempted, replay_command_id, reconciled_by, reconciled_at,
             aggregate_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'unknown', ?, NULL, NULL, '[]', 1, ?, ?, ?, 1, ?, ?)`,
          args: [
            resultId, workspaceId, paymentId,
            event.provider, providerAccountId,
            event.providerPaymentId,
            JSON.stringify({
              replayEventId: event.providerEventId,
              replayEventType: event.type,
              replayCommandId: replayResult.commandId,
            }),
            replayResult.commandId,
            actor.id, ts, ts, ts,
          ],
          expectedRowsAffected: 1,
        },
      ];

      return {
        statements,
        events: [
          {
            aggregateType: "payment_reconciliation_result",
            aggregateId: resultId,
            eventType: "payment.event_replayed",
            payload: {
              paymentId,
              replayedEventType: event.type,
              replayedEventId: event.providerEventId,
            },
          },
        ],
        audit: {
          action: "payment.replay_event",
          entityType: "payment_reconciliation_result",
          entityId: resultId,
          after: {
            paymentId,
            replayedEventType: event.type,
            replayedEventId: event.providerEventId,
          },
        },
        aggregate: { id: resultId } as Record<string, unknown>,
        newVersion: 1,
      };
    },
  );

  return {
    reconciliationResultId: resultId,
    replayResult,
    alreadyProcessed: false,
  };
}

// ── Query helpers ──

/**
 * List reconciliation results for a workspace, optionally filtered by payment.
 */
export async function listReconciliationResults(
  workspaceId: string,
  options: {
    paymentId?: string;
    status?: ReconciliationStatus;
    limit?: number;
    offset?: number;
  } = {},
): Promise<ReconciliationResult[]> {
  const clauses = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (options.paymentId) {
    clauses.push("payment_id = ?");
    args.push(options.paymentId);
  }
  if (options.status) {
    clauses.push("status = ?");
    args.push(options.status);
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  args.push(limit, offset);

  const rows = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${businessTable("payment_reconciliation_result")}
     WHERE ${clauses.join(" AND ")}
     ORDER BY reconciled_at DESC
     LIMIT ? OFFSET ?`,
    args,
  );

  return rows.map(mapReconciliationRow);
}

/**
 * Get a single reconciliation result by ID.
 */
export async function getReconciliationResult(
  workspaceId: string,
  resultId: string,
): Promise<ReconciliationResult> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${businessTable("payment_reconciliation_result")}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, resultId],
  );

  if (!row) {
    throw new NotFoundError(`Reconciliation result not found: ${resultId}`);
  }

  return mapReconciliationRow(row);
}

// ── Mapping ──

function mapReconciliationRow(row: Record<string, unknown>): ReconciliationResult {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    paymentId: row.payment_id as string,
    provider: row.provider as string,
    providerAccountId: row.provider_account_id as string,
    providerPaymentId: (row.provider_payment_id as string) || null,
    status: row.status as ReconciliationStatus,
    divergences: JSON.parse((row.divergences_json as string) || "[]") as Divergence[],
    replayAttempted: Boolean(row.replay_attempted),
    reconciledBy: row.reconciled_by as string,
    reconciledAt: row.reconciled_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
