"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  User,
  Wrench,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch } from "@/lib/api-fetch";

export const dynamic = "force-dynamic";

type RecordValue = string | number | boolean | null;
type BusinessRecord = Record<string, RecordValue>;

interface WorkOrderContext {
  customer: BusinessRecord | null;
  contact: BusinessRecord | null;
  site: BusinessRecord | null;
  asset: BusinessRecord | null;
  technician: BusinessRecord | null;
  visits: BusinessRecord[];
  reports: BusinessRecord[];
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  planned: "bg-blue-50 text-blue-700",
  triaged: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  blocked: "bg-red-50 text-red-600",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-600",
  reopened: "bg-purple-50 text-purple-700",
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-50 text-blue-700",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-600",
};

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function pickFirst(...values: unknown[]): string {
  for (const value of values) {
    const s = str(value).trim();
    if (s) return s;
  }
  return "";
}

function titleize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(iso: unknown): string {
  const value = str(iso);
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchRecordOrNull(
  workspaceId: string,
  objectKey: string,
  recordId: unknown
): Promise<BusinessRecord | null> {
  const id = str(recordId);
  if (!id) return null;
  try {
    const json = await apiFetch<{ success: boolean; data?: BusinessRecord | null }>(
      `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    return json.success ? json.data ?? null : null;
  } catch {
    return null;
  }
}

async function fetchRecords(
  workspaceId: string,
  objectKey: string
): Promise<BusinessRecord[]> {
  try {
    const json = await apiFetch<{ success: boolean; data?: BusinessRecord[] }>(
      `/api/workspaces/${workspaceId}/objects/${objectKey}/records?limit=100`,
      { cache: "no-store" }
    );
    return json.success && Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

async function loadWorkOrderContext(
  workspaceId: string,
  workOrderId: string,
  workOrder: BusinessRecord | null
): Promise<WorkOrderContext> {
  if (!workOrder) {
    return {
      customer: null,
      contact: null,
      site: null,
      asset: null,
      technician: null,
      visits: [],
      reports: [],
    };
  }

  const [customer, contact, site, asset, technician, allVisits, allReports] =
    await Promise.all([
      fetchRecordOrNull(workspaceId, "company", workOrder.company_id),
      fetchRecordOrNull(workspaceId, "contact", workOrder.contact_id),
      fetchRecordOrNull(workspaceId, "service_site", workOrder.service_site_id),
      fetchRecordOrNull(workspaceId, "asset", workOrder.asset_id),
      fetchRecordOrNull(workspaceId, "technician", workOrder.technician_id),
      fetchRecords(workspaceId, "service_visit"),
      fetchRecords(workspaceId, "service_report"),
    ]);

  return {
    customer,
    contact,
    site,
    asset,
    technician,
    visits: allVisits.filter((visit) => str(visit.work_order_id) === workOrderId),
    reports: allReports.filter((report) => str(report.work_order_id) === workOrderId),
  };
}

export default function MobileWorkOrderDetailPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileWorkOrderDetailPage />
    </Suspense>
  );
}

function MobileWorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const workspaceId = params.workspaceId as string;
  const workOrderId = params.workOrderId as string;

  const [workOrder, setWorkOrder] = useState<BusinessRecord | null>(null);
  const [context, setContext] = useState<WorkOrderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const json = await apiFetch<{ success: boolean; error?: { message: string }; data?: BusinessRecord | null }>(
          `/api/workspaces/${workspaceId}/objects/work_order/records/${encodeURIComponent(workOrderId)}`,
          { cache: "no-store" }
        );
        if (!json.success) {
          throw new Error(json.error?.message ?? t("mobile.errorOccurred"));
        }
        const record = json.data ?? null;
        setWorkOrder(record);
        setContext(await loadWorkOrderContext(workspaceId, workOrderId, record));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("mobile.errorOccurred"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, workOrderId, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const status = str(workOrder?.status || "draft");
  const priority = str(workOrder?.priority || "normal");
  const statusBadge = STATUS_BADGE[status] ?? "bg-slate-100 text-slate-600";
  const priorityBadge = PRIORITY_BADGE[priority] ?? "bg-slate-100 text-slate-600";

  const title = pickFirst(workOrder?.title, workOrder?.name, workOrderId);
  const customerName = pickFirst(context?.customer?.name, workOrder?.company_name, workOrder?.customer_name);
  const contactName = pickFirst(context?.contact?.name, context?.contact?.full_name, workOrder?.contact_name);
  const phone = pickFirst(context?.contact?.phone, context?.contact?.mobile, context?.contact?.phone_number);
  const email = pickFirst(context?.contact?.email);
  const siteName = pickFirst(context?.site?.name, workOrder?.site_name, workOrder?.service_site_name);
  const address = pickFirst(context?.site?.address, context?.site?.street_address, workOrder?.address);
  const assetName = pickFirst(context?.asset?.name, context?.asset?.asset_number, workOrder?.asset_name);
  const technicianName = pickFirst(context?.technician?.name, context?.technician?.full_name, workOrder?.technician_name);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-slate-900">
              Work Order
            </h1>
            <p className="truncate text-xs text-slate-400">{title}</p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
            aria-label={t("workspace.refresh")}
          >
            {refreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-slate-400" />
            <p className="mt-3 text-xs text-slate-400">{t("mobile.loading")}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-center text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.retry")}
            </button>
          </div>
        ) : !workOrder ? (
          <div className="flex flex-col items-center justify-center py-20">
            <AlertTriangle size={28} className="text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-600">Work order not found</p>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold leading-snug text-slate-900">{title}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge}`}>
                      {titleize(status)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityBadge}`}>
                      {titleize(priority)}
                    </span>
                  </div>
                </div>
                {status === "completed" && <CheckCircle2 size={22} className="shrink-0 text-green-500" />}
              </div>

              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <Calendar size={16} className="text-slate-400" />
                  <span>{formatDateTime(workOrder.scheduled_start ?? workOrder.requested_at ?? workOrder.sla_due_at)}</span>
                </div>
                {technicianName && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <User size={16} className="text-slate-400" />
                    <span>{technicianName}</span>
                  </div>
                )}
              </dl>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Building2 size={16} className="text-slate-400" />
                Customer & Site
              </h3>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                {customerName && <p className="font-semibold text-slate-800">{customerName}</p>}
                {contactName && (
                  <p className="flex items-center gap-2">
                    <User size={14} className="text-slate-400" />
                    {contactName}
                  </p>
                )}
                {phone && (
                  <a href={`tel:${phone}`} className="flex min-h-[32px] items-center gap-2 text-indigo-600">
                    <Phone size={14} />
                    {phone}
                  </a>
                )}
                {email && (
                  <a href={`mailto:${email}`} className="flex min-h-[32px] items-center gap-2 text-indigo-600">
                    <Mail size={14} />
                    {email}
                  </a>
                )}
                {siteName && (
                  <p className="flex items-center gap-2">
                    <MapPin size={14} className="text-slate-400" />
                    {siteName}
                  </p>
                )}
                {address && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">{address}</p>}
              </div>
            </section>

            {assetName && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Wrench size={16} className="text-slate-400" />
                  Asset
                </h3>
                <p className="mt-2 text-sm font-semibold text-slate-700">{assetName}</p>
              </section>
            )}

            {context?.visits.length ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Clock size={16} className="text-slate-400" />
                  Visits
                </h3>
                <div className="mt-3 divide-y divide-slate-100">
                  {context.visits.map((visit) => {
                    const visitId = str(visit.id);
                    const visitTitle = pickFirst(visit.title, visit.name, visitId);
                    return (
                      <Link
                        key={visitId}
                        href={`/m/w/${workspaceId}/visits/${encodeURIComponent(visitId)}`}
                        className="flex items-center gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">{visitTitle}</p>
                          <p className="text-xs text-slate-400">{formatDateTime(visit.scheduled_start)}</p>
                        </div>
                        <ChevronRight size={16} className="text-slate-300" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {context?.reports.length ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <FileText size={16} className="text-slate-400" />
                  Service Reports
                </h3>
                <div className="mt-3 space-y-3">
                  {context.reports.map((report) => {
                    const reportId = str(report.id);
                    const summary = pickFirst(report.summary, report.resolution, report.title, "Service report");
                    return (
                      <article key={reportId} className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-sm font-semibold text-slate-800">{summary}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatDateTime(report.completed_at)}</p>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
