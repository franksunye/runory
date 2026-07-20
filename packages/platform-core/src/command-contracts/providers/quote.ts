import { businessTable } from "../../contracts";
import { commandContractError } from "../errors";
import { registerCommandEffectProvider } from "../registry";
import { assertEffectCardinality } from "./cardinality";

interface PersistQuoteCalculationEffectInput {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  lineTotals: Array<{ lineId: string; lineTotal: number }>;
}

function parsePersistQuoteCalculationEffectInput(
  commandType: string,
  input: unknown,
): PersistQuoteCalculationEffectInput {
  const invalid = (): never => {
    throw commandContractError(
      `${commandType} did not provide a valid effect input for quote.persist_calculation.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  for (const key of ["subtotal", "discountTotal", "taxTotal", "grandTotal"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) invalid();
  }
  if (!Array.isArray(value.lineTotals)) invalid();
  const lineTotals = value.lineTotals as unknown[];
  for (const item of lineTotals) {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid();
    const row = item as Record<string, unknown>;
    if (typeof row.lineId !== "string" || row.lineId === "") invalid();
    if (typeof row.lineTotal !== "number" || !Number.isFinite(row.lineTotal)) invalid();
  }
  return value as unknown as PersistQuoteCalculationEffectInput;
}

registerCommandEffectProvider({
  capability: "quote.persist_calculation",
  version: "1.0.0",
  consistency: "atomic",
  prepare: ({ envelope, requirement, effectInput }) => {
    const input = parsePersistQuoteCalculationEffectInput(envelope.commandType, effectInput);
    assertEffectCardinality(envelope.commandType, requirement, 1, "Quote calculation(s)");
    return {
      recordCount: 1,
      statements: [
        ...input.lineTotals.map((line) => ({
          sql: `UPDATE ${businessTable("quote_line")}
                SET line_total = ?, updated_at = ?
                WHERE workspace_id = ? AND quote_id = ? AND id = ?`,
          args: [
            line.lineTotal, envelope.occurredAt, envelope.workspaceId,
            envelope.aggregateId, line.lineId,
          ],
          expectedRowsAffected: 1,
        })),
        {
          sql: `UPDATE ${businessTable("quote")}
                SET subtotal = ?, discount_total = ?, tax_total = ?, grand_total = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ?`,
          args: [
            input.subtotal, input.discountTotal, input.taxTotal, input.grandTotal,
            envelope.occurredAt, envelope.workspaceId, envelope.aggregateId,
          ],
          expectedRowsAffected: 1,
        },
      ],
    };
  },
});

interface CreateQuoteRevisionCopyEffectInput {
  newQuoteId: string;
  newQuoteNumber: string;
  rootQuoteId: string;
  newRevisionNumber: number;
  lineCopies: Array<{ sourceLineId: string; newLineId: string }>;
}

function parseCreateQuoteRevisionCopyEffectInput(
  commandType: string,
  input: unknown,
): CreateQuoteRevisionCopyEffectInput {
  const invalid = (): never => {
    throw commandContractError(
      `${commandType} did not provide a valid effect input for quote.create_revision_copy.`,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  for (const key of ["newQuoteId", "newQuoteNumber", "rootQuoteId"]) {
    if (typeof value[key] !== "string" || value[key] === "") invalid();
  }
  if (!Number.isInteger(value.newRevisionNumber)
    || (value.newRevisionNumber as number) < 1) invalid();
  if (!Array.isArray(value.lineCopies)) invalid();
  const lineCopies = value.lineCopies as unknown[];
  for (const item of lineCopies) {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid();
    const row = item as Record<string, unknown>;
    if (typeof row.sourceLineId !== "string" || row.sourceLineId === "") invalid();
    if (typeof row.newLineId !== "string" || row.newLineId === "") invalid();
  }
  return value as unknown as CreateQuoteRevisionCopyEffectInput;
}

registerCommandEffectProvider({
  capability: "quote.create_revision_copy",
  version: "1.0.0",
  consistency: "atomic",
  prepare: ({ envelope, requirement, effectInput }) => {
    const input = parseCreateQuoteRevisionCopyEffectInput(envelope.commandType, effectInput);
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      1,
      "Quote revision copy request(s)",
    );
    const ts = envelope.occurredAt;
    return {
      recordCount: 1,
      statements: [
        {
        sql: `INSERT INTO ${businessTable("quote")}
              (id, workspace_id, quote_number, title, status, version, aggregate_version,
               company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id,
               currency, subtotal, discount_total, tax_total, grand_total,
               valid_until, owner, terms, notes,
               root_quote_id, previous_version_id, revision_number,
               price_book_id, approved_at, accepted_at, rejected_reason, withdrawn_at,
               snapshot_hash, locked_at, created_at, updated_at)
              SELECT ?, ?, ?, title, 'draft', 1, 1,
               company_id, contact_id, deal_id, work_order_id, service_site_id, asset_id,
               currency, NULL, NULL, NULL, NULL,
               valid_until, owner, terms, notes,
               ?, ?, ?, price_book_id, NULL, NULL, NULL, NULL,
               NULL, NULL, ?, ?
              FROM ${businessTable("quote")}
              WHERE workspace_id = ? AND id = ?`,
        args: [
          input.newQuoteId, envelope.workspaceId, input.newQuoteNumber,
          input.rootQuoteId, envelope.aggregateId, input.newRevisionNumber,
          ts, ts, envelope.workspaceId, envelope.aggregateId,
        ],
        expectedRowsAffected: 1,
        },
        ...input.lineCopies.map((line) => ({
          sql: `INSERT INTO ${businessTable("quote_line")}
              (id, workspace_id, quote_id, product_service_id, description, quantity, unit,
               unit_price, discount_amount, tax_amount, line_total, sort_order, created_at, updated_at)
              SELECT ?, workspace_id, ?, product_service_id, description, quantity, unit,
               unit_price, discount_amount, tax_amount, line_total, sort_order, ?, ?
              FROM ${businessTable("quote_line")}
              WHERE workspace_id = ? AND quote_id = ? AND id = ?`,
        args: [
          line.newLineId, input.newQuoteId, ts, ts, envelope.workspaceId,
          envelope.aggregateId, line.sourceLineId,
        ],
          expectedRowsAffected: 1,
        })),
      ],
    };
  },
});
