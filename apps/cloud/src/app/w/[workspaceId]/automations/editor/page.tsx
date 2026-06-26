"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Plus, Trash2, Loader2, CheckCircle2,
} from "lucide-react";
import type {
  AutomationDefinition, AutomationTrigger, AutomationCondition, AutomationAction,
} from "@runory/contracts";
import type { AutomationDefinitionInfo } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import { useObjects, useFields } from "@/lib/api-hooks";
import type { MessageKey } from "@/i18n/messages";

// ── Types & Constants ──

type TriggerType = AutomationTrigger["type"];
type ActionType = AutomationAction["type"];
type Operator = AutomationCondition["operator"];

const TRIGGER_LABEL_KEYS: Record<TriggerType, MessageKey> = {
  record_created: "automations.trigger.record_created", record_updated: "automations.trigger.record_updated", record_field_changed: "automations.trigger.record_field_changed",
  schedule: "automations.trigger.schedule", manual: "automations.trigger.manual",
};
const ACTION_LABEL_KEYS: Record<ActionType, MessageKey> = {
  create_task: "automations.action.create_task", update_record: "automations.action.update_record", send_notification: "automations.action.send_notification",
  transition_workflow: "automations.action.transition_workflow", set_field: "automations.action.set_field",
};
const OPERATOR_LABEL_KEYS: Record<Operator, MessageKey> = {
  eq: "automations.operator.eq", neq: "automations.operator.neq", gt: "automations.operator.gt", lt: "automations.operator.lt", gte: "automations.operator.gte", lte: "automations.operator.lte",
  contains: "automations.operator.contains", in: "automations.operator.in",
};
const TRIGGER_TYPES: TriggerType[] = ["record_created", "record_updated", "record_field_changed", "schedule", "manual"];
const ACTION_TYPES: ActionType[] = ["create_task", "update_record", "send_notification", "transition_workflow", "set_field"];
const OPERATORS: Operator[] = ["eq", "neq", "gt", "lt", "gte", "lte", "contains", "in"];

interface Toast { type: "success" | "error"; message: string }

// ── Page (Suspense wrapper for useSearchParams) ──

export default function AutomationEditorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading...</p>}>
      <AutomationEditor />
    </Suspense>
  );
}

// ── Editor ──

function AutomationEditor() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get("id");
  const { t } = useI18n();

  const [existing, setExisting] = useState<AutomationDefinitionInfo | null>(null);
  const [loading, setLoading] = useState(!!editingId);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Fetch existing automation for edit mode
  useEffect(() => {
    if (!editingId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/automations/${editingId}`, { cache: "no-store" });
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

  const handleSave = async (def: AutomationDefinition) => {
    setSubmitting(true);
    try {
      if (existing) {
        const res = await fetch(`/api/workspaces/${workspaceId}/automations/${existing.automationId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates: def }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message ?? t("workspace.updateFailed"));
        showToast("success", t("automations.updated", { name: def.name }));
      } else {
        const res = await fetch(`/api/workspaces/${workspaceId}/automations`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(def),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message ?? t("workspace.createFailed"));
        showToast("success", t("automations.created", { name: def.name }));
      }
      // Redirect back to list after a brief delay so the toast is visible
      setTimeout(() => router.push(`/w/${workspaceId}/automations`), 800);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.saveFailed"));
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
            onClick={() => router.push(`/w/${workspaceId}/automations`)}
            className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            title={t("automations.editorBack")}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="app-eyebrow">Automation runtime</p>
            <h1 className="mt-1 text-2xl font-bold tracking-[-.025em] text-slate-950">
              {existing ? t("automations.editTitle") : t("automations.createTitle")}
            </h1>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {toast.message}
        </div>
      )}

      <AutomationEditorForm
        workspaceId={workspaceId}
        existing={existing}
        submitting={submitting}
        onSave={handleSave}
        onCancel={() => router.push(`/w/${workspaceId}/automations`)}
      />
    </div>
  );
}

// ── Editor Form ──

interface AutomationEditorFormProps {
  workspaceId: string;
  existing: AutomationDefinitionInfo | null;
  submitting: boolean;
  onSave: (def: AutomationDefinition) => void;
  onCancel: () => void;
}

