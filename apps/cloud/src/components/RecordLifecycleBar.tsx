"use client";

import useSWR from "swr";
import type { AggregateLifecycle } from "@runory/contracts";
import { AlertTriangle, Check, Info } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { formatRelativeTime } from "./SchemaTable";
import {
  resolveRecordLifecycle,
  type LifecycleEventFact,
  type LifecycleStageState,
  type ResolvedLifecycle,
} from "@/lib/record-lifecycle";

// The stage bar answers "what happened before, and how much is left" for
// records advanced by governed commands rather than by a workflow definition.
// The stages come from the aggregate lifecycle declared in the Module manifest,
// so any governed object gets a progress bar without a change here. Reached
// stages are dated from the governed domain events on the timeline, so a stage
// with no event and no timestamp column stays undated instead of being inferred
// from the current status.

interface TimelineEntry {
  event_type: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

const EVENT_PAGE_SIZE = 100;

export function RecordLifecycleBar({
  workspaceId,
  objectKey,
  recordId,
  record,
  spine,
}: {
  workspaceId: string;
  objectKey: string;
  recordId: string;
  record: Record<string, unknown>;
  /** Declared by the Module and served with the object metadata. */
  spine: AggregateLifecycle | null;
}) {
  const { t } = useI18n();
  const timelineUrl = spine
    ? `/api/workspaces/${workspaceId}/timeline?subjectType=${encodeURIComponent(objectKey)}&subjectId=${encodeURIComponent(recordId)}&limit=${EVENT_PAGE_SIZE}`
    : null;
  const { data } = useSWR<{ entries: TimelineEntry[] }>(timelineUrl);

  if (!spine) return null;

  const events: LifecycleEventFact[] = (data?.entries ?? [])
    .filter((entry) => entry.metadata?.source === "command")
    .map((entry) => ({ event_type: entry.event_type, occurred_at: entry.occurred_at }));

  const lifecycle = resolveRecordLifecycle(objectKey, spine, record, events, t);
  if (!lifecycle) return null;

  const interrupted = lifecycle.step !== null && lifecycle.banner !== null;
  const ended = lifecycle.step === null;

  return (
    <section className="app-card p-4 sm:p-5" aria-label={t("workspace.lifecycle.title")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="app-eyebrow">{t("workspace.lifecycle.title")}</p>
        {lifecycle.step !== null && (
          <p className="text-xs font-semibold text-slate-500">
            {t("workspace.lifecycle.step", { step: lifecycle.step, total: lifecycle.total })}
          </p>
        )}
      </div>

      <ol className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {lifecycle.stages.map((stage, index) => {
          // Sitting on the last stage means the record is finished, not in
          // flight, so it takes the completed treatment.
          const settled = stage.state === "done" || (stage.state === "current" && index === lifecycle.stages.length - 1);
          return (
          <li key={stage.key} className="flex min-w-[92px] flex-1 basis-0 flex-col gap-1.5">
            <div className={`h-1.5 rounded-full ${trackClass(stage.state, settled, interrupted, ended)}`} />
            <span className={`flex items-center gap-1 text-xs leading-tight ${labelClass(stage.state)}`}>
              {settled && !ended && <Check size={12} className="shrink-0 text-emerald-600" />}
              <span className="min-w-0">{stage.label}</span>
            </span>
            <span className="text-[11px] leading-tight text-slate-400">
              {stage.reachedAt ? formatRelativeTime(stage.reachedAt, t) : "\u00A0"}
            </span>
          </li>
          );
        })}
      </ol>

      {lifecycle.banner && <LifecycleBanner lifecycle={lifecycle} ended={ended} />}
    </section>
  );
}

function LifecycleBanner({ lifecycle, ended }: { lifecycle: ResolvedLifecycle; ended: boolean }) {
  const { t } = useI18n();
  const banner = lifecycle.banner;
  if (!banner) return null;
  const Icon = ended ? Info : AlertTriangle;
  const tone = ended
    ? "border-slate-200 bg-slate-50 text-slate-600"
    : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${tone}`}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <p>
        <span className="font-semibold">{banner.label}</span>
        <span className="ml-1.5">{t(banner.noteKey)}</span>
      </p>
    </div>
  );
}

function trackClass(
  state: LifecycleStageState,
  settled: boolean,
  interrupted: boolean,
  ended: boolean
): string {
  if (ended) return state === "done" ? "bg-slate-300" : "bg-slate-200";
  if (state === "current" && interrupted) return "bg-amber-400";
  if (settled) return "bg-emerald-500";
  if (state === "current") return "bg-indigo-500";
  return "bg-slate-200";
}

function labelClass(state: LifecycleStageState): string {
  if (state === "current") return "font-semibold text-slate-900";
  if (state === "done") return "text-slate-600";
  return "text-slate-400";
}
