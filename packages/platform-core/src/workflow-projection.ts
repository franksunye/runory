// ── Workflow Projection Functions (v0.8 Batch 4, Tech Spec §11) ──
//
// Pure projection functions that derive business-readable overviews and run
// state from existing workflow data — no persistence changes.
//
// Per Tech Spec §11.1:
//   - WorkflowOverview: step sequence and branches from a pinned definition
//   - WorkflowRunProjection: completed/current/pending path from instance +
//     work items + ordered events
//
// Per Tech Spec §11.1 (constraints):
//   - v0.8 does not invent conditions, loops, compensation nodes, or layout
//     coordinates that Workflow V2 does not own.
//   - Projection status and step history come ONLY from the pinned definition
//     version, instance, Work Items, and ordered Workflow events.
//   - v0.8 does not infer failure/retry data from returned Work Items,
//     repeated events, audit entries, or Command errors.

import type {
  WorkflowOverview,
  WorkflowRunProjection,
  WorkflowRunStep,
  WorkflowRunStepState,
  WorkflowRunNextAction,
} from "@runory/contracts";
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowInstanceRow,
  WorkItemRow,
  WorkflowEventRow,
} from "./workflow";

// ── Helpers ──

/**
 * Derive a human-readable label for a workflow step.
 *
 * The step id is typically machine-generated (e.g. "approval_1", "review_step"),
 * so we capitalize and clean it for display. If the step kind is more
 * descriptive, we use that as a fallback.
 */
function deriveStepLabel(step: WorkflowStep): string {
  // Try to produce a readable label from the step id
  const parts = step.id.replace(/[_-]+/g, " ").trim().split(/\s+/);
  const capitalized = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
  if (capitalized) return capitalized;

  // Fallback to kind
  const kindLabels: Record<string, string> = {
    start: "Start",
    human_task: "Human Task",
    approval: "Approval",
    system_command: "System Command",
    wait: "Wait",
    end: "End",
  };
  return kindLabels[step.kind] ?? step.kind;
}

/**
 * Compute the `next` array for a step in the overview.
 *
 * Per Tech Spec §11.1: "next contains step.next plus approval onApprove/onReject
 * targets."
 */
function computeStepNext(step: WorkflowStep): string[] {
  const next: string[] = [];
  if (step.next) next.push(step.next);
  if (step.onApprove) next.push(step.onApprove);
  if (step.onReject) next.push(step.onReject);
  // Deduplicate while preserving order
  return [...new Set(next)];
}

// ── Overview Projection ──

/**
 * Resolve a WorkflowOverview from a pinned workflow definition.
 *
 * Transforms the internal WorkflowDefinition (with next/onApprove/onReject
 * scattered across fields) into a unified step list with a `next` array and
 * a human-readable label.
 */
export function resolveWorkflowOverview(
  definition: WorkflowDefinition,
  versionNumber: number,
): WorkflowOverview {
  return {
    workflowKey: definition.workflowKey,
    name: definition.name,
    targetObject: definition.targetObject,
    versionNumber,
    steps: definition.steps.map((step) => ({
      id: step.id,
      kind: step.kind,
      label: deriveStepLabel(step),
      next: computeStepNext(step),
    })),
  };
}

// ── Run Projection ──

/**
 * Map the raw instance status string to the projection status enum.
 *
 * The instance table stores: "running", "completed", "cancelled".
 * The projection adds "returned" — derived from the latest workflow event
 * being `workflow.work_returned` while the instance is still "running".
 *
 * Per Tech Spec §11.1: we do NOT infer failure/retry data from returned Work
 * Items. The "returned" projection status reflects that a work item was
 * explicitly returned (a first-class workflow operation), not a failure.
 */
function resolveProjectionStatus(
  instance: WorkflowInstanceRow,
  events: WorkflowEventRow[],
): WorkflowRunProjection["status"] {
  if (instance.status === "completed") return "completed";
  if (instance.status === "cancelled") return "cancelled";

  // Instance is "running" — check if the latest meaningful event is a return
  if (events.length > 0) {
    const lastEvent = events[events.length - 1];
    if (lastEvent.event_type === "workflow.work_returned") {
      return "returned";
    }
  }

  return "running";
}

