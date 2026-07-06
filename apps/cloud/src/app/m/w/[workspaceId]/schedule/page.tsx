"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Clock, MapPin, Calendar, RefreshCw, Loader2, AlertTriangle,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import type { PlanningEntry } from "@/lib/api-hooks";

export const dynamic = "force-dynamic";

// ── Status styling ──

type StatusBucket = "scheduled" | "in_progress" | "completed" | "cancelled";

interface StatusStyle {
  bar: string;
  badge: string;
  labelKey: MessageKey;
}

const STATUS_STYLE: Record<StatusBucket, StatusStyle> = {
  scheduled: {
    bar: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700",
    labelKey: "planning.statusScheduled",
  },
  in_progress: {
    bar: "bg-green-500",
    badge: "bg-green-50 text-green-700",
    labelKey: "planning.statusInProgress",
  },
  completed: {
    bar: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600",
    labelKey: "planning.statusCompleted",
  },
  cancelled: {
    bar: "bg-red-500",
    badge: "bg-red-50 text-red-600",
    labelKey: "planning.statusCancelled",
  },
};

function statusBucket(status: string): StatusBucket {
  switch (status) {
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    case "in_progress": return "in_progress";
    case "scheduled":
    case "confirmed":
    case "tentative":
    default: return "scheduled";
  }
}

// ── Date helpers ──

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── API normalization (handles both camelCase and snake_case) ──

interface PlanningEntryRaw {
  id: string;
  workspace_id?: string;
  workspaceId?: string;
  resource_id?: string;
  resourceId?: string;
  subject_type?: string;
  subjectType?: string;
  subject_id?: string;
  subjectId?: string;
  start_at?: string;
  startAt?: string;
  end_at?: string;
  endAt?: string;
  status: string;
  notes?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  resource_name?: string | null;
  resourceName?: string | null;
  resource_type?: string | null;
  resourceType?: string | null;
  subject_name?: string | null;
  subjectName?: string | null;
}

function normalizeEntry(raw: PlanningEntryRaw): PlanningEntry {
  const r = raw ?? {};
  return {
    id: r.id,
    workspace_id: r.workspace_id ?? r.workspaceId ?? "",
    resource_id: r.resource_id ?? r.resourceId ?? "",
    subject_type: r.subject_type ?? r.subjectType ?? "",
    subject_id: r.subject_id ?? r.subjectId ?? "",
    start_at: r.start_at ?? r.startAt ?? "",
    end_at: r.end_at ?? r.endAt ?? "",
    status: r.status,
    notes: r.notes ?? null,
    created_at: r.created_at ?? r.createdAt ?? "",
    updated_at: r.updated_at ?? r.updatedAt ?? "",
    resource_name: r.resource_name ?? r.resourceName ?? undefined,
    resource_type: r.resource_type ?? r.resourceType ?? undefined,
    subject_name: r.subject_name ?? r.subjectName ?? undefined,
  };
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── Page ──

export default function MobileSchedulePageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileSchedulePage />
    </Suspense>
  );
}

function MobileSchedulePage() {
  const workspaceId = useParams().workspaceId as string;
  const { t, locale } = useI18n();

  const [entries, setEntries] = useState<PlanningEntry[]>([]);
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
        const now = new Date();
        const params = new URLSearchParams({
          from: startOfDay(now).toISOString(),
          to: endOfDay(now).toISOString(),
        });
        const res = await fetch(
          `/api/workspaces/${workspaceId}/planning/entries?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error?.message ?? t("mobile.errorOccurred"));
        }
        const raw: PlanningEntryRaw[] = json.data?.entries ?? [];
        setEntries(raw.map(normalizeEntry));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("mobile.errorOccurred"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const todayLabel = new Date().toLocaleDateString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{t("mobile.scheduleTitle")}</h1>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <Calendar size={12} />
              {todayLabel}
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
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <Calendar size={32} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">{t("mobile.scheduleNoEntries")}</p>
            <p className="mt-1 text-xs text-slate-400">{t("mobile.scheduleNoEntriesHint")}</p>
          </div>
        ) : (
          /* Timeline list */
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute bottom-0 left-[7px] top-2 w-0.5 bg-slate-200" />

            <ol className="space-y-4">
              {entries.map((entry) => {
                const style = STATUS_STYLE[statusBucket(entry.status)];
                const subjectLabel =
                  entry.subject_name ??
                  (entry.subject_id ? entry.subject_id.slice(0, 8) : "—");

                return (
                  <li key={entry.id} className="relative pl-8">
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-white ${style.bar}`}
                    />

                    {/* Card */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="min-w-0 flex-1 text-sm font-bold text-slate-900">
                          {subjectLabel}
                        </h3>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}
                        >
                          {t(style.labelKey)}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatTime(entry.start_at)}–{formatTime(entry.end_at)}
                        </span>
                        {entry.resource_name && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} />
                            {entry.resource_name}
                          </span>
                        )}
                      </div>

                      {entry.notes && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
