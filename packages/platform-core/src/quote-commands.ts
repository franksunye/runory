// ── Quote Commands (v0.5 Slice 1-2) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.6 and AD-02:
// Commands own business mutations. Generic CRUD can maintain drafts and
// non-governed descriptive fields, but cannot directly change governed
// lifecycle, pricing totals, accepted snapshots, etc.
//
// Each command goes through executeCommand() which provides:
//   - Idempotency (commandId + inputHash)
//   - Optimistic locking (expectedVersion)
//   - Atomic persistence (business state + events + audit + outbox in one batch)
//   - Diagnostics (command_executions table)

import { genId, now, queryOne, queryAll, batch } from "./db";
import { TABLES, businessTable } from "./contracts";
import { BusinessError, NotFoundError, InvalidInputError } from "./context";
import { ERROR_CODES } from "./errors";
import {
  executeCommand,
  checkOptimisticLock,
  type CommandEnvelope,
  type CommandActor,
  type CommandHandlerResult,
} from "./command-runtime";
import { startWorkflowV2, publishWorkflowDefinition } from "./workflow-v2";

// Re-export CommandActor so consumers of quote-commands do not need to depend
// on command-runtime directly for the actor type.
export type { CommandActor } from "./command-runtime";

// ── Types ──

export interface QuoteRecord {
  id: string;
  workspace_id: string;
  quote_number: string;
  title: string;
  status: string;
  version: number;
  aggregate_version: number;
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  work_order_id: string | null;
  currency: string;
  subtotal_amount: number | null;
  discount_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  valid_until: string | null;
  owner: string | null;
  terms: string | null;
  notes: string | null;
  root_quote_id: string | null;
  previous_version_id: string | null;
  revision_number: number;
  price_book_id: string | null;
  approved_at: string | null;
  accepted_at: string | null;
  rejected_reason: string | null;
  withdrawn_at: string | null;
  snapshot_hash: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Helper: Read Quote ──

async function readQuote(workspaceId: string, quoteId: string): Promise<QuoteRecord> {
  const row = await queryOne<QuoteRecord>(
    `SELECT * FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, quoteId]
  );
  if (!row) {
    throw new NotFoundError(`Quote not found: ${quoteId}`);
  }
  return row;
}

// ── Helper: Compute Snapshot Hash ──

function computeSnapshotHash(quote: QuoteRecord, lines: Array<Record<string, unknown>>): string {
  const crypto = require("node:crypto");
  const data = {
    quote_number: quote.quote_number,
    status: quote.status,
    currency: quote.currency,
    total_amount: quote.total_amount,
    lines: lines.map(l => ({
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_amount: l.discount_amount,
      tax_amount: l.tax_amount,
      line_total: l.line_total,
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 32);
}

// ── Commands ──

/**
 * quote.submit_for_approval
 * Transitions a draft quote to in_review and starts the approval workflow.
 */
export async function submitForApproval(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.submit_for_approval",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId },
      occurredAt: now(),
    },
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "draft") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot submit quote in status '${quote.status}'. Only 'draft' quotes can be submitted.`,
          409
        );
      }

      // Compute snapshot hash for integrity check
      const lines = await queryAll<Record<string, unknown>>(
        `SELECT * FROM ${businessTable("quote_line")} WHERE workspace_id = ? AND quote_id = ?`,
        [workspaceId, quoteId]
      );
      const snapshotHash = computeSnapshotHash(quote, lines);

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'in_review', snapshot_hash = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [snapshotHash, newVersion, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "in_review", snapshot_hash: snapshotHash, aggregate_version: newVersion };

      // Publish workflow definition (idempotent — won't duplicate if already published)
      await publishWorkflowDefinition(
        workspaceId,
        {
          workflowKey: "quote-approval",
          name: "Quote Approval",
          targetObject: "quote",
          initialState: "submitted",
          steps: [
            { id: "start", kind: "start", next: "submit" },
            { id: "submit", kind: "system_command", command: "quote.submit_for_approval", next: "approval" },
            { id: "approval", kind: "approval", assigneeRule: { permissionGroup: "sales_manager" }, onApprove: "approved", onReject: "rejected", policy: { allowSelfApproval: false } },
            { id: "approved", kind: "system_command", command: "quote.approve", next: "end" },
            { id: "rejected", kind: "system_command", command: "quote.reject", next: "end" },
            { id: "end", kind: "end" },
          ]
        },
        actor.id
      );