/**
 * Resolve the outcome for a completed step from workflow events.
 *
 * Only called for steps in "completed" state. Looks for the latest
 * terminal event in the current completion cycle:
 *   - workflow.approval_decided → "approved" or "rejected" (from payload)
 *   - workflow.work_cancelled → "cancelled"
 *
 * Note: workflow.work_returned is NOT an outcome for completed steps —
 * a returned step is "current" (re-active), not "completed".
 * workflow.work_completed has no explicit outcome (normal completion).
 */
function resolveStepOutcome(
  stepId: string,
  events: WorkflowEventRow[],
): { outcome?: WorkflowRunStep["outcome"]; occurredAt?: string } {
  // Walk events in reverse to find the latest outcome-bearing event.
  // Stop at work_returned — events before a return belong to a previous
  // completion cycle and should not contribute outcomes.
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    if (evt.step_id !== stepId) continue;

    if (evt.event_type === "workflow.work_returned") {
      // Events before this return belong to a previous cycle — stop
      break;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(evt.payload_json);
    } catch {
      payload = {};
    }

    if (evt.event_type === "workflow.approval_decided") {
      const outcome = payload.outcome as string;
      if (outcome === "approved" || outcome === "rejected") {
        return { outcome, occurredAt: evt.occurred_at };
      }
    }
    if (evt.event_type === "workflow.work_cancelled") {
      return { outcome: "cancelled", occurredAt: evt.occurred_at };
    }
  }

  return {};
}

/**
 * Find the most relevant work item for a step.
 *
 * A step may have multiple work items (e.g. returned and re-created). We
 * return the latest one by created_at, which reflects the current state.
 */
function findLatestWorkItemForStep(
  stepId: string,
  workItems: WorkItemRow[],
): WorkItemRow | undefined {
  const items = workItems.filter((wi) => wi.step_id === stepId);
  if (items.length === 0) return undefined;
  // Sort by created_at descending — latest first
  items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return items[0];
}

/**
 * Determine whether a step has been completed based on events.
 *
 * A step is "completed" if the LATEST terminal event for it is a completion
 * event (approval_decided or work_completed). If the latest terminal event is
 * work_returned, the step was returned and is now active again — NOT completed.
 *
 * This correctly handles the return cycle: a step may be completed, then
 * returned (undoing the completion), then re-completed. Only the latest
 * terminal event matters.
 */
function isStepCompleted(stepId: string, events: WorkflowEventRow[]): boolean {
  // Walk events in reverse to find the latest terminal event for this step
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    if (evt.step_id !== stepId) continue;

    if (evt.event_type === "workflow.approval_decided" || evt.event_type === "workflow.work_completed") {
      return true;
    }
    if (evt.event_type === "workflow.work_returned") {
      // The step was returned — it's active again, not completed
      return false;
    }
  }
  return false;
}

/**
 * Resolve the step states for the run projection.
 *
 * Step state logic:
 *   - If instance is cancelled: steps before current are "completed",
 *     current step is "cancelled", steps after are "pending"
 *   - If step has a terminal event: "completed"
 *   - If step matches instance.current_step_id: "current"
 *   - Otherwise: "pending"
 *
 * For "completed" steps, we also attach:
 *   - workItemStatus from the latest work item
 *   - occurredAt and outcome from events
 */
