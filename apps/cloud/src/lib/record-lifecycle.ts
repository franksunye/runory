import type { AggregateLifecycle } from "@runory/contracts";
import { messages, type MessageKey } from "@/i18n/messages";

// ── Record lifecycle presentation ──
//
// The lifecycle itself is declared once, on the aggregate in the Module manifest,
// and served with the object metadata. This module owns only the presentation
// half of it: turning the declared partition plus governed event facts into
// "where is this, and how much is left", and resolving copy.
//
// Labels follow a convention rather than travelling in the manifest, so a
// manifest never carries UI copy: `workspace.lifecycle.stage.{object}.{state}`
// for spine states and `workspace.lifecycle.status.{object}.{state}` for the
// states off it. A state with no translation falls back to a humanized form,
// which is what lets a third-party Module render without shipping into our
// message catalog.

export type RecordStatusTone = "active" | "done" | "warn" | "ended";
export type LifecycleStageState = "done" | "current" | "upcoming";

export interface LifecycleEventFact {
  event_type: string;
  occurred_at: string;
}

export interface ResolvedLifecycleStage {
  key: string;
  label: string;
  state: LifecycleStageState;
  /** Null when no event or column proves when this stage was reached. */
  reachedAt: string | null;
}

export interface ResolvedLifecycle {
  stages: ResolvedLifecycleStage[];
  /** 1-based position on the spine, null when the record left the spine. */
  step: number | null;
  total: number;
  statusLabel: string;
  banner: { label: string; noteKey: MessageKey } | null;
}

function humanizeState(state: string): string {
  const spaced = state.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : state;
}

/**
 * Resolve declared copy for a state, falling back to a humanized form.
 *
 * `translate` is the caller's `t`, which returns the key itself for a missing
 * entry — so candidates are checked against the catalog before use.
 */
export function lifecycleStateLabel(
  objectKey: string,
  state: string,
  translate: (key: MessageKey) => string
): string {
  for (const namespace of ["stage", "status"] as const) {
    const candidate = `workspace.lifecycle.${namespace}.${objectKey}.${state}`;
    if (candidate in messages.en) return translate(candidate as MessageKey);
  }
  return humanizeState(state);
}

export function statusTone(lifecycle: AggregateLifecycle, status: string): RecordStatusTone | null {
  if (lifecycle.terminals.includes(status)) return "ended";
  if (lifecycle.interrupts.includes(status)) return "warn";
  if (status in lifecycle.aliases) return "warn";
  const index = lifecycle.spine.indexOf(status);
  if (index < 0) return null;
  return index === lifecycle.spine.length - 1 ? "done" : "active";
}

/**
 * Design-system mapping from lifecycle tone → badge / dot classes.
 *
 * Surfaces must not keep per-status Tailwind tables: a new Module state inherits
 * colour from its classification (spine / interrupt / terminal / alias), and a
 * Workspace that has not loaded the lifecycle yet still gets a neutral badge.
 */
export function statusBadgeClass(tone: RecordStatusTone | null): string {
  if (tone === "done") return "bg-emerald-50 text-emerald-700";
  if (tone === "warn") return "bg-amber-50 text-amber-800";
  if (tone === "ended") return "bg-slate-100 text-slate-600";
  if (tone === "active") return "bg-indigo-50 text-indigo-700";
  return "bg-slate-100 text-slate-600";
}

export function statusDotClass(tone: RecordStatusTone | null): string {
  if (tone === "done") return "bg-emerald-500";
  if (tone === "warn") return "bg-amber-500";
  if (tone === "ended") return "bg-slate-400";
  if (tone === "active") return "bg-indigo-500";
  return "bg-slate-400";
}

export interface RecordStatusPresentation {
  label: string;
  tone: RecordStatusTone | null;
  badgeClass: string;
  dotClass: string;
}

