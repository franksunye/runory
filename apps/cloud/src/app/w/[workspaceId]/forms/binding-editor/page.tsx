"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Link2,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch, apiPost } from "@/lib/api-fetch";

interface FormDef {
  id: string;
  form_key: string;
  name: string;
  status: string;
}

interface Toast {
  type: "success" | "error";
  message: string;
}

const USAGE_TYPES: Array<{ value: string; labelKey: MessageKey }> = [
  { value: "workflow_step", labelKey: "forms.usageWorkflowStep" },
  { value: "record_action", labelKey: "forms.usageRecordAction" },
  { value: "public_endpoint", labelKey: "forms.usagePublicEndpoint" },
  { value: "marketing_capture", labelKey: "forms.usageMarketingCapture" },
  { value: "service_deliverable", labelKey: "forms.usageServiceDeliverable" },
];

export default function BindingEditorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading...</p>}>
      <BindingEditor />
    </Suspense>
  );
}

function BindingEditor() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const { t } = useI18n();

  const [definitions, setDefinitions] = useState<FormDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Form state
  const [formDefinitionId, setFormDefinitionId] = useState("");
  const [usageType, setUsageType] = useState("workflow_step");
  const [usageKey, setUsageKey] = useState("");
  const [labelOverride, setLabelOverride] = useState("");
  const [requirementPolicy, setRequirementPolicy] = useState<"required" | "optional">("required");

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const json = await apiFetch<{
          success: boolean;
          error?: { message: string };
          data?: FormDef[];
        }>(`/api/workspaces/${workspaceId}/forms/definitions`, {
          cache: "no-store",
        });
        if (!json.success) throw new Error(json.error?.message ?? "Load failed");
        setDefinitions(json.data ?? []);
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId, showToast]);

  const handleSave = async () => {
    if (!formDefinitionId) {
      showToast("error", "Please select a form definition");
      return;
    }
    try {
      setSubmitting(true);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/forms/bindings`,
        {
          formDefinitionId,
          usageType,
          usageKey: usageKey || undefined,
          labelOverride: labelOverride || undefined,
          requirementPolicy,
        }
      );
      if (!json.success) throw new Error(json.error?.message ?? "Create failed");
      showToast("success", "Form binding created");
      router.push(`/w/${workspaceId}/forms`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push(`/w/${workspaceId}/forms`)}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="app-eyebrow">{t("forms.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            {t("forms.createBinding")}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={submitting || !formDefinitionId}
          className="app-button-primary"
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CheckCircle2 size={16} />
          )}
          {t("workspace.save")}
        </button>
      </header>

      {/* Form */}
      <section className="app-card space-y-5 p-5 sm:p-6">
        {/* Form Definition */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            {t("forms.definitions")}
          </label>
          <select
            value={formDefinitionId}
            onChange={(e) => setFormDefinitionId(e.target.value)}
            className="app-input h-9"
          >
            <option value="">Select a form definition</option>
            {definitions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.form_key})
              </option>
            ))}
          </select>
        </div>

        {/* Usage Type */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Usage Type
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {USAGE_TYPES.map((ut) => (
              <button
                key={ut.value}
                type="button"
                onClick={() => setUsageType(ut.value)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  usageType === ut.value
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <Link2 size={14} className="shrink-0" />
                {t(ut.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Usage Key */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Usage Key <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={usageKey}
            onChange={(e) => setUsageKey(e.target.value)}
            placeholder={
              usageType === "workflow_step"
                ? "e.g. work-order-approval.approval"
                : "e.g. post-service-survey"
            }
            className="app-input h-9"
          />
          {usageType === "workflow_step" && (
            <p className="mt-1 text-[11px] text-slate-400">
              Format: <span className="font-mono">{`{workflowKey}.{stepId}`}</span>
            </p>
          )}
        </div>

        {/* Label Override */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Label Override <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={labelOverride}
            onChange={(e) => setLabelOverride(e.target.value)}
            placeholder="Custom label for this binding"
            className="app-input h-9"
          />
        </div>

        {/* Requirement Policy */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Requirement
          </label>
          <div className="flex gap-2">
            {(["required", "optional"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setRequirementPolicy(p)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold capitalize transition ${
                  requirementPolicy === p
                    ? p === "required"
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-slate-300 bg-slate-50 text-slate-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
