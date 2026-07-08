"use client";

import { useState, useCallback, useMemo } from "react";
import {
  GitBranch, CheckCircle2, Clock3, ChevronDown, ChevronUp,
  Gavel, ListChecks, FileText, User, Loader2, AlertCircle,
} from "lucide-react";
import type { WorkflowInstance, WorkItem, WorkflowEvent } from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useRecordWorkflow } from "@/lib/api-hooks";
import { apiPost } from "@/lib/api-fetch";

interface RecordWorkflowPanelProps {
  workspaceId: string;
  objectKey: string;
  recordId: string;
}

const INSTANCE_STATUS_BADGE: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

export default function RecordWorkflowPanel({
  workspaceId,
  objectKey,
  recordId,
}: RecordWorkflowPanelProps) {
  const { t } = useI18n();
  const { data, isLoading, mutate } = useRecordWorkflow(workspaceId, objectKey, recordId);

  const handleRefresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  // Build step pipeline from work items (distinct stepId in creation order).
  // The API returns instance + work_items + events but no definition, so we
  // derive the step list from the work items themselves.
  const steps = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const result: { stepId: string; kind: string }[] = [];
    for (const item of data.workItems) {
      if (!seen.has(item.stepId)) {
        seen.add(item.stepId);
        result.push({ stepId: item.stepId, kind: item.kind });
      }
    }
    return result;
  }, [data]);

  if (isLoading) {
    return (
      <div className="app-card p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900">
            {t("workspace.workflow.title")}
          </h3>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          {t("workspace.loading")}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-card p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900">
            {t("workspace.workflow.title")}
          </h3>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <AlertCircle size={14} />
          {t("workflow.noWorkflow")}
        </div>
      </div>
    );
  }

  const { instance, workItems, events } = data;
  const currentStepId = instance.currentStepId;
  const isCompleted = instance.status === "completed";
  const statusBadge = INSTANCE_STATUS_BADGE[instance.status] ?? "bg-slate-100 text-slate-700";

  return (
    <>
      <div className="app-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-900">
              {t("workspace.workflow.title")}
            </h3>
          </div>
          <span className={`app-badge ${statusBadge}`}>
            {isCompleted ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
            {instance.status}
          </span>
        </div>

        {/* Current Step */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {t("workflow.currentStep")}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            {isCompleted ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
            {currentStepId ?? "—"}
          </span>
        </div>

        {/* Step Pipeline */}
        {steps.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("workflow.stepPipeline")}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {steps.map((step, idx) => (
                <div key={step.stepId} className="flex items-center gap-1">
                  {idx > 0 && <span className="text-slate-300">&rarr;</span>}
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      step.stepId === currentStepId && !isCompleted
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    {step.stepId}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Work Items */}
      <WorkItemsSection
        workspaceId={workspaceId}
        workItems={workItems}
        onRefresh={handleRefresh}
      />

      {/* Recent Events */}
      <EventsSection events={events} />
    </>
  );
}

// ── Work Items Section ──

const KIND_ICON: Record<string, typeof Gavel> = {
  approval: Gavel,
  human_task: ListChecks,
  form: FileText,
};

const KIND_BADGE: Record<string, string> = {
  approval: "bg-amber-50 text-amber-700",
  human_task: "bg-blue-50 text-blue-700",
  form: "bg-purple-50 text-purple-700",
};

const STATUS_BADGE: Record<string, string> = {
  ready: "bg-slate-100 text-slate-700",
  active: "bg-green-50 text-green-700",
  completed: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-50 text-red-600",
};

const KIND_LABEL_KEY: Record<string, MessageKey> = {
  approval: "myWork.kindApproval",
  human_task: "myWork.kindHumanTask",
  form: "myWork.kindForm",
};

const STATUS_LABEL_KEY: Record<string, MessageKey> = {
  ready: "myWork.statusReady",
  active: "myWork.statusClaimed",
  completed: "myWork.statusCompleted",
  cancelled: "myWork.statusCompleted",
};

function isWorkOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

function formatWorkDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

interface WorkItemsSectionProps {
  workspaceId: string;
  workItems: WorkItem[];
  onRefresh: () => void;
}

function WorkItemsSection({ workspaceId, workItems, onRefresh }: WorkItemsSectionProps) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  const handleDecision = async (item: WorkItem, outcome: "approved" | "rejected") => {
    try {
      setExecuting(`decide-${item.id}`);
      setError(null);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/work-items/${item.id}/decisions`,
        {
          outcome,
          expectedVersion: item.version,
        }
      );
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.updateFailed"));
      notifyWorkspaceDataChanged();
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.updateFailed"));
    } finally {
      setExecuting(null);
    }
  };

  const handleComplete = async (item: WorkItem) => {
    try {
      setExecuting(`complete-${item.id}`);
      setError(null);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/commands/work_item.complete`,
        {
          workItemId: item.id,
          expectedVersion: item.version,
        }
      );
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.updateFailed"));
      notifyWorkspaceDataChanged();
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.updateFailed"));
    } finally {
      setExecuting(null);
    }
  };

  const handleClaim = async (item: WorkItem) => {
    try {
      setExecuting(`claim-${item.id}`);
      setError(null);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/work-items/${item.id}/claim`,
        { expectedVersion: item.version }
      );
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.updateFailed"));
      notifyWorkspaceDataChanged();
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.updateFailed"));
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div className="app-card mt-4 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <ListChecks size={16} className="text-indigo-500" />
        <h3 className="text-sm font-bold text-slate-900">{t("workflow.workItems")}</h3>
      </div>

      {error && <div className="app-error mt-3">{error}</div>}

      {workItems.length === 0 && !error && (
        <p className="mt-3 text-xs text-slate-400">{t("myWork.empty")}</p>
      )}

      {workItems.length > 0 && (
        <ul className="mt-3 space-y-3">
          {workItems.map((item) => {
            const KindIcon = KIND_ICON[item.kind] ?? ListChecks;
            const overdue = isWorkOverdue(item.dueAt) && item.status !== "completed";
            const kindBadge = KIND_BADGE[item.kind] ?? "bg-slate-100 text-slate-600";
            const statusBadge = STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600";
            const kindLabelKey = KIND_LABEL_KEY[item.kind] ?? "myWork.kindHumanTask";
            const statusLabelKey = STATUS_LABEL_KEY[item.status] ?? "myWork.statusReady";
            return (
              <li key={item.id} className={`rounded-lg border border-slate-200 p-3 ${overdue ? "border-red-200" : ""}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: badges + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`app-badge ${kindBadge}`}>
                        <KindIcon size={12} />
                        {t(kindLabelKey)}
                      </span>
                      <span className={`app-badge ${statusBadge}`}>
                        {overdue && item.status !== "completed"
                          ? t("myWork.statusOverdue")
                          : t(statusLabelKey)}
                      </span>
                      <span className="app-badge bg-slate-50 text-slate-500">
                        {t("workflow.stepKind")}: {item.stepId}
                      </span>
                      {item.formBindingId && (
                        <span className="app-badge bg-purple-50 text-purple-700">
                          {t("workflow.formBinding")}: {item.formBindingId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      {item.assigneeId ? (
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {t("workflow.assignee")}:{" "}
                          {item.assigneeType === "permission_group"
                            ? item.assigneeId.replace(/_/g, " ")
                            : item.assigneeId}
                        </span>
                      ) : null}
                      <span className={`flex items-center gap-1 ${overdue ? "font-semibold text-red-600" : ""}`}>
                        <Clock3 size={12} />
                        {t("workflow.dueDate")}:{" "}
                        {item.dueAt ? formatWorkDate(item.dueAt) : t("myWork.noDueDate")}
                      </span>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {/* Claim: available for items in ready status */}
                    {item.status === "ready" && (
                      <button
                        type="button"
                        onClick={() => void handleClaim(item)}
                        disabled={executing === `claim-${item.id}`}
                        className="app-button-secondary px-3 py-1 text-xs"
                      >
                        {executing === `claim-${item.id}` ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <User size={12} />
                        )}
                        {t("myWork.actionClaim")}
                      </button>
                    )}
                    {/* Approve/Reject: for approval items not yet completed */}
                    {item.kind === "approval" && item.status !== "completed" && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDecision(item, "approved")}
                          disabled={executing === `decide-${item.id}`}
                          className="app-button-primary px-3 py-1 text-xs"
                        >
                          {executing === `decide-${item.id}` ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={12} />
                          )}
                          {t("myWork.actionApprove")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDecision(item, "rejected")}
                          disabled={executing === `decide-${item.id}`}
                          className="app-button-secondary px-3 py-1 text-xs"
                        >
                          {t("myWork.actionReject")}
                        </button>
                      </>
                    )}
                    {/* Complete: for human_task items not yet completed */}
                    {item.kind === "human_task" && item.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => void handleComplete(item)}
                        disabled={executing === `complete-${item.id}`}
                        className="app-button-primary px-3 py-1 text-xs"
                      >
                        {executing === `complete-${item.id}` ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        {t("myWork.actionComplete")}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Events Section ──

const EVENT_TYPE_ICON: Record<string, typeof GitBranch> = {
  step_entered: GitBranch,
  step_completed: CheckCircle2,
  work_item_created: ListChecks,
  work_item_completed: CheckCircle2,
  work_item_claimed: User,
  instance_started: Clock3,
  instance_completed: CheckCircle2,
  approval_decision: Gavel,
};

interface EventsSectionProps {
  events: WorkflowEvent[];
}

function EventsSection({ events }: EventsSectionProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  // Show most recent first; default to last 5, expandable to all.
  const sorted = useMemo(
    () => [...events].sort((a, b) => b.sequence - a.sequence),
    [events]
  );
  const visible = expanded ? sorted : sorted.slice(0, 5);

  return (
    <div className="app-card mt-4 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock3 size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900">{t("workflow.recentEvents")}</h3>
        </div>
        {sorted.length > 5 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {sorted.length}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">{t("workflow.noEvents")}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {visible.map((event) => {
            const EventIcon = EVENT_TYPE_ICON[event.eventType] ?? Clock3;
            return (
              <li key={event.id} className="flex items-start gap-2 text-xs text-slate-600">
                <EventIcon size={12} className="mt-0.5 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <span className="font-medium">{event.eventType}</span>
                  {event.stepId && (
                    <span className="text-slate-400"> · {event.stepId}</span>
                  )}
                  <span className="block text-slate-400">
                    {event.actorId ?? "system"} · {formatWorkDate(event.occurredAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
