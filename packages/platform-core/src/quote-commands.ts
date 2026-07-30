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

import { createHash } from "node:crypto";
import { genId, now, queryOne, queryAll, batch, type BatchStatement } from "./db";
import { TABLES, businessTable } from "./contracts";
import { BusinessError, NotFoundError, InvalidInputError } from "./context";
import { ERROR_CODES } from "./errors";
import {
  executeCommand,
  checkOptimisticLock,
  type CommandEnvelope,
  type CommandActor,
  type CommandHandlerResult,
  type CommandResult,
} from "./command-runtime";
import { generateWorkOrderNumber } from "./fsm-commands";

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
  service_site_id: string | null;
  asset_id: string | null;
  currency: string;
  subtotal: number | null;
  discount_total: number | null;
  tax_total: number | null;
  grand_total: number | null;
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

export interface QuoteLineRecord {
  [key: string]: unknown;
  id: string;
  workspace_id: string;
  quote_id: string;
  product_service_id: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  discount_amount: number | null;
  tax_amount: number | null;
  line_total: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface QuoteLineWriteInput {
  product_service_id?: string | null;
  description?: string;
  quantity?: number;
  unit?: string | null;
  unit_price?: number;
  discount_amount?: number | null;
  tax_amount?: number | null;
  sort_order?: number;
  /** Accepted for compatibility but never trusted or persisted as supplied. */
  line_total?: number | null;
}

interface NormalizedQuoteLineFields {
  product_service_id: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  line_total: number;
  sort_order: number;
}

export type QuoteLineCommandAggregate = QuoteRecord & { line: QuoteLineRecord | null };

const QUOTE_LINE_MUTABLE_FIELDS = new Set([
  "product_service_id",
  "description",
  "quantity",
  "unit",
  "unit_price",
  "discount_amount",
  "tax_amount",
  "sort_order",
  "line_total",
]);

function assertSupportedQuoteLineInput(input: Record<string, unknown>): void {
  const unsupported = Object.keys(input).filter((key) => !QUOTE_LINE_MUTABLE_FIELDS.has(key));
  if (unsupported.length > 0) {
    throw new InvalidInputError(`Unsupported Quote Line field(s): ${unsupported.join(", ")}`);
  }
}

function finiteNumber(value: unknown, label: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new InvalidInputError(`${label} must be a finite number >= ${minimum}`);
  }
  return value;
}

function normalizeQuoteLine(
  input: QuoteLineWriteInput,
  existing?: QuoteLineRecord,
): NormalizedQuoteLineFields {
  assertSupportedQuoteLineInput(input as Record<string, unknown>);
  const description = input.description ?? existing?.description;
  if (typeof description !== "string" || description.trim() === "") {
    throw new InvalidInputError("Quote Line description is required");
  }
  const quantity = finiteNumber(input.quantity ?? existing?.quantity, "Quote Line quantity", 0);
  if (quantity === 0) {
    throw new InvalidInputError("Quote Line quantity must be greater than 0");
  }
  const unitPrice = finiteNumber(input.unit_price ?? existing?.unit_price, "Quote Line unit_price", 0);
  const discountAmount = finiteNumber(input.discount_amount ?? existing?.discount_amount ?? 0, "Quote Line discount_amount", 0);
  const taxAmount = finiteNumber(input.tax_amount ?? existing?.tax_amount ?? 0, "Quote Line tax_amount", 0);
  const sortOrder = finiteNumber(input.sort_order ?? existing?.sort_order ?? 0, "Quote Line sort_order", 0);
  const lineTotal = quantity * unitPrice - discountAmount + taxAmount;
  return {
    product_service_id: input.product_service_id !== undefined
      ? input.product_service_id
      : existing?.product_service_id ?? null,
    description: description.trim(),
    quantity,
    unit: input.unit !== undefined ? input.unit : existing?.unit ?? null,
    unit_price: unitPrice,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    line_total: lineTotal,
    sort_order: sortOrder,
  };
}

