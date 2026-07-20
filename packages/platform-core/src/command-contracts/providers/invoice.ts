import { businessTable } from "../../contracts";
import { queryOne } from "../../db";
import { commandContractError } from "../errors";
import { registerCommandEffectProvider } from "../registry";
import { assertEffectCardinality } from "./cardinality";

interface InvoiceSettlementEffectInput {
  sourceObjectType: string;
  sourceObjectId: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
}

function parseInput(commandType: string, value: unknown): InvoiceSettlementEffectInput {
  const invalid = (): never => {
    throw commandContractError(
      `${commandType} did not provide a valid Invoice settlement effect input.`,
    );
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const input = value as Record<string, unknown>;
  for (const key of ["sourceObjectType", "sourceObjectId", "paymentId", "currency"]) {
    if (typeof input[key] !== "string" || input[key] === "") invalid();
  }
  if (!Number.isSafeInteger(input.amountMinor) || (input.amountMinor as number) <= 0) invalid();
  return input as unknown as InvoiceSettlementEffectInput;
}

registerCommandEffectProvider({
  capability: "invoice.apply_payment",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement, effectInput }) => {
    const input = parseInput(envelope.commandType, effectInput);
    if (input.sourceObjectType !== "invoice") {
      assertEffectCardinality(envelope.commandType, requirement, 0, "Invoice payment allocation(s)");
      return { recordCount: 0, statements: [] };
    }
    const invoice = await queryOne<{
      id: string;
      status: string;
      currency: string;
      total_minor: number;
      amount_paid_minor: number;
      aggregate_version: number;
    }>(
      `SELECT id, status, currency, total_minor, amount_paid_minor, aggregate_version
       FROM ${businessTable("invoice")}
       WHERE workspace_id = ? AND id = ?`,
      [envelope.workspaceId, input.sourceObjectId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      invoice ? 1 : 0,
      "Invoice payment allocation(s)",
    );
    if (!invoice) return { recordCount: 0, statements: [] };
    if (!["issued", "partially_paid"].includes(invoice.status)) {
      throw commandContractError(`Invoice '${invoice.id}' cannot receive payment in status '${invoice.status}'.`);
    }
    if (invoice.currency !== input.currency) {
      throw commandContractError(`Invoice '${invoice.id}' currency does not match the Payment.`);
    }
    if (invoice.amount_paid_minor + input.amountMinor > invoice.total_minor) {
      throw commandContractError(`Payment would overpay Invoice '${invoice.id}'.`);
    }
    const nextPaid = invoice.amount_paid_minor + input.amountMinor;
    const nextStatus = nextPaid === invoice.total_minor ? "paid" : "partially_paid";
    const ts = envelope.occurredAt;
    return {
      recordCount: 1,
      statements: [
        {
          sql: `INSERT INTO ${businessTable("invoice_payment_allocation")}
            (id, workspace_id, invoice_id, payment_id, amount_minor,
             refunded_amount_minor, currency, allocated_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
          args: [
            `inva_${input.paymentId}`, envelope.workspaceId, invoice.id, input.paymentId,
            input.amountMinor, input.currency, ts, ts, ts,
          ],
          expectedRowsAffected: 1,
        },
        {
          sql: `UPDATE ${businessTable("invoice")}
            SET status = ?, amount_paid_minor = amount_paid_minor + ?,
                balance_due_minor = total_minor - (amount_paid_minor + ?),
                paid_at = CASE WHEN amount_paid_minor + ? = total_minor THEN ? ELSE NULL END,
                aggregate_version = aggregate_version + 1, updated_at = ?
            WHERE workspace_id = ? AND id = ? AND aggregate_version = ?
              AND status IN ('issued', 'partially_paid')
              AND amount_paid_minor + ? <= total_minor`,
          args: [
            nextStatus, input.amountMinor, input.amountMinor, input.amountMinor, ts, ts,
            envelope.workspaceId, invoice.id, invoice.aggregate_version, input.amountMinor,
          ],
          expectedRowsAffected: 1,
        },
      ],
    };
  },
});

registerCommandEffectProvider({
  capability: "invoice.apply_refund",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement, effectInput }) => {
    const input = parseInput(envelope.commandType, effectInput);
    if (input.sourceObjectType !== "invoice") {
      assertEffectCardinality(envelope.commandType, requirement, 0, "Invoice refund allocation(s)");
      return { recordCount: 0, statements: [] };
    }
    const allocation = await queryOne<{
      invoice_id: string;
      amount_minor: number;
      refunded_amount_minor: number;
      currency: string;
      aggregate_version: number;
      total_minor: number;
      amount_paid_minor: number;
      status: string;
    }>(
      `SELECT a.invoice_id, a.amount_minor, a.refunded_amount_minor, a.currency,
              i.aggregate_version, i.total_minor, i.amount_paid_minor, i.status
       FROM ${businessTable("invoice_payment_allocation")} a
       JOIN ${businessTable("invoice")} i
         ON i.workspace_id = a.workspace_id AND i.id = a.invoice_id
       WHERE a.workspace_id = ? AND a.payment_id = ?`,
      [envelope.workspaceId, input.paymentId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      allocation ? 1 : 0,
      "Invoice refund allocation(s)",
    );
    if (!allocation) return { recordCount: 0, statements: [] };
    if (allocation.currency !== input.currency) {
      throw commandContractError("Invoice allocation currency does not match the Refund.");
    }
    if (allocation.refunded_amount_minor + input.amountMinor > allocation.amount_minor) {
      throw commandContractError("Refund exceeds the Payment amount allocated to the Invoice.");
    }
    if (allocation.amount_paid_minor < input.amountMinor) {
      throw commandContractError("Refund exceeds the Invoice paid balance.");
    }
    const nextPaid = allocation.amount_paid_minor - input.amountMinor;
    const nextStatus = nextPaid === 0 ? "issued" : "partially_paid";
    const ts = envelope.occurredAt;
    return {
      recordCount: 1,
      statements: [
        {
          sql: `UPDATE ${businessTable("invoice_payment_allocation")}
            SET refunded_amount_minor = refunded_amount_minor + ?, updated_at = ?
            WHERE workspace_id = ? AND payment_id = ?
              AND refunded_amount_minor + ? <= amount_minor`,
          args: [
            input.amountMinor, ts, envelope.workspaceId, input.paymentId, input.amountMinor,
          ],
          expectedRowsAffected: 1,
        },
        {
          sql: `UPDATE ${businessTable("invoice")}
            SET status = ?, amount_paid_minor = amount_paid_minor - ?,
                balance_due_minor = total_minor - (amount_paid_minor - ?),
                paid_at = NULL, aggregate_version = aggregate_version + 1, updated_at = ?
            WHERE workspace_id = ? AND id = ? AND aggregate_version = ?
              AND status IN ('paid', 'partially_paid') AND amount_paid_minor >= ?`,
          args: [
            nextStatus, input.amountMinor, input.amountMinor, ts, envelope.workspaceId,
            allocation.invoice_id, allocation.aggregate_version, input.amountMinor,
          ],
          expectedRowsAffected: 1,
        },
      ],
    };
  },
});