/** Label + tone classes for a record status, driven by the declared lifecycle. */
export function recordStatusPresentation(
  objectKey: string,
  lifecycle: AggregateLifecycle | null | undefined,
  status: string,
  translate: (key: MessageKey) => string
): RecordStatusPresentation {
  if (!status) {
    return {
      label: "—",
      tone: null,
      badgeClass: statusBadgeClass(null),
      dotClass: statusDotClass(null),
    };
  }
  const tone = lifecycle ? statusTone(lifecycle, status) : null;
  return {
    label: lifecycleStateLabel(objectKey, status, translate),
    tone,
    badgeClass: statusBadgeClass(tone),
    dotClass: statusDotClass(tone),
  };
}

export function resolveRecordLifecycle(
  objectKey: string,
  lifecycle: AggregateLifecycle,
  record: Record<string, unknown>,
  events: LifecycleEventFact[],
  translate: (key: MessageKey) => string
): ResolvedLifecycle | null {
  const status = String(record.status ?? "");
  if (!status) return null;

  const label = (state: string) => lifecycleStateLabel(objectKey, state, translate);
  const earliestByType = earliestEventTimes(events);
  const reachedAt = lifecycle.spine.map((state, index) =>
    resolveStageTimestamp(lifecycle, state, record, earliestByType, index === 0)
  );
  const total = lifecycle.spine.length;

  if (lifecycle.terminals.includes(status)) {
    return {
      stages: lifecycle.spine.map((state, index) => ({
        key: state,
        label: label(state),
        state: reachedAt[index] ? "done" : "upcoming",
        reachedAt: reachedAt[index],
      })),
      step: null,
      total,
      statusLabel: label(status),
      banner: { label: label(status), noteKey: "workspace.lifecycle.terminalHelp" },
    };
  }

  if (lifecycle.interrupts.includes(status)) {
    // The pre-interrupt state is not stored on the record, so the furthest stage
    // with evidence is the honest position to hold.
    const index = Math.max(0, lastReachedIndex(reachedAt));
    return {
      stages: buildStages(lifecycle.spine, reachedAt, index, label),
      step: index + 1,
      total,
      statusLabel: label(status),
      banner: { label: label(status), noteKey: "workspace.lifecycle.interruptHelp" },
    };
  }

  const alias = lifecycle.aliases[status];
  const index = lifecycle.spine.indexOf(alias ?? status);
  if (index < 0) return null;

  return {
    stages: buildStages(lifecycle.spine, reachedAt, index, label),
    step: index + 1,
    total,
    statusLabel: label(status),
    banner: alias
      ? { label: label(status), noteKey: "workspace.lifecycle.regressedHelp" }
      : null,
  };
}

function buildStages(
  spine: string[],
  reachedAt: (string | null)[],
  currentIndex: number,
  label: (state: string) => string
): ResolvedLifecycleStage[] {
  return spine.map((state, index) => ({
    key: state,
    label: label(state),
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming",
    reachedAt: index <= currentIndex ? reachedAt[index] : null,
  }));
}

function lastReachedIndex(reachedAt: (string | null)[]): number {
  for (let index = reachedAt.length - 1; index >= 0; index -= 1) {
    if (reachedAt[index]) return index;
  }
  return -1;
}

function resolveStageTimestamp(
  lifecycle: AggregateLifecycle,
  state: string,
  record: Record<string, unknown>,
  earliestByType: Map<string, string>,
  isFirstStage: boolean
): string | null {
  const evidence = lifecycle.evidence[state];
  if (evidence?.timestampField) {
    const value = record[evidence.timestampField];
    if (typeof value === "string" && value !== "") return value;
  }
  let earliest: string | null = null;
  for (const eventType of evidence?.events ?? []) {
    const occurredAt = earliestByType.get(eventType);
    if (!occurredAt) continue;
    if (!earliest || occurredAt < earliest) earliest = occurredAt;
  }
  if (earliest) return earliest;
  if (isFirstStage) {
    const createdAt = record.created_at;
    if (typeof createdAt === "string" && createdAt !== "") return createdAt;
  }
  return null;
}

function earliestEventTimes(events: LifecycleEventFact[]): Map<string, string> {
  const earliest = new Map<string, string>();
  for (const event of events) {
    if (!event.event_type || !event.occurred_at) continue;
    const known = earliest.get(event.event_type);
    if (!known || event.occurred_at < known) {
      earliest.set(event.event_type, event.occurred_at);
    }
  }
  return earliest;
}
