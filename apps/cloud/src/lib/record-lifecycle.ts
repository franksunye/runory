import type { MessageKey } from "@/i18n/messages";

// ── Declared record lifecycles ──
//
// Business records advance through governed commands, so the statuses and the
// legal transitions already live in the module manifests (see each command's
// `transition` / `postconditions`). What the manifests do not declare is which
// of those statuses form the expected path a document travels — the spine an
// operator needs in order to answer "where is this, and how much is left".
//
// A raw FSM graph cannot answer that question: `blocked`, `reopened` and
// `cancelled` are legal but off-spine. So the spine is declared explicitly here
// and everything else is classified as an interrupt (paused on the spine), an
// alias (sits at an earlier spine position) or a terminal (ended off-spine).
//
// This declaration is intentionally colocated with `getBusinessCommandActions`
// in ObjectDetailPage: both derive from the same manifests, and keeping them in
// sight of each other makes drift visible. The longer-term home is
// `objects[].lifecycle` in the catalog manifest, served by the API so that the
// mobile app and the customer portal can reuse one spine.

export interface LifecycleStage {
  key: string;
  labelKey: MessageKey;
  /** Record column carrying the authoritative timestamp for this stage. */
  timestampField?: string;
  /** Governed domain events that prove this stage was reached. */
  events?: string[];
}

/** A status that sits at an earlier spine position than it was reached from. */
interface LifecycleAlias {
  stageKey: string;
  labelKey: MessageKey;
}

interface LifecycleInterrupt {
  labelKey: MessageKey;
  noteKey: MessageKey;
}

interface LifecycleTerminal {
  labelKey: MessageKey;
}

export interface RecordLifecycleSpine {
  stages: LifecycleStage[];
  aliases?: Record<string, LifecycleAlias>;
  interrupts?: Record<string, LifecycleInterrupt>;
  terminals?: Record<string, LifecycleTerminal>;
}

const LIFECYCLE_SPINES: Record<string, RecordLifecycleSpine> = {
  work_order: {
    stages: [
      { key: "new", labelKey: "workspace.lifecycle.stage.work_order.new" },
      { key: "triaged", labelKey: "workspace.lifecycle.stage.work_order.triaged", events: ["work_order.triaged"] },
      { key: "planned", labelKey: "workspace.lifecycle.stage.work_order.planned", events: ["work_order.visit_created"] },
      { key: "in_progress", labelKey: "workspace.lifecycle.stage.work_order.in_progress", events: ["work_order.started"] },
      {
        key: "completed",
        labelKey: "workspace.lifecycle.stage.work_order.completed",
        timestampField: "completed_at",
        events: ["work_order.completed"],
      },
    ],
    aliases: {
      reopened: { stageKey: "planned", labelKey: "workspace.lifecycle.status.work_order.reopened" },
    },
    interrupts: {
      blocked: {
        labelKey: "workspace.lifecycle.status.work_order.blocked",
        noteKey: "workspace.lifecycle.interruptHelp",
      },
    },
    terminals: {
      cancelled: { labelKey: "workspace.lifecycle.status.work_order.cancelled" },
    },
  },
  quote: {
    stages: [
      { key: "draft", labelKey: "workspace.lifecycle.stage.quote.draft", events: ["quote.draft_created"] },
      { key: "in_review", labelKey: "workspace.lifecycle.stage.quote.in_review", events: ["quote.submitted_for_approval"] },
      { key: "approved", labelKey: "workspace.lifecycle.stage.quote.approved", events: ["quote.approved"] },
      { key: "sent", labelKey: "workspace.lifecycle.stage.quote.sent", events: ["quote.marked_sent"] },
      { key: "accepted", labelKey: "workspace.lifecycle.stage.quote.accepted", events: ["quote.accepted"] },
      { key: "converted", labelKey: "workspace.lifecycle.stage.quote.converted", events: ["quote.converted_to_work_order"] },
    ],
    aliases: {
      returned: { stageKey: "draft", labelKey: "workspace.lifecycle.status.quote.returned" },
    },
    terminals: {
      rejected: { labelKey: "workspace.lifecycle.status.quote.rejected" },
      declined: { labelKey: "workspace.lifecycle.status.quote.declined" },
      expired: { labelKey: "workspace.lifecycle.status.quote.expired" },
      withdrawn: { labelKey: "workspace.lifecycle.status.quote.withdrawn" },
    },
  },
  service_visit: {
    stages: [
      { key: "unplanned", labelKey: "workspace.lifecycle.stage.service_visit.unplanned" },
      { key: "scheduled", labelKey: "workspace.lifecycle.stage.service_visit.scheduled" },
      { key: "en_route", labelKey: "workspace.lifecycle.stage.service_visit.en_route", events: ["visit.travel_started"] },
      { key: "on_site", labelKey: "workspace.lifecycle.stage.service_visit.on_site", events: ["visit.arrived_on_site"] },
      {
        key: "completed",
        labelKey: "workspace.lifecycle.stage.service_visit.completed",
        timestampField: "actual_end",
        events: ["visit.completed"],
      },
    ],
    terminals: {
      cancelled: { labelKey: "workspace.lifecycle.status.service_visit.cancelled" },
    },
  },
  invoice: {
    stages: [
      {
        key: "issued",
        labelKey: "workspace.lifecycle.stage.invoice.issued",
        timestampField: "issued_at",
        events: ["invoice.issued"],
      },
      { key: "partially_paid", labelKey: "workspace.lifecycle.stage.invoice.partially_paid" },
      { key: "paid", labelKey: "workspace.lifecycle.stage.invoice.paid", timestampField: "paid_at" },
    ],
    terminals: {
      void: { labelKey: "workspace.lifecycle.status.invoice.void" },
    },
  },
};

