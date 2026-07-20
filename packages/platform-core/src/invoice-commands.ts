import { createHash } from "node:crypto";
import { businessTable } from "./contracts";
import { BusinessError, InvalidInputError, NotFoundError } from "./context";
import { genId, now, queryAll, queryOne } from "./db";
import {
  checkOptimisticLock,
  executeCommand,
  type CommandActor,
  type CommandHandlerResult,
} from "./command-runtime";
import { ERROR_CODES } from "./errors";
import { normalizePaymentCurrency } from "./payment-commands";

export interface InvoiceRecord extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  invoice_number: string;
  status: "issued" | "partially_paid" | "paid" | "void";
  work_order_id: string;
  quote_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  currency: string;
  total_minor: number;
  amount_paid_minor: number;
  balance_due_minor: number;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  memo: string | null;
  source_snapshot_hash: string | null;
  created_by: string;
  aggregate_version: number;
  created_at: string;
  updated_at: string;
}

interface WorkOrderSource {
  id: string;
  title: string;
  status: string;
  company_id: string | null;
  contact_id: string | null;
  source_type: string | null;
  source_id: string | null;
  source_snapshot_hash: string | null;
}

interface QuoteSource {
  id: string;
  status: string;
  currency: string;
  grand_total: number | null;
  snapshot_hash: string | null;
}

interface QuoteLineSource {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number | null;
  sort_order: number | null;
}

function invoiceError(code: string, message: string): BusinessError {
  return new BusinessError(code, `${code}: ${message}`, 409);
}

function toMinor(value: number): number {
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new InvalidInputError("Invoice amount cannot be represented in minor units.");
  }
  return minor;
}

function assertPositiveMinor(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    throw new InvalidInputError("Invoice total must be a positive integer in minor units.");
  }
  return value!;
}

function normalizeDueAt(value: string | undefined): string | null {
  if (!value) return null;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new InvalidInputError("Invoice due date must be a valid date.");
  }
  return timestamp.toISOString();
}

