"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  GitBranch, Plus, RefreshCw, CheckCircle2, XCircle, Clock3,
  Play, ArrowRight, X, Pencil, Trash2, AlertCircle, Loader2,
  Layers, ListChecks, ExternalLink,
} from "lucide-react";
import type {
  WorkflowDefinition, WorkflowTransition,
  WorkflowDefinitionV2, WorkflowStep, WorkflowStepKind,
} from "@runory/contracts";
import type { WorkflowInstance } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { useRecords } from "@/lib/api-hooks";

interface PendingApproval extends WorkflowInstance {
  definition: WorkflowDefinition;
}
interface Toast { type: "success" | "error"; message: string }

export default function WorkflowsPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const { t } = useI18n();

  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [startFor, setStartFor] = useState<WorkflowDefinition | null>(null);
  const [transitionsMap, setTransitionsMap] = useState<Record<string, WorkflowTransition[]>>({});
  const [executing, setExecuting] = useState<{ instanceId: string; transitionId: string } | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [defsRes, instRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/workflows`, { cache: "no-store" }),
        fetch(`/api/workspaces/${workspaceId}/workflows/instances`, { cache: "no-store" }),
      ]);
      const defsJson = await defsRes.json();
      const instJson = await instRes.json();
      if (!defsJson.success) throw new Error(defsJson.error?.message ?? t("workspace.loadFailed"));
      if (!instJson.success) throw new Error(instJson.error?.message ?? t("workspace.loadFailed"));
      setDefinitions(defsJson.data);
      setInstances(instJson.data);

      // Compute pending approvals client-side: instances whose current state
      // has at least one transition requiring approval in the linked definition.
      const defMap = new Map<string, WorkflowDefinition>(
        (defsJson.data as WorkflowDefinition[]).map(d => [d.id, d])
      );
      const pendingList: PendingApproval[] = [];
      for (const inst of instJson.data as WorkflowInstance[]) {
        const def = defMap.get(inst.workflowId);
        if (!def) continue;
        const hasPending = def.transitions.some(
          (t: WorkflowTransition) => t.fromStatus === inst.currentState && t.requiresApproval
        );
        if (hasPending) pendingList.push({ ...inst, definition: def });
      }
      setPending(pendingList);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  // Lazily fetch available transitions for non-terminal instances.
  const loadTransitions = useCallback(async (instList: WorkflowInstance[], defs: WorkflowDefinition[]) => {
    const defMap = new Map(defs.map(d => [d.id, d]));
    const nonTerminal = instList.filter(inst => {
      const t = defMap.get(inst.workflowId)?.states.find(s => s.name === inst.currentState)?.type;
      return t !== "approved" && t !== "rejected" && t !== "final";
    });
    const results = await Promise.all(nonTerminal.map(async inst => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/workflows/instances/${inst.id}/transitions`,
          { cache: "no-store" }
        );
        const json = await res.json();
        return [inst.id, json.success ? json.data : []] as const;
      } catch {
        return [inst.id, []] as const;
      }
    }));
    setTransitionsMap(Object.fromEntries(results));
  }, [workspaceId]);

  useEffect(() => {
    if (instances.length > 0 && definitions.length > 0) {
      void loadTransitions(instances, definitions);
    }
  }, [instances, definitions, loadTransitions]);

  const handleStartInstance = async (workflowId: string, objectType: string, recordId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/workflows/instances`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, objectType, recordId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workflows.startFailed"));
      showToast("success", t("workflows.instanceStarted"));
      setStartFor(null);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("workflows.startFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteTransition = async (instanceId: string, transitionId: string, commentText: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/workflows/instances/${instanceId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transitionId, comment: commentText || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workflows.executeFailed"));
      showToast("success", t("workflows.executed"));
      setExecuting(null);
      setComment("");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("workflows.executeFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDefinition = async (def: WorkflowDefinition) => {
    if (!confirm(t("workflows.deleteConfirm", { name: def.name }))) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/workflows/${def.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.deleteFailed"));
      showToast("success", t("workflows.deleted", { name: def.name }));
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("workspace.deleteFailed"));
    }
  };

  const pickTransition = (instanceId: string, transitionId: string) => {
    setExecuting({ instanceId, transitionId });
    setComment("");
  };
  const cancelTransition = () => { setExecuting(null); setComment(""); };

  if (loading) return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Approval flows</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("workflows.title")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("workflows.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button onClick={() => void load()} className="app-button-secondary"><RefreshCw size={16} />{t("workspace.refresh")}</button>
          <button onClick={() => router.push(`/w/${workspaceId}/workflows/editor`)} className="app-button-primary"><Plus size={16} />{t("workflows.createWorkflow")}</button>
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

      {/* Pending Approvals */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">{t("workflows.pendingApprovals")}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("workflows.pendingApprovalsHint")}</p>
          </div>
          <span className="app-badge bg-amber-50 text-amber-700">{t("workflows.itemCount", { count: pending.length })}</span>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">{t("workflows.noPending")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map(p => (
              <InstanceRow key={p.id} instance={p} definition={p.definition}
                transitions={transitionsMap[p.id] ?? []} executing={executing} comment={comment}
                submitting={submitting} onCommentChange={setComment}
                onPickTransition={(tid) => pickTransition(p.id, tid)}
                onCancelTransition={cancelTransition}
                onExecute={() => handleExecuteTransition(p.id, executing?.transitionId ?? "", comment)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Workflow Definitions */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900">{t("workflows.definitions")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("workflows.definitionsMeta", { count: definitions.length })}</p>
        </div>
        {definitions.length === 0 ? (
          <p className="text-sm text-slate-400">{t("workflows.noDefinitions")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {definitions.map(def => {
              const defInstances = instances.filter(i => i.workflowId === def.id);
              return (
                <li key={def.id} className="py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><GitBranch size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{def.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {t("workflows.definitionMeta", { targetObject: def.targetObject, initialState: def.initialState, count: def.states.length })}
                      </p>
                    </div>
                    <span className="app-badge bg-indigo-50 text-indigo-700">{t("workflows.instanceCount", { count: defInstances.length })}</span>
                    <button onClick={() => setStartFor(def)} className="app-button-secondary"><Play size={14} />{t("workflows.startInstance")}</button>
                    <button onClick={() => router.push(`/w/${workspaceId}/workflows/editor?id=${def.id}`)} className="app-button-secondary"><Pencil size={14} />{t("workspace.edit")}</button>
                    <button onClick={() => handleDeleteDefinition(def)} className="text-slate-400 hover:text-red-600" title={t("workspace.delete")}><Trash2 size={16} /></button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 pl-12">
                    {def.states.map(s => (
                      <span key={s.name} className={`app-badge ${stateBadgeClass(s.type)}`}>{s.label}</span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recent Instances */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900">{t("workflows.recentInstances")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("workflows.recentInstancesMeta", { count: instances.length })}</p>
        </div>
        {instances.length === 0 ? (
          <p className="text-sm text-slate-400">{t("workflows.noInstances")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {instances.slice(0, 20).map(inst => {
              const def = definitions.find(d => d.id === inst.workflowId);
              return (
                <InstanceRow key={inst.id} instance={inst} definition={def}
                  transitions={transitionsMap[inst.id] ?? []} executing={executing} comment={comment}
                  submitting={submitting} onCommentChange={setComment}
                  onPickTransition={(tid) => pickTransition(inst.id, tid)}
                  onCancelTransition={cancelTransition}
                  onExecute={() => handleExecuteTransition(inst.id, executing?.transitionId ?? "", comment)}
                />
              );
            })}
          </ul>
        )}
      </section>

      {startFor && (
        <StartInstanceModal workspaceId={workspaceId} definition={startFor} submitting={submitting} onClose={() => setStartFor(null)}
          onSubmit={(ot, rid) => handleStartInstance(startFor.id, ot, rid)} />
      )}

      {/* V2 Workflow Instances */}
      <V2InstancesSection workspaceId={workspaceId} />
    </div>
  );
}

// ── Helpers ──

function stateBadgeClass(type: string): string {
  if (type === "approved") return "bg-emerald-50 text-emerald-700";
  if (type === "rejected") return "bg-red-50 text-red-700";
  if (type === "initial") return "bg-sky-50 text-sky-700";
  if (type === "final") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-600";
}

function isTerminalState(def: WorkflowDefinition | undefined, state: string): boolean {
  const t = def?.states.find(s => s.name === state)?.type;
  return t === "approved" || t === "rejected" || t === "final";
}

// ── Instance Row (with inline transition execution) ──

interface InstanceRowProps {
  instance: WorkflowInstance;
  definition?: WorkflowDefinition;
  transitions: WorkflowTransition[];
  executing: { instanceId: string; transitionId: string } | null;
  comment: string;
  submitting: boolean;
  onCommentChange: (v: string) => void;
  onPickTransition: (tid: string) => void;
  onCancelTransition: () => void;
  onExecute: () => void;
}

function InstanceRow({
  instance, definition, transitions, executing, comment, submitting,
  onCommentChange, onPickTransition, onCancelTransition, onExecute,
}: InstanceRowProps) {
  const { t } = useI18n();
  const terminal = isTerminalState(definition, instance.currentState);
  const stateType = definition?.states.find(s => s.name === instance.currentState)?.type;
  const Icon = terminal ? (stateType === "approved" ? CheckCircle2 : XCircle) : Clock3;
  const tone = terminal
    ? (stateType === "approved" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")
    : "bg-slate-100 text-slate-600";
  const isThisExecuting = executing?.instanceId === instance.id;
  const stateLabel = definition?.states.find(s => s.name === instance.currentState)?.label ?? instance.currentState;

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className={`grid size-9 place-items-center rounded-lg ${tone}`}><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{definition?.name ?? instance.workflowId}</p>
          <p className="truncate text-xs text-slate-500">
            {t("workflows.instanceMeta", { objectType: instance.objectType, recordId: instance.recordId, count: instance.history.length })}
          </p>
        </div>
        <span className="app-badge bg-slate-100 text-slate-700">{stateLabel}</span>
      </div>
      {!terminal && transitions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
          {transitions.map(tr => {
            const tid = `${tr.fromStatus}->${tr.toStatus}`;
            const active = isThisExecuting && executing?.transitionId === tid;
            return (
              <button key={tid} onClick={() => onPickTransition(tid)}
                className={`app-button-secondary min-h-9 ${active ? "ring-2 ring-indigo-400" : ""}`}
                disabled={submitting}>
                <ArrowRight size={14} />{tr.label}
                {tr.requiresApproval && <span className="text-amber-600">{t("workflows.requiresApprovalSuffix")}</span>}
              </button>
            );
          })}
        </div>
      )}
      {isThisExecuting && (
        <div className="mt-2 flex flex-col gap-2 pl-12 sm:flex-row sm:items-center">
          <input type="text" value={comment} onChange={e => onCommentChange(e.target.value)}
            placeholder={t("workflows.commentPlaceholder")} className="app-input h-9 flex-1" disabled={submitting} />
          <div className="flex gap-2">
            <button onClick={onExecute} className="app-button-primary min-h-9" disabled={submitting}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}{t("workflows.confirmExecute")}
            </button>
            <button onClick={onCancelTransition} className="app-button-secondary min-h-9" disabled={submitting}>{t("workspace.cancel")}</button>
          </div>
        </div>
      )}
    </li>
  );
}

// ── Start Instance Modal ──

interface StartInstanceModalProps {
  workspaceId: string;
  definition: WorkflowDefinition;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (objectType: string, recordId: string) => void;
}

function StartInstanceModal({ workspaceId, definition, submitting, onClose, onSubmit }: StartInstanceModalProps) {
  const { t } = useI18n();
  const [objectType, setObjectType] = useState(definition.targetObject);
  const [recordId, setRecordId] = useState("");

  // Fetch records of the target object so the user can pick from a dropdown
  const { data: records = [] } = useRecords(workspaceId, objectType, { limit: 100 });

  // Build display label for each record (name > title > subject > summary > number > id)
  const recordLabel = (r: Record<string, unknown>): string => {
    for (const key of ["name", "title", "subject", "summary", "number", "code", "email"]) {
      const v = r[key];
      if (typeof v === "string" && v) return v;
    }
    return String(r.id ?? "");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{t("workflows.startInstanceTitle", { name: definition.name })}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <Field label={t("workflows.field.objectType")}>
            <input className="app-input" value={objectType} onChange={e => setObjectType(e.target.value)} />
          </Field>
          <Field label={t("workflows.field.recordId")}>
            <select className="app-input" value={recordId} onChange={e => setRecordId(e.target.value)}>
              <option value="">{t("workflows.placeholderRecordId")}</option>
              {records.map(r => (
                <option key={String(r.id)} value={String(r.id)}>{recordLabel(r)}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="app-button-secondary" disabled={submitting}>{t("workspace.cancel")}</button>
          <button onClick={() => onSubmit(objectType, recordId)} className="app-button-primary" disabled={submitting || !objectType || !recordId}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{t("workflows.start")}
          </button>
        </div>
      </div>
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

// ── V2 Workflow Instances Section ──

/** API response shape for a V2 instance detail (DB rows are snake_case). */
interface V2InstanceDetail {
  id: string;
  workflow_definition_id: string;
  object_type: string;
  record_id: string;
  status: string;
  current_step_id: string | null;
  version: number;
  started_at: string;
  completed_at: string | null;
  work_items: V2WorkItemRow[];
  definition: WorkflowDefinitionV2 | null;
}

interface V2WorkItemRow {
  id: string;
  instance_id: string;
  step_id: string;
  kind: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
}

const V2_STEP_KIND_LABEL_KEY: Record<WorkflowStepKind, MessageKey> = {
  start: "workflowV2.stepKindStart",
  human_task: "workflowV2.stepKindHumanTask",
  approval: "workflowV2.stepKindApproval",
  system_command: "workflowV2.stepKindSystemCommand",
  wait: "workflowV2.stepKindWait",
  end: "workflowV2.stepKindEnd",
};

function v2StatusBadgeClass(status: string): string {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "running") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

function v2StepKindBadgeClass(kind: WorkflowStepKind): string {
  switch (kind) {
    case "start": return "bg-sky-50 text-sky-700";
    case "end": return "bg-slate-200 text-slate-700";
    case "approval": return "bg-amber-50 text-amber-700";
    case "human_task": return "bg-indigo-50 text-indigo-700";
    case "system_command": return "bg-violet-50 text-violet-700";
    case "wait": return "bg-slate-100 text-slate-600";
    default: return "bg-slate-100 text-slate-600";
  }
}

function V2InstancesSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [instances, setInstances] = useState<V2InstanceDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // 1. Fetch my-work items to discover V2 instance IDs
      const workRes = await fetch(
        `/api/workspaces/${workspaceId}/my-work?limit=100`,
        { cache: "no-store" }
      );
      const workJson = await workRes.json();
      if (!workJson.success) {
        throw new Error(workJson.error?.message ?? t("workflowV2.loadFailed"));
      }
      const items: V2WorkItemRow[] = workJson.data?.items ?? [];
      // 2. Group by instance_id to get unique V2 instance IDs
      const instanceIds = [...new Set(items.map((i) => i.instance_id))];
      if (instanceIds.length === 0) {
        setInstances([]);
        return;
      }
      // 3. Fetch each V2 instance detail (cap at 10 to avoid excessive calls)
      const details = await Promise.all(
        instanceIds.slice(0, 10).map(async (instId) => {
          try {
            const res = await fetch(
              `/api/workspaces/${workspaceId}/workflows/instances-v2/${instId}`,
              { cache: "no-store" }
            );
            const json = await res.json();
            return json.success ? (json.data as V2InstanceDetail) : null;
          } catch {
            return null;
          }
        })
      );
      setInstances(details.filter((d): d is V2InstanceDetail => d !== null));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workflowV2.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="app-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <Layers size={16} className="text-indigo-600" />
            {t("workflowV2.instancesTitle")}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{t("workflowV2.instancesHint")}</p>
        </div>
        <button onClick={() => void load()} className="app-button-secondary" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {loading && instances.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflowV2.loadingInstances")}</p>
      ) : error ? (
        <div className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      ) : instances.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflowV2.noInstances")}</p>
      ) : (
        <ul className="space-y-4">
          {instances.map((inst) => (
            <V2InstanceRow key={inst.id} instance={inst}
              onOpenRecord={(ot, rid) => router.push(`/w/${workspaceId}/o/${ot}/${rid}`)} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── V2 Instance Row ──

interface V2InstanceRowProps {
  instance: V2InstanceDetail;
  onOpenRecord: (objectType: string, recordId: string) => void;
}

function V2InstanceRow({ instance, onOpenRecord }: V2InstanceRowProps) {
  const { t } = useI18n();
  const def = instance.definition;
  const steps: WorkflowStep[] = def?.steps ?? [];
  const currentStepId = instance.current_step_id;

  // Work items kind breakdown
  const breakdown = instance.work_items.reduce((acc, wi) => {
    acc[wi.kind] = (acc[wi.kind] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const hasRecord = Boolean(instance.object_type && instance.record_id);

  return (
    <li className="rounded-lg border border-slate-100 p-4">
      {/* Header row: instance ID, definition key, status, current step, record link */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
          <Layers size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {def?.name ?? def?.workflowKey ?? instance.workflow_definition_id}
          </p>
          <p className="truncate text-xs text-slate-500">
            {t("workflowV2.instanceId")}: <span className="font-mono">{instance.id}</span>
            {def && (
              <> · {t("workflowV2.definitionKey")}: <span className="font-mono">{def.workflowKey}</span></>
            )}
          </p>
        </div>
        <span className={`app-badge ${v2StatusBadgeClass(instance.status)}`}>{instance.status}</span>
        {currentStepId && (
          <span className="app-badge bg-slate-100 text-slate-700">
            {t("workflowV2.currentStep")}: <span className="font-mono">{currentStepId}</span>
          </span>
        )}
        {hasRecord && (
          <button
            onClick={() => onOpenRecord(instance.object_type, instance.record_id)}
            className="app-button-secondary min-h-8"
            title={t("workflowV2.record")}
          >
            <ExternalLink size={14} />{t("workflowV2.record")}
          </button>
        )}
      </div>

      {/* Step pipeline (horizontal badges) */}
      {steps.length > 0 && (
        <div className="mt-3 pl-12">
          <p className="mb-1.5 text-xs font-semibold text-slate-500">{t("workflowV2.stepPipeline")}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {steps.map((step, i) => {
              const isCurrent = step.id === currentStepId;
              return (
                <span key={`${step.id}-${i}`} className="flex items-center gap-1.5">
                  <span
                    className={`app-badge ${v2StepKindBadgeClass(step.kind)} ${isCurrent ? "ring-2 ring-indigo-400" : ""}`}
                  >
                    {t(V2_STEP_KIND_LABEL_KEY[step.kind])}
                    <span className="font-mono text-[10px] opacity-70">{step.id}</span>
                  </span>
                  {i < steps.length - 1 && <ArrowRight size={12} className="text-slate-300" />}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Work items count with kind breakdown */}
      <div className="mt-3 pl-12">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <ListChecks size={13} />
          {t("workflowV2.workItemsBreakdown")}
          <span className="app-badge bg-slate-100 text-slate-600">{instance.work_items.length}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(breakdown).map(([kind, count]) => (
            <span key={kind} className="app-badge bg-slate-50 text-slate-600">
              {kind}: {count}
            </span>
          ))}
          {Object.keys(breakdown).length === 0 && (
            <span className="text-xs text-slate-400">{t("workflowV2.noInstances")}</span>
          )}
        </div>
      </div>
    </li>
  );
}

