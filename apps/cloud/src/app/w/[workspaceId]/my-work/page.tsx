"use client";

import { Suspense, useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw, Clock3, AlertTriangle, CheckCircle2, User,
  ArrowRight, Loader2, Gavel, ListChecks, FileText,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MyWorkItem } from "@/lib/api-hooks";
import { apiFetch, apiPost } from "@/lib/api-fetch";

interface Toast { type: "success" | "error"; message: string }

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

const KIND_LABEL_KEY: Record<string, string> = {
  approval: "myWork.kindApproval",
  human_task: "myWork.kindHumanTask",
  form: "myWork.kindForm",
};

const STATUS_LABEL_KEY: Record<string, string> = {
  ready: "myWork.statusReady",
  active: "myWork.statusClaimed",
  completed: "myWork.statusCompleted",
  cancelled: "myWork.statusCompleted",
};

const SUBJECT_ROUTE: Record<string, string> = {
  quote: "quotes",
  work_order: "work-orders",
  service_visit: "service-visits",
  service_report: "service-reports",
};

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

function formatDate(iso: string | null): string {
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

export default function MyWorkPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-400" /></div>}>
      <MyWorkPage />
    </Suspense>
  );
}

function MyWorkPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const initialKind = searchParams.get("kind") ?? "";
  const initialSubjectType = searchParams.get("subjectType") ?? "";

  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [filterKind, setFilterKind] = useState(initialKind);
  const [filterStatus, setFilterStatus] = useState("");
  const [executing, setExecuting] = useState<string | null>(null);
  const [decisionFor, setDecisionFor] = useState<MyWorkItem | null>(null);
  const [decisionOutcome, setDecisionOutcome] = useState<"approved" | "rejected">("approved");
  const [decisionComment, setDecisionComment] = useState("");

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filterKind) params.set("kind", filterKind);
      if (filterStatus) params.set("status", filterStatus);
      if (initialSubjectType) params.set("subjectType", initialSubjectType);
      const json = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: { items: MyWorkItem[] };
      }>(
        `/api/workspaces/${workspaceId}/my-work?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
      setItems(json.data?.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filterKind, filterStatus, initialSubjectType]);

  useEffect(() => { void load(); }, [load]);

  const handleClaim = async (item: MyWorkItem) => {
    try {
      setExecuting(`claim-${item.id}`);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/work-items/${item.id}/claim`,
        { expectedVersion: item.version }
      );
      if (!json.success) throw new Error(json.error?.message ?? "Claim failed");
      showToast("success", "Work item claimed");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Claim failed");
    } finally {
      setExecuting(null);
    }
  };

  const handleDecision = async () => {
    if (!decisionFor) return;
    try {
      setExecuting(`decide-${decisionFor.id}`);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/work-items/${decisionFor.id}/decisions`,
        {
          outcome: decisionOutcome,
          comment: decisionComment || null,
          expectedVersion: decisionFor.version,
        }
      );
      if (!json.success) throw new Error(json.error?.message ?? "Decision failed");
      showToast("success", decisionOutcome === "approved" ? "Approved" : "Rejected");
      setDecisionFor(null);
      setDecisionComment("");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Decision failed");
    } finally {
      setExecuting(null);
    }
  };

  const handleComplete = async (item: MyWorkItem) => {
    try {
      setExecuting(`complete-${item.id}`);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/commands/work_item.complete`,
        {
          workItemId: item.id,
          expectedVersion: item.version,
        }
      );
      if (!json.success) throw new Error(json.error?.message ?? "Complete failed");
      showToast("success", "Work item completed");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Complete failed");
    } finally {
      setExecuting(null);
    }
  };

  const navigateToSubject = (item: MyWorkItem) => {
    if (!item.subject_type || !item.subject_id) return;
    const slug = SUBJECT_ROUTE[item.subject_type] ?? item.subject_type.replace(/_/g, "-");
    router.push(`/w/${workspaceId}/${slug}/${item.subject_id}`);
  };

  const overdueCount = useMemo(
    () => items.filter(i => isOverdue(i.due_at) && i.status !== "completed").length,
    [items]
  );

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-20 z-[60] flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("myWork.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {items.length} {items.length === 1 ? "item" : "items"}
            {overdueCount > 0 && (
              <span className="ml-2 text-red-600">({overdueCount} overdue)</span>
            )}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="app-button-ghost"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {t("workspace.refresh")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">{t("myWork.filterKind")}</label>
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500"
          >
            <option value="">{t("myWork.filterAll")}</option>
            <option value="approval">{t("myWork.kindApproval")}</option>
            <option value="human_task">{t("myWork.kindHumanTask")}</option>
            <option value="form">{t("myWork.kindForm")}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">{t("myWork.filterStatus")}</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500"
          >
            <option value="">{t("myWork.filterAll")}</option>
            <option value="ready">{t("myWork.statusReady")}</option>
            <option value="overdue">{t("myWork.statusOverdue")}</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="app-error">{error}</div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="app-card p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <CheckCircle2 size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">{t("myWork.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const KindIcon = KIND_ICON[item.kind] ?? ListChecks;
            const overdue = isOverdue(item.due_at) && item.status !== "completed";
            const isOperational = item.instance_id === "operational" || Boolean(item.operational_source);
            return (
              <div
                key={item.id}
                className={`app-card p-4 sm:p-5 ${overdue ? "border-red-200" : ""}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: Kind + Subject */}
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${KIND_BADGE[item.kind] ?? "bg-slate-100 text-slate-600"}`}>
                      <KindIcon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`app-badge ${KIND_BADGE[item.kind] ?? "bg-slate-100 text-slate-600"}`}>
                          {t(KIND_LABEL_KEY[item.kind] as any ?? "myWork.kindHumanTask")}
                        </span>
                        <span className={`app-badge ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {item.status === "ready" && overdue
                            ? t("myWork.statusOverdue")
                            : t(STATUS_LABEL_KEY[item.status] as any ?? "myWork.statusReady")}
                        </span>
                        {item.subject_type && (
                          <button
                            onClick={() => navigateToSubject(item)}
                            className="app-badge bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100"
                          >
                            {SUBJECT_LABEL[item.subject_type] ?? item.subject_type}
                            <ArrowRight size={12} />
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        {item.title && (
                          <span className="w-full text-sm font-semibold text-slate-900">
                            {item.title}
                          </span>
                        )}
                        {item.due_at && (
                          <span className={`flex items-center gap-1 ${overdue ? "font-semibold text-red-600" : ""}`}>
                            <Clock3 size={12} />
                            {t("myWork.dueDate")}: {formatDate(item.due_at)}
                          </span>
                        )}
                        {item.assignee_id && (
                          <span className="flex items-center gap-1">
                            <User size={12} />
                            {t("myWork.assignee")}: {item.assignee_display ?? (item.assignee_type === "permission_group" ? item.assignee_id.replace(/_/g, " ") : item.assignee_id)}
                          </span>
                        )}
                        {item.form_binding_id && (
                          <span className="text-purple-600">
                            {t("workflow.formBinding")}: {item.form_binding_id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    {isOperational && item.subject_type && item.subject_id && (
                      <button
                        onClick={() => navigateToSubject(item)}
                        className="app-button-primary text-xs"
                      >
                        Open
                        <ArrowRight size={14} />
                      </button>
                    )}
                    {!isOperational && item.status === "ready" && (
                      <button
                        onClick={() => void handleClaim(item)}
                        disabled={executing === `claim-${item.id}`}
                        className="app-button-secondary text-xs"
                      >
                        {executing === `claim-${item.id}` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : null}
                        {t("myWork.actionClaim")}
                      </button>
                    )}
                    {!isOperational && item.kind === "approval" && item.status !== "completed" && (
                      <>
                        <button
                          onClick={() => {
                            setDecisionFor(item);
                            setDecisionOutcome("approved");
                            setDecisionComment("");
                          }}
                          disabled={executing === `decide-${item.id}`}
                          className="app-button-primary text-xs"
                        >
                          {t("myWork.actionApprove")}
                        </button>
                        <button
                          onClick={() => {
                            setDecisionFor(item);
                            setDecisionOutcome("rejected");
                            setDecisionComment("");
                          }}
                          disabled={executing === `decide-${item.id}`}
                          className="app-button-danger text-xs"
                        >
                          {t("myWork.actionReject")}
                        </button>
                      </>
                    )}
                    {!isOperational && item.kind === "human_task" && item.status !== "completed" && (
                      <button
                        onClick={() => void handleComplete(item)}
                        disabled={executing === `complete-${item.id}`}
                        className="app-button-primary text-xs"
                      >
                        {executing === `complete-${item.id}` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : null}
                        {t("myWork.actionComplete")}
                      </button>
                    )}
                    {!isOperational && item.kind === "form" && item.form_binding_id && item.status !== "completed" && (
                      <button
                        onClick={() => navigateToSubject(item)}
                        className="app-button-secondary text-xs"
                      >
                        {t("forms.actionSubmit")}
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Decision Modal */}
      {decisionFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setDecisionFor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">
              {decisionOutcome === "approved" ? t("myWork.actionApprove") : t("myWork.actionReject")}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {decisionFor.subject_type ?? "Work item"} · {decisionFor.id.slice(0, 12)}
            </p>
            <textarea
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              placeholder={t("forms.returnReason")}
              className="app-input mt-4 h-24 resize-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDecisionFor(null)}
                className="app-button-ghost"
              >
                {t("workspace.cancel")}
              </button>
              <button
                onClick={() => void handleDecision()}
                disabled={executing === `decide-${decisionFor.id}`}
                className={decisionOutcome === "approved" ? "app-button-primary" : "app-button-danger"}
              >
                {executing === `decide-${decisionFor.id}` ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : null}
                {decisionOutcome === "approved" ? t("myWork.actionApprove") : t("myWork.actionReject")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
