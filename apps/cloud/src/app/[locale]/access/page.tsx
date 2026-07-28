"use client";

/**
 * Customer Access Page — Tech Spec §10
 *
 * Public route: /:locale/access
 *
 * A standalone (no MarketingHeader/Footer) customer-facing journey page. The
 * customer arrives via a magic link containing a single-use token in the URL
 * fragment (#token=...). The token is exchanged for a signed session cookie,
 * after which the page renders a read-only journey: Quote → Work Order →
 * Service Reports → Invoice → Payment.
 *
 * The browser never submits business input — the server derives every value.
 * Internal IDs are never shown to the customer.
 *
 * States implemented (Tech Spec §10):
 *   1. exchanging link
 *   2. unavailable / expired / revoked
 *   3. Quote awaiting acceptance
 *   4. accepted Quote / job status
 *   5. service completed / report available
 *   6. Invoice outstanding / partially paid
 *   7. redirecting to hosted Checkout
 *   8. payment processing / paid / refunded
 *   9. provider return / cancel / failure
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  FileText,
  Info,
  Loader2,
  LogOut,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { Locale } from "@/i18n/config";
import { apiFetch, apiPost } from "@/lib/api-fetch";

// ─────────────────────────────────────────────────────────────────────────────
// Inline translations (en / zh)
// ─────────────────────────────────────────────────────────────────────────────

const translations = {
  en: {
    "brand": "Runory",
    "page.title": "Customer Portal",
    "page.secured": "Secured customer access",
    "page.subtitle": "Review your quote, track your job, and complete payment.",

    "loading.default": "Loading…",

    "exchanging.title": "Securing your access",
    "exchanging.desc": "Please wait while we verify your link…",

    "unavailable.title": "Access unavailable",
    "unavailable.desc":
      "This link is no longer valid, has expired, or has been revoked. Please request a new link from your service provider.",
    "unavailable.help":
      "If you believe this is an error, contact the business that shared this link with you.",

    "greeting": "Hello, {name}",
    "greeting.fallback": "Welcome",
    "provider.label": "Service provider",

    "session.expires": "Session expires {time}",
    "action.logout": "Sign out",
    "action.cancel": "Cancel",
    "action.close": "Close",
    "action.viewDetails": "View details",
    "action.hideDetails": "Hide details",

    "checkout.returned": "Payment successful — refreshing your status…",
    "checkout.cancelled": "Payment was cancelled. You can pay again whenever you're ready.",

    "quote.title": "Quote",
    "quote.number": "Quote number",
    "quote.revision": "Revision",
    "quote.validUntil": "Valid until",
    "quote.noValidity": "No expiry",
    "quote.amount": "Amount",
    "quote.terms": "Terms & conditions",
    "quote.lineItems": "Line items",
    "quote.subtotal": "Subtotal",
    "quote.discount": "Discount",
    "quote.tax": "Tax",
    "quote.total": "Total",
    "quote.status.awaiting": "Awaiting your acceptance",
    "quote.status.accepted": "Accepted",
    "quote.status.draft": "Draft",
    "quote.status.other": "Quote",
    "quote.acceptedAt": "Accepted on {date}",
    "quote.accept.cta": "Accept quote",
    "quote.accept.title": "Accept this quote?",
    "quote.accept.desc": "Please confirm the details below before accepting.",
    "quote.accept.confirm": "I accept this quote",
    "quote.accept.success": "Quote accepted successfully. Thank you!",
    "quote.accept.error": "We couldn't accept this quote. Please try again or contact your provider.",
    "quote.noTerms": "No terms specified.",

    "workOrder.title": "Job status",
    "workOrder.number": "Job number",
    "workOrder.scheduled": "Scheduled",
    "workOrder.completed": "Completed",
    "workOrder.notScheduled": "Not yet scheduled",
    "workOrder.status.scheduled": "Scheduled",
    "workOrder.status.in_progress": "In progress",
    "workOrder.status.completed": "Completed",
    "workOrder.status.cancelled": "Cancelled",
    "workOrder.status.on_hold": "On hold",
    "workOrder.status.other": "Current status",

    "reports.title": "Service reports",
    "reports.summary": "Summary",
    "reports.resolution": "Resolution",
    "reports.completedAt": "Completed on {date}",
    "reports.empty": "No service reports yet.",

    "invoice.title": "Invoice",
    "invoice.number": "Invoice number",
    "invoice.balance": "Balance due",
    "invoice.total": "Total",
    "invoice.paid": "Amount paid",
    "invoice.issuedAt": "Issued on {date}",
    "invoice.dueAt": "Due on {date}",
    "invoice.paidAt": "Paid on {date}",
    "invoice.memo": "Memo",
    "invoice.lineItems": "Line items",
    "invoice.status.issued": "Payment due",
    "invoice.status.partially_paid": "Partially paid",
    "invoice.status.paid": "Paid in full",
    "invoice.status.void": "Void",
    "invoice.status.other": "Invoice",

    "payment.title": "Payment status",
    "payment.pay": "Pay now",
    "payment.pay.title": "Continue to payment?",
    "payment.pay.desc": "You will be redirected to our secure payment provider to complete your payment.",
    "payment.pay.invoice": "Invoice",
    "payment.pay.balance": "Balance due",
    "payment.pay.continue": "Continue to checkout",
    "payment.pay.redirecting": "Redirecting to secure checkout…",
    "payment.pay.error": "We couldn't start checkout. Please try again or contact your provider.",
    "payment.amount": "Amount requested",
    "payment.refunded": "Refunded amount",
    "payment.status.processing": "Payment processing",
    "payment.status.paid": "Payment received",
    "payment.status.refunded": "Refunded",
    "payment.status.pending": "Awaiting payment",
    "payment.status.failed": "Payment failed",
    "payment.status.other": "Payment",
  },
  zh: {
    "brand": "Runory",
    "page.title": "客户门户",
    "page.secured": "安全的客户访问",
    "page.subtitle": "查看您的报价、跟踪工单进度并完成付款。",

    "loading.default": "加载中…",

    "exchanging.title": "正在验证您的访问权限",
    "exchanging.desc": "请稍候，我们正在验证您的链接…",

    "unavailable.title": "访问不可用",
    "unavailable.desc":
      "此链接已失效、过期或被撤销。请向您的服务提供商索取新的链接。",
    "unavailable.help": "如果您认为这是错误，请联系与您分享此链接的企业。",

    "greeting": "您好，{name}",
    "greeting.fallback": "欢迎",
    "provider.label": "服务提供商",

    "session.expires": "会话将于 {time} 过期",
    "action.logout": "退出登录",
    "action.cancel": "取消",
    "action.close": "关闭",
    "action.viewDetails": "查看明细",
    "action.hideDetails": "收起明细",

    "checkout.returned": "付款成功 — 正在刷新您的状态…",
    "checkout.cancelled": "付款已取消。您可以随时重新发起付款。",

    "quote.title": "报价单",
    "quote.number": "报价单号",
    "quote.revision": "版本",
    "quote.validUntil": "有效期至",
    "quote.noValidity": "无有效期",
    "quote.amount": "金额",
    "quote.terms": "条款与条件",
    "quote.lineItems": "明细项目",
    "quote.subtotal": "小计",
    "quote.discount": "折扣",
    "quote.tax": "税额",
    "quote.total": "总计",
    "quote.status.awaiting": "等待您确认",
    "quote.status.accepted": "已接受",
    "quote.status.draft": "草稿",
    "quote.status.other": "报价单",
    "quote.acceptedAt": "已于 {date} 接受",
    "quote.accept.cta": "接受报价",
    "quote.accept.title": "确认接受此报价？",
    "quote.accept.desc": "请在接受前确认以下信息。",
    "quote.accept.confirm": "我接受此报价",
    "quote.accept.success": "报价已成功接受，感谢您！",
    "quote.accept.error": "无法接受此报价，请重试或联系您的服务商。",
    "quote.noTerms": "未指定条款。",

    "workOrder.title": "工单状态",
    "workOrder.number": "工单号",
    "workOrder.scheduled": "计划时间",
    "workOrder.completed": "完成时间",
    "workOrder.notScheduled": "尚未排期",
    "workOrder.status.scheduled": "已排期",
    "workOrder.status.in_progress": "进行中",
    "workOrder.status.completed": "已完成",
    "workOrder.status.cancelled": "已取消",
    "workOrder.status.on_hold": "已暂停",
    "workOrder.status.other": "当前状态",

    "reports.title": "服务报告",
    "reports.summary": "概述",
    "reports.resolution": "处理结果",
    "reports.completedAt": "于 {date} 完成",
    "reports.empty": "暂无服务报告。",

    "invoice.title": "账单",
    "invoice.number": "账单号",
    "invoice.balance": "应付余额",
    "invoice.total": "总额",
    "invoice.paid": "已付金额",
    "invoice.issuedAt": "于 {date} 开具",
    "invoice.dueAt": "于 {date} 到期",
    "invoice.paidAt": "于 {date} 付清",
    "invoice.memo": "备注",
    "invoice.lineItems": "明细项目",
    "invoice.status.issued": "待付款",
    "invoice.status.partially_paid": "部分付款",
    "invoice.status.paid": "已付清",
    "invoice.status.void": "已作废",
    "invoice.status.other": "账单",

    "payment.title": "付款状态",
    "payment.pay": "立即付款",
    "payment.pay.title": "前往付款？",
    "payment.pay.desc": "您将被重定向到我们的安全支付服务商以完成付款。",
    "payment.pay.invoice": "账单",
    "payment.pay.balance": "应付余额",
    "payment.pay.continue": "前往结账",
    "payment.pay.redirecting": "正在重定向到安全结账页面…",
    "payment.pay.error": "无法发起结账，请重试或联系您的服务商。",
    "payment.amount": "请求金额",
    "payment.refunded": "已退款金额",
    "payment.status.processing": "付款处理中",
    "payment.status.paid": "已收到付款",
    "payment.status.refunded": "已退款",
    "payment.status.pending": "等待付款",
    "payment.status.failed": "付款失败",
    "payment.status.other": "付款",
  },
} as const;

type TranslationKey = keyof (typeof translations)["en"];

/** Translation function type. Params accept null/undefined (coerced to ""). */
type TFunc = (key: TranslationKey, params?: Record<string, string | number | null | undefined>) => string;

