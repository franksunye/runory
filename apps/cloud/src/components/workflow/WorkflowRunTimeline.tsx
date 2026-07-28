"use client";

import { useMemo } from "react";
import {
  Check,
  X,
  Clock,
  Loader2,
  ArrowRight,
  GitBranch,
  Inbox,
} from "lucide-react";
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepKind,
  WorkflowRunProjection,
  WorkflowRunStep,
  WorkflowRunStepState,
  WorkflowRunNextAction,
} from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

// ── Props ──

interface WorkflowRunTimelineProps {
  definition: WorkflowDefinition;
  runProjection: WorkflowRunProjection | null;
}

// ── i18n label maps ──

const STEP_KIND_LABEL_KEY: Record<WorkflowStepKind, MessageKey> = {
  start: "workflow.stepKindStart",
  human_task: "workflow.stepKindHumanTask",
  approval: "workflow.stepKindApproval",
  system_command: "workflow.stepKindSystemCommand",
  wait: "workflow.stepKindWait",
  end: "workflow.stepKindEnd",
};

// Colored dot per step kind (same dot pattern as FlowDiagram).
const STEP_KIND_DOT: Record<WorkflowStepKind, string> = {
  start: "bg-slate-400",
  end: "bg-slate-400",
  human_task: "bg-indigo-500",
  approval: "bg-amber-500",
  system_command: "bg-blue-500",
  wait: "bg-slate-400",
};

// Subtle tag background per step kind.
const STEP_KIND_TAG: Record<WorkflowStepKind, string> = {
  start: "bg-slate-100 text-slate-600",
  end: "bg-slate-100 text-slate-600",
  human_task: "bg-indigo-50 text-indigo-700",
  approval: "bg-amber-50 text-amber-700",
  system_command: "bg-blue-50 text-blue-700",
  wait: "bg-slate-100 text-slate-600",
};

type Outcome = "approved" | "rejected" | "returned" | "cancelled";

const OUTCOME_BADGE: Record<Outcome, { className: string; key: MessageKey }> = {
  approved: { className: "bg-emerald-50 text-emerald-700", key: "workflow.outcomeApproved" },
  rejected: { className: "bg-red-50 text-red-700", key: "workflow.outcomeRejected" },
  returned: { className: "bg-amber-50 text-amber-700", key: "workflow.outcomeReturned" },
  cancelled: { className: "bg-slate-100 text-slate-500", key: "workflow.outcomeCancelled" },
};

const STATUS_BADGE: Record<
  WorkflowRunProjection["status"],
  { className: string; key: MessageKey; pulse?: boolean }
> = {
  running: { className: "bg-amber-50 text-amber-700", key: "workflow.runInProgress", pulse: true },
  completed: { className: "bg-emerald-50 text-emerald-700", key: "workflow.runCompleted" },
  returned: { className: "bg-amber-50 text-amber-700", key: "workflow.runReturned", pulse: true },
  cancelled: { className: "bg-red-50 text-red-700", key: "workflow.runCancelled" },
};

const STEP_STATE_LABEL_KEY: Record<WorkflowRunStepState, MessageKey> = {
  pending: "workflow.stepPending",
  current: "workflow.stepCurrent",
  completed: "workflow.stepCompleted",
  cancelled: "workflow.stepCancelled",
};

// nextAction.kind overlaps with WorkflowStepKind — translate when possible.
const NEXT_ACTION_KIND_KEY: Record<string, MessageKey> = {
  start: "workflow.stepKindStart",
  human_task: "workflow.stepKindHumanTask",
  approval: "workflow.stepKindApproval",
  system_command: "workflow.stepKindSystemCommand",
  wait: "workflow.stepKindWait",
  end: "workflow.stepKindEnd",
};

type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

// ── Helpers ──

/**
 * Derive a human-readable label for a workflow step.
 *
 * Mirrors the `deriveStepLabel` logic in `workflow-projection.ts`: clean the
 * step id (replace underscores/hyphens with spaces, capitalize each word) and
 * fall back to the localized step-kind label when the id yields nothing.
 */
function deriveStepLabel(step: WorkflowStep, t: TFunc): string {
  const parts = step.id.replace(/[_-]+/g, " ").trim().split(/\s+/);
  const capitalized = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
  if (capitalized) return capitalized;
  return t(STEP_KIND_LABEL_KEY[step.kind]);
}

