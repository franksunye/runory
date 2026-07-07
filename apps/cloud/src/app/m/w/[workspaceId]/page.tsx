"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  RefreshCw, Clock3, AlertTriangle, CheckCircle2, Loader2,
  Gavel, ListChecks, FileText, ChevronRight, Inbox,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import type { MyWorkItem } from "@/lib/api-hooks";

export const dynamic = "force-dynamic";

// ── Badge / icon maps ──

const KIND_ICON: Record<string, typeof Gavel> = {
  approval: Gavel,
  human_task: ListChecks,
  form: FileText,
};

const KIND_BADGE: Record<string, string> = {
  approval: "bg-amber-50 text-amber-700",
  human_task: "bg-blue-50 text-blue-700",
  form: "bg-purple-50 text-purple-700",
};

const STATUS_BADGE: Record<string, string> = {
  ready: "bg-slate-100 text-slate-700",
  active: "bg-green-50 text-green-700",
  completed: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-50 text-red-600",
};

const KIND_LABEL_KEY: Record<string, MessageKey> = {
  approval: "myWork.kindApproval",
  human_task: "myWork.kindHumanTask",
  form: "myWork.kindForm",
};

const STATUS_LABEL_KEY: Record<string, MessageKey> = {
  ready: "myWork.statusReady",
  active: "myWork.statusClaimed",
  completed: "myWork.statusCompleted",
  cancelled: "myWork.statusCompleted",
};

const SUBJECT_LABEL: Record<string, string> = {
  quote: "Quote",
  work_order: "Work Order",
  service_visit: "Visit",
  service_report: "Report",
};

function mobileSubjectRoute(workspaceId: string, item: MyWorkItem): string {
  if (item.subject_type === "service_visit" && item.subject_id) {
    return `/m/w/${workspaceId}/visits/${item.subject_id}`;
  }
  if (item.subject_type === "work_order" && item.subject_id) {
    return `/w/${workspaceId}/work-orders/${item.subject_id}`;
  }
  if (item.subject_type === "quote" && item.subject_id) {
    return `/w/${workspaceId}/quotes/${item.subject_id}`;
  }
  return `/m/w/${workspaceId}/work/${item.id}`;
}

// ── Helpers ──

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

function formatDueDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Page ──

export default function MobileTodayPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileTodayPage />
    </Suspense>
  );
}

function MobileTodayPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const { t } = useI18n();

  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
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
        // Per v0.5.1 Spec §6: use cursor-based pagination, not full download
        const params = new URLSearchParams();
        if (isRefresh) {
          // Fresh load — no cursor, reset state
          setCursor(null);
        } else if (cursor) {
          params.set("cursor", cursor);
        }
        const res = await fetch(
          `/api/workspaces/${workspaceId}/my-work?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error?.message ?? t("mobile.errorOccurred"));
        }
        const newItems = json.data?.items ?? [];
        if (isRefresh || !cursor) {
          setItems(newItems);
        } else {
          setItems((prev) => [...prev, ...newItems]);
        }
        setHasMore(!!json.data?.nextCursor);
        setCursor(json.data?.nextCursor ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("mobile.errorOccurred"));
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [workspaceId, cursor, t]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    void load(false);
  }, [hasMore, loadingMore, load]);

  const overdueCount = items.filter(
    (i) => isOverdue(i.due_at) && i.status !== "completed"
  ).length;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{t("mobile.todayTitle")}</h1>
            <p className="mt-0.5 text-xs text-slate-400">
              {t("mobile.todaySubtitle", { count: items.length })}
              {overdueCount > 0 && (
                <span className="ml-1.5 font-semibold text-red-600">
                  ({overdueCount} {t("myWork.statusOverdue").toLowerCase()})
                </span>
              )}
            </p>
          </div>
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
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.retry")}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">{t("mobile.todayEmpty")}</p>
            <p className="mt-1 text-xs text-slate-400">{t("mobile.todayEmptyHint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const KindIcon = KIND_ICON[item.kind] ?? ListChecks;
              const overdue = isOverdue(item.due_at) && item.status !== "completed";
              const isOperational = item.instance_id === "operational" || Boolean(item.operational_source);
              const kindBadge = KIND_BADGE[item.kind] ?? "bg-slate-100 text-slate-600";
              const statusBadge = STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600";
              const kindLabelKey = KIND_LABEL_KEY[item.kind] ?? "myWork.kindHumanTask";
              const statusLabelKey = STATUS_LABEL_KEY[item.status] ?? "myWork.statusReady";

              return (
                <button
                  key={item.id}
                  onClick={() => router.push(isOperational ? mobileSubjectRoute(workspaceId, item) : `/m/w/${workspaceId}/work/${item.id}`)}
                  className={`flex w-full items-start gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition active:scale-[0.98] ${
                    overdue ? "border-red-200" : "border-slate-200"
                  }`}
                >
                  {/* Kind icon */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${kindBadge}`}
                  >
                    <KindIcon size={18} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${kindBadge}`}>
                        {t(kindLabelKey)}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge}`}>
                        {overdue ? t("myWork.statusOverdue") : t(statusLabelKey)}
                      </span>
                      {item.subject_type && (
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {SUBJECT_LABEL[item.subject_type] ?? item.subject_type}
                        </span>
                      )}
                    </div>

                    {item.title && (
                      <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">
                        {item.title}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {item.due_at && (
                        <span
                          className={`flex items-center gap-1 ${overdue ? "font-semibold text-red-600" : ""}`}
                        >
                          <Clock3 size={12} />
                          {formatDueDate(item.due_at)}
                        </span>
                      )}
                      {item.assignee_id && (
                        <span className="flex items-center gap-1">
                          <Inbox size={12} />
                          {item.assignee_type === "permission_group"
                            ? item.assignee_id.replace(/_/g, " ")
                            : item.assignee_id}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Chevron */}
                  <ChevronRight size={18} className="mt-1 shrink-0 text-slate-300" />
                </button>
              );
            })}

            {/* Load More button — cursor pagination */}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore ? t("mobile.loading") : t("mobile.loadMore")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
