"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  GitBranch, CheckCircle2, XCircle, Clock3, ChevronDown, ChevronUp,
  Gavel, ListChecks, FileText, User, Loader2,
} from "lucide-react";
import type { WorkflowDefinition, WorkflowTransition } from "@runory/contracts";
import type { WorkflowInstance } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { objectKeyToRouteSegment } from "@/lib/dynamic-object";
import type { MyWorkItem } from "@/lib/api-hooks";

interface RecordWorkflowPanelProps {
  workspaceId: string;
  instance: WorkflowInstance;
  definition: WorkflowDefinition;
  availableTransitions: WorkflowTransition[];
  isTerminal: boolean;
  onTransitionComplete?: () => void;
}

// State badge color mapping
const STATE_COLORS: Record<string, string> = {
  initial: "bg-blue-100 text-blue-700",
  intermediate: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  final: "bg-slate-100 text-slate-700",
};

function getStateColor(definition: WorkflowDefinition, stateName: string): string {
  const state = definition.states.find(s => s.name === stateName);
  if (!state) return "bg-slate-100 text-slate-700";
  return STATE_COLORS[state.type] ?? STATE_COLORS.intermediate;
}

function getStateLabel(definition: WorkflowDefinition, stateName: string): string {
  const state = definition.states.find(s => s.name === stateName);
  return state?.label ?? stateName;
}

