"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Plus, Trash2, ArrowRight, Loader2, CheckCircle2,
} from "lucide-react";
import type { WorkflowDefinition } from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import { useObjects } from "@/lib/api-hooks";
import type { MessageKey } from "@/i18n/messages";

// ── Types & Constants ──

type StateType = "initial" | "intermediate" | "approved" | "rejected" | "final";
type Role = "admin" | "member" | "viewer";

const STATE_TYPES: StateType[] = ["initial", "intermediate", "approved", "rejected", "final"];
const STATE_TYPE_LABEL_KEYS: Record<StateType, MessageKey> = {
  initial: "workflows.stateType.initial", intermediate: "workflows.stateType.intermediate", approved: "workflows.stateType.approved", rejected: "workflows.stateType.rejected", final: "workflows.stateType.final",
};
const ROLES: Role[] = ["admin", "member", "viewer"];
const ROLE_LABEL_KEYS: Record<Role, MessageKey> = { admin: "workflows.role.admin", member: "workflows.role.member", viewer: "workflows.role.viewer" };

interface EditorState { name: string; label: string; type: StateType }
interface EditorTransition {
  fromStatus: string; toStatus: string; label: string;
  requiresApproval: boolean; requiredRole: Role;
}

interface Toast { type: "success" | "error"; message: string }

// ── Page (Suspense wrapper for useSearchParams) ──

export default function WorkflowEditorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading...</p>}>
      <WorkflowEditor />
    </Suspense>
  );
}

// ── Editor ──

function WorkflowEditor() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get("id");
  const { t } = useI18n();

  const [existing, setExisting] = useState<WorkflowDefinition | null>(null);
  const [loading, setLoading] = useState(!!editingId);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!editingId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/workflows/${editingId}`, { cache: "no-store" });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message ?? t("workspace.loadFailed"));
        setExisting(json.data);
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : t("workspace.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, [editingId, workspaceId, showToast, t]);

  const handleSave = async (def: WorkflowDefinition) => {
    setSubmitting(true);
    try {
      if (existing) {
        const res = await fetch(`/api/workspaces/${workspaceId}/workflows/${existing.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(def),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message ?? t("workspace.updateFailed"));
        showToast("success", t("workflows.updated", { name: def.name }));
      } else {
        const res = await fetch(`/api/workspaces/${workspaceId}/workflows`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(def),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message ?? t("workspace.createFailed"));
        showToast("success", t("workflows.created", { name: def.name }));
      }
      setTimeout(() => router.push(`/w/${workspaceId}/workflows`), 800);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("workspace.createFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
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
            title={t("workflows.editorBack")}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="app-eyebrow">Approval flows</p>
            <h1 className="mt-1 text-2xl font-bold tracking-[-.025em] text-slate-950">
              {existing ? t("workflows.editWorkflowTitle", { name: existing.name }) : t("workflows.createWorkflowTitle")}
            </h1>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {toast.message}
        </div>
      )}

      <WorkflowEditorForm
        workspaceId={workspaceId}
        existing={existing}
        submitting={submitting}
        onSave={handleSave}
        onCancel={() => router.push(`/w/${workspaceId}/workflows`)}
      />
    </div>
  );
}

// ── Editor Form ──

interface WorkflowEditorFormProps {
  workspaceId: string;
  existing: WorkflowDefinition | null;
  submitting: boolean;
  onSave: (def: WorkflowDefinition) => void;
  onCancel: () => void;
}

