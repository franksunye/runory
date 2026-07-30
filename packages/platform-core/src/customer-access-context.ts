// ── Customer Access Journey Context (v0.8 Batch 3, Tech Spec §8.2) ──
//
// Per Tech Spec §8.2: GET /api/customer-access/context returns one
// customer-safe journey DTO assembled from the grant root. Only capabilities
// included in the grant are surfaced. Internal IDs, hashes, assignment data,
// provider references, failure payloads, audit internals, and attachment
// storage identifiers are excluded.
//
// The DTO is a read-only projection — it never accepts business input from the
// browser and never mutates state.

import type {
  CustomerAccessCapability,
  CustomerAccessContextDto,
  CustomerQuoteDto,
  CustomerWorkOrderStatusDto,
  CustomerServiceReportDto,
  CustomerInvoiceDto,
  CustomerPaymentStatusDto,
} from "@runory/contracts";
import { queryOne, queryAll } from "./db";
import { TABLES, businessTable } from "./contracts";
import type { CustomerAccessGrantRecord } from "./customer-access-commands";
import { generateWorkOrderNumber } from "./fsm-commands";

// ── Helpers ──

function parseCapabilities(grant: CustomerAccessGrantRecord): CustomerAccessCapability[] {
  try {
    return JSON.parse(grant.capabilities_json) as CustomerAccessCapability[];
  } catch {
    return [];
  }
}

function subjectMatches(
  grant: CustomerAccessGrantRecord,
  record: { company_id: string | null; contact_id: string | null },
): boolean {
  if (grant.subject_type === "contact") {
    return record.contact_id === grant.subject_id;
  }
  return record.company_id === grant.subject_id;
}

// ── DB Row Types ──

interface QuoteRow {
  id: string;
  quote_number: string;
  title: string;
  status: string;
  currency: string;
  subtotal: number | null;
  discount_total: number | null;
  tax_total: number | null;
  grand_total: number | null;
  valid_until: string | null;
  terms: string | null;
  revision_number: number;
  accepted_at: string | null;
  work_order_id: string | null;
  company_id: string | null;
  contact_id: string | null;
}

interface QuoteLineRow {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number | null;
}

interface WorkOrderRow {
  id: string;
  work_order_number: string | null;
  title: string;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  completed_at: string | null;
  company_id: string | null;
  contact_id: string | null;
}

interface ServiceReportRow {
  id: string;
  summary: string | null;
  resolution: string | null;
  completed_at: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  currency: string;
  total_minor: number;
  amount_paid_minor: number;
  balance_due_minor: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  memo: string | null;
  company_id: string | null;
  contact_id: string | null;
}

interface InvoiceLineRow {
  id: string;
  description: string | null;
  quantity: number | null;
  unit_price_minor: number;
  line_total_minor: number;
}

interface PaymentRequestRow {
  id: string;
  status: string;
  amount_due_minor: number;
  currency: string;
}

interface PaymentRow {
  status: string;
  amount_minor: number;
  refunded_amount_minor: number;
  currency: string;
}

// ── DTO Builders ──

function buildQuoteDto(quote: QuoteRow, lines: QuoteLineRow[]): CustomerQuoteDto {
  return {
    id: quote.id,
    quoteNumber: quote.quote_number,
    title: quote.title,
    status: quote.status,
    currency: quote.currency,
    subtotal: quote.subtotal ?? 0,
    discountTotal: quote.discount_total ?? 0,
    taxTotal: quote.tax_total ?? 0,
    grandTotal: quote.grand_total ?? 0,
    validUntil: quote.valid_until,
    terms: quote.terms,
    revisionNumber: quote.revision_number,
    acceptedAt: quote.accepted_at,
    lines: lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      lineTotal: l.line_total ?? 0,
    })),
  };
}

function buildWorkOrderDto(wo: WorkOrderRow): CustomerWorkOrderStatusDto {
  return {
    id: wo.id,
    // Never expose the raw record ID to the customer. If work_order_number is
    // missing (legacy data), derive a stable display number from the record ID
    // so the customer sees a professional identifier like "WO-20260728-A1B2C3D4".
    number: wo.work_order_number ?? generateWorkOrderNumber(wo.id),
    title: wo.title,
    status: wo.status,
    scheduledStart: wo.scheduled_start,
    scheduledEnd: wo.scheduled_end,
    completedAt: wo.completed_at,
  };
}