      // Start workflow instance (creates initial work items based on definition steps)
      const { instanceId } = await startWorkflowV2(
        workspaceId,
        "quote-approval",
        "quote",
        quoteId,
        actor
      );

      // Get the created work item IDs (the approval work item)
      const workItems = await queryAll<{ id: string }>(
        `SELECT id FROM ${TABLES.workItems}
         WHERE workspace_id = ? AND instance_id = ? AND status = 'ready'`,
        [workspaceId, instanceId]
      );
      const workItemIds = workItems.map(wi => wi.id);

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.submitted_for_approval",
          payload: { quoteId, snapshotHash, workflowInstanceId: instanceId },
        }],
        audit: {
          action: "quote.submit_for_approval",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status, aggregate_version: quote.aggregate_version },
          after: { status: "in_review", aggregate_version: newVersion, snapshot_hash: snapshotHash },
        },
        aggregate: updatedQuote,
        newVersion,
        workItemIds,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.approve
 * Approves a quote that is in_review. Called by the workflow approval decision.
 */
export async function approveQuote(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.approve",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId },
      occurredAt: now(),
    },
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "in_review") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot approve quote in status '${quote.status}'. Only 'in_review' quotes can be approved.`,
          409
        );
      }

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'approved', approved_at = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [ts, newVersion, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "approved", approved_at: ts, aggregate_version: newVersion };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.approved",
          payload: { quoteId, approvedAt: ts },
        }],
        audit: {
          action: "quote.approve",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status },
          after: { status: "approved", approved_at: ts },
        },
        aggregate: updatedQuote,
        newVersion,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.reject
 * Rejects a quote that is in_review.
 */
export async function rejectQuote(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  reason: string,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.reject",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId, reason },
      occurredAt: now(),
    },
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "in_review") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot reject quote in status '${quote.status}'. Only 'in_review' quotes can be rejected.`,
          409
        );
      }

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'rejected', rejected_reason = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [reason, newVersion, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "rejected", rejected_reason: reason, aggregate_version: newVersion };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.rejected",
          payload: { quoteId, reason },
        }],
        audit: {
          action: "quote.reject",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status },
          after: { status: "rejected", rejected_reason: reason },
        },
        aggregate: updatedQuote,
        newVersion,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.return_for_changes
 * Returns an in_review quote back to draft.
 */
export async function returnForChanges(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  comment: string | null,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.return_for_changes",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId, comment },
      occurredAt: now(),
    },
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "in_review") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot return quote in status '${quote.status}'. Only 'in_review' quotes can be returned.`,
          409
        );
      }

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'draft', snapshot_hash = NULL, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [newVersion, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "draft", snapshot_hash: null, aggregate_version: newVersion };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.returned_for_changes",
          payload: { quoteId, comment },
        }],
        audit: {
          action: "quote.return_for_changes",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status },
          after: { status: "draft" },
        },
        aggregate: updatedQuote,
        newVersion,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.withdraw
 * Withdraws a quote (from draft, in_review, approved, or sent).
 */
export async function withdrawQuote(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.withdraw",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId },
      occurredAt: now(),
    },
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      const allowedStatuses = ["draft", "in_review", "approved", "sent"];
      if (!allowedStatuses.includes(quote.status)) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot withdraw quote in status '${quote.status}'. Allowed: ${allowedStatuses.join(", ")}`,
          409
        );
      }

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'withdrawn', withdrawn_at = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [ts, newVersion, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "withdrawn", withdrawn_at: ts, aggregate_version: newVersion };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.withdrawn",
          payload: { quoteId, withdrawnAt: ts },
        }],
        audit: {
          action: "quote.withdraw",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status },
          after: { status: "withdrawn" },
        },
        aggregate: updatedQuote,
        newVersion,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.mark_sent
 * Marks an approved quote as sent to the customer.
 */
