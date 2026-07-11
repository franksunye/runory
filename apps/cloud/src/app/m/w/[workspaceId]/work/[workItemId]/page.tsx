"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertTriangle, CheckCircle2, Clock3,
  Gavel, ListChecks, FileText, User, ChevronRight, AlertCircle, RefreshCw,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { apiFetch, apiPost } from "@/lib/api-fetch";

export const dynamic = "force-dynamic";

// ── Types ──

interface WorkItemDetail {
  id: string;
  workspace_id: string;
  instance_id: string;
  step_id: string;
  kind: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
  assignee_type: string | null;
  assignee_id: string | null;
  candidate_rule_json: string | null;
  due_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  form_binding_id: string | null;
  input_snapshot_json: string | null;
  input_snapshot_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

// ── Badge / icon maps ──

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

// ── Helpers ──

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const SUBJECT_LABEL: Record<string, string> = {
  quote: "Quote",
  work_order: "Work Order",
  service_visit: "Visit",
  service_report: "Report",
};

// ── Page ──

export default function MobileWorkItemPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileWorkItemPage />
    </Suspense>
  );
}

function MobileWorkItemPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const workItemId = params.workItemId as string;
  const router = useRouter();
  const { t } = useI18n();

  const [item, setItem] = useState<WorkItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [staleState, setStaleState] = useState<{ visible: boolean; message: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const json = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: WorkItemDetail | null;
      }>(
        `/api/workspaces/${workspaceId}/my-work/${workItemId}`,
        { cache: "no-store" }
      );
      if (!json.success) {
        throw new Error(json.error?.message ?? t("mobile.errorOccurred"));
      }
      setItem(json.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mobile.errorOccurred"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, workItemId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Helper: detect stale state (VERSION_CONFLICT) from API error
  const isStaleStateError = (e: unknown): boolean => {
    if (e instanceof Error) {
      const msg = e.message.toLowerCase();
      return msg.includes("version_conflict") || msg.includes("version conflict") ||
             msg.includes("expected version") || msg.includes("modified by another");
    }
    return false;
  };

  // ── Actions ──

  const handleClaim = async () => {
    if (!item) return;
    try {
      setExecuting("claim");
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/work-items/${item.id}/claim`,
        { expectedVersion: item.version }
      );
      if (!json.success) throw new Error(json.error?.message ?? t("mobile.actionFailed"));
      notifyWorkspaceDataChanged();
      showToast("success", t("mobile.actionSuccess"));
      await load();
    } catch (e) {
      if (isStaleStateError(e)) {
        setStaleState({ visible: true, message: e instanceof Error ? e.message : t("mobile.staleStateDesc") });
      } else {
        showToast("error", e instanceof Error ? e.message : t("mobile.actionFailed"));
      }
    } finally {
      setExecuting(null);
    }
  };

  const handleComplete = async () => {
    if (!item) return;
    try {
      setExecuting("complete");
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/work-items/${item.id}/complete`,
        { expectedVersion: item.version }
      );
      if (!json.success) throw new Error(json.error?.message ?? t("mobile.actionFailed"));
      notifyWorkspaceDataChanged();
      showToast("success", t("mobile.actionSuccess"));
      await load();
    } catch (e) {
      if (isStaleStateError(e)) {
        setStaleState({ visible: true, message: e instanceof Error ? e.message : t("mobile.staleStateDesc") });
      } else {
        showToast("error", e instanceof Error ? e.message : t("mobile.actionFailed"));
      }
    } finally {
      setExecuting(null);
    }
  };

  const handleDecision = async (outcome: "approved" | "rejected") => {
    if (!item) return;
    try {
      setExecuting(`decide-${outcome}`);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/work-items/${item.id}/decisions`,
        {
          outcome,
          comment: decisionComment || null,
          expectedVersion: item.version,
        }
      );
      if (!json.success) throw new Error(json.error?.message ?? t("mobile.actionFailed"));
      notifyWorkspaceDataChanged();
      showToast("success", t("mobile.actionSuccess"));
      setDecisionComment("");
      await load();
    } catch (e) {
      if (isStaleStateError(e)) {
        setStaleState({ visible: true, message: e instanceof Error ? e.message : t("mobile.staleStateDesc") });
      } else {
        showToast("error", e instanceof Error ? e.message : t("mobile.actionFailed"));
      }
    } finally {
      setExecuting(null);
    }
  };

  // Stale-state recovery: reload the latest data
  const handleStaleStateRecovery = async () => {
    setStaleState(null);
    await load();
    showToast("success", t("mobile.staleStateRefreshed"));
  };

  // ── Render ──

  const KindIcon = item ? (KIND_ICON[item.kind] ?? ListChecks) : ListChecks;
  const overdue = item ? isOverdue(item.due_at) && item.status !== "completed" : false;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 top-4 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
          style={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
        >
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Stale-state recovery dialog (v0.5.1 Spec §5.4) */}
      {staleState?.visible && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle size={24} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {t("mobile.staleStateTitle")}
                </h3>
              </div>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-slate-600">
              {t("mobile.staleStateDesc")}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void handleStaleStateRecovery()}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white active:bg-indigo-700"
              >
                <RefreshCw size={16} />
                {t("mobile.staleStateRefresh")}
              </button>
              <button
                onClick={() => setStaleState(null)}
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 active:bg-slate-50"
              >
                {t("mobile.staleStateDismiss")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">
            {t("mobile.workItemTitle")}
          </h1>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-slate-400" />
            <p className="mt-3 text-xs text-slate-400">{t("mobile.loading")}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-center text-sm text-red-600">{error}</p>
            <button
              onClick={() => void load()}
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.retry")}
            </button>
          </div>
        ) : !item ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <AlertCircle size={28} className="text-slate-400" />
            <p className="text-sm text-slate-500">{t("mobile.workItemNotFound")}</p>
            <button
              onClick={() => router.push(`/m/w/${workspaceId}`)}
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.tabToday")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Work item summary card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                    KIND_BADGE[item.kind] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  <KindIcon size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        KIND_BADGE[item.kind] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {t(KIND_LABEL_KEY[item.kind] ?? "myWork.kindHumanTask")}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {overdue
                        ? t("myWork.statusOverdue")
                        : t(STATUS_LABEL_KEY[item.status] ?? "myWork.statusReady")}
                    </span>
                    {item.subject_type && (
                      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {SUBJECT_LABEL[item.subject_type] ?? item.subject_type}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-slate-400">{item.id}</p>
                </div>
              </div>
            </div>

            {/* Detail rows */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <dl className="space-y-3">
                {/* Subject */}
                <div className="flex items-center gap-3">
                  <dt className="w-20 shrink-0 text-xs text-slate-400">{t("mobile.workItemSubject")}</dt>
                  <dd className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                    {item.subject_type
                      ? SUBJECT_LABEL[item.subject_type] ?? item.subject_type
                      : "—"}
                    {item.subject_id && (
                      <span className="ml-1.5 font-mono text-[11px] text-slate-400">
                        {item.subject_id.slice(0, 12)}
                      </span>
                    )}
                  </dd>
                </div>

                {/* Step */}
                <div className="flex items-center gap-3">
                  <dt className="w-20 shrink-0 text-xs text-slate-400">{t("mobile.workItemStep")}</dt>
                  <dd className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                    {item.step_id}
                  </dd>
                </div>

                {/* Status */}
                <div className="flex items-center gap-3">
                  <dt className="w-20 shrink-0 text-xs text-slate-400">{t("mobile.workItemStatus")}</dt>
                  <dd className="flex-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.status === "active" && <CheckCircle2 size={12} />}
                      {item.status === "ready" && <Clock3 size={12} />}
                      {overdue
                        ? t("myWork.statusOverdue")
                        : t(STATUS_LABEL_KEY[item.status] ?? "myWork.statusReady")}
                    </span>
                  </dd>
                </div>

                {/* Assignee */}
                {item.assignee_id && (
                  <div className="flex items-center gap-3">
                    <dt className="w-20 shrink-0 text-xs text-slate-400">{t("workflow.assignee")}</dt>
                    <dd className="min-w-0 flex-1 flex items-center gap-1 text-sm font-medium text-slate-800">
                      <User size={12} className="text-slate-400" />
                      {item.assignee_type === "permission_group"
                        ? item.assignee_id.replace(/_/g, " ")
                        : item.assignee_id}
                    </dd>
                  </div>
                )}

                {/* Due date */}
                {item.due_at && (
                  <div className="flex items-center gap-3">
                    <dt className="w-20 shrink-0 text-xs text-slate-400">{t("workflow.dueDate")}</dt>
                    <dd className={`min-w-0 flex-1 text-sm font-medium ${overdue ? "text-red-600" : "text-slate-800"}`}>
                      {formatDateTime(item.due_at)}
                    </dd>
                  </div>
                )}

                {/* Form binding */}
                {item.form_binding_id && (
                  <div className="flex items-center gap-3">
                    <dt className="w-20 shrink-0 text-xs text-slate-400">{t("mobile.workItemFormBinding")}</dt>
                    <dd className="min-w-0 flex-1 text-sm font-mono text-purple-600">
                      {item.form_binding_id.slice(0, 12)}
                    </dd>
                  </div>
                )}

                {/* Claimed by */}
                {item.claimed_by && (
                  <div className="flex items-center gap-3">
                    <dt className="w-20 shrink-0 text-xs text-slate-400">{t("myWork.actionClaim")}</dt>
                    <dd className="min-w-0 flex-1 text-sm text-slate-600">
                      {item.claimed_by}
                      {item.claimed_at && (
                        <span className="ml-1.5 text-xs text-slate-400">
                          {formatDateTime(item.claimed_at)}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Form binding info */}
            {item.form_binding_id && item.kind === "form" && (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-purple-600" />
                  <p className="text-sm font-semibold text-purple-900">
                    {t("mobile.workItemFormBinding")}
                  </p>
                </div>
                <p className="mt-1 text-xs text-purple-600">
                  {item.form_binding_id.slice(0, 12)}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-900">{t("mobile.workItemActions")}</h3>

              {item.status === "completed" || item.status === "cancelled" ? (
                <p className="py-2 text-center text-xs text-slate-400">
                  {t("mobile.workItemNoActions")}
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Claim */}
                  {item.status === "ready" && (
                    <button
                      onClick={() => void handleClaim()}
                      disabled={executing === "claim"}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
                    >
                      {executing === "claim" ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <User size={16} />
                      )}
                      {t("myWork.actionClaim")}
                    </button>
                  )}

                  {/* Complete (human_task) */}
                  {item.kind === "human_task" && item.status !== "completed" && (
                    <button
                      onClick={() => void handleComplete()}
                      disabled={executing === "complete"}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-indigo-700 disabled:opacity-50"
                    >
                      {executing === "complete" ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      {t("myWork.actionComplete")}
                    </button>
                  )}

                  {/* Approve / Reject (approval) */}
                  {item.kind === "approval" && item.status !== "completed" && (
                    <>
                      {/* Comment input for decisions */}
                      <textarea
                        value={decisionComment}
                        onChange={(e) => setDecisionComment(e.target.value)}
                        placeholder={t("workspace.workflow.commentPlaceholder")}
                        className="h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:bg-white"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => void handleDecision("approved")}
                          disabled={executing === "decide-approved" || executing === "decide-rejected"}
                          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-green-700 disabled:opacity-50"
                        >
                          {executing === "decide-approved" ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                          {t("myWork.actionApprove")}
                        </button>
                        <button
                          onClick={() => void handleDecision("rejected")}
                          disabled={executing === "decide-approved" || executing === "decide-rejected"}
                          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-600 active:bg-red-50 disabled:opacity-50"
                        >
                          {executing === "decide-rejected" ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <AlertCircle size={16} />
                          )}
                          {t("myWork.actionReject")}
                        </button>
                      </div>
                    </>
                  )}

                  {/* Form: stay inside the mobile execution shell */}
                  {item.kind === "form" && item.form_binding_id && item.subject_type && (
                    <Link
                      href={`/m/w/${workspaceId}/work/${item.id}/form`}
                      className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 active:bg-indigo-100"
                    >
                      <span className="flex items-center gap-2">
                        <FileText size={16} />
                        {t("forms.actionSubmit")}
                      </span>
                      <ChevronRight size={16} />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
