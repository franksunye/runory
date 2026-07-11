"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  Inbox,
  ArrowRight,
  X,
  CircleDot,
  Plus,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import type {
  FormDefinition,
  FormBinding,
  FormSubmission,
} from "@/lib/api-hooks";
import { apiFetch, apiPost } from "@/lib/api-fetch";

interface Toast {
  type: "success" | "error";
  message: string;
}

type TabKey = "definitions" | "bindings" | "submissions";

const TAB_LABELS: Record<TabKey, MessageKey> = {
  definitions: "forms.definitions",
  bindings: "forms.bindings",
  submissions: "forms.submissions",
};

// Definition status → i18n key
const DEFINITION_STATUS_KEY: Record<string, MessageKey> = {
  draft: "forms.statusDraft",
  active: "forms.statusActive",
  retired: "forms.statusRetired",
};

const DEFINITION_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-50 text-emerald-700",
  retired: "bg-red-50 text-red-600",
};

// Submission status → i18n key
const SUBMISSION_STATUS_KEY: Record<string, MessageKey> = {
  draft: "forms.submissionStatusDraft",
  submitted: "forms.submissionStatusSubmitted",
  accepted: "forms.submissionStatusAccepted",
  returned: "forms.submissionStatusReturned",
  void: "forms.submissionStatusVoid",
};

const SUBMISSION_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  returned: "bg-red-50 text-red-600",
  void: "bg-slate-200 text-slate-500",
};

// Usage type → i18n key
const USAGE_TYPE_KEY: Record<string, MessageKey> = {
  workflow_step: "forms.usageWorkflowStep",
  record_action: "forms.usageRecordAction",
  public_endpoint: "forms.usagePublicEndpoint",
  marketing_capture: "forms.usageMarketingCapture",
  service_deliverable: "forms.usageServiceDeliverable",
};