export async function markSent(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.mark_sent",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId },
      occurredAt: now(),
    },
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "approved") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot mark quote as sent in status '${quote.status}'. Only 'approved' quotes can be sent.`,
          409
        );
      }

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'sent', aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [newVersion, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "sent", aggregate_version: newVersion };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.marked_sent",
          payload: { quoteId },
        }],
        audit: {
          action: "quote.mark_sent",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status },
          after: { status: "sent" },
        },
        aggregate: updatedQuote,
        newVersion,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.accept
 * Customer accepts the quote. Locks the snapshot.
 */
export async function acceptQuote(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.accept",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId },
      occurredAt: now(),
    },
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "sent") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot accept quote in status '${quote.status}'. Only 'sent' quotes can be accepted.`,
          409
        );
      }

      // Verify no other accepted version in the same lineage
      if (quote.root_quote_id) {
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM ${businessTable("quote")}
           WHERE workspace_id = ? AND root_quote_id = ? AND status = 'accepted' AND id != ?`,
          [workspaceId, quote.root_quote_id, quoteId]
        );
        if (existing) {
          throw new BusinessError(
            ERROR_CODES.CONFLICT,
            `Another version of this quote is already accepted: ${existing.id}`,
            409
          );
        }
      }

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'accepted', accepted_at = ?, locked_at = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [ts, ts, newVersion, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "accepted", accepted_at: ts, locked_at: ts, aggregate_version: newVersion };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.accepted",
          payload: { quoteId, acceptedAt: ts },
        }],
        audit: {
          action: "quote.accept",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status },
          after: { status: "accepted", accepted_at: ts, locked_at: ts },
        },
        aggregate: updatedQuote,
        newVersion,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.mark_declined
 * Customer declines the quote.
 */
export async function markDeclined(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  reason: string | null,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.mark_declined",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId, reason },
      occurredAt: now(),
    },
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "sent") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot decline quote in status '${quote.status}'. Only 'sent' quotes can be declined.`,
          409
        );
      }

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'declined', rejected_reason = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [reason, newVersion, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "declined", rejected_reason: reason, aggregate_version: newVersion };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.declined",
          payload: { quoteId, reason },
        }],
        audit: {
          action: "quote.mark_declined",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status },
          after: { status: "declined" },
        },
        aggregate: updatedQuote,
        newVersion,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.expire
 * Marks a quote as expired (e.g. past valid_until date).
 */
