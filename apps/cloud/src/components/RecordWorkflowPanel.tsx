"use client";

import { useState } from "react";
import { GitBranch, CheckCircle2, XCircle, Clock3, ChevronDown, ChevronUp } from "lucide-react";
import type { WorkflowDefinition, WorkflowTransition } from "@runory/contracts";
import type { WorkflowInstance } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";

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
  );
}
