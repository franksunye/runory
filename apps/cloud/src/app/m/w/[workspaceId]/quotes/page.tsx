"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { WorkspaceRecord } from "@/lib/api-hooks";
import { apiFetch } from "@/lib/api-fetch";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  review: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  sent: "bg-blue-50 text-blue-700",
  accepted: "bg-green-50 text-green-700",
  returned: "bg-purple-50 text-purple-700",
  rejected: "bg-red-50 text-red-600",
  expired: "bg-slate-100 text-slate-500",
};

function titleize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMoney(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function MobileQuotesPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileQuotesPage />
    </Suspense>
  );
}

function MobileQuotesPage() {
  const workspaceId = useParams().workspaceId as string;
  const { t } = useI18n();

  const [records, setRecords] = useState<WorkspaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const params = new URLSearchParams({ limit: "50" });
        if (debouncedSearch) params.set("search", debouncedSearch);
        const json = await apiFetch<{
          success: boolean;
          error?: { message: string };
          data?: WorkspaceRecord[];
        }>(
          `/api/workspaces/${workspaceId}/objects/quote/records?${params.toString()}`,
          { cache: "no-store" }
        );
        if (!json.success) throw new Error(json.error?.message ?? t("mobile.errorOccurred"));
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

  const hasSearch = useMemo(() => debouncedSearch.length > 0, [debouncedSearch]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Quotes</h1>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
            aria-label={t("workspace.refresh")}
          >
            {refreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>

        <div className="relative mt-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotes"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-slate-400 active:bg-slate-200"
              aria-label={t("workspace.clearSearch")}
            >
              <X size={16} />
            </button>
          )}
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
            <AlertTriangle size={28} className="text-red-400" />
            <p className="text-center text-sm text-red-600">{error}</p>
            <button
              onClick={() => void load()}
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.retry")}
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <FileText size={32} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {hasSearch ? "No matching quotes" : "No quotes yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => {
              const id = String(record.id ?? record._id ?? "");
              const title = String(record.title ?? record.name ?? record.quote_number ?? id.slice(0, 12) ?? "—");
              const status = String(record.status ?? "draft");
              const statusBadge = STATUS_BADGE[status] ?? "bg-slate-100 text-slate-600";
              const total = formatMoney(record.total_amount ?? record.amount ?? record.grand_total);
              const validUntil = String(record.valid_until ?? record.expires_at ?? "");

              return (
                <article
                  key={id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-bold text-slate-900">{title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge}`}>
                          {titleize(status)}
                        </span>
                        {total && <span className="text-xs font-semibold text-slate-700">{total}</span>}
                      </div>
                      {validUntil && (
                        <p className="mt-1 text-xs text-slate-400">Valid until {validUntil}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300" />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
