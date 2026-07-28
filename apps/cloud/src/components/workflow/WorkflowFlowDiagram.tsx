"use client";

import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepKind,
  WorkflowOverview,
  WorkflowOverviewStep,
} from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

// ── Props ──

interface WorkflowFlowDiagramProps {
  definition: WorkflowDefinition;
  overview: WorkflowOverview | null;
}

// ── Constants ──

const STEP_KIND_LABEL_KEY: Record<WorkflowStepKind, MessageKey> = {
  start: "workflow.stepKindStart",
  human_task: "workflow.stepKindHumanTask",
  approval: "workflow.stepKindApproval",
  system_command: "workflow.stepKindSystemCommand",
  wait: "workflow.stepKindWait",
  end: "workflow.stepKindEnd",
};

/** Tailwind background class for the 6px colored dot per step kind. */
const STEP_KIND_DOT_CLASS: Record<WorkflowStepKind, string> = {
  start: "bg-slate-400",
  end: "bg-slate-400",
  human_task: "bg-indigo-500",
  approval: "bg-amber-500",
  system_command: "bg-blue-500",
  wait: "bg-slate-400",
};

// ── Helpers ──

/**
 * Derive a human-readable label from a step ID.
 * Capitalizes words and replaces underscores/hyphens with spaces.
 * Mirrors the `deriveStepLabel` logic in platform-core/workflow-projection.
 */
function deriveLabelFromId(stepId: string): string {
  const parts = stepId.replace(/[_-]+/g, " ").trim().split(/\s+/);
  const capitalized = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
  return capitalized || stepId;
}

/**
 * Compute the next-step IDs for a workflow step.
 * Combines `next`, `onApprove`, and `onReject`, deduplicating while
 * preserving order. Mirrors `computeStepNext` in workflow-projection.
 */
function computeStepNext(step: WorkflowStep): string[] {
  const next: string[] = [];
  if (step.next) next.push(step.next);
  if (step.onApprove) next.push(step.onApprove);
  if (step.onReject) next.push(step.onReject);
  return [...new Set(next)];
}

/**
 * Resolve overview steps from the overview projection, or derive them
 * from the definition when the overview is null.
 */
function resolveOverviewSteps(
  definition: WorkflowDefinition,
  overview: WorkflowOverview | null,
): WorkflowOverviewStep[] {
  if (overview?.steps?.length) {
    return overview.steps;
  }
  return definition.steps.map((step) => ({
    id: step.id,
    kind: step.kind,
    label: deriveLabelFromId(step.id),
    next: computeStepNext(step),
  }));
}

/**
 * Determine the branch label for a specific edge (step -> targetId).
 * For approval steps, uses `onApprove`/`onReject` to show "Approve"/"Reject".
 * For other multi-branch steps, falls back to a numeric index.
 */
function getBranchLabel(
  step: WorkflowStep | undefined,
  targetId: string,
  t: (key: MessageKey) => string,
): string | null {
  if (!step) return null;
  if (step.kind === "approval") {
    if (step.onApprove === targetId) return t("myWork.actionApprove");
    if (step.onReject === targetId) return t("myWork.actionReject");
  }
  const nextArr = computeStepNext(step);
  if (nextArr.length > 1) {
    const idx = nextArr.indexOf(targetId);
    if (idx >= 0) return String(idx + 1);
  }
  return null;
}

// ── Sub-components ──

/** Translation function subset accepted by presentational sub-components. */
type TranslateFn = (key: MessageKey) => string;