export async function expireQuote(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.expire",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId },
      occurredAt: now(),
    },
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      const allowedStatuses = ["draft", "in_review", "approved", "sent"];
      if (!allowedStatuses.includes(quote.status)) {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot expire quote in status '${quote.status}'.`,
          409
        );
      }

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'expired', aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [newVersion, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "expired", aggregate_version: newVersion };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.expired",
          payload: { quoteId },
        }],
        audit: {
          action: "quote.expire",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status },
          after: { status: "expired" },
        },
        aggregate: updatedQuote,
        newVersion,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.recalculate
 * Recalculates quote totals from line items. Only allowed in 'draft' state.
 */
export async function recalculateQuoteCommand(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.recalculate",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId },
      occurredAt: now(),
    },
    async () => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "draft") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot recalculate quote in status '${quote.status}'. Only 'draft' quotes can be recalculated.`,
          409
        );
      }

      // Compute and persist totals
      const { recalculateQuote } = await import("./quote-calculation");
      const totals = await recalculateQuote(workspaceId, quoteId);

      const ts = now();
      const newVersion = quote.aggregate_version + 1;

      // Re-read the updated quote
      const updatedQuote = await readQuote(workspaceId, quoteId);

      return {
        statements: [{
          sql: `UPDATE ${businessTable("quote")}
                SET aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [newVersion, ts, workspaceId, quoteId],
        }],
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.recalculated",
          payload: { quoteId, ...totals },
        }],
        audit: {
          action: "quote.recalculate",
          entityType: "quote",
          entityId: quoteId,
          before: { aggregate_version: quote.aggregate_version },
          after: { aggregate_version: newVersion, ...totals },
        },
        aggregate: { ...updatedQuote, aggregate_version: newVersion },
        newVersion,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.create_revision
 * Creates a new revision of an approved/sent/accepted/declined/expired/withdrawn quote.
 * The old quote becomes immutable (locked).
 */
export async function createRevision(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.create_revision",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId },
      occurredAt: now(),
    },
    async () => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      const allowedStatuses = ["approved", "sent", "accepted", "declined", "expired", "withdrawn"];
      if (!allowedStatuses.includes(quote.status)) {
        throw new BusinessError(
          ERROR_CODES.IMMUTABLE_REVISION,
          `IMMUTABLE_REVISION: Cannot create revision of quote in status '${quote.status}'. ` +
          `Allowed statuses: ${allowedStatuses.join(", ")}`,
          409
        );
      }

      // Lock the old quote
      const ts = now();
      const oldVersion = quote.aggregate_version + 1;

      // Create new revision
      const newQuoteId = genId("quote");
      const newQuoteNumber = `${quote.quote_number}-R${(quote.revision_number ?? 0) + 1}`;
      const rootQuoteId = quote.root_quote_id ?? quote.id;
      const newRevisionNumber = (quote.revision_number ?? 0) + 1;

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        // Lock old quote
        {
          sql: `UPDATE ${businessTable("quote")}
                SET locked_at = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [ts, oldVersion, ts, workspaceId, quoteId],
        },
        // Create new revision
        {
          sql: `INSERT INTO ${businessTable("quote")}
                (id, workspace_id, quote_number, title, status, version, aggregate_version,
                 company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id,
                 currency, subtotal_amount, discount_amount, tax_amount, total_amount,
                 valid_until, owner, terms, notes,
                 root_quote_id, previous_version_id, revision_number,
                 price_book_id, approved_at, accepted_at, rejected_reason, withdrawn_at,
                 snapshot_hash, locked_at, created_at, updated_at)
                SELECT ?, ?, title, ?, 'draft', 1, 1,
                 company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id,
                 currency, NULL, NULL, NULL, NULL,
                 valid_until, owner, terms, notes,
                 ?, ?, ?, price_book_id, NULL, NULL, NULL, NULL,
                 NULL, NULL, ?, ?`,
          args: [
            newQuoteId, workspaceId, newQuoteNumber,
            rootQuoteId, quoteId, newRevisionNumber,
            ts, ts,
          ],
        },
      ];

      // Clone quote lines to the new revision
      const lines = await queryAll<{ id: string }>(
        `SELECT id FROM ${businessTable("quote_line")}
         WHERE workspace_id = ? AND quote_id = ?`,
        [workspaceId, quoteId]
      );

      for (const line of lines) {
        const newLineId = genId("qline");
        statements.push({
          sql: `INSERT INTO ${businessTable("quote_line")}
                (id, workspace_id, quote_id, product_service_id, description, quantity, unit,
                 unit_price, discount_amount, tax_amount, line_total, sort_order, created_at, updated_at)
                SELECT ?, workspace_id, ?, product_service_id, description, quantity, unit,
                 unit_price, discount_amount, tax_amount, line_total, sort_order, ?, ?
                FROM ${businessTable("quote_line")}
                WHERE id = ?`,
          args: [newLineId, newQuoteId, ts, ts, line.id],
        });
      }

      const newQuote = {
        ...quote,
        id: newQuoteId,
        quote_number: newQuoteNumber,
        status: "draft",
        aggregate_version: 1,
        root_quote_id: rootQuoteId,
        previous_version_id: quoteId,
        revision_number: newRevisionNumber,
        approved_at: null,
        accepted_at: null,
        rejected_reason: null,
        withdrawn_at: null,
        snapshot_hash: null,
        locked_at: null,
      };

      return {
        statements,
        events: [
          {
            aggregateType: "quote",
            aggregateId: quoteId,
            eventType: "quote.revision_created",
            payload: { oldQuoteId: quoteId, newQuoteId, revisionNumber: newRevisionNumber },
          },
          {
            aggregateType: "quote",
            aggregateId: newQuoteId,
            eventType: "quote.revision_created",
            payload: { oldQuoteId: quoteId, newQuoteId, revisionNumber: newRevisionNumber },
          },
        ],
        audit: {
          action: "quote.create_revision",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status, revision_number: quote.revision_number },
          after: { newQuoteId, revisionNumber: newRevisionNumber, locked: true },
        },
        aggregate: newQuote,
        newVersion: 1,
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.convert_to_work_order
 * Converts an accepted quote into a work order. Idempotent: retrying returns the same work order.
 */
export async function convertToWorkOrder(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string
) {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.convert_to_work_order",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion,
      actor,
      input: { quoteId },
      occurredAt: now(),
    },
    async () => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "accepted") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot convert quote in status '${quote.status}'. Only 'accepted' quotes can be converted.`,
          409
        );
      }

      // IDEMPOTENCY CHECK: If a work order with source_type='quote' AND source_id=quoteId already exists, return it
      const existingWo = await queryOne<{ id: string }>(
        `SELECT id FROM ${businessTable("work_order")}
         WHERE workspace_id = ? AND source_type = 'quote' AND source_id = ?`,
        [workspaceId, quoteId]
      );

      if (existingWo) {
        // Already converted — return the existing work order as the result
        // This is the idempotent path: same command, same input, returns same result
        const wo = await queryOne<Record<string, unknown>>(
          `SELECT * FROM ${businessTable("work_order")}
           WHERE workspace_id = ? AND id = ?`,
          [workspaceId, existingWo.id]
        );

        return {
          statements: [],  // No new writes needed
          events: [{
            aggregateType: "quote",
            aggregateId: quoteId,
            eventType: "quote.conversion_idempotent",
            payload: { quoteId, workOrderId: existingWo.id, alreadyConverted: true },
          }],
          audit: {
            action: "quote.convert_to_work_order.idempotent",
            entityType: "quote",
            entityId: quoteId,
            before: { status: quote.status },
            after: { workOrderId: existingWo.id, alreadyConverted: true },
          },
          aggregate: { ...quote, work_order_id: existingWo.id } as QuoteRecord,
          newVersion: quote.aggregate_version,  // Version unchanged — no mutation
          workItemIds: [],
        } as CommandHandlerResult<QuoteRecord>;
      }

      // Create the work order
      const woId = genId("wo");
      const woNumber = `WO-${Date.now().toString(36).toUpperCase()}`;
      const ts = now();

      // Compute snapshot hash for provenance
      const lines = await queryAll<Record<string, unknown>>(
        `SELECT * FROM ${businessTable("quote_line")}
         WHERE workspace_id = ? AND quote_id = ?`,
        [workspaceId, quoteId]
      );
      const snapshotHash = computeSnapshotHash(quote, lines);

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `INSERT INTO ${businessTable("work_order")}
                (id, workspace_id, title, description, status, priority,
                 company_id, contact_id, service_site_id, asset_id,
                 source_type, source_id, source_snapshot_hash,
                 work_order_number, aggregate_version,
                 requested_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'new', 'medium',
                 ?, ?, ?, ?,
                 'quote', ?, ?,
                 ?, 1,
                 ?, ?, ?)`,
          args: [
            woId, workspaceId,
            quote.title,
            `Converted from quote ${quote.quote_number}`,
            quote.company_id,
            quote.contact_id,
            null, // service_site_id — will be set by dispatcher
            null, // asset_id
            quoteId,
            snapshotHash,
            woNumber,
            ts, ts, ts,
          ],
        },
        // Link quote to work order
        {
          sql: `UPDATE ${businessTable("quote")}
                SET work_order_id = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [woId, quote.aggregate_version + 1, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, work_order_id: woId, aggregate_version: quote.aggregate_version + 1 };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.converted_to_work_order",
          payload: { quoteId, workOrderId: woId, workOrderNumber: woNumber },
        }],
        audit: {
          action: "quote.convert_to_work_order",
          entityType: "quote",
          entityId: quoteId,
          before: { status: quote.status },
          after: { status: "accepted", workOrderId: woId, workOrderNumber: woNumber },
        },
        aggregate: updatedQuote,
        newVersion: quote.aggregate_version + 1,
        workItemIds: [],
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}