export function hasRecordLifecycle(objectKey: string): boolean {
  return objectKey in LIFECYCLE_SPINES;
}

// ── Header status badge ──
//
// The badge reuses the lifecycle vocabulary so the header, the stage bar and
// the record fields never disagree about what a status is called.

export type RecordStatusTone = "active" | "done" | "warn" | "ended";

export function recordStatusBadge(
  objectKey: string,
  status: string
): { labelKey: MessageKey; tone: RecordStatusTone } | null {
  const spine = LIFECYCLE_SPINES[objectKey];
  if (!spine || !status) return null;

  const terminal = spine.terminals?.[status];
  if (terminal) return { labelKey: terminal.labelKey, tone: "ended" };

  const interrupt = spine.interrupts?.[status];
  if (interrupt) return { labelKey: interrupt.labelKey, tone: "warn" };

  const alias = spine.aliases?.[status];
  if (alias) return { labelKey: alias.labelKey, tone: "warn" };

  const index = spine.stages.findIndex((stage) => stage.key === status);
  if (index < 0) return null;
  return {
    labelKey: spine.stages[index].labelKey,
    tone: index === spine.stages.length - 1 ? "done" : "active",
  };
}

// ── Resolution ──

export interface LifecycleEventFact {
  event_type: string;
  occurred_at: string;
}

export type LifecycleStageState = "done" | "current" | "upcoming";

export interface ResolvedLifecycleStage {
  key: string;
  labelKey: MessageKey;
  state: LifecycleStageState;
  /** Null when no event or column proves when this stage was reached. */
  reachedAt: string | null;
}

export interface ResolvedLifecycle {
  stages: ResolvedLifecycleStage[];
  /** 1-based position on the spine, null when the record left the spine. */
  step: number | null;
  total: number;
  /** Short label for the current status, whether on the spine or not. */
  statusLabelKey: MessageKey;
  banner: { labelKey: MessageKey; noteKey: MessageKey } | null;
}

export function resolveRecordLifecycle(
  objectKey: string,
  record: Record<string, unknown>,
  events: LifecycleEventFact[]
): ResolvedLifecycle | null {
  const spine = LIFECYCLE_SPINES[objectKey];
  if (!spine) return null;

  const status = String(record.status ?? "");
  if (!status) return null;

  const earliestByType = earliestEventTimes(events);
  const reachedAt = spine.stages.map((stage, index) =>
    resolveStageTimestamp(stage, record, earliestByType, index === 0)
  );

  const terminal = spine.terminals?.[status];
  if (terminal) {
    return {
      stages: spine.stages.map((stage, index) => ({
        key: stage.key,
        labelKey: stage.labelKey,
        state: reachedAt[index] ? "done" : "upcoming",
        reachedAt: reachedAt[index],
      })),
      step: null,
      total: spine.stages.length,
      statusLabelKey: terminal.labelKey,
      banner: { labelKey: terminal.labelKey, noteKey: "workspace.lifecycle.terminalHelp" },
    };
  }

  const interrupt = spine.interrupts?.[status];
  if (interrupt) {
    // The pre-interrupt status is not stored on the record, so the furthest
    // stage with evidence is the honest position to hold.
    const index = Math.max(0, lastReachedIndex(reachedAt));
    return {
      stages: buildStages(spine.stages, reachedAt, index),
      step: index + 1,
      total: spine.stages.length,
      statusLabelKey: interrupt.labelKey,
      banner: { labelKey: interrupt.labelKey, noteKey: interrupt.noteKey },
    };
  }

  const alias = spine.aliases?.[status];
  const stageKey = alias ? alias.stageKey : status;
  const index = spine.stages.findIndex((stage) => stage.key === stageKey);
  if (index < 0) return null;

  return {
    stages: buildStages(spine.stages, reachedAt, index),
    step: index + 1,
    total: spine.stages.length,
    statusLabelKey: alias ? alias.labelKey : spine.stages[index].labelKey,
    banner: alias
      ? { labelKey: alias.labelKey, noteKey: "workspace.lifecycle.regressedHelp" }
      : null,
  };
}

function buildStages(
  stages: LifecycleStage[],
  reachedAt: (string | null)[],
  currentIndex: number
): ResolvedLifecycleStage[] {
  return stages.map((stage, index) => ({
    key: stage.key,
    labelKey: stage.labelKey,
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
  stage: LifecycleStage,
  record: Record<string, unknown>,
  earliestByType: Map<string, string>,
  isFirstStage: boolean
): string | null {
  if (stage.timestampField) {
    const value = record[stage.timestampField];
    if (typeof value === "string" && value !== "") return value;
  }
  let earliest: string | null = null;
  for (const eventType of stage.events ?? []) {
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