async function readQuoteLine(
  workspaceId: string,
  quoteId: string,
  lineId: string,
  includeDeleted = false,
): Promise<QuoteLineRecord> {
  const line = await queryOne<QuoteLineRecord>(
    `SELECT * FROM ${businessTable("quote_line")}
     WHERE workspace_id = ? AND quote_id = ? AND id = ?
     ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
    [workspaceId, quoteId, lineId],
  );
  if (!line) throw new NotFoundError(`Quote Line not found: ${lineId}`);
  return line;
}

async function readActiveQuoteLines(workspaceId: string, quoteId: string): Promise<QuoteLineRecord[]> {
  return queryAll<QuoteLineRecord>(
    `SELECT * FROM ${businessTable("quote_line")}
     WHERE workspace_id = ? AND quote_id = ? AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC, id ASC`,
    [workspaceId, quoteId],
  );
}

function assertEditableQuote(quote: QuoteRecord): void {
  if (quote.status !== "draft") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `INVALID_TRANSITION: Quote Lines can only be changed while Quote is draft (current: '${quote.status}').`,
      409,
    );
  }
}

function quoteCalculationStatements(
  workspaceId: string,
  quote: QuoteRecord,
  calculation: import("./quote-calculation").PreparedQuoteCalculation,
  occurredAt: string,
  excludedLineIds: Set<string> = new Set(),
): BatchStatement[] {
  const newVersion = quote.aggregate_version + 1;
  return [
    ...calculation.lineTotals
      .filter((line) => !excludedLineIds.has(line.lineId))
      .map((line) => ({
        sql: `UPDATE ${businessTable("quote_line")}
              SET line_total = ?, updated_at = ?
              WHERE workspace_id = ? AND quote_id = ? AND id = ? AND deleted_at IS NULL`,
        args: [line.lineTotal, occurredAt, workspaceId, quote.id, line.lineId],
        expectedRowsAffected: 1,
      })),
    {
      sql: `UPDATE ${businessTable("quote")}
            SET subtotal = ?, discount_total = ?, tax_total = ?, grand_total = ?,
                aggregate_version = ?, updated_at = ?
            WHERE workspace_id = ? AND id = ? AND aggregate_version = ?`,
      args: [
        calculation.subtotal,
        calculation.discountTotal,
        calculation.taxTotal,
        calculation.grandTotal,
        newVersion,
        occurredAt,
        workspaceId,
        quote.id,
        quote.aggregate_version,
      ],
      expectedRowsAffected: 1,
    },
  ];
}

function quoteWithCalculation(
  quote: QuoteRecord,
  calculation: import("./quote-calculation").PreparedQuoteCalculation,
  line: QuoteLineRecord | null,
  occurredAt: string,
): QuoteLineCommandAggregate {
  return {
    ...quote,
    subtotal: calculation.subtotal,
    discount_total: calculation.discountTotal,
    tax_total: calculation.taxTotal,
    grand_total: calculation.grandTotal,
    aggregate_version: quote.aggregate_version + 1,
    updated_at: occurredAt,
    line,
  };
}

/** Add a Quote Line and recalculate its Quote in one Command transaction. */
export async function addQuoteLine(
  workspaceId: string,
  quoteId: string,
  actor: CommandActor,
  expectedVersion: number,
  input: QuoteLineWriteInput,
  commandId?: string,
) {
  return executeCommand<QuoteLineCommandAggregate>({
    commandId: commandId ?? genId("cmd"),
    workspaceId,
    commandType: "quote.add_line",
    aggregateType: "quote",
    aggregateId: quoteId,
    expectedVersion,
    actor,
    input: { quoteId, ...input, line_total: undefined },
    occurredAt: now(),
  }, async (envelope) => {
    const quote = await readQuote(workspaceId, quoteId);
    checkOptimisticLock(quote.aggregate_version, expectedVersion);
    assertEditableQuote(quote);
    const values = normalizeQuoteLine(input);
    const lineId = genId("qln");
    const activeLines = await readActiveQuoteLines(workspaceId, quoteId);
    const { calculateQuoteLines } = await import("./quote-calculation");
    const calculation = calculateQuoteLines([...activeLines, { id: lineId, ...values }]);
    const ts = envelope.occurredAt;
    const line: QuoteLineRecord = {
      id: lineId,
      workspace_id: workspaceId,
      quote_id: quoteId,
      ...values,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
      deleted_by: null,
    };
    return {
      statements: [{
        sql: `INSERT INTO ${businessTable("quote_line")}
              (id, workspace_id, quote_id, product_service_id, description, quantity, unit,
               unit_price, discount_amount, tax_amount, line_total, sort_order,
               created_at, updated_at, deleted_at, deleted_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        args: [line.id, workspaceId, quoteId, line.product_service_id, line.description,
          line.quantity, line.unit, line.unit_price, line.discount_amount, line.tax_amount,
          line.line_total, line.sort_order, ts, ts],
        expectedRowsAffected: 1,
      }, ...quoteCalculationStatements(workspaceId, quote, calculation, ts, new Set([lineId]))],
      events: [{ aggregateType: "quote", aggregateId: quoteId, eventType: "quote.line_added", payload: { quoteId, lineId } }],
      audit: { action: "quote.add_line", entityType: "quote_line", entityId: lineId, before: null, after: line },
      aggregate: quoteWithCalculation(quote, calculation, line, ts),
      newVersion: quote.aggregate_version + 1,
    };
  });
}

