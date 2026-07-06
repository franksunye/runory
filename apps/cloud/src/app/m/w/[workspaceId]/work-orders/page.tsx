"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Search, ClipboardList, RefreshCw, Loader2, AlertTriangle,
  ChevronRight, X,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { WorkspaceRecord } from "@/lib/api-hooks";

export const dynamic = "force-dynamic";

// ── Work Order status badge map ──

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  triaged: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  blocked: "bg-red-50 text-red-600",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  triaged: "Triaged",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
  open: "Open",
};

// ── Page ──

export default function MobileWorkOrdersPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileWorkOrdersPage />
    </Suspense>
  );
}

function MobileWorkOrdersPage() {
  const workspaceId = useParams().workspaceId as string;
  const { t } = useI18n();

  const [records, setRecords] = useState<WorkspaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        params.set("limit", "50");
        const res = await fetch(
          `/api/workspaces/${workspaceId}/objects/work_order/records?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error?.message ?? t("mobile.errorOccurred"));
        }
        setRecords(Array.isArray(json.data) ? json.data : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("mobile.errorOccurred"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, debouncedSearch, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const workOrderHref = useCallback(
    (recordId: string) => `/w/${workspaceId}/work-orders/${recordId}`,
    [workspaceId]
  );

  const hasSearch = useMemo(() => debouncedSearch.length > 0, [debouncedSearch]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">{t("mobile.workOrdersTitle")}</h1>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
            aria-label={t("workspace.refresh")}
          >
            {refreshing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
          </button>
        </div>

        {/* Search bar */}
        <div className="relative mt-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("mobile.workOrdersSearch")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 active:bg-slate-200"
              aria-label={t("workspace.clearSearch")}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-slate-400" />
            <p className="mt-3 text-xs text-slate-400">{t("mobile.loading")}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <AlertTriangle size={28} className="text-red-400" />
            <p className="text-center text-sm text-red-600">{error}</p>
            <button
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.retry")}
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <ClipboardList size={32} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">{t("mobile.workOrdersEmpty")}</p>
            <p className="mt-1 text-xs text-slate-400">{t("mobile.workOrdersEmptyHint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => {
              const id = String(record.id ?? record._id ?? "");
              const title = String(record.title ?? record.name ?? (id.slice(0, 12) || "—"));
              const status = String(record.status ?? "draft");
              const statusBadge = STATUS_BADGE[status] ?? "bg-slate-100 text-slate-600";
              const statusLabel = STATUS_LABEL[status] ?? status;
              const customer = String(record.customer_name ?? record.company_name ?? record.customer ?? "");
              const site = String(record.site_name ?? record.service_site_name ?? record.site ?? "");
              const technician = String(record.technician_name ?? record.assigned_technician ?? record.technician ?? "");

              return (
                <a
                  key={id}
                  href={workOrderHref(id)}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 text-sm font-bold text-slate-900">
                      {title}
                    </h3>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  {(customer || site || technician) && (
                    <dl className="mt-2 space-y-1 text-xs text-slate-500">
                      {customer && (
                        <div className="flex items-center gap-1.5">
                          <dt className="shrink-0 text-slate-400">{t("mobile.workOrderCustomer")}:</dt>
                          <dd className="min-w-0 truncate font-medium text-slate-600">{customer}</dd>
                        </div>
                      )}
                      {site && (
                        <div className="flex items-center gap-1.5">
                          <dt className="shrink-0 text-slate-400">{t("mobile.workOrderSite")}:</dt>
                          <dd className="min-w-0 truncate font-medium text-slate-600">{site}</dd>
                        </div>
                      )}
                      {technician && (
                        <div className="flex items-center gap-1.5">
                          <dt className="shrink-0 text-slate-400">{t("mobile.workOrderTechnician")}:</dt>
                          <dd className="min-w-0 truncate font-medium text-slate-600">{technician}</dd>
                        </div>
                      )}
                    </dl>
                  )}

                  <div className="mt-2 flex items-center justify-end">
                    <ChevronRight size={16} className="text-slate-300" />
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
