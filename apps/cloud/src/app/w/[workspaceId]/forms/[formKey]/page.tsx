"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  FileText,
  Link2,
  Inbox,
  CircleDot,
  Pencil,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import type {
  FormDefinitionDetail,
  FormBindingV2,
  FormSubmissionV2,
} from "@/lib/api-hooks";

interface Toast {
  type: "success" | "error";
  message: string;
}

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

function safeParseJson(raw: string | undefined | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default function FormDefinitionDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const formKey = params.formKey as string;
  const router = useRouter();
  const { t } = useI18n();

  const [detail, setDetail] = useState<FormDefinitionDetail | null>(null);
  const [bindings, setBindings] = useState<FormBindingV2[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmissionV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [detailRes, bindsRes, subsRes] = await Promise.all([
        fetch(
          `/api/workspaces/${workspaceId}/forms/definitions/${formKey}`,
          { cache: "no-store" }
        ),
        fetch(`/api/workspaces/${workspaceId}/forms/bindings`, {
          cache: "no-store",
        }),
        fetch(`/api/workspaces/${workspaceId}/forms/submissions`, {
          cache: "no-store",
        }),
      ]);

      const detailJson = await detailRes.json();
      const bindsJson = await bindsRes.json();
      const subsJson = await subsRes.json();

      if (!detailJson.success)
        throw new Error(
          detailJson.error?.message ?? t("workspace.loadFailed")
        );
      if (!bindsJson.success)
        throw new Error(
          bindsJson.error?.message ?? t("workspace.loadFailed")
        );
      if (!subsJson.success)
        throw new Error(
          subsJson.error?.message ?? t("workspace.loadFailed")
        );

      setDetail(detailJson.data ?? null);

      // Filter bindings + submissions to this form definition
      const defId = detailJson.data?.definition?.id;
      setBindings(
        (bindsJson.data ?? []).filter(
          (b: FormBindingV2) => b.form_definition_id === defId
        )
      );
      setSubmissions(
        (subsJson.data ?? []).filter(
          (s: FormSubmissionV2) => s.form_definition_id === defId
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, formKey, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const recentSubmissions = submissions.slice(0, 20);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

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

      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push(`/w/${workspaceId}/forms`)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft size={15} />
        {t("forms.title")}
      </button>

      {error && <div className="app-error">{error}</div>}

      {detail ? (
        <>
          {/* Header */}
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                <FileText size={20} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                    {detail.definition.name}
                  </h1>
                  <span
                    className={`app-badge ${
                      DEFINITION_STATUS_COLOR[detail.definition.status] ??
                      "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {DEFINITION_STATUS_KEY[detail.definition.status]
                      ? t(DEFINITION_STATUS_KEY[detail.definition.status])
                      : detail.definition.status}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {detail.definition.form_key}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {t("forms.revision")} {detail.definition.version_number ?? "—"} ·{" "}
                  {formatDate(detail.definition.published_at ?? "")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/w/${workspaceId}/forms/editor?edit=${formKey}`
                  )
                }
                className="app-button-secondary"
              >
                <Pencil size={16} />
                {t("workspace.edit")}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="app-button-secondary"
              >
                <RefreshCw size={16} />
                {t("workspace.refresh")}
              </button>
            </div>
          </header>

          {/* Schema */}
          <section className="app-card p-5 sm:p-6">
            <h3 className="mb-3 font-bold text-slate-900">Schema</h3>
            <pre className="overflow-x-auto rounded-md border border-slate-100 bg-slate-50 p-4 text-[12px] leading-relaxed text-slate-700">
              {JSON.stringify(
                detail.schema,
                null,
                2
              )}
            </pre>
          </section>

          {/* Bindings */}
          <section className="app-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">
                  {t("forms.bindings")}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {bindings.length}{" "}
                  {bindings.length === 1 ? "binding" : "bindings"}
                </p>
              </div>
              <Link2 size={18} className="text-slate-300" />
            </div>
            {bindings.length === 0 ? (
              <div className="py-8 text-center">
                <Link2 size={28} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">
                  {t("forms.noBindings")}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bindings.map((b) => {
                  const usageKey = USAGE_TYPE_KEY[b.usage_type];
                  return (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center gap-3 py-3"
                    >
                      <span
                        className={`app-badge ${
                          USAGE_TYPE_COLOR[b.usage_type] ??
                          "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {usageKey ? t(usageKey) : b.usage_type}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-700">
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
                      </div>
                      <span
                        className={`flex items-center gap-1 text-xs font-semibold ${
                          b.active ? "text-emerald-600" : "text-slate-400"
                        }`}
                      >
                        <CircleDot size={12} />
                        {b.active ? "Active" : "Inactive"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Recent Submissions */}
          <section className="app-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">
                  {t("forms.submissions")}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {submissions.length} total · showing{" "}
                  {recentSubmissions.length}
                </p>
              </div>
              <Inbox size={18} className="text-slate-300" />
            </div>
            {recentSubmissions.length === 0 ? (
              <div className="py-8 text-center">
                <Inbox size={28} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">
                  {t("forms.noSubmissions")}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentSubmissions.map((sub) => {
                  const statusKey = SUBMISSION_STATUS_KEY[sub.status];
                  return (
                    <li
                      key={sub.id}
                      className="flex flex-wrap items-center gap-3 py-3"
                    >
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
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-slate-500">
                          {t("forms.submissionStatusSubmitted")}:{" "}
                          {sub.submitted_by ?? "—"}
                          {sub.return_reason && (
                            <span className="ml-2 text-red-600">
                              · {sub.return_reason}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {formatDate(sub.submitted_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : (
        !error && (
          <div className="app-card p-12 text-center">
            <FileText size={32} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              Form definition not found.
            </p>
          </div>
        )
      )}
    </div>
  );
}
