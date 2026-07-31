/**
 * Human-readable workflow step labels for office UI (G3 UX Batch 4 / UX-B3).
 * Prefer definition/runProjection labels when provided; never leave raw stepIds alone.
 */

import type { MessageKey } from "@/i18n/messages";

const KNOWN_STEP_KEYS: Record<string, MessageKey> = {
  approval: "workflow.step.approval",
  form: "workflow.step.form",
  human_task: "workflow.step.human_task",
  field_execution: "workflow.step.field_execution",
  start: "workflow.step.start",
  end: "workflow.step.end",
  system_command: "workflow.step.system_command",
  wait: "workflow.step.wait",
};

export function humanizeStepId(stepId: string): string {
  const cleaned = stepId.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return stepId;
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function workflowStepLabel(
  stepId: string | null | undefined,
  options?: {
    definitionLabel?: string | null;
    t?: (key: MessageKey) => string;
  },
): string {
  if (!stepId) return "—";
  const fromDefinition = options?.definitionLabel?.trim();
  if (fromDefinition) return fromDefinition;

  const known = KNOWN_STEP_KEYS[stepId];
  if (known && options?.t) return options.t(known);
  if (known) return humanizeStepId(stepId);

  // Match known kind prefixes: approval_1 → Approval
  for (const [key, messageKey] of Object.entries(KNOWN_STEP_KEYS)) {
    if (stepId === key || stepId.startsWith(`${key}_`) || stepId.startsWith(`${key}-`)) {
      if (options?.t) return options.t(messageKey);
      return humanizeStepId(key);
    }
  }

  return humanizeStepId(stepId);
}
