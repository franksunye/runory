// ── Quote Calculation (v0.5 Slice 2) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.6:
// Quote totals are calculated server-side from quote lines and price/tax/discount policy.
// The legacy editable subtotal/discount_total/tax_total/grand_total are replaced
// by governed fields that can only be set through quote.recalculate command.

import { queryAll, queryOne, execute, now } from "./db";
import { businessTable } from "./contracts";
import { BusinessError, NotFoundError } from "./context";
import { ERROR_CODES } from "./errors";

// Calculate and return quote totals without persisting
export async function computeQuoteTotals(
  workspaceId: string,
  quoteId: string
): Promise<{
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
}> {
  const lines = await queryAll<{
    id: string;
    quantity: number | null;
    unit_price: number | null;
    discount_amount: number | null;
    tax_amount: number | null;
    line_total: number | null;
  }>(
    `SELECT id, quantity, unit_price, discount_amount, tax_amount, line_total
     FROM ${businessTable("quote_line")}
     WHERE workspace_id = ? AND quote_id = ?`,
    [workspaceId, quoteId]
  );

  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  for (const line of lines) {
    const qty = line.quantity ?? 0;
    const unitPrice = line.unit_price ?? 0;
    const lineSubtotal = qty * unitPrice;
    const lineDiscount = line.discount_amount ?? 0;
    const lineTax = line.tax_amount ?? 0;
    const lineTotal = lineSubtotal - lineDiscount + lineTax;

    subtotal += lineSubtotal;
    discountTotal += lineDiscount;
    taxTotal += lineTax;

    // Update line_total if it changed
    if (line.line_total !== lineTotal) {
      await execute(
        `UPDATE ${businessTable("quote_line")}
         SET line_total = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ?`,
        [lineTotal, now(), workspaceId, line.id]
      );
    }
  }

  const grandTotal = subtotal - discountTotal + taxTotal;

  return { subtotal, discountTotal, taxTotal, grandTotal };
}

// Persist calculated totals to the quote record (direct DB write, not updateRecord — totals are governed)
export async function recalculateQuote(
  workspaceId: string,
  quoteId: string
): Promise<{ subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number }> {
  const totals = await computeQuoteTotals(workspaceId, quoteId);
  
  await execute(
    `UPDATE ${businessTable("quote")}
     SET subtotal = ?, discount_total = ?, tax_total = ?, grand_total = ?, updated_at = ?
     WHERE workspace_id = ? AND id = ?`,
    [totals.subtotal, totals.discountTotal, totals.taxTotal, totals.grandTotal, now(), workspaceId, quoteId]
  );

  return totals;
}

// Validate quote completeness before submission
export async function validateQuoteCompleteness(
  workspaceId: string,
  quoteId: string
): Promise<void> {
  const quote = await queryOne<{ currency: string | null; status: string }>(
    `SELECT currency, status FROM ${businessTable("quote")}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, quoteId]
  );
  if (!quote) {
    throw new NotFoundError(`Quote not found: ${quoteId}`);
  }

  const lines = await queryAll<{
    quantity: number | null;
    unit_price: number | null;
    description: string | null;
  }>(
    `SELECT quantity, unit_price, description
     FROM ${businessTable("quote_line")}
     WHERE workspace_id = ? AND quote_id = ?`,
    [workspaceId, quoteId]
  );

  const errors: string[] = [];

  if (lines.length === 0) {
    errors.push("Quote must have at least one line item");
  }

  if (!quote.currency) {
    errors.push("Quote must have a currency set");
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.description) {
      errors.push(`Line ${i + 1}: description is required`);
    }
    if (line.quantity === null || line.quantity <= 0) {
      errors.push(`Line ${i + 1}: quantity must be greater than 0`);
    }
    if (line.unit_price === null || line.unit_price < 0) {
      errors.push(`Line ${i + 1}: unit price must be >= 0`);
    }
  }

  if (errors.length > 0) {
    throw new BusinessError(
      ERROR_CODES.REQUIRED_INPUT_MISSING,
      `REQUIRED_INPUT_MISSING: ${errors.join("; ")}`,
      422
    );
  }
}
