"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  Zap, Plus, RefreshCw, Play, Eye, Trash2, ToggleLeft, ToggleRight,
  X, AlertCircle, Loader2, Pencil, ChevronDown, ChevronUp,
  CheckCircle2,
} from "lucide-react";
import type {
  AutomationDefinition, AutomationTrigger, AutomationCondition, AutomationAction,
} from "@runory/contracts";
import type {
  AutomationDefinitionInfo, AutomationRun, DryRunResult,
} from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import { useObjects, useFields } from "@/lib/api-hooks";
import type { MessageKey } from "@/i18n/messages";

interface Toast { type: "success" | "error"; message: string }

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
const RUN_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  success: "automations.runStatus.success", failed: "automations.runStatus.failed", skipped: "automations.runStatus.skipped", dry_run: "automations.runStatus.dry_run",
};

function runStatusBadgeClass(status: string): string {
  if (status === "success") return "bg-emerald-50 text-emerald-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "skipped") return "bg-amber-50 text-amber-700";
  if (status === "dry_run") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("zh-CN", { hour12: false }); }
  catch { return iso; }
}

export default function AutomationsPage() {
  const workspaceId = useParams().workspaceId as string;
  const { t } = useI18n();
  const [automations, setAutomations] = useState<AutomationDefinitionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<AutomationDefinitionInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/workspaces/${workspaceId}/automations`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.loadFailed"));
      setAutomations(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async (def: AutomationDefinition, existing?: AutomationDefinitionInfo) => {
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
      setShowEditor(false);
      setEditing(null);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (auto: AutomationDefinitionInfo, enabled: boolean) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("automations.toggleFailed"));
      setAutomations(list => list.map(a => a.automationId === auto.automationId ? { ...a, enabled } : a));
      showToast("success", enabled ? t("automations.enabled") : t("automations.disabled"));
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.toggleFailed"));
    }
  };

  const handleDelete = async (auto: AutomationDefinitionInfo) => {
    if (!confirm(t("automations.deleteConfirm", { name: auto.name }))) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.deleteFailed"));
      showToast("success", t("automations.deleted", { name: auto.name }));
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("workspace.deleteFailed"));
    }
  };

  if (loading) return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Automation runtime</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("automations.title")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("automations.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button onClick={() => void load()} className="app-button-secondary"><RefreshCw size={16} />{t("workspace.refresh")}</button>
          <button onClick={() => { setEditing(null); setShowEditor(true); }} className="app-button-primary"><Plus size={16} />{t("automations.createAutomation")}</button>
        </div>
      </header>

      {error && (
        <div className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {toast.message}
        </div>
      )}

      <section className="app-card p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900">{t("automations.list")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("automations.listMeta", { count: automations.length })}</p>
        </div>
        {automations.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Zap size={32} className="text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">{t("automations.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {automations.map(auto => (
              <AutomationCard
                key={auto.automationId}
                auto={auto}
                workspaceId={workspaceId}
                expanded={expandedId === auto.automationId}
                onToggleExpand={() => setExpandedId(prev => prev === auto.automationId ? null : auto.automationId)}
                onToggle={(en) => handleToggle(auto, en)}
                onEdit={() => { setEditing(auto); setShowEditor(true); }}
                onDelete={() => handleDelete(auto)}
                showToast={showToast}
              />
            ))}
          </ul>
        )}
      </section>

      {showEditor && (
        <AutomationEditorModal
          workspaceId={workspaceId}
          submitting={submitting}
          existing={editing}
          onClose={() => { setShowEditor(false); setEditing(null); }}
          onSubmit={(def) => handleSave(def, editing ?? undefined)}
        />
      )}
    </div>
  );
}

// ── Automation Card (with dry run + run history) ──

interface AutomationCardProps {
  auto: AutomationDefinitionInfo;
  workspaceId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  showToast: (type: Toast["type"], message: string) => void;
}

function AutomationCard({ auto, workspaceId, expanded, onToggleExpand, onToggle, onEdit, onDelete, showToast }: AutomationCardProps) {
  const { t } = useI18n();
  const def = auto.definition;
  const [dryResult, setDryResult] = useState<DryRunResult | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadedRuns, setLoadedRuns] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}/run?limit=10`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("automations.loadHistoryFailed"));
      setRuns(json.data);
      setLoadedRuns(true);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.loadHistoryFailed"));
    }
  }, [workspaceId, auto.automationId, showToast, t]);

  useEffect(() => {
    if (expanded && !loadedRuns) void loadRuns();
  }, [expanded, loadedRuns, loadRuns]);

  const handleDryRun = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true, triggerPayload: {} }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("automations.dryRunFailed"));
      setDryResult(json.data);
      showToast("success", t("automations.dryRunCompleted"));
      await loadRuns();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.dryRunFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleRunNow = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, triggerType: "manual" }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("automations.runFailed"));
      showToast("success", t("automations.runTriggered"));
      await loadRuns();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.runFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Zap size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{def.name}</p>
          <p className="truncate text-xs text-slate-500">
            {def.description ? `${def.description} · ` : ""}{t("automations.triggerPrefix", { label: t(TRIGGER_LABEL_KEYS[def.trigger.type]) })}
            {def.trigger.targetObject ? ` · ${def.trigger.targetObject}` : ""}
            {def.trigger.fieldKey ? `.${def.trigger.fieldKey}` : ""}
            {def.trigger.cron ? ` · ${def.trigger.cron}` : ""}
            {" · "}{t("automations.actionsCount", { count: def.actions.length })}
          </p>
        </div>
        {auto.lastRunStatus && (
          <span className={`app-badge ${runStatusBadgeClass(auto.lastRunStatus)}`}>{RUN_STATUS_LABEL_KEYS[auto.lastRunStatus] ? t(RUN_STATUS_LABEL_KEYS[auto.lastRunStatus]) : auto.lastRunStatus}</span>
        )}
        <span className="app-badge bg-slate-100 text-slate-600">{formatTime(auto.lastRunAt)}</span>
        <button onClick={() => onToggle(!auto.enabled)} className="text-slate-500 hover:text-indigo-600" title={auto.enabled ? t("automations.enabled") : t("automations.disabled")}>
          {auto.enabled ? <ToggleRight size={22} className="text-emerald-600" /> : <ToggleLeft size={22} />}
        </button>
        <button onClick={onEdit} className="app-button-secondary"><Pencil size={14} />{t("workspace.edit")}</button>
        <button onClick={onDelete} className="text-slate-400 hover:text-red-600" title={t("workspace.delete")}><Trash2 size={16} /></button>
        <button onClick={onToggleExpand} className="text-slate-400 hover:text-slate-600" title={expanded ? t("automations.collapse") : t("automations.expand")}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-4 pl-12">
          <div className="flex flex-wrap gap-2">
            <button onClick={handleDryRun} className="app-button-secondary" disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}{t("automations.dryRun")}
            </button>
            <button onClick={handleRunNow} className="app-button-primary" disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{t("automations.runNow")}
            </button>
          </div>

          {dryResult && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <p className="text-xs font-bold text-slate-700">{t("automations.dryRunResult")}</p>
              <p className="mt-1 text-xs text-slate-600">
                {t("automations.wouldFire")}{" "}
                <span className={dryResult.wouldFire ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                  {dryResult.wouldFire ? t("workspace.yes") : t("workspace.no")}
                </span>
                {dryResult.reason ? ` · ${dryResult.reason}` : ""}
              </p>
              {dryResult.actionsPreview.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {dryResult.actionsPreview.map((a, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <span className="app-badge bg-slate-100 text-slate-600 mr-1">{ACTION_LABEL_KEYS[a.actionType as ActionType] ? t(ACTION_LABEL_KEYS[a.actionType as ActionType]) : a.actionType}</span>
                      {a.description}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">{t("automations.recentRuns")}</p>
            {runs.length === 0 ? (
              <p className="text-xs text-slate-400">{t("automations.noRuns")}</p>
            ) : (
              <ul className="space-y-1.5">
                {runs.map(run => (
                  <li key={run.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className={`app-badge ${runStatusBadgeClass(run.status)}`}>{RUN_STATUS_LABEL_KEYS[run.status] ? t(RUN_STATUS_LABEL_KEYS[run.status]) : run.status}</span>
                    <span>{formatTime(run.startedAt)}</span>
                    <span className="text-slate-400">· {run.triggerType}</span>
                    {run.actionsTaken.length > 0 && <span className="text-slate-400">{t("automations.runActionsCount", { count: run.actionsTaken.length })}</span>}
                    {run.errorMessage && <span className="text-red-600">· {run.errorMessage}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ── Create / Edit Automation Modal ──

interface AutomationEditorModalProps {
  workspaceId: string;
  submitting: boolean;
  existing: AutomationDefinitionInfo | null;
  onClose: () => void;
  onSubmit: (def: AutomationDefinition) => void;
}

function AutomationEditorModal({ workspaceId, submitting, existing, onClose, onSubmit }: AutomationEditorModalProps) {
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

  // Fetch fields for the selected target object (used for fieldKey + condition field dropdowns)
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
    onSubmit({ id, name, description: description || undefined, trigger, conditions: submitConditions, actions, enabled });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{existing ? t("automations.editTitle") : t("automations.createTitle")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("automations.field.automationId")}>
              <input className="app-input" value={id} onChange={e => setId(e.target.value)} placeholder={t("automations.placeholderAutomationId")} disabled={!!existing} />
            </Field>
            <Field label={t("automations.field.name")}>
              <input className="app-input" value={name} onChange={e => setName(e.target.value)} placeholder={t("automations.placeholderName")} />
            </Field>
          </div>
          <Field label={t("automations.field.description")}>
            <input className="app-input" value={description} onChange={e => setDescription(e.target.value)} placeholder={t("automations.placeholderDescription")} />
          </Field>

          {/* Trigger */}
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="mb-2 text-sm font-bold text-slate-900">{t("automations.triggerSection")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
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
          </div>

          {/* Conditions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">{t("automations.conditions")}</p>
              <button onClick={addCondition} className="app-button-secondary min-h-8"><Plus size={14} />{t("automations.addCondition")}</button>
            </div>
            <div className="space-y-2">
              {conditions.length === 0 && <p className="text-xs text-slate-400">{t("automations.noConditions")}</p>}
              {conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className="app-input h-9 flex-1" value={c.field} onChange={e => updateCondition(i, { field: e.target.value })}>
                    <option value="">{t("automations.placeholderField")}</option>
                    {targetFields.map(f => <option key={f.fieldKey} value={f.fieldKey}>{f.label ?? f.fieldKey}</option>)}
                  </select>
                  <select className="app-input h-9 w-28" value={c.operator} onChange={e => updateCondition(i, { operator: e.target.value as Operator })}>
                    {OPERATORS.map(o => <option key={o} value={o}>{t(OPERATOR_LABEL_KEYS[o])}</option>)}
                  </select>
                  <input className="app-input h-9 flex-1" value={Array.isArray(c.value) ? c.value.join(",") : String(c.value)} onChange={e => updateCondition(i, { value: e.target.value })} placeholder={t("automations.placeholderValue")} />
                  <button onClick={() => removeCondition(i)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">{t("automations.actions")}</p>
              <button onClick={addAction} className="app-button-secondary min-h-8"><Plus size={14} />{t("automations.addAction")}</button>
            </div>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-slate-100 p-2">
                  <div className="flex items-center gap-2">
                    <select className="app-input h-9 w-40" value={a.type} onChange={e => updateAction(i, { type: e.target.value as ActionType })}>
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
                    <div className="grid gap-2 sm:grid-cols-2">
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
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />{t("automations.enable")}
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="app-button-secondary" disabled={submitting}>{t("workspace.cancel")}</button>
          <button onClick={handleSubmit} className="app-button-primary" disabled={submitting || !canSubmit}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}{existing ? t("workspace.save") : t("workspace.create")}
          </button>
        </div>
      </div>
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
