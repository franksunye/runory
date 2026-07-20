"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronUp, Activity, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { formatRelativeTime } from "./SchemaTable";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch } from "@/lib/api-fetch";

// ── Subject type mapping ──
//
// The Timeline API accepts these subject types: company, service_site,
// asset, work_order, visit, quote, deal.
// The objectKey from ObjectDetailPage uses "service_visit" (with underscore)
// instead of "visit", so we map it here. All other valid keys pass through
// unchanged.
const SUBJECT_TYPE_MAP: Record<string, string> = {
  service_visit: "visit",
};

// Object keys that are valid timeline subjects. Used by ObjectDetailPage to
// decide whether to render this section at all.
export const VALID_TIMELINE_OBJECTS = new Set([
  "company",
  "service_site",
  "asset",
  "work_order",
  "service_visit",
  "visit",
  "quote",
  "invoice",
  "deal",
]);

export function isValidTimelineSubject(objectKey: string): boolean {
  return VALID_TIMELINE_OBJECTS.has(objectKey);
}

// ── Timeline entry type (mirrors API response shape) ──

interface TimelineEntry {
  id: string;
  event_type: string;
  occurred_at: string;
  subject_type: string;
  subject_id: string;
  actor_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
}

interface TimelineResponse {
  entries: TimelineEntry[];
  nextCursor: string | null;
}

// ── Event type color mapping ──
//
// Determined by the event_type prefix:
//   workflow.*         → indigo
//   audit.*            → blue
//   form.submission.*  → emerald
//   schedule.*         → amber
//   (fallback)         → slate

type EventTone = "indigo" | "blue" | "emerald" | "amber" | "slate";

const TONE_STYLES: Record<EventTone, { dot: string; ring: string; badge: string }> = {
  indigo: {
    dot: "bg-indigo-500",
    ring: "border-indigo-300",
    badge: "bg-indigo-50 text-indigo-700",
  },
  blue: {
    dot: "bg-blue-500",
    ring: "border-blue-300",
    badge: "bg-blue-50 text-blue-700",
  },
  emerald: {
    dot: "bg-emerald-500",
    ring: "border-emerald-300",
    badge: "bg-emerald-50 text-emerald-700",
  },
  amber: {
    dot: "bg-amber-500",
    ring: "border-amber-300",
    badge: "bg-amber-50 text-amber-700",
  },
  slate: {
    dot: "bg-slate-400",
    ring: "border-slate-300",
    badge: "bg-slate-100 text-slate-600",
  },
};

const TONE_BADGE_LABEL: Record<EventTone, MessageKey> = {
  indigo: "timeline.badgeWorkflow",
  blue: "timeline.badgeAudit",
  emerald: "timeline.badgeForm",
  amber: "timeline.badgeSchedule",
  slate: "activity.categorySystem",
};

function getEventTypeTone(eventType: string): EventTone {
  if (eventType.startsWith("workflow.")) return "indigo";
  if (eventType.startsWith("audit.")) return "blue";
  if (eventType.startsWith("form.submission.")) return "emerald";
  if (eventType.startsWith("schedule.")) return "amber";
  return "slate";
}

// Actor type label mapping (reuses existing activity.actor.* keys).
const ACTOR_LABELS: Record<string, MessageKey> = {
  user: "activity.actor.user",
  agent: "activity.actor.agent",
  system: "activity.actor.system",
};

function actorLabel(
  entry: TimelineEntry,
  t: (key: MessageKey) => string
): string {
  const actorType = (entry.metadata.actor_type as string | undefined) ?? "";
  const key = ACTOR_LABELS[actorType];
  if (key) return t(key);
  return actorType || (entry.actor_id ?? "—");
}

// ── Component ──

export interface RecordTimelineSectionProps {
  workspaceId: string;
  /** Object key (e.g. "company", "service_site", "service_visit") */
  subjectType: string;
  subjectId: string;
}

const PAGE_SIZE = 20;

export default function RecordTimelineSection({
  workspaceId,
  subjectType,
  subjectId,
}: RecordTimelineSectionProps) {
  const { t } = useI18n();
  const apiSubjectType = SUBJECT_TYPE_MAP[subjectType] ?? subjectType;

  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const buildUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams({
        subjectType: apiSubjectType,
        subjectId,
        limit: String(PAGE_SIZE),
      });
      if (cursor) params.set("cursor", cursor);
      return `/api/workspaces/${workspaceId}/timeline?${params.toString()}`;
    },
    [workspaceId, apiSubjectType, subjectId]
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch<{ success: boolean; data?: TimelineResponse; error?: { message?: string } }>(buildUrl());
      if (json.success && json.data) {
        setEntries(json.data.entries);
        setNextCursor(json.data.nextCursor);
      } else {
        setError(json.error?.message ?? t("workspace.loadFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [buildUrl, t]);

  // Always fetch on mount so the entry-count badge is populated even when
  // the section is collapsed.
  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const json = await apiFetch<{ success: boolean; data?: TimelineResponse }>(buildUrl(nextCursor));
      if (json.success && json.data) {
        setEntries((prev) => [...prev, ...json.data!.entries]);
        setNextCursor(json.data.nextCursor);
      }
    } catch {
      // Silently ignore pagination errors — the user can retry.
    } finally {
      setLoadingMore(false);
    }
  }, [buildUrl, nextCursor, loadingMore]);

  const entryCount = entries.length;

  return (
    <div className="app-card p-5 sm:p-6">
      {/* Header — always visible, click to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <Activity size={16} className="text-slate-500" />
          <h3 className="text-sm font-bold text-slate-900">
            {t("timeline.title")}
          </h3>
          {fetched && !loading && entryCount > 0 && (
            <span className="app-badge bg-slate-100 text-slate-600">
              {entryCount}
              {nextCursor ? "+" : ""}
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronUp size={16} className="text-slate-400" />
        ) : (
          <ChevronDown size={16} className="text-slate-400" />
        )}
      </button>

      {/* Body — only rendered when expanded */}
      {expanded && (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              {t("workspace.loading")}
            </div>
          ) : error ? (
            <div className="app-error">{error}</div>
          ) : entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              {t("timeline.empty")}
            </p>
          ) : (
            <>
              <ol className="relative space-y-4 border-l border-slate-200 pl-6">
                {entries.map((entry) => {
                  const tone = getEventTypeTone(entry.event_type);
                  const style = TONE_STYLES[tone];
                  const badgeLabel = t(TONE_BADGE_LABEL[tone]);
                  return (
                    <li key={entry.id} className="relative">
                      <span
                        className={`absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${style.ring} bg-white`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      </span>
                      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`app-badge ${style.badge}`}>
                              {badgeLabel}
                            </span>
                            <span className="text-sm font-semibold text-slate-800">
                              {entry.summary}
                            </span>
                          </div>
                          <time
                            className="shrink-0 text-xs text-slate-400"
                            title={new Date(entry.occurred_at).toLocaleString("zh-CN")}
                          >
                            {formatRelativeTime(entry.occurred_at, t)}
                          </time>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            {actorLabel(entry, t)}
                          </span>
                          {entry.actor_id && (
                            <span className="font-mono text-[11px] text-slate-400">
                              {entry.actor_id}
                            </span>
                          )}
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {entry.event_type}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {nextCursor && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="app-button-secondary"
                  >
                    {loadingMore && <Loader2 size={15} className="animate-spin" />}
                    {loadingMore ? t("workspace.loading") : t("timeline.loadMore")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
