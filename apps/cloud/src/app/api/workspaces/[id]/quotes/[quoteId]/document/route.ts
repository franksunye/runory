// ── Quote Document Output API (v0.5.1 P0, Spec §4.5) ──
//
// Generates a provider-neutral, printable HTML document for a Quote.
// The output contract is established in v0.5.1; v0.5.2 will supply
// authoritative PDF generation, immutable revisions, and acceptance
// guarantees.
//
// Per spec:
//   - MUST resolve one explicit revision
//   - MUST record an audit event
//   - MUST NOT calculate different totals from the Quote command runtime
//   - Draft watermark when the Quote is not approved/sent/accepted

import { NextRequest, NextResponse } from "next/server";
import {
  getRecord,
  writeAuditEvent,
  now,
  getWorkspace,
  queryAll,
  businessTable,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { handleError, notFound, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Statuses that do NOT trigger the draft watermark.
// Per spec §4.5: "Draft watermark when the Quote is not approved/sent/accepted".
const NON_DRAFT_STATUSES = new Set(["approved", "sent", "accepted"]);

// ── Helpers ──

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeHtmlMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function formatMoney(amount: unknown, currency: string | undefined): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return "&mdash;";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || ""}`.trim();
  }
}

function formatDate(dateStr: unknown): string {
  if (!dateStr) return "&mdash;";
  try {
    return new Date(String(dateStr)).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return escapeHtml(dateStr);
  }
}

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return dateStr;
  }
}

/** Safely load a related record, returning undefined if the object/table is unavailable. */
async function safeGetRecord(
  workspaceId: string,
  objectKey: string,
  recordId: string | null | undefined
): Promise<Record<string, unknown> | undefined> {
  if (!recordId) return undefined;
  try {
    return await getRecord(workspaceId, objectKey, recordId);
  } catch {
    return undefined;
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
    case "accepted":
      return "badge-green";
    case "rejected":
    case "declined":
      return "badge-red";
    case "in_review":
    case "sent":
      return "badge-blue";
    case "expired":
      return "badge-orange";
    default:
      return "badge-gray";
  }
}

// ── HTML Document Generation ──

interface QuoteDocumentData {
  workspaceName: string;
  quote: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  company: Record<string, unknown> | undefined;
  contact: Record<string, unknown> | undefined;
  serviceSite: Record<string, unknown> | undefined;
  generatedAt: string;
  showWatermark: boolean;
  revisionNumber: number;
}

function generateQuoteHtml(data: QuoteDocumentData): string {
  const {
    workspaceName,
    quote,
    lines,
    company,
    contact,
    serviceSite,
    generatedAt,
    showWatermark,
    revisionNumber,
  } = data;

  const quoteNumber = escapeHtml(quote.quote_number);
  const title = escapeHtml(quote.title);
  const status = String(quote.status ?? "draft");
  const currency = String(quote.currency ?? "CNY");
  const validUntil = quote.valid_until;
  const terms = quote.terms;
  const notes = quote.notes;
  const snapshotHash = quote.snapshot_hash;
  const approvedAt = quote.approved_at;
  const acceptedAt = quote.accepted_at;

  // Related party fields
  const companyName = escapeHtml(company?.name ?? "");
  const companyPhone = escapeHtml(company?.phone ?? "");
  const companyAddress = escapeHtmlMultiline(company?.address ?? "");

  const contactName = escapeHtml(contact?.name ?? "");
  const contactEmail = escapeHtml(contact?.email ?? "");
  const contactPhone = escapeHtml(contact?.phone ?? "");
  const contactTitle = escapeHtml(contact?.title ?? "");

  const siteName = escapeHtml(serviceSite?.name ?? "");
  const siteAddress = escapeHtmlMultiline(
    [serviceSite?.address, serviceSite?.city, serviceSite?.region, serviceSite?.postal_code]
      .filter(Boolean)
      .join(", ")
  );
  const siteAccessNotes = escapeHtmlMultiline(serviceSite?.access_notes ?? "");

  // Line items rows
  const lineRows = lines.length > 0
    ? lines.map((line, i) => {
        const description = escapeHtml(line.description ?? "");
        const quantity = Number(line.quantity ?? 0);
        const unit = escapeHtml(line.unit ?? "");
        const unitPrice = formatMoney(line.unit_price, currency);
        const discount = formatMoney(line.discount_amount, currency);
        const tax = formatMoney(line.tax_amount, currency);
        const lineTotal = formatMoney(line.line_total, currency);
        return `<tr>
          <td class="col-num">${i + 1}</td>
          <td class="col-desc">${description}</td>
          <td class="col-qty">${Number.isFinite(quantity) ? quantity : ""}</td>
          <td class="col-unit">${unit}</td>
          <td class="col-price">${unitPrice}</td>
          <td class="col-disc">${discount}</td>
          <td class="col-tax">${tax}</td>
          <td class="col-total">${lineTotal}</td>
        </tr>`;
      }).join("\n")
    : `<tr class="no-lines"><td colspan="8">No line items</td></tr>`;

  // Totals
  const subtotal = formatMoney(quote.subtotal, currency);
  const discountTotal = formatMoney(quote.discount_total, currency);
  const taxTotal = formatMoney(quote.tax_total, currency);
  const grandTotal = formatMoney(quote.grand_total, currency);

  // Status display
  const statusLabel = status.replace(/_/g, " ");

  // Watermark
  const watermarkHtml = showWatermark
    ? `<div class="watermark"><span>${escapeHtml(statusLabel.toUpperCase())}</span></div>`
    : "";

  // Approval/acceptance info
  const approvalInfo: string[] = [];
  if (approvedAt) {
    approvalInfo.push(`<div><span class="meta-label">Approved:</span> ${formatDate(approvedAt)}</div>`);
  }
  if (acceptedAt) {
    approvalInfo.push(`<div><span class="meta-label">Accepted:</span> ${formatDate(acceptedAt)}</div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quote ${quoteNumber} - Rev ${revisionNumber}</title>
  <style>
    /* ── Reset & Base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 14px; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1a1a2e;
      background: #f0f0f5;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Watermark ── */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      pointer-events: none;
      z-index: 9999;
      opacity: 0.12;
    }
    .watermark span {
      font-size: 7rem;
      font-weight: 800;
      letter-spacing: 0.3em;
      color: #666;
      text-transform: uppercase;
      white-space: nowrap;
    }

    /* ── Document Container ── */
    .document {
      max-width: 800px;
      margin: 2rem auto;
      background: #fff;
      padding: 3rem;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 4px;
      position: relative;
    }

    /* ── Header ── */
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #1a1a2e;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    .provider h1 {
      font-size: 1.6rem;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 0.25rem;
    }
    .provider .doc-label {
      font-size: 0.8rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .quote-meta {
      text-align: right;
    }
    .quote-meta h2 {
      font-size: 1.8rem;
      font-weight: 700;
      color: #1a1a2e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .meta-row {
      font-size: 0.85rem;
      margin-bottom: 0.2rem;
    }
    .meta-label {
      color: #888;
      display: inline-block;
      min-width: 80px;
    }

    /* ── Status Badge ── */
    .status-badge {
      display: inline-block;
      padding: 0.2rem 0.7rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-green { background: #d4edda; color: #155724; }
    .badge-red { background: #f8d7da; color: #721c24; }
    .badge-blue { background: #d1ecf1; color: #0c5460; }
    .badge-orange { background: #fff3cd; color: #856404; }
    .badge-gray { background: #e2e3e5; color: #383d41; }

    /* ── Title ── */
    .quote-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      color: #333;
    }

    /* ── Parties Section ── */
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2.5rem;
    }
    .party h3 {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #888;
      margin-bottom: 0.5rem;
      padding-bottom: 0.3rem;
      border-bottom: 1px solid #e0e0e0;
    }
    .party .party-name {
      font-weight: 600;
      font-size: 0.95rem;
      margin-bottom: 0.15rem;
    }
    .party .party-detail {
      font-size: 0.85rem;
      color: #555;
      line-height: 1.4;
    }

    /* ── Line Items Table ── */
    .line-items {
      margin-bottom: 2rem;
    }
    .line-items table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .line-items thead th {
      background: #1a1a2e;
      color: #fff;
      padding: 0.6rem 0.5rem;
      text-align: left;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .line-items thead th:first-child { border-radius: 4px 0 0 0; }
    .line-items thead th:last-child { border-radius: 0 4px 0 0; }
    .line-items tbody td {
      padding: 0.6rem 0.5rem;
      border-bottom: 1px solid #e8e8e8;
      vertical-align: top;
    }
    .line-items tbody tr:nth-child(even) { background: #fafafa; }
    .col-num { width: 2.5rem; text-align: center; color: #999; }
    .col-desc { min-width: 200px; }
    .col-qty { width: 4rem; text-align: right; }
    .col-unit { width: 4rem; }
    .col-price { width: 7rem; text-align: right; }
    .col-disc { width: 7rem; text-align: right; }
    .col-tax { width: 7rem; text-align: right; }
    .col-total { width: 8rem; text-align: right; font-weight: 600; }
    .no-lines td { text-align: center; padding: 1.5rem; color: #999; font-style: italic; }

    /* ── Totals ── */
    .totals {
      margin-left: auto;
      width: 300px;
      margin-bottom: 2.5rem;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 0.35rem 0;
      font-size: 0.9rem;
    }
    .total-row span:first-child { color: #555; }
    .total-row span:last-child { font-weight: 500; }
    .total-row.grand {
      border-top: 2px solid #1a1a2e;
      margin-top: 0.5rem;
      padding-top: 0.6rem;
      font-size: 1.1rem;
      font-weight: 700;
    }
    .total-row.grand span:first-child { color: #1a1a2e; }

    /* ── Footer ── */
    .doc-footer {
      border-top: 1px solid #e0e0e0;
      padding-top: 1.5rem;
      margin-top: 1rem;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .footer-section h4 {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #888;
      margin-bottom: 0.4rem;
    }
    .footer-section p {
      font-size: 0.85rem;
      color: #444;
      line-height: 1.5;
    }
    .footer-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.5rem;
      font-size: 0.75rem;
      color: #999;
      padding-top: 0.5rem;
      border-top: 1px solid #f0f0f0;
    }
    .footer-meta div { white-space: nowrap; }

    /* ── Print ── */
    @media print {
      body { background: #fff; font-size: 12px; }
      .document {
        max-width: none;
        margin: 0;
        padding: 0;
        box-shadow: none;
        border-radius: 0;
      }
      .watermark span { font-size: 5rem; opacity: 0.15; }
      .line-items thead th { background: #333 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .line-items tbody tr:nth-child(even) { background: #fafafa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .status-badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .parties { grid-template-columns: 1fr 1fr 1fr; }
      .footer-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  ${watermarkHtml}
  <div class="document">
    <!-- Header -->
    <header class="doc-header">
      <div class="provider">
        <h1>${escapeHtml(workspaceName)}</h1>
        <div class="doc-label">Quote Document</div>
      </div>
      <div class="quote-meta">
        <h2>Quote</h2>
        <div class="meta-row"><span class="meta-label">Number:</span> ${quoteNumber}</div>
        <div class="meta-row"><span class="meta-label">Revision:</span> ${revisionNumber}</div>
        <div class="meta-row"><span class="meta-label">Status:</span> <span class="status-badge ${statusBadgeClass(status)}">${escapeHtml(statusLabel)}</span></div>
      </div>
    </header>

    <!-- Title -->
    ${title ? `<div class="quote-title">${title}</div>` : ""}

    <!-- Parties -->
    <section class="parties">
      <div class="party">
        <h3>Provider</h3>
        <div class="party-name">${escapeHtml(workspaceName)}</div>
        ${companyPhone ? `<div class="party-detail">${companyPhone}</div>` : ""}
        ${companyAddress ? `<div class="party-detail">${companyAddress}</div>` : ""}
      </div>
      <div class="party">
        <h3>Customer / Contact</h3>
        ${companyName ? `<div class="party-name">${companyName}</div>` : "<div class=\"party-detail\">&mdash;</div>"}
        ${contactName ? `<div class="party-detail"><strong>${contactName}</strong>${contactTitle ? `, ${contactTitle}` : ""}</div>` : ""}
        ${contactEmail ? `<div class="party-detail">${contactEmail}</div>` : ""}
        ${contactPhone ? `<div class="party-detail">${contactPhone}</div>` : ""}
      </div>
      <div class="party">
        <h3>Service Site</h3>
        ${siteName ? `<div class="party-name">${siteName}</div>` : "<div class=\"party-detail\">&mdash;</div>"}
        ${siteAddress ? `<div class="party-detail">${siteAddress}</div>` : ""}
        ${siteAccessNotes ? `<div class="party-detail"><em>Access: ${siteAccessNotes}</em></div>` : ""}
      </div>
    </section>

    <!-- Line Items -->
    <section class="line-items">
      <table>
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-desc">Description</th>
            <th class="col-qty">Qty</th>
            <th class="col-unit">Unit</th>
            <th class="col-price">Unit Price</th>
            <th class="col-disc">Discount</th>
            <th class="col-tax">Tax</th>
            <th class="col-total">Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
        </tbody>
      </table>
    </section>

    <!-- Totals -->
    <section class="totals">
      <div class="total-row"><span>Subtotal</span><span>${subtotal}</span></div>
      <div class="total-row"><span>Total Discount</span><span>${discountTotal}</span></div>
      <div class="total-row"><span>Total Tax</span><span>${taxTotal}</span></div>
      <div class="total-row grand"><span>Grand Total (${escapeHtml(currency)})</span><span>${grandTotal}</span></div>
    </section>

    <!-- Footer -->
    <footer class="doc-footer">
      <div class="footer-grid">
        <div class="footer-section">
          <h4>Terms</h4>
          <p>${terms ? escapeHtmlMultiline(terms) : "&mdash;"}</p>
        </div>
        <div class="footer-section">
          <h4>Notes</h4>
          <p>${notes ? escapeHtmlMultiline(notes) : "&mdash;"}</p>
        </div>
      </div>
      <div class="footer-grid">
        <div class="footer-section">
          <h4>Validity</h4>
          <p>Valid until: ${formatDate(validUntil)}</p>
        </div>
        <div class="footer-section">
          <h4>Approvals</h4>
          ${approvalInfo.length > 0 ? approvalInfo.join("") : "<p>&mdash;</p>"}
        </div>
      </div>
      <div class="footer-meta">
        <div>Generated at: ${escapeHtml(formatDateTime(generatedAt))}</div>
        <div>Source revision: ${revisionNumber}</div>
        ${snapshotHash ? `<div>Snapshot: ${escapeHtml(snapshotHash)}</div>` : ""}
      </div>
    </footer>
  </div>
</body>
</html>`;
}

// ── GET Handler ──

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; quoteId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, quoteId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "html";
    const requestedRevision = url.searchParams.get("revision");

    // Validate format
    if (format !== "html" && format !== "pdf") {
      return invalidInput(`Invalid format '${format}'. Supported values: html, pdf.`, ctx.requestId);
    }

    // ── Load the Quote record (dynamic object, objectKey="quote") ──
    const quote = await getRecord(workspaceId, "quote", quoteId);
    if (!quote) {
      return notFound(`Quote ${quoteId} not found`, ctx.requestId);
    }

    const quoteStatus = String(quote.status ?? "draft");
    const revisionNumber = Number(quote.revision_number ?? 0);

    // ── Resolve one explicit revision ──
    // If a revision is requested, it must match the quote's revision_number.
    // The spec requires the document to resolve exactly one revision.
    if (requestedRevision !== null) {
      const requestedRev = Number(requestedRevision);
      if (Number.isNaN(requestedRev) || requestedRev !== revisionNumber) {
        return notFound(
          `Revision ${requestedRevision} not found for quote ${quoteId}. Current revision: ${revisionNumber}.`,
          ctx.requestId
        );
      }
    }

    // ── Load workspace for provider identity ──
    const workspace = await getWorkspace(workspaceId);
    const workspaceName = workspace?.name ?? "Unknown Workspace";

    // ── Load quote line items (related records, objectKey="quote_line") ──
    const lines = await queryAll<Record<string, unknown>>(
      `SELECT * FROM ${businessTable("quote_line")} WHERE workspace_id = ? AND quote_id = ? ORDER BY sort_order ASC, created_at ASC`,
      [workspaceId, quoteId]
    );

    // ── Load related customer/contact/service site ──
    const [company, contact, serviceSite] = await Promise.all([
      safeGetRecord(workspaceId, "company", quote.company_id as string | null),
      safeGetRecord(workspaceId, "contact", quote.contact_id as string | null),
      safeGetRecord(workspaceId, "service_site", quote.service_site_id as string | null),
    ]);

    const generatedAt = now();
    const showWatermark = !NON_DRAFT_STATUSES.has(quoteStatus);

    // ── Generate HTML document ──
    const html = generateQuoteHtml({
      workspaceName,
      quote,
      lines,
      company,
      contact,
      serviceSite,
      generatedAt,
      showWatermark,
      revisionNumber,
    });

    // ── Record audit event ──
    writeAuditEvent({
      workspaceId,
      actorType: ctx.principal?.authMethod === "api_key" ? "api_key" : "user",
      actorId: ctx.principal?.userId ?? "unknown",
      action: "quote.document_generated",
      entityType: "quote",
      entityId: quoteId,
      after: {
        format,
        revision: revisionNumber,
        status: quoteStatus,
        snapshotHash: quote.snapshot_hash ?? null,
        generatedAt,
        lineCount: lines.length,
      },
      requestId: ctx.requestId,
    }).catch((err) => {
      console.error("[audit] Failed to write audit event:", err);
    });

    // ── Return HTML response ──
    // PDF generation is deferred to v0.5.2 per spec; both html and pdf formats
    // return HTML with Content-Type: text/html to establish the document contract.
    const responseHeaders: Record<string, string> = {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "x-request-id": ctx.requestId,
    };

    if (format === "pdf") {
      // Suggest a filename for download; actual PDF conversion deferred to v0.5.2.
      const safeQuoteNumber = String(quote.quote_number ?? quoteId).replace(/[^a-zA-Z0-9_-]/g, "_");
      responseHeaders["Content-Disposition"] = `inline; filename="quote-${safeQuoteNumber}-rev${revisionNumber}.html"`;
    }

    return new NextResponse(html, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (e) {
    return handleError(e, requestId);
  }
}