function makeT(locale: Locale): TFunc {
  const dict = translations[locale] ?? translations.en;
  return (key, params) => {
    let str: string = dict[key] ?? translations.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
      }
    }
    return str;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror CustomerAccessContextDto (Spec §8.2 / @runory/contracts)
// ─────────────────────────────────────────────────────────────────────────----

interface CustomerAccessContext {
  grant: { id: string; expiresAt: string; capabilities: string[] };
  workspace: { name: string };
  customer: { displayName: string };
  quote?: {
    id: string;
    quoteNumber: string;
    title: string;
    status: string;
    currency: string;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
    validUntil: string | null;
    terms: string | null;
    revisionNumber: number;
    acceptedAt: string | null;
    lines: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;
  };
  workOrder?: {
    id: string;
    number: string;
    title: string;
    status: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    completedAt: string | null;
  };
  serviceReports: Array<{
    id: string;
    summary: string | null;
    resolution: string | null;
    completedAt: string | null;
  }>;
  invoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
    currency: string;
    totalMinor: number;
    amountPaidMinor: number;
    balanceDueMinor: number;
    issuedAt: string | null;
    dueAt: string | null;
    paidAt: string | null;
    memo: string | null;
    lines: Array<{
      id: string;
      description: string | null;
      quantity: number | null;
      unitPrice: number | null;
      lineTotal: number;
    }>;
  };
  payment?: {
    requestStatus: string;
    paymentStatus: string | null;
    amountMinor: number;
    refundedAmountMinor: number;
    currency: string;
  };
  availableActions: Array<"quote.accept" | "invoice.pay">;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message: string; code?: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Quote amounts are major units. Invoice / payment amounts are minor units. */
