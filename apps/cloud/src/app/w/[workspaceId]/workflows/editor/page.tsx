"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Plus, Trash2, Loader2, CheckCircle2,
  Layers, AlertCircle,
} from "lucide-react";
import type {
  WorkflowDefinition, WorkflowStep, WorkflowStepKind,
} from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import { useObjects } from "@/lib/api-hooks";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch, apiPost } from "@/lib/api-fetch";

// ── Types & Constants ──

interface EditorStep {
  id: string;
  kind: WorkflowStepKind;
  next: string;
  command: string;
  formBindingId: string;
  permissionGroup: string;
  onApprove: string;
  onReject: string;
}

const STEP_KINDS: WorkflowStepKind[] = [
  "start", "human_task", "approval", "system_command", "wait", "end",
];

const STEP_KIND_LABEL_KEY: Record<WorkflowStepKind, MessageKey> = {
  start: "workflow.stepKindStart",
  human_task: "workflow.stepKindHumanTask",
  approval: "workflow.stepKindApproval",
  system_command: "workflow.stepKindSystemCommand",
  wait: "workflow.stepKindWait",
  end: "workflow.stepKindEnd",
};

interface Toast { type: "success" | "error"; message: string }

/** Shape of a single definition returned by the definitions endpoint. */
interface DefinitionRow {
  id: string;
  workflowKey: string;
  name: string;
  targetObject: string;
  status: string;
  versionNumber: number;
  definition: WorkflowDefinition | null;
}

const EMPTY_STEP: EditorStep = {
  id: "", kind: "human_task", next: "", command: "",
  formBindingId: "", permissionGroup: "", onApprove: "", onReject: "",
};

// ── Page (Suspense wrapper for useSearchParams) ──

export default function WorkflowEditorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading...</p>}>
      <StepEditor />
    </Suspense>
  );
}

// ── Step Editor (the only editor) ──