function invoiceSnapshotHash(input: {
  workOrderId: string;
  quoteId: string | null;
  currency: string;
  totalMinor: number;
  lines: Array<Record<string, unknown>>;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

export async function issueInvoiceFromWorkOrder(
  workspaceId: string,
  workOrderId: string,
  actor: CommandActor,
  input: {
    totalMinor?: number;
    currency?: string;
    dueAt?: string;
    memo?: string;
  } = {},
  commandId?: string,
) {
  const workOrder = await queryOne<WorkOrderSource>(
    `SELECT id, title, status, company_id, contact_id, source_type, source_id, source_snapshot_hash
     FROM ${businessTable("work_order")}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workOrderId],
  );
  if (!workOrder) throw new NotFoundError("Work Order not found.");
  if (workOrder.status !== "completed") {
    throw invoiceError(
      ERROR_CODES.INVALID_TRANSITION,
      "A Work Order must be completed before its Invoice can be issued.",
    );
  }

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM ${businessTable("invoice")}
     WHERE workspace_id = ? AND work_order_id = ?`,
    [workspaceId, workOrderId],
  );
  if (existing) {
    throw invoiceError("INVOICE_ALREADY_EXISTS", "This Work Order already has an Invoice.");
  }

  let quote: QuoteSource | undefined;
  let quoteLines: QuoteLineSource[] = [];
  if (workOrder.source_type === "quote" && workOrder.source_id) {
    quote = await queryOne<QuoteSource>(
      `SELECT id, status, currency, grand_total, snapshot_hash
       FROM ${businessTable("quote")}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, workOrder.source_id],
    );
    if (!quote || quote.status !== "accepted") {
      throw invoiceError("INVOICE_SOURCE_INVALID", "The source Quote is missing or is no longer accepted.");
    }
    quoteLines = await queryAll<QuoteLineSource>(
      `SELECT id, description, quantity, unit, unit_price, line_total, sort_order
       FROM ${businessTable("quote_line")}
       WHERE workspace_id = ? AND quote_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [workspaceId, quote.id],
    );
  }

  const currency = normalizePaymentCurrency(quote?.currency ?? input.currency ?? "");
  const totalMinor = quote
    ? assertPositiveMinor(toMinor(Number(quote.grand_total ?? 0)))
    : assertPositiveMinor(input.totalMinor);
  const dueAt = normalizeDueAt(input.dueAt);
  const timestamp = now();
  const invoiceId = genId("inv");
  const invoiceNumber = `INV-${timestamp.slice(0, 10).replaceAll("-", "")}-${invoiceId.slice(-8).toUpperCase()}`;
  const lines = quoteLines.length > 0
    ? quoteLines.map((line, index) => ({
        id: genId("invl"),
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPriceMinor: toMinor(line.unit_price),
        lineTotalMinor: toMinor(Number(line.line_total ?? line.quantity * line.unit_price)),
        sortOrder: line.sort_order ?? index,
      }))
    : [{
        id: genId("invl"),
        description: workOrder.title,
        quantity: 1,
        unit: "service",
        unitPriceMinor: totalMinor,
        lineTotalMinor: totalMinor,
        sortOrder: 0,
      }];
  const lineTotal = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  if (lineTotal !== totalMinor) {
    throw invoiceError(
      "INVOICE_TOTAL_MISMATCH",
      `Invoice lines total ${lineTotal} but the source total is ${totalMinor}.`,
    );
  }
  const snapshotHash = quote?.snapshot_hash
    ?? workOrder.source_snapshot_hash
    ?? invoiceSnapshotHash({
      workOrderId,
      quoteId: quote?.id ?? null,
      currency,
      totalMinor,
      lines,
    });
  const invoice: InvoiceRecord = {
    id: invoiceId,
    workspace_id: workspaceId,
    invoice_number: invoiceNumber,
    status: "issued",
    work_order_id: workOrderId,
    quote_id: quote?.id ?? null,
    company_id: workOrder.company_id,
    contact_id: workOrder.contact_id,
    currency,
    total_minor: totalMinor,
    amount_paid_minor: 0,
    balance_due_minor: totalMinor,
    issued_at: timestamp,
    due_at: dueAt,
    paid_at: null,
    voided_at: null,
    memo: input.memo?.trim() || null,
    source_snapshot_hash: snapshotHash,
    created_by: actor.id,
    aggregate_version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  };

  return executeCommand({
    commandId: commandId ?? `invoice.issue:${workOrderId}`,
    workspaceId,
    commandType: "invoice.issue_from_work_order",
    aggregateType: "invoice",
    aggregateId: invoiceId,
    expectedVersion: null,
    actor,
    occurredAt: timestamp,
    input: { workOrderId, totalMinor, currency, dueAt, memo: invoice.memo },
  }, async () => ({
    statements: [
      {
        sql: `INSERT INTO ${businessTable("invoice")}
          (id, workspace_id, invoice_number, status, work_order_id, quote_id,
           company_id, contact_id, currency, total_minor, amount_paid_minor,
           balance_due_minor, issued_at, due_at, paid_at, voided_at, memo,
           source_snapshot_hash, created_by, aggregate_version, created_at, updated_at)
          VALUES (?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, NULL, ?, ?, ?, 1, ?, ?)`,
        args: [
          invoiceId, workspaceId, invoiceNumber, workOrderId, invoice.quote_id,
          workOrder.company_id, workOrder.contact_id, currency, totalMinor, totalMinor,
          timestamp, dueAt, invoice.memo, snapshotHash, actor.id, timestamp, timestamp,
        ],
        expectedRowsAffected: 1,
      },
      ...lines.map((line) => ({
        sql: `INSERT INTO ${businessTable("invoice_line")}
          (id, workspace_id, invoice_id, description, quantity, unit,
           unit_price_minor, line_total_minor, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          line.id, workspaceId, invoiceId, line.description, line.quantity, line.unit,
          line.unitPriceMinor, line.lineTotalMinor, line.sortOrder, timestamp, timestamp,
        ],
        expectedRowsAffected: 1,
      })),
    ],
    events: [{
      aggregateType: "invoice",
      aggregateId: invoiceId,
      eventType: "invoice.issued",
      payload: { workOrderId, quoteId: invoice.quote_id, totalMinor, currency },
    }],
    audit: {
      action: "invoice.issue_from_work_order",
      entityType: "invoice",
      entityId: invoiceId,
      after: invoice,
    },
    aggregate: invoice,
    newVersion: 1,
  } satisfies CommandHandlerResult<InvoiceRecord>));
}

export async function voidInvoice(
  workspaceId: string,
  invoiceId: string,
  actor: CommandActor,
  expectedVersion: number,
  reason?: string,
  commandId?: string,
) {
  const invoice = await queryOne<InvoiceRecord>(
    `SELECT * FROM ${businessTable("invoice")}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, invoiceId],
  );
  if (!invoice) throw new NotFoundError("Invoice not found.");
  checkOptimisticLock(invoice.aggregate_version, expectedVersion);
  if (invoice.status !== "issued" || invoice.amount_paid_minor !== 0) {
    throw invoiceError(
      ERROR_CODES.INVALID_TRANSITION,
      "Only an unpaid issued Invoice can be voided.",
    );
  }
  const openPaymentRequest = await queryOne<{ id: string }>(
    `SELECT id FROM ${businessTable("payment_request")}
     WHERE workspace_id = ? AND source_object_type = 'invoice' AND source_object_id = ?
       AND status = 'open'
     LIMIT 1`,
    [workspaceId, invoiceId],
  );
  if (openPaymentRequest) {
    throw invoiceError(
      "INVOICE_PAYMENT_REQUEST_OPEN",
      "Expire or complete the open payment request before voiding this Invoice.",
    );
  }
  const timestamp = now();
  const updated: InvoiceRecord = {
    ...invoice,
    status: "void",
    voided_at: timestamp,
    memo: reason?.trim() || invoice.memo,
    aggregate_version: invoice.aggregate_version + 1,
    updated_at: timestamp,
  };
  return executeCommand({
    commandId: commandId ?? genId("cmd"),
    workspaceId,
    commandType: "invoice.void",
    aggregateType: "invoice",
    aggregateId: invoiceId,
    expectedVersion,
    actor,
    occurredAt: timestamp,
    input: { reason: reason?.trim() || null },
  }, async () => ({
    statements: [{
      sql: `UPDATE ${businessTable("invoice")}
        SET status = 'void', voided_at = ?, memo = ?, aggregate_version = ?,
            updated_at = ?
        WHERE workspace_id = ? AND id = ? AND aggregate_version = ?
          AND status = 'issued' AND amount_paid_minor = 0
          AND NOT EXISTS (
            SELECT 1 FROM ${businessTable("payment_request")} pr
            WHERE pr.workspace_id = ? AND pr.source_object_type = 'invoice'
              AND pr.source_object_id = ? AND pr.status = 'open'
          )`,
      args: [
        timestamp, updated.memo, updated.aggregate_version, timestamp,
        workspaceId, invoiceId, expectedVersion, workspaceId, invoiceId,
      ],
      expectedRowsAffected: 1,
    }],
    events: [{
      aggregateType: "invoice",
      aggregateId: invoiceId,
      eventType: "invoice.voided",
      payload: { reason: reason?.trim() || null },
    }],
    audit: {
      action: "invoice.void",
      entityType: "invoice",
      entityId: invoiceId,
      before: invoice,
      after: updated,
    },
    aggregate: updated,
    newVersion: updated.aggregate_version,
  } satisfies CommandHandlerResult<InvoiceRecord>));
}