function buildServiceReportDto(r: ServiceReportRow): CustomerServiceReportDto {
  return {
    id: r.id,
    summary: r.summary,
    resolution: r.resolution,
    completedAt: r.completed_at,
  };
}

function buildInvoiceDto(invoice: InvoiceRow, lines: InvoiceLineRow[]): CustomerInvoiceDto {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    currency: invoice.currency,
    totalMinor: invoice.total_minor,
    amountPaidMinor: invoice.amount_paid_minor,
    balanceDueMinor: invoice.balance_due_minor,
    issuedAt: invoice.issued_at,
    dueAt: invoice.due_at,
    paidAt: invoice.paid_at,
    memo: invoice.memo,
    lines: lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unit_price_minor,
      lineTotal: l.line_total_minor,
    })),
  };
}

function buildPaymentDto(
  request: PaymentRequestRow,
  payment: PaymentRow | null,
): CustomerPaymentStatusDto {
  return {
    requestStatus: request.status,
    paymentStatus: payment?.status ?? null,
    amountMinor: request.amount_due_minor,
    refundedAmountMinor: payment?.refunded_amount_minor ?? 0,
    currency: request.currency,
  };
}

// ── Main Context Resolver ──

/**
 * Resolve the customer-safe journey context DTO from a grant.
 *
 * Per Tech Spec §8.2, assembles workspace, customer, quote, work order,
 * service reports, invoice, and payment status — all filtered by the grant
 * capabilities and verified against the grant subject.
 *
 * Only capabilities included in the grant are surfaced. If the root record is
 * missing or its subject does not match the grant, a minimal context (grant +
 * workspace + customer) is returned with no business data.
 */