function AutomationEditorForm({ workspaceId, existing, submitting, onSave, onCancel }: AutomationEditorFormProps) {
  const { t } = useI18n();
  const def = existing?.definition;
  const { data: objects = [] } = useObjects(workspaceId);

  const [id, setId] = useState(def?.id ?? "");
  const [name, setName] = useState(def?.name ?? "");
  const [description, setDescription] = useState(def?.description ?? "");
  const [enabled, setEnabled] = useState(def?.enabled ?? true);
  const [triggerType, setTriggerType] = useState<TriggerType>(def?.trigger.type ?? "record_created");
  const [targetObject, setTargetObject] = useState(def?.trigger.targetObject ?? "");
  const [fieldKey, setFieldKey] = useState(def?.trigger.fieldKey ?? "");
  const [cron, setCron] = useState(def?.trigger.cron ?? "");
  const [conditions, setConditions] = useState<AutomationCondition[]>(def?.conditions ?? []);
  const [actions, setActions] = useState<AutomationAction[]>(
    def?.actions ?? [{ type: "create_task", title: t("automations.defaultTaskTitle") }]
  );

  const { data: targetObjectDetail } = useFields(workspaceId, targetObject);
  const targetFields = targetObjectDetail?.fields ?? [];

  const addCondition = () => setConditions(c => [...c, { field: "", operator: "eq", value: "" }]);
  const removeCondition = (i: number) => setConditions(c => c.filter((_, idx) => idx !== i));
  const updateCondition = (i: number, patch: Partial<AutomationCondition>) =>
    setConditions(c => c.map((co, idx) => (idx === i ? { ...co, ...patch } : co)));

  const addAction = () => setActions(a => [...a, { type: "create_task" }]);
  const removeAction = (i: number) => setActions(a => a.filter((_, idx) => idx !== i));
  const updateAction = (i: number, patch: Partial<AutomationAction>) =>
    setActions(a => a.map((ac, idx) => (idx === i ? { ...ac, ...patch } : ac)));

  const canSubmit = Boolean(id && name && actions.length > 0 && actions.every(a => a.type))
    && (triggerType !== "record_field_changed" || Boolean(fieldKey))
    && (triggerType !== "schedule" || Boolean(cron));

  const handleSubmit = () => {
    if (!canSubmit) return;
    const trigger: AutomationTrigger = { type: triggerType };
    if (targetObject) trigger.targetObject = targetObject;
    if (triggerType === "record_field_changed" && fieldKey) trigger.fieldKey = fieldKey;
    if (triggerType === "schedule" && cron) trigger.cron = cron;
    const submitConditions = conditions
      .filter(c => c.field)
      .map(c => ({
        field: c.field,
        operator: c.operator,
        value: c.operator === "in"
          ? String(c.value).split(",").map(s => s.trim()).filter(Boolean)
          : c.value,
      }));
    onSave({ id, name, description: description || undefined, trigger, conditions: submitConditions, actions, enabled });
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <section className="app-card p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-900">{t("automations.editorBasicInfo")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("automations.field.automationId")}>
            <input className="app-input" value={id} onChange={e => setId(e.target.value)} placeholder={t("automations.placeholderAutomationId")} disabled={!!existing} />
          </Field>
          <Field label={t("automations.field.name")}>
            <input className="app-input" value={name} onChange={e => setName(e.target.value)} placeholder={t("automations.placeholderName")} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t("automations.field.description")}>
            <textarea className="app-input h-20" value={description} onChange={e => setDescription(e.target.value)} placeholder={t("automations.placeholderDescription")} />
          </Field>
        </div>
      </section>

      {/* Trigger */}
      <section className="app-card p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-900">{t("automations.triggerSection")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("automations.field.triggerType")}>
            <select className="app-input" value={triggerType} onChange={e => setTriggerType(e.target.value as TriggerType)}>
              {TRIGGER_TYPES.map(trig => <option key={trig} value={trig}>{t(TRIGGER_LABEL_KEYS[trig])}</option>)}
            </select>
          </Field>
          <Field label={t("automations.field.targetObject")}>
            <select className="app-input" value={targetObject} onChange={e => { setTargetObject(e.target.value); setFieldKey(""); }}>
              <option value="">{t("automations.placeholderTargetObject")}</option>
              {objects.map(obj => <option key={obj.objectKey} value={obj.objectKey}>{obj.label ?? obj.objectKey}</option>)}
            </select>
          </Field>
          {triggerType === "record_field_changed" && (
            <Field label={t("automations.field.fieldKey")}>
              <select className="app-input" value={fieldKey} onChange={e => setFieldKey(e.target.value)}>
                <option value="">{t("automations.placeholderFieldKey")}</option>
                {targetFields.map(f => <option key={f.fieldKey} value={f.fieldKey}>{f.label ?? f.fieldKey}</option>)}
              </select>
            </Field>
          )}
          {triggerType === "schedule" && (
            <Field label={t("automations.field.cron")}>
              <input className="app-input" value={cron} onChange={e => setCron(e.target.value)} placeholder={t("automations.placeholderCron")} />
            </Field>
          )}
        </div>
      </section>

      {/* Conditions */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">{t("automations.conditions")}</h2>
          <button onClick={addCondition} className="app-button-secondary min-h-8"><Plus size={14} />{t("automations.addCondition")}</button>
        </div>
        <div className="space-y-3">
          {conditions.length === 0 && <p className="text-xs text-slate-400">{t("automations.noConditions")}</p>}
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select className="app-input h-9 min-w-[140px] flex-1" value={c.field} onChange={e => updateCondition(i, { field: e.target.value })}>
                <option value="">{t("automations.placeholderField")}</option>
                {targetFields.map(f => <option key={f.fieldKey} value={f.fieldKey}>{f.label ?? f.fieldKey}</option>)}
              </select>
              <select className="app-input h-9 w-32" value={c.operator} onChange={e => updateCondition(i, { operator: e.target.value as Operator })}>
                {OPERATORS.map(o => <option key={o} value={o}>{t(OPERATOR_LABEL_KEYS[o])}</option>)}
              </select>
              <input className="app-input h-9 min-w-[120px] flex-1" value={Array.isArray(c.value) ? c.value.join(",") : String(c.value)} onChange={e => updateCondition(i, { value: e.target.value })} placeholder={t("automations.placeholderValue")} />
              <button onClick={() => removeCondition(i)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </section>

      {/* Actions */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">{t("automations.actions")}</h2>
          <button onClick={addAction} className="app-button-secondary min-h-8"><Plus size={14} />{t("automations.addAction")}</button>
        </div>
        <div className="space-y-3">
          {actions.map((a, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-slate-100 p-3">
              <div className="flex items-center gap-2">
                <select className="app-input h-9 w-44" value={a.type} onChange={e => updateAction(i, { type: e.target.value as ActionType })}>
                  {ACTION_TYPES.map(act => <option key={act} value={act}>{t(ACTION_LABEL_KEYS[act])}</option>)}
                </select>
                <button onClick={() => removeAction(i)} className="ml-auto text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
              </div>
              {(a.type === "create_task" || a.type === "update_record" || a.type === "set_field") && (
                <Field label={t("automations.field.targetObject")}>
                  <select className="app-input h-9" value={a.targetObject ?? ""} onChange={e => updateAction(i, { targetObject: e.target.value })}>
                    <option value="">{t("automations.placeholderActionTargetObject")}</option>
                    {objects.map(obj => <option key={obj.objectKey} value={obj.objectKey}>{obj.label ?? obj.objectKey}</option>)}
                  </select>
                </Field>
              )}
              {a.type === "create_task" && (
                <Field label={t("automations.field.taskTitle")}>
                  <input className="app-input h-9" value={a.title ?? ""} onChange={e => updateAction(i, { title: e.target.value })} placeholder={t("automations.placeholderTaskTitle")} />
                </Field>
              )}
              {a.type === "send_notification" && (
                <Field label={t("automations.field.notificationContent")}>
                  <input className="app-input h-9" value={a.message ?? ""} onChange={e => updateAction(i, { message: e.target.value })} placeholder={t("automations.placeholderNotification")} />
                </Field>
              )}
              {(a.type === "update_record" || a.type === "set_field") && (
                <Field label={t("automations.field.fields")}>
                  <textarea className="app-input h-20" value={fieldsToText(a.fields)} onChange={e => updateAction(i, { fields: textToFields(e.target.value) })} placeholder={"status=active\npriority=high"} />
                </Field>
              )}
              {a.type === "transition_workflow" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("automations.field.workflowId")}>
                    <input className="app-input h-9" value={a.workflowId ?? ""} onChange={e => updateAction(i, { workflowId: e.target.value })} />
                  </Field>
                  <Field label={t("automations.field.transitionId")}>
                    <input className="app-input h-9" value={a.transitionId ?? ""} onChange={e => updateAction(i, { transitionId: e.target.value })} />
                  </Field>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Enable + Actions Bar */}
      <section className="app-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="size-4 rounded border-slate-300" />
          {t("automations.enable")}
        </label>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="app-button-secondary" disabled={submitting}>{t("workspace.cancel")}</button>
          <button onClick={handleSubmit} className="app-button-primary" disabled={submitting || !canSubmit}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {existing ? t("workspace.save") : t("workspace.create")}
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Helpers ──

function fieldsToText(fields?: Record<string, unknown>): string {
  if (!fields) return "";
  return Object.entries(fields).map(([k, v]) => `${k}=${String(v)}`).join("\n");
}

function textToFields(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) out[k] = v;
    }
  }
  return out;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