const USAGE_TYPE_COLOR: Record<string, string> = {
  workflow_step: "bg-blue-50 text-blue-700",
  record_action: "bg-emerald-50 text-emerald-700",
  public_endpoint: "bg-purple-50 text-purple-700",
  marketing_capture: "bg-amber-50 text-amber-700",
  service_deliverable: "bg-cyan-50 text-cyan-700",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default function FormsPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const router = useRouter();
  const { t } = useI18n();

  const [tab, setTab] = useState<TabKey>("definitions");

  const [definitions, setDefinitions] = useState<FormDefinition[]>([]);
  const [bindings, setBindings] = useState<FormBinding[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Submissions filters
  const [filterSubjectType, setFilterSubjectType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Expanded submission row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Action state
  const [executing, setExecuting] = useState<string | null>(null);
  const [returnFor, setReturnFor] = useState<FormSubmission | null>(null);
  const [returnReason, setReturnReason] = useState("");

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [defsJson, bindsJson] = await Promise.all([
        apiFetch<{ success: boolean; error?: { message: string }; data?: FormDefinition[] }>(
          `/api/workspaces/${workspaceId}/forms/definitions`,
          { cache: "no-store" }
        ),
        apiFetch<{ success: boolean; error?: { message: string }; data?: FormBinding[] }>(
          `/api/workspaces/${workspaceId}/forms/bindings`,
          { cache: "no-store" }
        ),
      ]);
      if (!defsJson.success)
        throw new Error(defsJson.error?.message ?? t("workspace.loadFailed"));
      if (!bindsJson.success)
        throw new Error(bindsJson.error?.message ?? t("workspace.loadFailed"));
      setDefinitions(defsJson.data ?? []);
      setBindings(bindsJson.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, t]);

  const loadSubmissions = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filterSubjectType) qs.set("subjectType", filterSubjectType);
      if (filterStatus) qs.set("status", filterStatus);
      const json = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: FormSubmission[];
      }>(
        `/api/workspaces/${workspaceId}/forms/submissions?${qs.toString()}`,
        { cache: "no-store" }
      );
      if (!json.success)
        throw new Error(json.error?.message ?? t("workspace.loadFailed"));
      setSubmissions(json.data ?? []);
    } catch (e) {
      showToast(
        "error",
        e instanceof Error ? e.message : t("workspace.loadFailed")
      );
    }
  }, [workspaceId, filterSubjectType, filterStatus, t, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "submissions") void loadSubmissions();
  }, [tab, loadSubmissions]);

  const handleAccept = async (submission: FormSubmission) => {
    try {
      setExecuting(`accept-${submission.id}`);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/forms/submissions/${submission.id}`,
        { action: "accept" }
      );
      if (!json.success)
        throw new Error(json.error?.message ?? "Accept failed");
      showToast("success", t("forms.actionAccept"));
      await loadSubmissions();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Accept failed");
    } finally {
      setExecuting(null);
    }
  };

  const handleReturn = async () => {
    if (!returnFor) return;
    try {
      setExecuting(`return-${returnFor.id}`);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/forms/submissions/${returnFor.id}`,
        {
          action: "return",
          returnReason: returnReason || undefined,
        }
      );
      if (!json.success)
        throw new Error(json.error?.message ?? "Return failed");
      showToast("success", t("forms.actionReturn"));
      setReturnFor(null);
      setReturnReason("");
      await loadSubmissions();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Return failed");
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 top-20 z-[60] flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertTriangle size={16} />
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">{t("forms.eyebrow")}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {t("forms.title")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {tab === "definitions" && (
            <button
              type="button"
              onClick={() => router.push(`/w/${workspaceId}/forms/editor`)}
              className="app-button-primary"
            >
              <Plus size={16} />
              {t("forms.createDefinition")}
            </button>
          )}
          {tab === "bindings" && (
            <button
              type="button"
              onClick={() => router.push(`/w/${workspaceId}/forms/binding-editor`)}
              className="app-button-primary"
              disabled={definitions.length === 0}
            >
              <Plus size={16} />
              {t("forms.createBinding")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void load();
              if (tab === "submissions") void loadSubmissions();
            }}
            disabled={loading}
            className="app-button-secondary"
          >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {t("workspace.refresh")}
        </button>
        </div>
      </header>

      {error && <div className="app-error">{error}</div>}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => {
          const isActive = tab === key;
          const Icon =
            key === "definitions"
              ? FileText
              : key === "bindings"
                ? Link2
                : Inbox;
          const count =
            key === "definitions"
              ? definitions.length
              : key === "bindings"
                ? bindings.length
                : submissions.length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={15} />
              {t(TAB_LABELS[key])}
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  isActive
                    ? "bg-indigo-50 text-indigo-600"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Definitions Tab ── */}
      {tab === "definitions" && (
        <section className="app-card p-5 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : definitions.length === 0 ? (
            <div className="py-12 text-center">
              <FileText size={32} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">{t("forms.noBindings")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {definitions.map((def) => {
                const statusKey = DEFINITION_STATUS_KEY[def.status];
                return (
                  <li key={def.id}>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/w/${workspaceId}/forms/${def.form_key}`
                        )
                      }
                      className="flex w-full items-center gap-3 py-4 text-left transition hover:bg-slate-50"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                        <FileText size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {def.name}
                          </span>
                          <span
                            className={`app-badge ${
                              DEFINITION_STATUS_COLOR[def.status] ??
                              "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {statusKey ? t(statusKey) : def.status}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                          {def.form_key}
                        </p>
                      </div>
                      <span className="hidden text-xs text-slate-400 sm:block">
                        {formatDate(def.created_at)}
                      </span>
                      <ArrowRight
                        size={15}
                        className="shrink-0 text-slate-300"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/w/${workspaceId}/forms/editor?edit=${def.form_key}`);
                      }}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                      title="Edit"
                    >
                      <FileText size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ── Bindings Tab ── */}
      {tab === "bindings" && (
        <section className="app-card p-5 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : bindings.length === 0 ? (
            <div className="py-12 text-center">
              <Link2 size={32} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                {t("forms.noBindings")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bindings.map((b) => {
                const usageKey = USAGE_TYPE_KEY[b.usage_type];
                const defName =
                  definitions.find((d) => d.id === b.form_definition_id)
                    ?.name ?? b.form_definition_id.slice(0, 8);
                // Parse workflow_step usage_key: "{workflowKey}.{stepId}"
                const dotIdx = b.usage_key ? b.usage_key.lastIndexOf(".") : -1;
                const wfKey =
                  dotIdx > 0 ? b.usage_key!.slice(0, dotIdx) : (b.usage_key ?? "");
                const stepId = dotIdx > 0 ? b.usage_key!.slice(dotIdx + 1) : "";
                const isWorkflowStep =
                  b.usage_type === "workflow_step" && dotIdx > 0;
                const isServiceDeliverable =
                  b.usage_type === "service_deliverable";
                return (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center gap-3 py-4"
                  >
                    <span
                      className={`app-badge ${
                        USAGE_TYPE_COLOR[b.usage_type] ??
                        "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {usageKey ? t(usageKey) : b.usage_type}
                    </span>
                    {/* Requirement policy badge */}
                    <span
                      className={`app-badge ${
                        b.requirement_policy === "required"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {b.requirement_policy === "required"
                        ? t("forms.requirementRequired")
                        : t("forms.requirementOptional")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {defName}
                      </p>
                      {isWorkflowStep ? (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/w/${workspaceId}/workflows`)
                          }
                          className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-indigo-50 px-2 py-1 text-left text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                          title={t("forms.openWorkflows")}
                        >
                          <Link2 size={12} className="shrink-0" />
                          <span>
                            {t("forms.workflowLink")}:{" "}
                            <span className="font-mono">{wfKey}</span>
                          </span>
                          <span className="text-indigo-300">·</span>
                          <span>
                            {t("forms.stepLabel")}:{" "}
                            <span className="font-mono">{stepId}</span>
                          </span>
                          <ArrowRight
                            size={11}
                            className="text-indigo-400"
                          />
                        </button>
                      ) : (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {b.usage_key ? (
                            <span className="font-mono">{b.usage_key}</span>
                          ) : (
                            <span className="app-muted">—</span>
                          )}
                          {b.label_override && (
                            <span className="ml-2 text-slate-400">
                              · {b.label_override}
                            </span>
                          )}
                        </p>
                      )}
                      {isServiceDeliverable && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                          <CircleDot size={10} />
                          {t("forms.usageServiceDeliverable")}
                        </span>
                      )}
                    </div>
                    <span
                      className={`flex items-center gap-1.5 text-xs font-semibold ${
                        b.active
                          ? "text-emerald-600"
                          : "text-slate-400"
                      }`}
                    >
                      <CircleDot size={12} />
                      {b.active ? "Active" : "Inactive"}
                    </span>
                    <span className="hidden text-xs text-slate-400 sm:block">
                      {formatDate(b.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ── Submissions Tab ── */}
      {tab === "submissions" && (
        <div className="space-y-4">
          {/* Filters */}
          <section className="app-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Subject Type
                </label>
                <input
                  type="text"
                  value={filterSubjectType}
                  onChange={(e) => setFilterSubjectType(e.target.value)}
                  placeholder="e.g. quote, work_order"
                  className="app-input h-9"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Status
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="app-input h-9"
                >
                  <option value="">All</option>
                  <option value="draft">
                    {t("forms.submissionStatusDraft")}
                  </option>
                  <option value="submitted">
                    {t("forms.submissionStatusSubmitted")}
                  </option>
                  <option value="accepted">
                    {t("forms.submissionStatusAccepted")}
                  </option>
                  <option value="returned">
                    {t("forms.submissionStatusReturned")}
                  </option>
                  <option value="void">
                    {t("forms.submissionStatusVoid")}
                  </option>
                </select>
              </div>
            </div>
          </section>

          {/* List */}
          <section className="app-card p-5 sm:p-6">
            {submissions.length === 0 ? (
              <div className="py-12 text-center">
                <Inbox size={32} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">
                  {t("forms.noSubmissions")}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {submissions.map((sub) => {
                  const isExpanded = expandedId === sub.id;
                  const statusKey = SUBMISSION_STATUS_KEY[sub.status];
                  const canAct = sub.status === "submitted";
                  return (
                    <li key={sub.id} className="py-4">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : sub.id)
                        }
                        className="flex w-full items-start gap-3 text-left"
                      >
                        <span className="mt-0.5 text-slate-300">
                          {isExpanded ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`app-badge ${
                                SUBMISSION_STATUS_COLOR[sub.status] ??
                                "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {statusKey ? t(statusKey) : sub.status}
                            </span>
                            {sub.subject_type && (
                              <span className="app-badge bg-indigo-50 text-indigo-700">
                                {sub.subject_type}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-slate-500">
                              {t("forms.revision")} {sub.revision_number}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>
                              {t("forms.submissionStatusSubmitted")}:{" "}
                              {sub.submitted_by ?? "—"}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span>{formatDate(sub.submitted_at)}</span>
                            {sub.return_reason && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-red-600">
                                  {t("forms.returnReason")}:{" "}
                                  {sub.return_reason}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded answers */}
                      {isExpanded && (
                        <div className="mt-3 pl-7">
                          <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              answers_json
                            </p>
                            <pre className="overflow-x-auto text-[11px] leading-relaxed text-slate-600">
                              {JSON.stringify(
                                safeParseJson(sub.answers_json),
                                null,
                                2
                              )}
                            </pre>
                          </div>

                          {canAct && (
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleAccept(sub)}
                                disabled={
                                  executing === `accept-${sub.id}`
                                }
                                className="app-button-primary text-xs"
                              >
                                {executing === `accept-${sub.id}` ? (
                                  <Loader2
                                    size={14}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <CheckCircle2 size={14} />
                                )}
                                {t("forms.actionAccept")}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReturnFor(sub);
                                  setReturnReason("");
                                }}
                                disabled={
                                  executing === `return-${sub.id}`
                                }
                                className="app-button-danger text-xs"
                              >
                                {t("forms.actionReturn")}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Return Reason Modal */}
      {returnFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setReturnFor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {t("forms.actionReturn")}
              </h3>
              <button
                type="button"
                onClick={() => setReturnFor(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {t("forms.revision")} {returnFor.revision_number} ·{" "}
              {returnFor.subject_type ?? "—"}
            </p>
            <label className="mt-4 mb-1 block text-xs font-semibold text-slate-600">
              {t("forms.returnReason")}
            </label>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder={t("forms.returnReason")}
              className="app-input h-24 resize-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnFor(null)}
                className="app-button-ghost"
              >
                {t("workspace.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleReturn()}
                disabled={executing === `return-${returnFor.id}`}
                className="app-button-danger"
              >
                {executing === `return-${returnFor.id}` ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : null}
                {t("forms.actionReturn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