export async function resolveCustomerAccessContext(
  grant: CustomerAccessGrantRecord,
): Promise<CustomerAccessContextDto> {
  const capabilities = parseCapabilities(grant);
  const has = (cap: CustomerAccessCapability): boolean => capabilities.includes(cap);

  // ── Workspace name ──
  const workspace = await queryOne<{ name: string }>(
    `SELECT name FROM ${TABLES.workspaces} WHERE id = ?`,
    [grant.workspace_id],
  );

  // ── Customer display name ──
  let customerDisplayName = "Customer";
  if (grant.subject_type === "contact") {
    const contact = await queryOne<{ name: string }>(
      `SELECT name FROM ${businessTable("contact")} WHERE workspace_id = ? AND id = ?`,
      [grant.workspace_id, grant.subject_id],
    );
    if (contact) customerDisplayName = contact.name;
  } else {
    const company = await queryOne<{ name: string }>(
      `SELECT name FROM ${businessTable("company")} WHERE workspace_id = ? AND id = ?`,
      [grant.workspace_id, grant.subject_id],
    );
    if (company) customerDisplayName = company.name;
  }

  const availableActions: Array<"quote.accept" | "invoice.pay"> = [];

  // ── Resolve root and journey ──
  let workOrderId: string | null = null;
  let quoteDto: CustomerQuoteDto | undefined;

  if (grant.root_object_type === "quote") {
    const quote = await queryOne<QuoteRow>(
      `SELECT id, quote_number, title, status, currency, subtotal, discount_total,
              tax_total, grand_total, valid_until, terms, revision_number,
              accepted_at, work_order_id, company_id, contact_id
       FROM ${businessTable("quote")}
       WHERE workspace_id = ? AND id = ?`,
      [grant.workspace_id, grant.root_record_id],
    );

    if (quote && subjectMatches(grant, quote)) {
      workOrderId = quote.work_order_id;

      if (has("quote.view")) {
        const lines = await queryAll<QuoteLineRow>(
          `SELECT id, description, quantity, unit_price, line_total
           FROM ${businessTable("quote_line")}
           WHERE workspace_id = ? AND quote_id = ? AND deleted_at IS NULL
           ORDER BY sort_order ASC`,
          [grant.workspace_id, quote.id],
        );
        quoteDto = buildQuoteDto(quote, lines);
      }

      if (has("quote.accept") && quote.status === "sent") {
        availableActions.push("quote.accept");
      }
    }
  } else {
    // Root is work_order — resolve the work order directly.
    workOrderId = grant.root_record_id;
  }

  // ── Work order status ──
  let workOrderDto: CustomerWorkOrderStatusDto | undefined;
  if (workOrderId && has("work_order.view_status")) {
    const wo = await queryOne<WorkOrderRow>(
      `SELECT id, work_order_number, title, status, scheduled_start,
              scheduled_end, completed_at, company_id, contact_id
       FROM ${businessTable("work_order")}
       WHERE workspace_id = ? AND id = ?`,
      [grant.workspace_id, workOrderId],
    );
    if (wo && subjectMatches(grant, wo)) {
      workOrderDto = buildWorkOrderDto(wo);
    }
  }

  // ── Service reports ──
  let serviceReports: CustomerServiceReportDto[] = [];
  if (workOrderId && has("service_report.view")) {
    const reports = await queryAll<ServiceReportRow>(
      `SELECT id, summary, resolution, completed_at
       FROM ${businessTable("service_report")}
       WHERE workspace_id = ? AND work_order_id = ?
       ORDER BY completed_at DESC NULLS LAST`,
      [grant.workspace_id, workOrderId],
    );
    serviceReports = reports.map(buildServiceReportDto);
  }

  // ── Invoice ──
  let invoiceDto: CustomerInvoiceDto | undefined;
  let paymentDto: CustomerPaymentStatusDto | undefined;
  let invoiceStatus = "";
  let invoiceBalance = 0;
  if (workOrderId && has("invoice.view")) {
    const invoice = await queryOne<InvoiceRow>(
      `SELECT id, invoice_number, status, currency, total_minor,
              amount_paid_minor, balance_due_minor, issued_at, due_at,
              paid_at, memo, company_id, contact_id
       FROM ${businessTable("invoice")}
       WHERE workspace_id = ? AND work_order_id = ?`,
      [grant.workspace_id, workOrderId],
    );
    if (invoice && subjectMatches(grant, invoice)) {
      invoiceStatus = invoice.status;
      invoiceBalance = invoice.balance_due_minor;
      const lines = await queryAll<InvoiceLineRow>(
        `SELECT id, description, quantity, unit_price_minor, line_total_minor
         FROM ${businessTable("invoice_line")}
         WHERE workspace_id = ? AND invoice_id = ?
         ORDER BY sort_order ASC`,
        [grant.workspace_id, invoice.id],
      );
      invoiceDto = buildInvoiceDto(invoice, lines);

      // ── Payment status ──
      if (has("payment.view_status")) {
        const paymentRequest = await queryOne<PaymentRequestRow>(
          `SELECT id, status, amount_due_minor, currency
           FROM ${businessTable("payment_request")}
           WHERE workspace_id = ? AND source_object_type = 'invoice'
             AND source_object_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
          [grant.workspace_id, invoice.id],
        );
        if (paymentRequest) {
          const payment = await queryOne<PaymentRow>(
            `SELECT status, amount_minor, refunded_amount_minor, currency
             FROM ${businessTable("payment")}
             WHERE workspace_id = ? AND payment_request_id = ?
             LIMIT 1`,
            [grant.workspace_id, paymentRequest.id],
          );
          paymentDto = buildPaymentDto(paymentRequest, payment ?? null);
        }
      }
    }
  }

  // ── Available actions ──
  if (
    has("invoice.pay")
    && (invoiceStatus === "issued" || invoiceStatus === "partially_paid")
    && invoiceBalance > 0
  ) {
    availableActions.push("invoice.pay");
  }

  return {
    grant: {
      id: grant.id,
      expiresAt: grant.expires_at,
      capabilities,
    },
    workspace: { name: workspace?.name ?? "Workspace" },
    customer: { displayName: customerDisplayName },
    quote: quoteDto,
    workOrder: workOrderDto,
    serviceReports,
    invoice: invoiceDto,
    payment: paymentDto,
    availableActions,
  };
}