function resolveStepStates(
  definition: WorkflowDefinition,
  instance: WorkflowInstanceRow,
  workItems: WorkItemRow[],
  events: WorkflowEventRow[],
  projectionStatus: WorkflowRunProjection["status"],
): WorkflowRunStep[] {
  // Build a set of step ids that appear before the current step
  const stepIds = definition.steps.map((s) => s.id);
  const currentStepIndex = instance.current_step_id
    ? stepIds.indexOf(instance.current_step_id)
    : -1;

  return definition.steps.map((step) => {
    const stepIndex = stepIds.indexOf(step.id);
    let state: WorkflowRunStepState;

    if (instance.status === "cancelled") {
      // Cancelled instance: steps before current are completed, current and
      // after are cancelled (unless already completed by events)
      if (isStepCompleted(step.id, events)) {
        state = "completed";
      } else if (currentStepIndex >= 0 && stepIndex < currentStepIndex) {
        state = "completed";
      } else if (step.id === instance.current_step_id) {
        state = "cancelled";
      } else if (currentStepIndex >= 0 && stepIndex > currentStepIndex) {
        state = "cancelled";
      } else {
        state = "cancelled";
      }
    } else if (isStepCompleted(step.id, events)) {
      state = "completed";
    } else if (instance.status === "completed") {
      // Completed instance: all steps that aren't explicitly completed by
      // events (e.g. the end step) are considered completed
      state = "completed";
    } else if (step.id === instance.current_step_id && (projectionStatus === "running" || projectionStatus === "returned")) {
      // The current step is "current" whether the instance is running normally
      // or has been returned (re-active work item in ready state)
      state = "current";
    } else if (stepIndex < currentStepIndex) {
      // Steps before the current step that don't have explicit events
      // (e.g. start, system_command, wait) are considered completed
      state = "completed";
    } else {
      state = "pending";
    }

    const result: WorkflowRunStep = {
      id: step.id,
      state,
    };

    // Attach work item status for steps that have work items
    const workItem = findLatestWorkItemForStep(step.id, workItems);
    if (workItem) {
      result.workItemStatus = workItem.status;
    }

    // Attach outcome and occurredAt for completed steps
    if (state === "completed") {
      const { outcome, occurredAt } = resolveStepOutcome(step.id, events);
      if (outcome) result.outcome = outcome;
      if (occurredAt) result.occurredAt = occurredAt;
    }

    return result;
  });
}

/**
 * Resolve the next action for the run projection.
 *
 * The next action is derived from the current step's kind and its active
 * work item:
 *   - approval → { kind: "approval", workItemId }
 *   - human_task → { kind: "human_task", workItemId }
 *   - system_command → { kind: "system_command" }
 *   - wait → { kind: "wait" }
 *   - end → undefined (no next action)
 *
 * Per Tech Spec §11.1: v0.8 does not infer retry/failure data. The nextAction
 * is only present when the instance is running or returned.
 */
function resolveNextAction(
  definition: WorkflowDefinition,
  instance: WorkflowInstanceRow,
  workItems: WorkItemRow[],
  projectionStatus: WorkflowRunProjection["status"],
): WorkflowRunNextAction | undefined {
  if (projectionStatus === "completed" || projectionStatus === "cancelled") {
    return undefined;
  }

  if (!instance.current_step_id) return undefined;

  const currentStep = definition.steps.find((s) => s.id === instance.current_step_id);
  if (!currentStep) return undefined;

  if (currentStep.kind === "end") return undefined;

  // Find the active work item for the current step
  const workItem = findLatestWorkItemForStep(instance.current_step_id, workItems);
  const workItemId = workItem?.id;

  switch (currentStep.kind) {
    case "approval":
      return { kind: "approval", workItemId };
    case "human_task":
      return { kind: "human_task", workItemId };
    case "system_command":
      return { kind: "system_command" };
    case "wait":
      return { kind: "wait" };
    default:
      return { kind: currentStep.kind };
  }
}

/**
 * Resolve a WorkflowRunProjection from instance data.
 *
 * This is the main projection function. It takes the raw database rows
 * (instance, work items, events) and the pinned definition, and produces
 * a business-readable run projection.
 *
 * Per Tech Spec §11.1:
 *   - Status and step history come ONLY from the pinned definition version,
 *     instance, Work Items, and ordered Workflow events.
 *   - Does NOT infer failure/retry data from returned Work Items, repeated
 *     events, audit entries, or Command errors.
 */
export function resolveWorkflowRunProjection(
  definition: WorkflowDefinition,
  instance: WorkflowInstanceRow,
  workItems: WorkItemRow[],
  events: WorkflowEventRow[],
): WorkflowRunProjection {
  const projectionStatus = resolveProjectionStatus(instance, events);
  const steps = resolveStepStates(
    definition,
    instance,
    workItems,
    events,
    projectionStatus,
  );
  const nextAction = resolveNextAction(
    definition,
    instance,
    workItems,
    projectionStatus,
  );

  return {
    instanceId: instance.id,
    status: projectionStatus,
    currentStepId: instance.current_step_id,
    startedAt: instance.started_at,
    completedAt: instance.completed_at,
    steps,
    nextAction,
  };
}