function WorkflowEditorForm({ workspaceId, existing, submitting, onSave, onCancel }: WorkflowEditorFormProps) {
  const { t } = useI18n();
  const { data: objects = [] } = useObjects(workspaceId);

  const [id, setId] = useState(existing?.id ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [targetObject, setTargetObject] = useState(existing?.targetObject ?? "");
  const [initialState, setInitialState] = useState(existing?.initialState ?? "");
  const [stateField, setStateField] = useState(existing?.stateField ?? "");
  const [autoStart, setAutoStart] = useState(existing?.autoStart ?? false);
  const [states, setStates] = useState<EditorState[]>(
    existing?.states ?? [
      { name: "draft", label: t("workflows.sampleState.draft"), type: "initial" },
      { name: "approved", label: t("workflows.sampleState.approved"), type: "approved" },
    ]
  );
  const [transitions, setTransitions] = useState<EditorTransition[]>(
    existing?.transitions?.map(tr => ({
      fromStatus: tr.fromStatus,
      toStatus: tr.toStatus,
      label: tr.label,
      requiresApproval: tr.requiresApproval,
      requiredRole: tr.requiredRole,
    })) ?? []
  );

  const addState = () => setStates(s => [...s, { name: "", label: "", type: "intermediate" }]);
  const removeState = (i: number) => setStates(s => s.filter((_, idx) => idx !== i));
  const updateState = (i: number, patch: Partial<EditorState>) =>
    setStates(s => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));

  const addTransition = () => setTransitions(prev => [...prev, {
    fromStatus: states[0]?.name ?? "", toStatus: states[0]?.name ?? "",
    label: "", requiresApproval: false, requiredRole: "member",
  }]);
  const removeTransition = (i: number) => setTransitions(prev => prev.filter((_, idx) => idx !== i));
  const updateTransition = (i: number, patch: Partial<EditorTransition>) =>
    setTransitions(prev => prev.map((tr, idx) => (idx === i ? { ...tr, ...patch } : tr)));

  const canSubmit = Boolean(id && name && targetObject && initialState)
    && states.every(s => s.name && s.label)
    && transitions.every(tr => tr.fromStatus && tr.toStatus && tr.label);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSave({ id, name, targetObject, initialState, states, transitions, stateField: stateField || undefined, autoStart });
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <section className="app-card p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-900">{t("workflows.editorBasicInfo")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("workflows.field.workflowId")}>
            <input className="app-input" value={id} onChange={e => setId(e.target.value)} placeholder={t("workflows.placeholderWorkflowId")} disabled={!!existing} />
          </Field>
          <Field label={t("workflows.field.name")}>
            <input className="app-input" value={name} onChange={e => setName(e.target.value)} placeholder={t("workflows.placeholderName")} />
          </Field>
          <Field label={t("workflows.field.targetObject")}>
            <select className="app-input" value={targetObject} onChange={e => setTargetObject(e.target.value)}>
              <option value="">{t("workflows.placeholderTargetObject")}</option>
              {objects.map(obj => <option key={obj.objectKey} value={obj.objectKey}>{obj.label ?? obj.objectKey}</option>)}
            </select>
          </Field>
          <Field label={t("workflows.field.initialState")}>
            <input className="app-input" value={initialState} onChange={e => setInitialState(e.target.value)} placeholder={t("workflows.placeholderInitialState")} />
          </Field>
          <Field label={t("workflows.field.stateField")}>
            <input className="app-input" value={stateField} onChange={e => setStateField(e.target.value)} placeholder={t("workflows.placeholderStateField")} />
          </Field>
          <Field label={t("workflows.field.autoStart")}>
            <label className="flex items-center gap-2 pt-2">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" checked={autoStart} onChange={e => setAutoStart(e.target.checked)} />
              <span className="text-xs text-slate-500">{autoStart ? t("workspace.yes") : t("workspace.no")}</span>
            </label>
          </Field>
        </div>
        {stateField && (
          <p className="mt-3 text-xs text-indigo-600">{t("workflows.stateFieldHint")}</p>
        )}
      </section>

      {/* States */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">{t("workflows.statesList")}</h2>
          <button onClick={addState} className="app-button-secondary min-h-8"><Plus size={14} />{t("workflows.addState")}</button>
        </div>
        <div className="space-y-3">
          {states.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input className="app-input h-9 w-32" value={s.name} onChange={e => updateState(i, { name: e.target.value })} placeholder="name" />
              <input className="app-input h-9 min-w-[140px] flex-1" value={s.label} onChange={e => updateState(i, { label: e.target.value })} placeholder={t("workflows.placeholderStateLabel")} />
              <select className="app-input h-9 w-32" value={s.type} onChange={e => updateState(i, { type: e.target.value as StateType })}>
                {STATE_TYPES.map(st => <option key={st} value={st}>{t(STATE_TYPE_LABEL_KEYS[st])}</option>)}
              </select>
              <button onClick={() => removeState(i)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </section>

      {/* Transitions */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">{t("workflows.transitions")}</h2>
          <button onClick={addTransition} className="app-button-secondary min-h-8"><Plus size={14} />{t("workflows.addTransition")}</button>
        </div>
        <div className="space-y-3">
          {transitions.length === 0 && <p className="text-xs text-slate-400">{t("workflows.noTransitions")}</p>}
          {transitions.map((tr, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-slate-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <select className="app-input h-9 min-w-[120px] flex-1" value={tr.fromStatus} onChange={e => updateTransition(i, { fromStatus: e.target.value })}>
                  <option value="">{t("workflows.fromState")}</option>
                  {states.map(s => <option key={s.name} value={s.name}>{s.label || s.name}</option>)}
                </select>
                <ArrowRight size={14} className="shrink-0 text-slate-400" />
                <select className="app-input h-9 min-w-[120px] flex-1" value={tr.toStatus} onChange={e => updateTransition(i, { toStatus: e.target.value })}>
                  <option value="">{t("workflows.toState")}</option>
                  {states.map(s => <option key={s.name} value={s.name}>{s.label || s.name}</option>)}
                </select>
                <button onClick={() => removeTransition(i)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input className="app-input h-9 min-w-[140px] flex-1" value={tr.label} onChange={e => updateTransition(i, { label: e.target.value })} placeholder={t("workflows.placeholderTransitionLabel")} />
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={tr.requiresApproval} onChange={e => updateTransition(i, { requiresApproval: e.target.checked })} />{t("workflows.requiresApprovalLabel")}
                </label>
                <select className="app-input h-9 w-28" value={tr.requiredRole} onChange={e => updateTransition(i, { requiredRole: e.target.value as Role })}>
                  {ROLES.map(r => <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Actions Bar */}
      <section className="app-card flex items-center justify-end gap-2 p-5 sm:p-6">
        <button onClick={onCancel} className="app-button-secondary" disabled={submitting}>{t("workspace.cancel")}</button>
        <button onClick={handleSubmit} className="app-button-primary" disabled={submitting || !canSubmit}>
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {existing ? t("workspace.save") : t("workspace.create")}
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