/** Update a Quote Line and recalculate its Quote in one Command transaction. */
export async function updateQuoteLine(
  workspaceId: string,
  quoteId: string,
  lineId: string,
  actor: CommandActor,
  expectedVersion: number,
  input: QuoteLineWriteInput,
  commandId?: string,
) {
  if (typeof lineId !== "string" || lineId.trim() === "") {
    throw new InvalidInputError("Quote Line lineId is required");
  }
  return executeCommand<QuoteLineCommandAggregate>({
    commandId: commandId ?? genId("cmd"), workspaceId, commandType: "quote.update_line",
    aggregateType: "quote", aggregateId: quoteId, expectedVersion, actor,
    input: { quoteId, lineId, ...input, line_total: undefined }, occurredAt: now(),
  }, async (envelope) => {
    const quote = await readQuote(workspaceId, quoteId);
    checkOptimisticLock(quote.aggregate_version, expectedVersion);
    assertEditableQuote(quote);
    const before = await readQuoteLine(workspaceId, quoteId, lineId);
    const values = normalizeQuoteLine(input, before);
    const activeLines = await readActiveQuoteLines(workspaceId, quoteId);
    const prospective = activeLines.map((line) => line.id === lineId ? { ...line, ...values } : line);
    const { calculateQuoteLines } = await import("./quote-calculation");
    const calculation = calculateQuoteLines(prospective);
    const ts = envelope.occurredAt;
    const line: QuoteLineRecord = { ...before, ...values, updated_at: ts };
    return {
      statements: [{
        sql: `UPDATE ${businessTable("quote_line")}
              SET product_service_id = ?, description = ?, quantity = ?, unit = ?, unit_price = ?,
                  discount_amount = ?, tax_amount = ?, line_total = ?, sort_order = ?, updated_at = ?
              WHERE workspace_id = ? AND quote_id = ? AND id = ? AND deleted_at IS NULL`,
        args: [line.product_service_id, line.description, line.quantity, line.unit, line.unit_price,
          line.discount_amount, line.tax_amount, line.line_total, line.sort_order, ts,
          workspaceId, quoteId, lineId],
        expectedRowsAffected: 1,
      }, ...quoteCalculationStatements(workspaceId, quote, calculation, ts, new Set([lineId]))],
      events: [{ aggregateType: "quote", aggregateId: quoteId, eventType: "quote.line_updated", payload: { quoteId, lineId } }],
      audit: { action: "quote.update_line", entityType: "quote_line", entityId: lineId, before, after: line },
      aggregate: quoteWithCalculation(quote, calculation, line, ts),
      newVersion: quote.aggregate_version + 1,
    };
  });
}