/** Format an ISO timestamp with the user's locale via Intl.DateTimeFormat. */
function formatTimestamp(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/** Style for the vertical connector leading from a step toward the next one. */
function connectorClass(nextState: WorkflowRunStepState): string {
  // Reached steps (completed or current) get a solid, low-opacity green line.
  if (nextState === "completed" || nextState === "current") {
    return "w-0.5 flex-1 bg-emerald-200";
  }
  // A cancelled segment reads as a red-tinted dashed line.
  if (nextState === "cancelled") {
    return "w-0 flex-1 border-l-2 border-dashed border-red-200";
  }
  // Pending steps get a dashed border-color line.
  return "w-0 flex-1 border-l-2 border-dashed border-slate-200";
}

// ── Sub-components ──

/** The 32px circular icon for a step, styled by its run state. */
function StepIcon({ state }: { state: WorkflowRunStepState }) {
  switch (state) {
    case "completed":
      return (
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <Check size={16} strokeWidth={2.5} />
        </div>
      );
    case "current":
      return (
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600 ring-2 ring-indigo-400 ring-offset-2 ring-offset-white">
          <Loader2 size={16} className="animate-spin" />
        </div>
      );
    case "cancelled":
      return (
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 opacity-50">
          <X size={16} strokeWidth={2.5} />
        </div>
      );
    case "pending":
    default:
      return (
        <div className="size-8 shrink-0 rounded-full border-2 border-slate-200 bg-white" />
      );
  }
}

interface TimelineStepProps {
  step: WorkflowStep;
  runStep: WorkflowRunStep | undefined;
  isLast: boolean;
  nextState: WorkflowRunStepState | undefined;
}

function TimelineStep({ step, runStep, isLast, nextState }: TimelineStepProps) {
  const { t, locale } = useI18n();
  const state = runStep?.state ?? "pending";
  const label = deriveStepLabel(step, t);
  const outcome = runStep?.outcome;
  const outcomeStyle = outcome ? OUTCOME_BADGE[outcome] : undefined;

  const labelClass =
    state === "current"
      ? "text-sm font-semibold text-slate-950"
      : state === "completed"
        ? "text-sm font-medium text-slate-700"
        : state === "cancelled"
          ? "text-sm font-medium text-slate-400 line-through"
          : "text-sm font-medium text-slate-400";

  return (
    <li className="flex gap-3">
      {/* Icon + connector column */}
      <div className="flex flex-col items-center">
        <StepIcon state={state} />
        {!isLast && nextState && (
          <div className={connectorClass(nextState)} aria-hidden="true" />
        )}
      </div>

      {/* Content */}
      <div className={`min-w-0 flex-1 ${isLast ? "pb-1" : "pb-5"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={labelClass}>{label}</span>
          <span className={`app-badge ${STEP_KIND_TAG[step.kind]}`}>
            <span className={`size-1.5 rounded-full ${STEP_KIND_DOT[step.kind]}`} />
            {t(STEP_KIND_LABEL_KEY[step.kind])}
          </span>
          {outcomeStyle && (
            <span className={`app-badge ${outcomeStyle.className}`}>
              {t(outcomeStyle.key)}
            </span>
          )}
          {state !== "completed" && (
            <span className="text-[11px] font-medium text-slate-400">
              {t(STEP_STATE_LABEL_KEY[state])}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          {runStep?.occurredAt && (
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {formatTimestamp(runStep.occurredAt, locale)}
            </span>
          )}
          {runStep?.workItemStatus && (
            <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">
              {runStep.workItemStatus}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/** Highlighted box describing the next action the workflow is waiting on. */
function NextActionBox({ nextAction }: { nextAction: WorkflowRunNextAction }) {
  const { t } = useI18n();
  const kindKey = NEXT_ACTION_KIND_KEY[nextAction.kind];
  const kindLabel = kindKey ? t(kindKey) : nextAction.kind;

  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-600">
        <ArrowRight size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
          {t("workflow.runNextAction")}
        </p>
        <p className="truncate text-sm font-medium text-slate-800">
          {kindLabel}
        </p>
      </div>
    </div>
  );
}

// ── Main component ──

export default function WorkflowRunTimeline({
  definition,
  runProjection,
}: WorkflowRunTimelineProps) {
  const { t } = useI18n();

  // Pair each definition step with its run state (if any), preserving order.
  const steps = useMemo(() => {
    return definition.steps.map((step) => ({
      step,
      runStep: runProjection?.steps.find((s) => s.id === step.id),
    }));
  }, [definition.steps, runProjection]);

  // Progress = completed steps / total steps.
  const { completedCount, total, pct } = useMemo(() => {
    const totalSteps = steps.length;
    const done = steps.filter((s) => s.runStep?.state === "completed").length;
    return {
      completedCount: done,
      total: totalSteps,
      pct: totalSteps > 0 ? Math.round((done / totalSteps) * 100) : 0,
    };
  }, [steps]);

  // No run data: render a minimal empty state.
  if (!runProjection) {
    return (
      <div className="app-card p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900">
            {definition.name || definition.workflowKey}
          </h3>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Inbox size={14} />
          {t("workflow.noRunData")}
        </div>
      </div>
    );
  }

  const statusBadge = STATUS_BADGE[runProjection.status];

  return (
    <div className="app-card p-5 sm:p-6">
      {/* Header + status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch size={16} className="shrink-0 text-indigo-500" />
          <h3 className="truncate text-sm font-bold text-slate-900">
            {definition.name || definition.workflowKey}
          </h3>
        </div>
        <span
          className={`app-badge shrink-0 ${statusBadge.className} ${
            statusBadge.pulse ? "animate-pulse" : ""
          }`}
        >
          {t(statusBadge.key)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium">{t("workflow.runProgress")}</span>
          <span className="font-mono text-[11px] text-slate-400">
            {completedCount}/{total}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-1.5 rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Vertical timeline */}
      <ol className="mt-5 max-h-[28rem] overflow-y-auto pr-1">
        {steps.map(({ step, runStep }, i) => (
          <TimelineStep
            key={`${step.id}-${i}`}
            step={step}
            runStep={runStep}
            isLast={i === steps.length - 1}
            nextState={steps[i + 1]?.runStep?.state}
          />
        ))}
      </ol>

      {/* Next action */}
      {runProjection.nextAction && (
        <NextActionBox nextAction={runProjection.nextAction} />
      )}
    </div>
  );
}
