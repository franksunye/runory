"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Calendar,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import type { PlanningEntry } from "@/lib/api-hooks";

// ── Constants ──

const HOUR_START = 7; // 07:00
const HOUR_END = 21; // 21:00 (exclusive upper bound)
const HOUR_HEIGHT = 48; // px per hour
const GRID_HEIGHT = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

// ── Status styling ──

type StatusBucket = "scheduled" | "in_progress" | "completed" | "cancelled";

interface StatusStyle {
  block: string; // background + text color for entry block
  border: string; // border color
  accent: string; // left accent border color
  bar: string; // solid color bar (timeline)
  badge: string; // app-badge classes
  labelKey: MessageKey;
}

const STATUS_STYLE: Record<StatusBucket, StatusStyle> = {
  scheduled: {
    block: "bg-blue-50 text-blue-900",
    border: "border-blue-300",
    accent: "border-l-blue-500",
    bar: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700",
    labelKey: "planning.statusScheduled",
  },
  in_progress: {
    block: "bg-green-50 text-green-900",
    border: "border-green-300",
    accent: "border-l-green-500",
    bar: "bg-green-500",
    badge: "bg-green-50 text-green-700",
    labelKey: "planning.statusInProgress",
  },
  completed: {
    block: "bg-slate-100 text-slate-700",
    border: "border-slate-300",
    accent: "border-l-slate-400",
    bar: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600",
    labelKey: "planning.statusCompleted",
  },
  cancelled: {
    block: "bg-red-50 text-red-900",
    border: "border-red-300",
    accent: "border-l-red-500",
    bar: "bg-red-500",
    badge: "bg-red-50 text-red-600",
    labelKey: "planning.statusCancelled",
  },
};

function statusBucket(status: string): StatusBucket {
  switch (status) {
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "in_progress":
      return "in_progress";
    case "scheduled":
    case "confirmed":
    case "tentative":
    default:
      return "scheduled";
  }
}

// ── Date helpers ──

/** Monday 00:00 of the week containing `date` (week starts Monday). */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday ... 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTimeRange(e: PlanningEntry): string {
  const s = new Date(e.start_at);
  const en = new Date(e.end_at);
  const oneDay = sameDay(s, en);
  const startStr = s.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const endStr = en.toLocaleString(undefined, oneDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
  );
  return `${startStr} – ${endStr}`;
}

/** Position (top/height in px) of an entry within the day column grid. */
function positionFor(e: PlanningEntry): { top: number; height: number } {
  const s = new Date(e.start_at);
  const en = new Date(e.end_at);
  const windowStartMin = HOUR_START * 60;
  const windowMin = (HOUR_END - HOUR_START) * 60;

  let startMin = s.getHours() * 60 + s.getMinutes() - windowStartMin;
  let endMin = en.getHours() * 60 + en.getMinutes() - windowStartMin;

  // Entry ending on the following day → cap to end of window.
  if (endMin <= startMin) endMin = windowMin;
  // Entirely before the visible window → small chip pinned to the top.
  if (endMin <= 0) {
    startMin = 0;
    endMin = 14;
  }
  // Entirely after the visible window → small chip pinned to the bottom.
  if (startMin >= windowMin) {
    startMin = windowMin - 14;
    endMin = windowMin;
  }

  startMin = Math.max(startMin, 0);
  endMin = Math.min(endMin, windowMin);

  const top = (startMin * HOUR_HEIGHT) / 60;
  let height = Math.max(((endMin - startMin) * HOUR_HEIGHT) / 60, 16);
  if (top + height > GRID_HEIGHT) height = GRID_HEIGHT - top - 1;
  if (height < 1) height = 1;
  return { top, height };
}

// ── API normalization ──
//
// The planning API returns camelCase fields (startAt, endAt, resourceName, …)
// while the shared `PlanningEntry` type uses snake_case. Normalize so the page
// can rely on the documented `PlanningEntry` contract and still work at runtime.

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

// ── Page ──