/** Soft-delete (or explicitly hard-delete) a Quote Line atomically with Quote totals. */
export async function removeQuoteLine(
  workspaceId: string,
  quoteId: string,
  lineId: string,
  actor: CommandActor,
  expectedVersion: number,
  options: { hard?: boolean } = {},
  commandId?: string,
) {
  if (typeof lineId !== "string" || lineId.trim() === "") {
    throw new InvalidInputError("Quote Line lineId is required");
  }
  return executeCommand<QuoteLineCommandAggregate>({
    commandId: commandId ?? genId("cmd"), workspaceId, commandType: "quote.remove_line",
    aggregateType: "quote", aggregateId: quoteId, expectedVersion, actor,
    input: { quoteId, lineId, hard: options.hard === true }, occurredAt: now(),
  }, async (envelope) => {
    const quote = await readQuote(workspaceId, quoteId);
    checkOptimisticLock(quote.aggregate_version, expectedVersion);
    assertEditableQuote(quote);
    const before = await readQuoteLine(workspaceId, quoteId, lineId);
    const remaining = (await readActiveQuoteLines(workspaceId, quoteId)).filter((line) => line.id !== lineId);
    const { calculateQuoteLines } = await import("./quote-calculation");
    const calculation = calculateQuoteLines(remaining);
    const ts = envelope.occurredAt;
    const line = options.hard ? null : { ...before, deleted_at: ts, deleted_by: actor.id, updated_at: ts };
    const mutation: BatchStatement[] = options.hard ? [{
      sql: `DELETE FROM ${TABLES.extensionFieldValues}
            WHERE workspace_id = ? AND object_key = 'quote_line' AND record_id = ?`,
      args: [workspaceId, lineId],
    }, {
      sql: `DELETE FROM ${businessTable("quote_line")}
            WHERE workspace_id = ? AND quote_id = ? AND id = ? AND deleted_at IS NULL`,
      args: [workspaceId, quoteId, lineId], expectedRowsAffected: 1,
    }] : [{
      sql: `UPDATE ${businessTable("quote_line")}
            SET deleted_at = ?, deleted_by = ?, updated_at = ?
            WHERE workspace_id = ? AND quote_id = ? AND id = ? AND deleted_at IS NULL`,
      args: [ts, actor.id, ts, workspaceId, quoteId, lineId], expectedRowsAffected: 1,
    }];
    return {
      statements: [...mutation, ...quoteCalculationStatements(workspaceId, quote, calculation, ts)],
      events: [{ aggregateType: "quote", aggregateId: quoteId, eventType: "quote.line_removed", payload: { quoteId, lineId, hard: options.hard === true } }],
      audit: { action: "quote.remove_line", entityType: "quote_line", entityId: lineId, before, after: line },
      aggregate: quoteWithCalculation(quote, calculation, line, ts),
      newVersion: quote.aggregate_version + 1,
    };
  });
}

/** Restore a soft-deleted Quote Line atomically with Quote totals. */
export async function restoreQuoteLine(
  workspaceId: string,
  quoteId: string,
  lineId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string,
) {
  if (typeof lineId !== "string" || lineId.trim() === "") {
    throw new InvalidInputError("Quote Line lineId is required");
  }
  return executeCommand<QuoteLineCommandAggregate>({
    commandId: commandId ?? genId("cmd"), workspaceId, commandType: "quote.restore_line",
    aggregateType: "quote", aggregateId: quoteId, expectedVersion, actor,
    input: { quoteId, lineId }, occurredAt: now(),
  }, async (envelope) => {
    const quote = await readQuote(workspaceId, quoteId);
    checkOptimisticLock(quote.aggregate_version, expectedVersion);
    assertEditableQuote(quote);
    const before = await readQuoteLine(workspaceId, quoteId, lineId, true);
    if (!before.deleted_at) throw new InvalidInputError(`Quote Line ${lineId} is not deleted`);
    const activeLines = await readActiveQuoteLines(workspaceId, quoteId);
    const restored = { ...before, deleted_at: null, deleted_by: null, updated_at: envelope.occurredAt };
    const { calculateQuoteLines } = await import("./quote-calculation");
    const calculation = calculateQuoteLines([...activeLines, restored]);
    const restoredTotal = calculation.lineTotals.find((entry) => entry.lineId === lineId)?.lineTotal ?? restored.line_total;
    const line = { ...restored, line_total: restoredTotal };
    const ts = envelope.occurredAt;
    return {
      statements: [{
        sql: `UPDATE ${businessTable("quote_line")}
              SET deleted_at = NULL, deleted_by = NULL, line_total = ?, updated_at = ?
              WHERE workspace_id = ? AND quote_id = ? AND id = ? AND deleted_at IS NOT NULL`,
        args: [line.line_total, ts, workspaceId, quoteId, lineId], expectedRowsAffected: 1,
      }, ...quoteCalculationStatements(workspaceId, quote, calculation, ts, new Set([lineId]))],
      events: [{ aggregateType: "quote", aggregateId: quoteId, eventType: "quote.line_restored", payload: { quoteId, lineId } }],
      audit: { action: "quote.restore_line", entityType: "quote_line", entityId: lineId, before, after: line },
      aggregate: quoteWithCalculation(quote, calculation, line, ts),
      newVersion: quote.aggregate_version + 1,
    };
  });
}