function minorToMajor(minor: number): number {
  return minor / 100;
}

function intlLocale(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}

function formatCurrency(locale: Locale, amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(locale: Locale, value: string | null): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDateTime(locale: Locale, value: string | null): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token / URL helpers
// ─────────────────────────────────────────────────────────────────────────────

function getTokenFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const query = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(query);
  const token = params.get("token");
  return token && token.length > 0 ? token : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status label helpers
// ─────────────────────────────────────────────────────────────────────────────

function quoteStatusLabel(t: TFunc, status: string): string {
  switch (status) {
    case "sent":
      return t("quote.status.awaiting");
    case "accepted":
      return t("quote.status.accepted");
    case "draft":
      return t("quote.status.draft");
    default:
      return t("quote.status.other");
  }
}

function workOrderStatusLabel(t: TFunc, status: string): string {
  switch (status) {
    case "scheduled":
      return t("workOrder.status.scheduled");
    case "in_progress":
    case "in-progress":
      return t("workOrder.status.in_progress");
    case "completed":
      return t("workOrder.status.completed");
    case "cancelled":
    case "canceled":
      return t("workOrder.status.cancelled");
    case "on_hold":
    case "on-hold":
      return t("workOrder.status.on_hold");
    default:
      return t("workOrder.status.other");
  }
}

function invoiceStatusLabel(t: TFunc, status: string): string {
  switch (status) {
    case "issued":
      return t("invoice.status.issued");
    case "partially_paid":
    case "partially-paid":
      return t("invoice.status.partially_paid");
    case "paid":
      return t("invoice.status.paid");
    case "void":
      return t("invoice.status.void");
    default:
      return t("invoice.status.other");
  }
}

function paymentStatusLabel(t: TFunc, payment: CustomerAccessContext["payment"]): string {
  if (!payment) return t("payment.status.pending");
  if (payment.paymentStatus === "refunded" || payment.refundedAmountMinor > 0) {
    return t("payment.status.refunded");
  }
  switch (payment.paymentStatus) {
    case "paid":
    case "succeeded":
    case "completed":
      return t("payment.status.paid");
    case "processing":
    case "pending":
      return t("payment.status.processing");
    case "failed":
    case "canceled":
      return t("payment.status.failed");
    default:
      return t("payment.status.other");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ tone, children }: { tone: "indigo" | "emerald" | "amber" | "slate" | "red"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
    red: "bg-red-50 text-red-700",
  };
  return <span className={`app-badge ${tones[tone]}`}>{children}</span>;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-slate-800">{children}</dd>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  badge,
  children,
  t,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  t: TFunc;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="app-card overflow-hidden" aria-label={title}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t("action.hideDetails") : t("action.viewDetails")}
            className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>
      {open && <div className="px-5 py-4">{children}</div>}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Full-screen state screens
// ─────────────────────────────────────────────────────────────────────────────

function ExchangingScreen({ t }: { t: TFunc }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fc] px-6">
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="size-8 animate-spin text-indigo-600" aria-hidden />
        <div>
          <p className="text-base font-bold text-slate-900">{t("exchanging.title")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("exchanging.desc")}</p>
        </div>
      </div>
    </main>
  );
}