export default function PlanningPage() {
  const workspaceId = useParams().workspaceId as string;
  const { t, locale } = useI18n();

  const [entries, setEntries] = useState<PlanningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<PlanningEntry | null>(null);
  const [view, setView] = useState<"calendar" | "timeline">("calendar");

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i),
    []
  );

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          from: weekStart.toISOString(),
          to: weekEnd.toISOString(),
        });
        const res = await fetch(
          `/api/workspaces/${workspaceId}/planning/entries?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error?.message ?? "Failed to load planning entries");
        }
        const raw: PlanningEntryRaw[] = json.data?.entries ?? [];
        setEntries(raw.map(normalizeEntry));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load planning entries";
        setError(msg);
        if (isRefresh) showToast("error", msg);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, weekStart, weekEnd, showToast]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const entriesByDay = useMemo<PlanningEntry[][]>(() => {
    const buckets: PlanningEntry[][] = Array.from({ length: 7 }, () => []);
    for (const e of entries) {
      const start = new Date(e.start_at);
      const idx = Math.floor(
        (start.getTime() - weekStart.getTime()) / 86_400_000
      );
      if (idx >= 0 && idx < 7) buckets[idx].push(e);
    }
    for (const arr of buckets) {
      arr.sort((a, b) => a.start_at.localeCompare(b.start_at));
    }
    return buckets;
  }, [entries, weekStart]);

  const isToday = useCallback((d: Date) => sameDay(d, new Date()), []);

  const weekRangeLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    const s = weekStart.toLocaleDateString(locale, { month: "short", day: "numeric" });
    const e = end.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
    return `${s} – ${e}`;
  }, [weekStart, locale]);

  const entryLabel = (e: PlanningEntry): string =>
    e.subject_name ?? (e.subject_id ? e.subject_id.slice(0, 8) : "—");

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 top-20 z-[70] flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.type === "error" && <AlertTriangle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Planning</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">
            {t("planning.title")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              onClick={() => setView("calendar")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                view === "calendar"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Calendar size={14} />
              {t("planning.viewCalendar")}
            </button>
            <button
              onClick={() => setView("timeline")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                view === "timeline"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Clock size={14} />
              {t("planning.viewTimeline")}
            </button>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="app-button-secondary"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {t("workspace.refresh")}
          </button>
        </div>
      </header>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="app-button-ghost"
            aria-label="Previous week"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="app-button-secondary"
          >
            {t("planning.today")}
          </button>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="app-button-ghost"
            aria-label="Next week"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <p className="text-sm font-semibold text-slate-600">{weekRangeLabel}</p>
      </div>

      {/* Error */}
      {error && (
        <div className="app-error">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </span>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : entries.length === 0 ? (
        <div className="app-card flex flex-col items-center p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Calendar size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">{t("planning.noEntries")}</p>
        </div>
      ) : view === "calendar" ? (
        <div className="overflow-x-auto">
          <div className="app-card min-w-[760px] overflow-hidden">
            {/* Day header row */}
            <div
              className="grid border-b border-slate-200"
              style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}
            >
              <div className="border-r border-slate-200" />
              {days.map((d, i) => {
                const today = isToday(d);
                return (
                  <div
                    key={i}
                    className={`border-r border-slate-200 px-2 py-2.5 text-center last:border-r-0 ${
                      today ? "bg-indigo-50" : ""
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {d.toLocaleDateString(locale, { weekday: "short" })}
                    </div>
                    <div
                      className={`mt-0.5 text-base font-bold ${
                        today ? "text-indigo-600" : "text-slate-800"
                      }`}
                    >
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time grid body */}
            <div
              className="grid"
              style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}
            >
              {/* Hour labels */}
              <div
                className="relative border-r border-slate-200"
                style={{ height: GRID_HEIGHT }}
              >
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-slate-400"
                    style={{ top: i * HOUR_HEIGHT }}
                  >
                    {pad(h)}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d, dayIdx) => {
                const today = isToday(d);
                const dayEntries = entriesByDay[dayIdx];
                return (
                  <div
                    key={dayIdx}
                    className={`relative border-r border-slate-200 last:border-r-0 ${
                      today ? "bg-indigo-50/30" : ""
                    }`}
                    style={{ height: GRID_HEIGHT }}
                  >
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-slate-100"
                        style={{ top: i * HOUR_HEIGHT }}
                      />
                    ))}
                    {dayEntries.map((e) => {
                      const pos = positionFor(e);
                      const style = STATUS_STYLE[statusBucket(e.status)];
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelected(e)}
                          className={`absolute left-0.5 right-0.5 overflow-hidden rounded-md border border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition hover:z-20 hover:shadow-md ${style.border} ${style.accent} ${style.block}`}
                          style={{ top: pos.top, height: pos.height }}
                        >
                          <div className="truncate font-semibold">{entryLabel(e)}</div>
                          {pos.height > 34 && (
                            <div className="truncate opacity-80">
                              {formatTime(e.start_at)}–{formatTime(e.end_at)}
                            </div>
                          )}
                          {pos.height > 56 && e.resource_name && (
                            <div className="truncate opacity-70">{e.resource_name}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Timeline view */
        <div className="space-y-5">
          {days.map((d, dayIdx) => {
            const today = isToday(d);
            const dayEntries = entriesByDay[dayIdx];
            return (
              <div key={dayIdx} className="app-card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Calendar size={15} className={today ? "text-indigo-500" : "text-slate-400"} />
                  <span
                    className={`text-sm font-bold ${
                      today ? "text-indigo-700" : "text-slate-800"
                    }`}
                  >
                    {d.toLocaleDateString(locale, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {today && (
                    <span className="app-badge bg-indigo-50 text-indigo-700">
                      {t("planning.today")}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">{dayEntries.length}</span>
                </div>
                {dayEntries.length === 0 ? (
                  <p className="app-muted pl-7 text-sm">—</p>
                ) : (
                  <div className="space-y-2">
                    {dayEntries.map((e) => {
                      const style = STATUS_STYLE[statusBucket(e.status)];
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelected(e)}
                          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-indigo-300 hover:shadow-sm"
                        >
                          <div className={`h-9 w-1 shrink-0 rounded-full ${style.bar}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-800">
                                {entryLabel(e)}
                              </span>
                              <span className={`app-badge ${style.badge}`}>
                                {t(style.labelKey)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Clock size={11} />
                                {formatTime(e.start_at)}–{formatTime(e.end_at)}
                              </span>
                              {e.resource_name && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin size={11} />
                                  {e.resource_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={14} className="shrink-0 text-slate-300" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Entry detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold text-slate-900">
                  {selected.subject_name ??
                    (selected.subject_id ? selected.subject_id.slice(0, 12) : selected.id.slice(0, 8))}
                </h3>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                  {selected.id.slice(0, 12)}
                </p>
              </div>
              <span
                className={`app-badge ${STATUS_STYLE[statusBucket(selected.status)].badge}`}
              >
                {t(STATUS_STYLE[statusBucket(selected.status)].labelKey)}
              </span>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <MapPin size={15} className="shrink-0 text-slate-400" />
                <span className="w-20 shrink-0 text-xs text-slate-400">
                  {t("planning.resource")}
                </span>
                <span className="font-medium text-slate-800">
                  {selected.resource_name ??
                    (selected.resource_id ? selected.resource_id.slice(0, 8) : "—")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={15} className="shrink-0 text-slate-400" />
                <span className="w-20 shrink-0 text-xs text-slate-400">
                  {t("planning.subject")}
                </span>
                <span className="font-medium text-slate-800">
                  {selected.subject_type || "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={15} className="shrink-0 text-slate-400" />
                <span className="w-20 shrink-0 text-xs text-slate-400">
                  {t("planning.timeSlot")}
                </span>
                <span className="font-medium text-slate-800">
                  {formatDateTimeRange(selected)}
                </span>
              </div>
              {selected.notes && (
                <div className="pt-1">
                  <p className="mb-1 text-xs text-slate-400">Notes</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-700">
                    {selected.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => setSelected(null)} className="app-button-ghost">
                {t("workspace.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