/** Compact dashed SVG connector with an optional branch label badge. */
function Connector({ label }: { label: string | null }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-stretch py-1">
      {label ? (
        <span className="mb-0.5 whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
          {label}
        </span>
      ) : null}
      <svg
        width="28"
        height="10"
        viewBox="0 0 28 10"
        fill="none"
        className="text-slate-300"
        aria-hidden="true"
      >
        <line
          x1="0"
          y1="5"
          x2="22"
          y2="5"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="3 3"
        />
        <path
          d="M20 1.5 L26 5 L20 8.5"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Step card showing the business label, kind dot, and optional form indicator. */
function StepCard({
  label,
  kind,
  isPill,
  hasForm,
  t,
}: {
  label: string;
  kind: WorkflowStepKind;
  isPill: boolean;
  hasForm: boolean;
  t: TranslateFn;
}) {
  return (
    <div
      className={`flex shrink-0 flex-col gap-1 border border-slate-200 bg-white px-3 py-2 shadow-sm ${
        isPill ? "rounded-full" : "rounded-lg"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`size-1.5 shrink-0 rounded-full ${STEP_KIND_DOT_CLASS[kind]}`}
        />
        <span className="text-[10px] font-medium leading-none text-slate-500">
          {t(STEP_KIND_LABEL_KEY[kind])}
        </span>
        {hasForm ? (
          <FileText size={11} className="shrink-0 text-slate-400" />
        ) : null}
      </div>
      <span className="text-xs font-bold leading-tight text-slate-800">
        {label}
      </span>
    </div>
  );
}

// ── Main Component ──

/**
 * Read-only visual component that renders a workflow definition as a
 * horizontal card flow (Overview mode). Replaces the badge pipeline in the
 * workflows page with a business-readable visual flow.
 *
 * - Card-style nodes with colored kind dots
 * - Business labels from the overview projection (falls back to derived labels)
 * - Dashed SVG connectors between cards
 * - Branch visualization with condition labels (Approve / Reject)
 * - Responsive: horizontal on desktop, wraps on mobile
 */
export function WorkflowFlowDiagram({
  definition,
  overview,
}: WorkflowFlowDiagramProps) {
  const { t } = useI18n();
  const overviewSteps = resolveOverviewSteps(definition, overview);
  const stepMap = new Map(definition.steps.map((s) => [s.id, s]));
  const overviewMap = new Map(overviewSteps.map((s) => [s.id, s]));

  if (overviewSteps.length === 0) return null;

  const rendered = new Set<string>();
  const segments: ReactNode[] = [];

  for (const ovStep of overviewSteps) {
    if (rendered.has(ovStep.id)) continue;
    rendered.add(ovStep.id);

    const step = stepMap.get(ovStep.id);
    const nextIds = ovStep.next;
    const hasBranches = nextIds.length > 1;
    const isPill = ovStep.kind === "start" || ovStep.kind === "end";
    const hasForm = Boolean(step?.formBindingId);

    // Render the step card
    segments.push(
      <StepCard
        key={`card-${ovStep.id}`}
        label={ovStep.label}
        kind={ovStep.kind}
        isPill={isPill}
        hasForm={hasForm}
        t={t}
      />
    );

    // No outgoing edges — terminal step
    if (nextIds.length === 0) continue;

    if (hasBranches) {
      // Collect branch targets that exist in the overview
      const branchTargets = nextIds
        .map((id) => overviewMap.get(id))
        .filter((s): s is WorkflowOverviewStep => s != null);

      if (branchTargets.length > 0) {
        // Mark targets as rendered so they are skipped in the main loop
        for (const bt of branchTargets) rendered.add(bt.id);

        // Check whether any steps remain after the branch (merge point)
        const hasRemaining = overviewSteps.some((s) => !rendered.has(s.id));

        segments.push(
          <div
            key={`branch-${ovStep.id}`}
            className="flex shrink-0 flex-col justify-center gap-2 self-stretch"
          >
            {branchTargets.map((bt) => {
              const btStep = stepMap.get(bt.id);
              const btLabel = getBranchLabel(step, bt.id, t);
              const btIsPill = bt.kind === "start" || bt.kind === "end";
              const btHasForm = Boolean(btStep?.formBindingId);

              return (
                <div key={bt.id} className="flex items-center gap-1">
                  <Connector label={btLabel} />
                  <StepCard
                    label={bt.label}
                    kind={bt.kind}
                    isPill={btIsPill}
                    hasForm={btHasForm}
                    t={t}
                  />
                </div>
              );
            })}
          </div>
        );

        // Merge connector to the next unrendered step (if any)
        if (hasRemaining) {
          segments.push(<Connector key={`merge-${ovStep.id}`} label={null} />);
        }
      } else {
        // Branch targets not found in overview — fall back to simple connector
        segments.push(<Connector key={`conn-${ovStep.id}`} label={null} />);
      }
    } else {
      // Single next step — simple dashed connector
      segments.push(<Connector key={`conn-${ovStep.id}`} label={null} />);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-3">{segments}</div>
  );
}

export default WorkflowFlowDiagram;