function UnavailableScreen({ t }: { t: TFunc }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fc] px-6 py-12">
      <div role="alert" className="app-card w-full max-w-md p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle className="size-7" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">{t("unavailable.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t("unavailable.desc")}</p>
        <p className="mt-4 text-xs text-slate-400">{t("unavailable.help")}</p>
      </div>
    </main>
  );
}

function RedirectingScreen({ t }: { t: TFunc }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fc] px-6">
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="size-8 animate-spin text-indigo-600" aria-hidden />
        <div>
          <p className="text-base font-bold text-slate-900">{t("payment.pay.redirecting")}</p>
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm: Accept Quote (Spec §10 — show number, revision, amount, currency, validity)
// ─────────────────────────────────────────────────────────────────────────────

function AcceptQuoteDialog({
  context,
  accepting,
  error,
  onConfirm,
  onCancel,
  locale,
  t,
}: {
  context: CustomerAccessContext;
  accepting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  locale: Locale;
  t: TFunc;
}) {
  const quote = context.quote!;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="accept-quote-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="app-card w-full max-w-md p-6 outline-none"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <h2 id="accept-quote-title" className="text-lg font-bold text-slate-900">
            {t("quote.accept.title")}
          </h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">{t("quote.accept.desc")}</p>

        <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          <DetailRow label={t("quote.number")}>{quote.quoteNumber}</DetailRow>
          <DetailRow label={t("quote.revision")}>R{quote.revisionNumber}</DetailRow>
          <DetailRow label={t("quote.amount")}>
            {formatCurrency(locale, quote.grandTotal, quote.currency)}
          </DetailRow>
          <DetailRow label={t("quote.validUntil")}>
            {formatDate(locale, quote.validUntil) ?? t("quote.noValidity")}
          </DetailRow>
        </dl>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="app-button-secondary" disabled={accepting}>
            {t("action.cancel")}
          </button>
          <button type="button" onClick={onConfirm} disabled={accepting} className="app-button-primary">
            {accepting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            {t("quote.accept.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm: Pay Invoice (Spec §10 — show invoice number, balance, currency)
// ─────────────────────────────────────────────────────────────────────────────

function PayInvoiceDialog({
  context,
  requesting,
  error,
  onConfirm,
  onCancel,
  locale,
  t,
}: {
  context: CustomerAccessContext;
  requesting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  locale: Locale;
  t: TFunc;
}) {
  const invoice = context.invoice!;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-invoice-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div ref={dialogRef} tabIndex={-1} className="app-card w-full max-w-md p-6 outline-none">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <CreditCard className="size-5" aria-hidden />
          </span>
          <h2 id="pay-invoice-title" className="text-lg font-bold text-slate-900">
            {t("payment.pay.title")}
          </h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">{t("payment.pay.desc")}</p>

        <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          <DetailRow label={t("payment.pay.invoice")}>{invoice.invoiceNumber}</DetailRow>
          <DetailRow label={t("payment.pay.balance")}>
            {formatCurrency(locale, minorToMajor(invoice.balanceDueMinor), invoice.currency)}
          </DetailRow>
        </dl>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="app-button-secondary" disabled={requesting}>
            {t("action.cancel")}
          </button>
          <button type="button" onClick={onConfirm} disabled={requesting} className="app-button-primary">
            {requesting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
            {t("payment.pay.continue")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Journey cards
// ─────────────────────────────────────────────────────────────────────────────

function QuoteCard({
  context,
  onAccept,
  t,
  locale,
}: {
  context: CustomerAccessContext;
  onAccept: () => void;
  t: TFunc;
  locale: Locale;
}) {
  const quote = context.quote!;
  const canAccept = context.availableActions.includes("quote.accept");
  const isAccepted = quote.status === "accepted" || quote.acceptedAt != null;

  const tone = isAccepted ? "emerald" : canAccept ? "amber" : "slate";

  return (
    <SectionCard
      t={t}
      icon={<FileText className="size-4" aria-hidden />}
      title={t("quote.title")}
      badge={<StatusBadge tone={tone as "emerald" | "amber" | "slate"}>{quoteStatusLabel(t, quote.status)}</StatusBadge>}
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("quote.number")}</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">
            {quote.quoteNumber}
            <span className="ml-2 text-xs font-medium text-slate-400">R{quote.revisionNumber}</span>
          </p>
          {quote.title && <p className="mt-1 text-sm text-slate-600">{quote.title}</p>}
        </div>

        {isAccepted && quote.acceptedAt && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="size-4" aria-hidden />
            {t("quote.acceptedAt", { date: formatDate(locale, quote.acceptedAt) })}
          </p>
        )}

        {quote.lines.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("quote.lineItems")}</p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {quote.lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-700">{line.description}</p>
                    <p className="text-xs text-slate-400">×{line.quantity}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-800">
                    {formatCurrency(locale, line.lineTotal, quote.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
          <DetailRow label={t("quote.subtotal")}>{formatCurrency(locale, quote.subtotal, quote.currency)}</DetailRow>
          {quote.discountTotal > 0 && (
            <DetailRow label={t("quote.discount")}>−{formatCurrency(locale, quote.discountTotal, quote.currency)}</DetailRow>
          )}
          {quote.taxTotal > 0 && (
            <DetailRow label={t("quote.tax")}>{formatCurrency(locale, quote.taxTotal, quote.currency)}</DetailRow>
          )}
          <DetailRow label={t("quote.total")}>
            <span className="text-base">{formatCurrency(locale, quote.grandTotal, quote.currency)}</span>
          </DetailRow>
        </dl>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">{t("quote.validUntil")}</span>
          <span className="font-semibold text-slate-800">{formatDate(locale, quote.validUntil) ?? t("quote.noValidity")}</span>
        </div>

        {quote.terms && (
          <details className="rounded-xl border border-slate-200 bg-slate-50/50">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-slate-600">
              {t("quote.terms")}
            </summary>
            <p className="whitespace-pre-wrap px-3 pb-3 text-sm leading-6 text-slate-600">{quote.terms}</p>
          </details>
        )}

        {canAccept && (
          <button type="button" onClick={onAccept} className="app-button-primary w-full sm:w-auto">
            <CheckCircle2 className="size-4" aria-hidden />
            {t("quote.accept.cta")}
          </button>
        )}
      </div>
    </SectionCard>
  );
}

function WorkOrderCard({
  context,
  t,
  locale,
}: {
  context: CustomerAccessContext;
  t: TFunc;
  locale: Locale;
}) {
  const wo = context.workOrder!;
  const isCompleted = wo.status === "completed";

  const tone = isCompleted ? "emerald" : wo.status === "cancelled" || wo.status === "canceled" ? "red" : "indigo";

  return (
    <SectionCard
      t={t}
      icon={<Wrench className="size-4" aria-hidden />}
      title={t("workOrder.title")}
      badge={<StatusBadge tone={tone as "emerald" | "red" | "indigo"}>{workOrderStatusLabel(t, wo.status)}</StatusBadge>}
    >
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("workOrder.number")}</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{wo.number}</p>
          {wo.title && <p className="mt-1 text-sm text-slate-600">{wo.title}</p>}
        </div>
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
          {wo.scheduledStart && (
            <DetailRow label={t("workOrder.scheduled")}>
              {formatDateTime(locale, wo.scheduledStart)}
              {wo.scheduledEnd ? ` — ${formatDateTime(locale, wo.scheduledEnd)}` : ""}
            </DetailRow>
          )}
          {!wo.scheduledStart && (
            <DetailRow label={t("workOrder.scheduled")}>{t("workOrder.notScheduled")}</DetailRow>
          )}
          {wo.completedAt && (
            <DetailRow label={t("workOrder.completed")}>{formatDateTime(locale, wo.completedAt)}</DetailRow>
          )}
        </dl>
      </div>
    </SectionCard>
  );
}

function ServiceReportsCard({
  context,
  t,
  locale,
}: {
  context: CustomerAccessContext;
  t: TFunc;
  locale: Locale;
}) {
  const reports = context.serviceReports;
  if (reports.length === 0) return null;

  return (
    <SectionCard
      t={t}
      icon={<Receipt className="size-4" aria-hidden />}
      title={t("reports.title")}
      badge={<StatusBadge tone="emerald">{reports.length}</StatusBadge>}
    >
      <ul className="space-y-3">
        {reports.map((report) => (
          <li key={report.id} className="rounded-xl border border-slate-200 p-4">
            {report.summary && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("reports.summary")}</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{report.summary}</p>
              </div>
            )}
            {report.resolution && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("reports.resolution")}</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{report.resolution}</p>
              </div>
            )}
            {report.completedAt && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="size-3.5" aria-hidden />
                {t("reports.completedAt", { date: formatDate(locale, report.completedAt) })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function InvoiceCard({
  context,
  onPay,
  t,
  locale,
}: {
  context: CustomerAccessContext;
  onPay: () => void;
  t: TFunc;
  locale: Locale;
}) {
  const invoice = context.invoice!;
  const canPay = context.availableActions.includes("invoice.pay");
  const isPaid = invoice.status === "paid" || invoice.balanceDueMinor <= 0;

  const tone = isPaid ? "emerald" : canPay ? "amber" : invoice.status === "void" ? "slate" : "indigo";

  return (
    <SectionCard
      t={t}
      icon={<Receipt className="size-4" aria-hidden />}
      title={t("invoice.title")}
      badge={<StatusBadge tone={tone as "emerald" | "amber" | "slate" | "indigo"}>{invoiceStatusLabel(t, invoice.status)}</StatusBadge>}
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("invoice.number")}</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{invoice.invoiceNumber}</p>
        </div>

        {invoice.lines.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("invoice.lineItems")}</p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {invoice.lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-700">{line.description ?? "—"}</p>
                    {line.quantity != null && <p className="text-xs text-slate-400">×{line.quantity}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-800">
                    {formatCurrency(locale, minorToMajor(line.lineTotal), invoice.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
          <DetailRow label={t("invoice.total")}>{formatCurrency(locale, minorToMajor(invoice.totalMinor), invoice.currency)}</DetailRow>
          {invoice.amountPaidMinor > 0 && (
            <DetailRow label={t("invoice.paid")}>{formatCurrency(locale, minorToMajor(invoice.amountPaidMinor), invoice.currency)}</DetailRow>
          )}
          <DetailRow label={t("invoice.balance")}>
            <span className="text-base">{formatCurrency(locale, minorToMajor(invoice.balanceDueMinor), invoice.currency)}</span>
          </DetailRow>
        </dl>

        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:justify-between">
          {invoice.issuedAt && (
            <span className="text-slate-500">{t("invoice.issuedAt", { date: formatDate(locale, invoice.issuedAt) })}</span>
          )}
          {invoice.dueAt && !isPaid && (
            <span className="text-slate-500">{t("invoice.dueAt", { date: formatDate(locale, invoice.dueAt) })}</span>
          )}
          {invoice.paidAt && isPaid && (
            <span className="font-semibold text-emerald-700">{t("invoice.paidAt", { date: formatDate(locale, invoice.paidAt) })}</span>
          )}
        </div>

        {invoice.memo && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{invoice.memo}</p>
        )}

        {canPay && (
          <button type="button" onClick={onPay} className="app-button-primary w-full sm:w-auto">
            <CreditCard className="size-4" aria-hidden />
            {t("payment.pay")}
          </button>
        )}
      </div>
    </SectionCard>
  );
}

function PaymentStatusCard({
  context,
  t,
  locale,
}: {
  context: CustomerAccessContext;
  t: TFunc;
  locale: Locale;
}) {
  const payment = context.payment!;
  const label = paymentStatusLabel(t, payment);
  const isPaid = payment.paymentStatus === "paid" || payment.paymentStatus === "succeeded" || payment.paymentStatus === "completed";
  const isRefunded = payment.paymentStatus === "refunded" || payment.refundedAmountMinor > 0;
  const tone = isRefunded ? "amber" : isPaid ? "emerald" : "indigo";

  return (
    <SectionCard
      t={t}
      icon={<CreditCard className="size-4" aria-hidden />}
      title={t("payment.title")}
      badge={<StatusBadge tone={tone as "amber" | "emerald" | "indigo"}>{label}</StatusBadge>}
    >
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
        <DetailRow label={t("payment.amount")}>
          {formatCurrency(locale, minorToMajor(payment.amountMinor), payment.currency)}
        </DetailRow>
        {payment.refundedAmountMinor > 0 && (
          <DetailRow label={t("payment.refunded")}>
            {formatCurrency(locale, minorToMajor(payment.refundedAmountMinor), payment.currency)}
          </DetailRow>
        )}
      </dl>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

type Phase = "exchanging" | "unavailable" | "ready";

export default function CustomerAccessPage() {
  const { locale } = useI18n();
  const t = makeT(locale);

  const [phase, setPhase] = useState<Phase>("exchanging");
  const [context, setContext] = useState<CustomerAccessContext | null>(null);
  const [checkoutReturn, setCheckoutReturn] = useState<"returned" | "cancelled" | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Accept-quote modal
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptSuccess, setAcceptSuccess] = useState(false);

  // Pay-invoice modal
  const [payOpen, setPayOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [loggingOut, setLoggingOut] = useState(false);

  const loadContext = useCallback(async (): Promise<CustomerAccessContext | null> => {
    try {
      const json = await apiFetch<ApiResponse<CustomerAccessContext>>("/api/customer-access/context", {
        cache: "no-store",
      });
      if (json.success && json.data) {
        setContext(json.data);
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Initial mount: token exchange + context fetch + checkout return handling.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Stripe return handling (?checkout=returned | cancelled)
      const searchParams = new URLSearchParams(window.location.search);
      const checkoutParam = searchParams.get("checkout");
      if (checkoutParam === "returned" || checkoutParam === "cancelled") {
        setCheckoutReturn(checkoutParam);
        // Clean the URL — remove the query param.
        searchParams.delete("checkout");
        const remaining = searchParams.toString();
        const cleanUrl =
          window.location.pathname + (remaining ? `?${remaining}` : "") + window.location.hash;
        window.history.replaceState(null, "", cleanUrl);
      }

      // 2. Check hash for a token (#token=...)
      const token = getTokenFromHash();

      if (token) {
        setPhase("exchanging");
        try {
          await apiPost<ApiResponse<unknown>>("/api/customer-access/exchange", { token });
          if (cancelled) return;
          // Token consumed — clear the fragment so it is not visible / shared.
          if (window.location.hash) {
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
          }
        } catch {
          if (!cancelled) setPhase("unavailable");
          return;
        }
      }

      if (cancelled) return;

      // 3. Fetch context (no token → relies on existing session cookie).
      const ctx = await loadContext();
      if (cancelled) return;
      if (ctx) {
        setPhase("ready");
      } else {
        setPhase("unavailable");
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [loadContext]);

  // Auto-dismiss the checkout-return notice after a few seconds.
  useEffect(() => {
    if (!checkoutReturn) return;
    const timer = window.setTimeout(() => setCheckoutReturn(null), 6000);
    return () => window.clearTimeout(timer);
  }, [checkoutReturn]);

  // ── Actions ──

  const handleAcceptQuote = useCallback(async () => {
    if (!context?.quote) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      await apiPost<ApiResponse<unknown>>(
        `/api/customer-access/quotes/${context.quote.id}/accept`,
      );
      setAccepting(false);
      setAcceptOpen(false);
      setAcceptSuccess(true);
      window.setTimeout(() => setAcceptSuccess(false), 6000);
      await loadContext();
    } catch {
      setAccepting(false);
      setAcceptError(t("quote.accept.error"));
    }
  }, [context, loadContext, t]);

  const handleCheckout = useCallback(async () => {
    if (!context?.invoice) return;
    setRequesting(true);
    setPayError(null);
    try {
      const json = await apiPost<ApiResponse<{ checkoutUrl: string }>>(
        `/api/customer-access/invoices/${context.invoice.id}/checkout`,
      );
      const checkoutUrl = json.data?.checkoutUrl;
      if (!checkoutUrl) {
        throw new Error("No checkout URL returned");
      }
      setRequesting(false);
      setPayOpen(false);
      setRedirecting(true);
      // Redirect to hosted Stripe Checkout.
      window.location.href = checkoutUrl;
    } catch {
      setRequesting(false);
      setPayError(t("payment.pay.error"));
    }
  }, [context, t]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await apiPost<ApiResponse<unknown>>("/api/customer-access/session/logout");
    } catch {
      // Ignore — clear client state regardless.
    }
    setContext(null);
    setPhase("unavailable");
    setLoggingOut(false);
  }, []);

  // ── Render ──

  if (redirecting) {
    return <RedirectingScreen t={t} />;
  }

  if (phase === "exchanging") {
    return <ExchangingScreen t={t} />;
  }

  if (phase === "unavailable" || !context) {
    return <UnavailableScreen t={t} />;
  }

  const showQuote = !!context.quote;
  const showWorkOrder = !!context.workOrder;
  const showReports = context.serviceReports.length > 0;
  const showInvoice = !!context.invoice;
  const showPayment = !!context.payment;

  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-slate-950 font-bold text-white">R</div>
            <span className="text-base font-bold tracking-tight text-slate-950">{t("brand")}</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
          >
            {loggingOut ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
            <span className="hidden sm:inline">{t("action.logout")}</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        {/* Greeting */}
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950">
              {context.customer.displayName
                ? t("greeting", { name: context.customer.displayName })
                : t("greeting.fallback")}
            </h1>
            <p className="mt-0.5 text-sm text-slate-600">
              <span className="font-medium text-slate-500">{t("provider.label")}:</span>{" "}
              <span className="font-semibold text-slate-700">{context.workspace.name}</span>
            </p>
          </div>
        </div>

        {/* Checkout return notice (state 9) */}
        {checkoutReturn === "returned" && (
          <div
            role="status"
            aria-live="polite"
            className="mt-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {t("checkout.returned")}
          </div>
        )}
        {checkoutReturn === "cancelled" && (
          <div
            role="status"
            aria-live="polite"
            className="mt-6 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <Info className="size-4 shrink-0" aria-hidden />
            {t("checkout.cancelled")}
          </div>
        )}

        {/* Accept-quote success notice */}
        {acceptSuccess && (
          <div
            role="status"
            aria-live="polite"
            className="mt-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {t("quote.accept.success")}
          </div>
        )}

        {/* Journey cards */}
        <div className="mt-8 space-y-5">
          {showQuote && (
            <QuoteCard context={context} onAccept={() => { setAcceptError(null); setAcceptOpen(true); }} t={t} locale={locale} />
          )}
          {showWorkOrder && <WorkOrderCard context={context} t={t} locale={locale} />}
          {showReports && <ServiceReportsCard context={context} t={t} locale={locale} />}
          {showInvoice && (
            <InvoiceCard context={context} onPay={() => { setPayError(null); setPayOpen(true); }} t={t} locale={locale} />
          )}
          {showPayment && <PaymentStatusCard context={context} t={t} locale={locale} />}
        </div>

        {/* Session footer */}
        <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t("page.secured")}
          {context.grant.expiresAt && (
            <>
              <span className="mx-1">·</span>
              <CalendarClock className="size-3.5" aria-hidden />
              {t("session.expires", { time: formatDateTime(locale, context.grant.expiresAt) })}
            </>
          )}
        </p>
      </div>

      {/* Modals */}
      {acceptOpen && context.quote && (
        <AcceptQuoteDialog
          context={context}
          accepting={accepting}
          error={acceptError}
          onConfirm={handleAcceptQuote}
          onCancel={() => { setAcceptOpen(false); setAcceptError(null); }}
          locale={locale}
          t={t}
        />
      )}
      {payOpen && context.invoice && (
        <PayInvoiceDialog
          context={context}
          requesting={requesting}
          error={payError}
          onConfirm={handleCheckout}
          onCancel={() => { setPayOpen(false); setPayError(null); }}
          locale={locale}
          t={t}
        />
      )}
    </main>
  );
}