export default function RecordWorkflowPanel({
  workspaceId,
  instance,
  definition,
  availableTransitions,
  isTerminal,
  onTransitionComplete,
}: RecordWorkflowPanelProps) {
  const { t } = useI18n();
  const [executingTransition, setExecutingTransition] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [pendingTransition, setPendingTransition] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleExecute = async (transitionId: string) => {
    setExecutingTransition(transitionId);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/workflows/instances/${instance.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ transitionId, comment: comment || undefined }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setPendingTransition(null);
        setComment("");
        notifyWorkspaceDataChanged();
        onTransitionComplete?.();
      } else {
        setError(json.error?.message ?? t("workspace.updateFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.updateFailed"));
    } finally {
      setExecutingTransition(null);
    }
  };

  const currentStateLabel = getStateLabel(definition, instance.currentState);
  const currentStateColor = getStateColor(definition, instance.currentState);

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
        <span className="text-xs text-slate-400">{definition.name}</span>
      </div>

      {/* Current State */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {t("workspace.workflow.currentState")}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${currentStateColor}`}>
          {isTerminal ? (
            <CheckCircle2 size={12} />
          ) : (
            <Clock3 size={12} />
          )}
          {currentStateLabel}
        </span>
      </div>

      {/* State Pipeline */}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {definition.states.map((state, idx) => (
          <div key={state.name} className="flex items-center gap-1">
            {idx > 0 && <span className="text-slate-300">→</span>}
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                state.name === instance.currentState
                  ? currentStateColor
                  : "bg-slate-50 text-slate-400"
              }`}
            >
              {state.label}
            </span>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && <div className="app-error mt-3">{error}</div>}

      {/* Available Transitions */}
      {!isTerminal && availableTransitions.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {t("workspace.workflow.availableActions")}
          </p>
          <div className="flex flex-wrap gap-2">
            {availableTransitions.map((tr) => {
              const transId = `${tr.fromStatus}->${tr.toStatus}`;
              const isExecuting = executingTransition === transId;
              const isPending = pendingTransition === transId;
              return (
                <div key={transId}>
                  {isPending ? (
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
                      <input
                        type="text"
                        className="app-input flex-1 text-xs"
                        placeholder={t("workspace.workflow.commentPlaceholder")}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleExecute(transId)}
                        disabled={isExecuting}
                        className="app-button-primary px-3 py-1 text-xs"
                      >
                        {isExecuting ? t("workspace.saving") : t("workspace.workflow.confirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPendingTransition(null); setComment(""); }}
                        className="app-button-secondary px-3 py-1 text-xs"
                      >
                        {t("workspace.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingTransition(transId)}
                      className="app-button-secondary px-3 py-1.5 text-xs"
                    >
                      {tr.label}
                      {tr.requiresApproval && (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">
                          {t("workspace.workflow.approval")}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Terminal state indicator */}
      {isTerminal && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          {instance.currentState === definition.states.find(s => s.type === "rejected")?.name ? (
            <XCircle size={16} className="text-red-400" />
          ) : (
            <CheckCircle2 size={16} className="text-green-400" />
          )}
          <span>{t("workspace.workflow.terminalState")}</span>
        </div>
      )}

      {/* History (collapsible) */}
      {instance.history.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {t("workspace.workflow.history")} ({instance.history.length})
          </button>
          {showHistory && (
            <ol className="mt-2 space-y-2">
              {instance.history.map((event, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="mt-0.5 font-mono text-slate-400">{idx + 1}.</span>
                  <div>
                    <span className="font-medium">{event.transitionLabel}</span>
                    <span className="text-slate-400">
                      {" "}: {getStateLabel(definition, event.fromStatus)} → {getStateLabel(definition, event.toStatus)}
                    </span>
                    <span className="block text-slate-400">
                      {event.actorId} · {event.timestamp}
                    </span>
                    {event.comment && (
                      <span className="block italic text-slate-500">"{event.comment}"</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>

      {/* V2 Work Items */}
      <WorkItemsSection
        workspaceId={workspaceId}
        objectType={instance.objectType}
        recordId={instance.recordId}
      />
    </>
  );
}

// ── V2 Work Items Section ──

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
  objectType: string;
  recordId: string;
}

function WorkItemsSection({ workspaceId, objectType, recordId }: WorkItemsSectionProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/workspaces/${workspaceId}/my-work?subjectType=${encodeURIComponent(objectType)}&status=ready,active`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.loadFailed"));
      const all: MyWorkItem[] = json.data?.items ?? [];
      // Scope to the current record
      setItems(all.filter((i) => i.subject_id === recordId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, objectType, recordId, t]);

  useEffect(() => { void load(); }, [load]);

  const handleDecision = async (item: MyWorkItem, outcome: "approved" | "rejected") => {
    try {
      setExecuting(`decide-${item.id}`);
      const res = await fetch(
        `/api/workspaces/${workspaceId}/work-items/${item.id}/decisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({
            outcome,
            expectedVersion: item.version,
          }),
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.updateFailed"));
      notifyWorkspaceDataChanged();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.updateFailed"));
    } finally {
      setExecuting(null);
    }
  };

  const handleComplete = async (item: MyWorkItem) => {
    try {
      setExecuting(`complete-${item.id}`);
      const res = await fetch(
        `/api/workspaces/${workspaceId}/commands/work_item.complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({
            workItemId: item.id,
            expectedVersion: item.version,
          }),
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.updateFailed"));
      notifyWorkspaceDataChanged();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.updateFailed"));
    } finally {
      setExecuting(null);
    }
  };

  const navigateToRecord = () => {
    router.push(`/w/${workspaceId}/${objectKeyToRouteSegment(objectType)}/${recordId}`);
  };

  return (
    <div className="app-card mt-4 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <ListChecks size={16} className="text-indigo-500" />
        <h3 className="text-sm font-bold text-slate-900">{t("workflowV2.workItems")}</h3>
        {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>

      {error && <div className="app-error mt-3">{error}</div>}

      {!loading && items.length === 0 && !error && (
        <p className="mt-3 text-xs text-slate-400">{t("myWork.empty")}</p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-3">
          {items.map((item) => {
            const KindIcon = KIND_ICON[item.kind] ?? ListChecks;
            const overdue = isWorkOverdue(item.due_at) && item.status !== "completed";
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
                      {item.form_binding_id && (
                        <span className="app-badge bg-purple-50 text-purple-700">
                          {t("workflowV2.formBinding")}: {item.form_binding_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      {item.assignee_id ? (
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {t("workflowV2.assignee")}:{" "}
                          {item.assignee_type === "permission_group"
                            ? item.assignee_id.replace(/_/g, " ")
                            : item.assignee_id}
                        </span>
                      ) : null}
                      <span className={`flex items-center gap-1 ${overdue ? "font-semibold text-red-600" : ""}`}>
                        <Clock3 size={12} />
                        {t("workflowV2.dueDate")}:{" "}
                        {item.due_at ? formatWorkDate(item.due_at) : t("myWork.noDueDate")}
                      </span>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                    {item.kind === "form" && (
                      <button
                        type="button"
                        onClick={navigateToRecord}
                        className="app-button-secondary px-3 py-1 text-xs"
                      >
                        <FileText size={12} />
                        {t("extension.viewDetails")}
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