// ── Helper: Compute Snapshot Hash ──

function computeSnapshotHash(quote: QuoteRecord, lines: Array<Record<string, unknown>>): string {
  const data = {
    quote_number: quote.quote_number,
    status: quote.status,
    currency: quote.currency,
    grand_total: quote.grand_total,
    lines: lines.map(l => ({
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_amount: l.discount_amount,
      tax_amount: l.tax_amount,
      line_total: l.line_total,
    })),
  };
  return createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 32);
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
        `SELECT * FROM ${businessTable("quote_line")}
         WHERE workspace_id = ? AND quote_id = ? AND deleted_at IS NULL`,
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

      // The installed workflow definition is started by an atomic Provider.
      // It advances past this system_command to the first actionable step.
      const instanceId = genId("wfi");
      const workItemId = genId("wi");

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
        workItemIds: [workItemId],
        effectInputs: {
          "workflow.start_process": {
            workflowKey: "quote-approval",
            instanceId,
            workItemId,
          },
        },
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
    async (envelope) => {
      const quote = await readQuote(workspaceId, quoteId);
      checkOptimisticLock(quote.aggregate_version, expectedVersion);

      if (quote.status !== "draft") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot recalculate quote in status '${quote.status}'. Only 'draft' quotes can be recalculated.`,
          409
        );
      }

      // Calculation is read-only here. Persistence belongs to the contracted
      // atomic Provider and is committed with the Quote version/event/audit.
      const { prepareQuoteCalculation } = await import("./quote-calculation");
      const calculation = await prepareQuoteCalculation(workspaceId, quoteId);
      const { lineTotals, ...totals } = calculation;

      const ts = envelope.occurredAt;
      const newVersion = quote.aggregate_version + 1;

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
        aggregate: {
          ...quote,
          subtotal: totals.subtotal,
          discount_total: totals.discountTotal,
          tax_total: totals.taxTotal,
          grand_total: totals.grandTotal,
          aggregate_version: newVersion,
        },
        newVersion,
        effectInputs: {
          "quote.persist_calculation": { ...totals, lineTotals },
        },
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
    async (envelope) => {
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
      const ts = envelope.occurredAt;
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
      ];

      // Clone quote lines to the new revision
      const lines = await queryAll<{ id: string }>(
        `SELECT id FROM ${businessTable("quote_line")}
         WHERE workspace_id = ? AND quote_id = ? AND deleted_at IS NULL`,
        [workspaceId, quoteId]
      );

      const lineCopies = lines.map((line) => ({
        sourceLineId: line.id,
        newLineId: genId("qline"),
      }));

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
        effectInputs: {
          "quote.create_revision_copy": {
            newQuoteId,
            newQuoteNumber,
            rootQuoteId,
            newRevisionNumber,
            lineCopies,
          },
        },
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
            eventType: "quote.converted_to_work_order",
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

      // No existing work order — validate the quote is in a convertible state
      if (quote.status !== "accepted") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot convert quote in status '${quote.status}'. Only 'accepted' quotes can be converted.`,
          409
        );
      }

      // Create the work order
      const woId = genId("wo");
      const woNumber = generateWorkOrderNumber(woId);
      const ts = now();

      // Compute snapshot hash for provenance
      const lines = await queryAll<Record<string, unknown>>(
        `SELECT * FROM ${businessTable("quote_line")}
         WHERE workspace_id = ? AND quote_id = ? AND deleted_at IS NULL`,
        [workspaceId, quoteId]
      );
      const snapshotHash = computeSnapshotHash(quote, lines);

      const statements: Array<{ sql: string; args?: unknown[] }> = [
        // Transition quote status to "converted" and link work order
        {
          sql: `UPDATE ${businessTable("quote")}
                SET status = 'converted', work_order_id = ?, aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [woId, quote.aggregate_version + 1, ts, workspaceId, quoteId],
        },
      ];

      const updatedQuote = { ...quote, status: "converted", work_order_id: woId, aggregate_version: quote.aggregate_version + 1 };

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
          after: { status: "converted", workOrderId: woId, workOrderNumber: woNumber },
        },
        aggregate: updatedQuote,
        newVersion: quote.aggregate_version + 1,
        workItemIds: [],
        effectInputs: {
          "fsm.create_work_order_from_quote": {
            workOrderId: woId,
            workOrderNumber: woNumber,
            title: quote.title,
            description: `Converted from quote ${quote.quote_number}`,
            companyId: quote.company_id,
            contactId: quote.contact_id,
            serviceSiteId: quote.service_site_id,
            snapshotHash,
          },
        },
      } as CommandHandlerResult<QuoteRecord>;
    }
  );
}

/**
 * quote.create_draft
 * Create a new draft quote. Generates a quote_number and persists a quote record
 * with status='draft', aggregate_version=1. Uses executeCommand for idempotency.
 *
 * Per v0.5 Spec §6.1 quote.create_draft.
 */
export async function createQuoteDraft(
  workspaceId: string,
  params: {
    title?: string;
    dealId?: string;
    companyId?: string;
    contactId?: string;
    currency?: string;
    priceBookId?: string;
  },
  actor: CommandActor,
  commandId?: string
): Promise<CommandResult<Partial<QuoteRecord>>> {
  const quoteId = genId("quote");
  const quoteNumber = `Q-${Date.now().toString(36).toUpperCase()}`;
  const ts = now();

  return executeCommand<Partial<QuoteRecord>>(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "quote.create_draft",
      aggregateType: "quote",
      aggregateId: quoteId,
      expectedVersion: null, // create new aggregate
      actor,
      input: { ...params },
      occurredAt: ts,
    },
    async () => {
      const statements: Array<{ sql: string; args?: unknown[] }> = [
        {
          sql: `INSERT INTO ${businessTable("quote")}
                (id, workspace_id, quote_number, title, status, version, aggregate_version,
                 company_id, contact_id, deal_id, currency, price_book_id,
                 revision_number, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'draft', 1, 1, ?, ?, ?, ?, ?, 1, ?, ?)`,
          args: [
            quoteId,
            workspaceId,
            quoteNumber,
            params.title ?? "",
            params.companyId ?? null,
            params.contactId ?? null,
            params.dealId ?? null,
            params.currency ?? "CNY",
            params.priceBookId ?? null,
            ts,
            ts,
          ],
        },
      ];

      const aggregate: Partial<QuoteRecord> = {
        id: quoteId,
        workspace_id: workspaceId,
        quote_number: quoteNumber,
        title: params.title ?? "",
        status: "draft",
        version: 1,
        aggregate_version: 1,
        company_id: params.companyId ?? null,
        contact_id: params.contactId ?? null,
        deal_id: params.dealId ?? null,
        currency: params.currency ?? "CNY",
        price_book_id: params.priceBookId ?? null,
        revision_number: 1,
        created_at: ts,
        updated_at: ts,
      };

      return {
        statements,
        events: [{
          aggregateType: "quote",
          aggregateId: quoteId,
          eventType: "quote.draft_created",
          payload: { quoteId, quoteNumber },
        }],
        audit: {
          action: "quote.create_draft",
          entityType: "quote",
          entityId: quoteId,
          before: null,
          after: { status: "draft", quoteNumber },
        },
        aggregate,
        newVersion: 1,
      } as CommandHandlerResult<Partial<QuoteRecord>>;
    }
  );
}