function StepEditor() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const editKey = searchParams.get("edit"); // workflowKey of the definition to edit
  const { t } = useI18n();
  const { data: objects = [] } = useObjects(workspaceId);

  const [workflowKey, setWorkflowKey] = useState("");
  const [name, setName] = useState("");
  const [targetObject, setTargetObject] = useState("");
  const [initialState, setInitialState] = useState("");
  const [steps, setSteps] = useState<EditorStep[]>([
    { ...EMPTY_STEP, id: "start", kind: "start" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(editKey));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Load existing definition when editing (?edit={workflowKey}).
  // Fetches the definitions list and matches by workflowKey.
  useEffect(() => {
    if (!editKey) return;
    void (async () => {
      try {
        const json = await apiFetch<{
          success: boolean;
          error?: { message: string };
          data?: DefinitionRow[];
        }>(
          `/api/workspaces/${workspaceId}/workflows/definitions`,
          { cache: "no-store" }
        );
        if (!json.success) {
          throw new Error(json.error?.message ?? t("workflow.loadFailed"));
        }
        const rows: DefinitionRow[] = json.data ?? [];
        const match = rows.find((r) => r.workflowKey === editKey);
        if (!match || !match.definition) {
          setLoadError(t("workflow.loadFailed"));
          return;
        }
        const def = match.definition;
        setWorkflowKey(def.workflowKey ?? "");
        setName(def.name ?? "");
        setTargetObject(def.targetObject ?? "");
        setInitialState(def.initialState ?? "");
        const loadedSteps: EditorStep[] = (def.steps ?? []).map((s: WorkflowStep) => ({
          id: s.id,
          kind: s.kind,
          next: s.next ?? "",
          command: s.command ?? "",
          formBindingId: s.formBindingId ?? "",
          permissionGroup: s.assigneeRule?.permissionGroup ?? "",
          onApprove: s.onApprove ?? "",
          onReject: s.onReject ?? "",
        }));
        setSteps(loadedSteps.length > 0 ? loadedSteps : [{ ...EMPTY_STEP, id: "start", kind: "start" }]);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : t("workflow.loadFailed"));
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [editKey, workspaceId, t]);

  const addStep = () => setSteps((prev) => [...prev, { ...EMPTY_STEP }]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<EditorStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const canSubmit = Boolean(workflowKey && name && targetObject && initialState)
    && steps.every((s) => s.id && s.kind);

  const handleSave = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const v2Steps: WorkflowStep[] = steps.map((s) => {
        const step: WorkflowStep = { id: s.id, kind: s.kind };
        if (s.next) step.next = s.next;
        if (s.command) step.command = s.command;
        if (s.formBindingId) step.formBindingId = s.formBindingId;
        if (s.permissionGroup) step.assigneeRule = { permissionGroup: s.permissionGroup };
        if (s.onApprove) step.onApprove = s.onApprove;
        if (s.onReject) step.onReject = s.onReject;
        return step;
      });
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/workflows`,
        {
          workflowKey,
          name,
          targetObject,
          initialState,
          steps: v2Steps,
        }
      );
      if (!json.success) {
        throw new Error(json.error?.message ?? t("workflow.saveFailed"));
      }
      showToast("success", t("workflow.saved"));
      setTimeout(() => router.push(`/w/${workspaceId}/workflows`), 800);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("workflow.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 size={16} className="animate-spin" />{t("workspace.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/w/${workspaceId}/workflows`)}
            className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            title={t("workflow.editorBack")}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="app-eyebrow">Step workflows</p>
            <h1 className="mt-1 text-2xl font-bold tracking-[-.025em] text-slate-950">
              {editKey ? t("workflow.editWorkflowTitle", { name }) : t("workflow.createWorkflowTitle")}
            </h1>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{loadError}</p>
          </div>
        </div>
      )}

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {toast.message}
        </div>
      )}

      <section className="app-card p-5 sm:p-6">
        {/* Header */}
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Layers size={16} className="text-indigo-600" />
            {t("workflow.stepEditorTitle")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t("workflow.stepEditorHint")}</p>
        </div>

        {/* Basic Info */}
        <h3 className="mb-3 text-sm font-bold text-slate-900">{t("workflow.editorBasicInfo")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("workflow.workflowKey")}>
            <input
              className="app-input"
              value={workflowKey}
              onChange={(e) => setWorkflowKey(e.target.value)}
              placeholder={t("workflow.placeholderWorkflowKey")}
              disabled={Boolean(editKey)}
            />
          </Field>
          <Field label={t("workflow.fieldName")}>
            <input
              className="app-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("workflow.placeholderName")}
            />
          </Field>
          <Field label={t("workflow.fieldTargetObject")}>
            <select
              className="app-input"
              value={targetObject}
              onChange={(e) => setTargetObject(e.target.value)}
            >
              <option value="">{t("workflow.placeholderTargetObject")}</option>
              {objects.map((obj) => (
                <option key={obj.objectKey} value={obj.objectKey}>
                  {obj.label ?? obj.objectKey}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("workflow.initialState")}>
            <input
              className="app-input"
              value={initialState}
              onChange={(e) => setInitialState(e.target.value)}
              placeholder={t("workflow.placeholderInitialState")}
            />
          </Field>
        </div>

        {/* Steps */}
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">{t("workflow.stepPipeline")}</h3>
            <button onClick={addStep} className="app-button-secondary min-h-8">
              <Plus size={14} />{t("workflow.addStep")}
            </button>
          </div>
          <div className="space-y-3">
            {steps.length === 0 && (
              <p className="text-xs text-slate-400">{t("workflow.noSteps")}</p>
            )}
            {steps.map((step, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-slate-100 p-3">
                {/* Row 1: id, kind, delete */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="app-input h-9 w-32"
                    value={step.id}
                    onChange={(e) => updateStep(i, { id: e.target.value })}
                    placeholder={t("workflow.placeholderStepId")}
                  />
                  <select
                    className="app-input h-9 w-40"
                    value={step.kind}
                    onChange={(e) => updateStep(i, { kind: e.target.value as WorkflowStepKind })}
                  >
                    {STEP_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(STEP_KIND_LABEL_KEY[k])}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeStep(i)}
                    className="text-slate-400 hover:text-red-600"
                    title={t("workspace.delete")}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {/* Row 2: next, command */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="app-input h-9 min-w-[120px] flex-1"
                    value={step.next}
                    onChange={(e) => updateStep(i, { next: e.target.value })}
                    placeholder={t("workflow.placeholderStepNext")}
                  />
                  <input
                    className="app-input h-9 min-w-[120px] flex-1"
                    value={step.command}
                    onChange={(e) => updateStep(i, { command: e.target.value })}
                    placeholder={t("workflow.placeholderStepCommand")}
                  />
                </div>
                {/* Row 3: formBindingId, permissionGroup */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="app-input h-9 min-w-[120px] flex-1"
                    value={step.formBindingId}
                    onChange={(e) => updateStep(i, { formBindingId: e.target.value })}
                    placeholder={t("workflow.formBinding")}
                  />
                  <input
                    className="app-input h-9 min-w-[120px] flex-1"
                    value={step.permissionGroup}
                    onChange={(e) => updateStep(i, { permissionGroup: e.target.value })}
                    placeholder={t("workflow.placeholderPermissionGroup")}
                  />
                </div>
                {/* Row 4: onApprove, onReject */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="app-input h-9 min-w-[120px] flex-1"
                    value={step.onApprove}
                    onChange={(e) => updateStep(i, { onApprove: e.target.value })}
                    placeholder={t("workflow.placeholderOnApprove")}
                  />
                  <input
                    className="app-input h-9 min-w-[120px] flex-1"
                    value={step.onReject}
                    onChange={(e) => updateStep(i, { onReject: e.target.value })}
                    placeholder={t("workflow.placeholderOnReject")}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Actions Bar */}
      <section className="app-card flex items-center justify-end gap-2 p-5 sm:p-6">
        <button
          onClick={() => router.push(`/w/${workspaceId}/workflows`)}
          className="app-button-secondary"
          disabled={submitting}
        >
          {t("workspace.cancel")}
        </button>
        <button onClick={handleSave} className="app-button-primary" disabled={submitting || !canSubmit}>
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {editKey ? t("workspace.save") : t("workspace.create")}
        </button>
      </section>
    </div>
  );
}

// ── Field wrapper ──

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
