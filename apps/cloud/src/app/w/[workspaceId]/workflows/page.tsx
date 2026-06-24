"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  GitBranch, Plus, RefreshCw, CheckCircle2, XCircle, Clock3,
  Play, ArrowRight, X, Trash2, AlertCircle, Loader2,
} from "lucide-react";
import type { WorkflowDefinition, WorkflowTransition } from "@runory/contracts";
import type { WorkflowInstance } from "@runory/platform-core";

interface PendingApproval extends WorkflowInstance {
  definition: WorkflowDefinition;
}
interface Toast { type: "success" | "error"; message: string }

type StateType = "initial" | "intermediate" | "approved" | "rejected" | "final";
type Role = "admin" | "member" | "viewer";

const STATE_TYPES: StateType[] = ["initial", "intermediate", "approved", "rejected", "final"];
const STATE_TYPE_LABELS: Record<StateType, string> = {
  initial: "初始", intermediate: "中间", approved: "已批准", rejected: "已拒绝", final: "终态",
};
const ROLES: Role[] = ["admin", "member", "viewer"];
const ROLE_LABELS: Record<Role, string> = { admin: "管理员", member: "成员", viewer: "访客" };

interface EditorState { name: string; label: string; type: StateType }
interface EditorTransition {
  fromStatus: string; toStatus: string; label: string;
  requiresApproval: boolean; requiredRole: Role;
}

export default function WorkflowsPage() {
  const workspaceId = useParams().workspaceId as string;

  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
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
      if (!defsJson.success) throw new Error(defsJson.error?.message ?? "加载失败");
      if (!instJson.success) throw new Error(instJson.error?.message ?? "加载失败");
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
      setError(e instanceof Error ? e.message : "加载失败");
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

  const handleCreateWorkflow = async (def: WorkflowDefinition) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/workflows`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(def),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "创建失败");
      showToast("success", `工作流「${def.name}」已创建`);
      setShowCreateModal(false);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartInstance = async (workflowId: string, objectType: string, recordId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/workflows/instances`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, objectType, recordId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "启动失败");
      showToast("success", "工作流实例已启动");
      setStartFor(null);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "启动失败");
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
      if (!json.success) throw new Error(json.error?.message ?? "执行失败");
      showToast("success", "操作已执行");
      setExecuting(null);
      setComment("");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "执行失败");
    } finally {
      setSubmitting(false);
    }
  };

  const pickTransition = (instanceId: string, transitionId: string) => {
    setExecuting({ instanceId, transitionId });
    setComment("");
  };
  const cancelTransition = () => { setExecuting(null); setComment(""); };

  if (loading) return <p className="text-sm text-slate-400">加载中...</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Approval flows</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">工作流</h1>
          <p className="mt-2 text-sm text-slate-500">管理审批流定义与运行中的工作流实例。</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button onClick={() => void load()} className="app-button-secondary"><RefreshCw size={16} />刷新</button>
          <button onClick={() => setShowCreateModal(true)} className="app-button-primary"><Plus size={16} />创建工作流</button>
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
            <h3 className="font-bold text-slate-900">待审批</h3>
            <p className="mt-1 text-xs text-slate-500">当前状态需要审批的工作流实例</p>
          </div>
          <span className="app-badge bg-amber-50 text-amber-700">{pending.length} 项</span>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">暂无待审批项</p>
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
          <h3 className="font-bold text-slate-900">工作流定义</h3>
          <p className="mt-1 text-xs text-slate-500">已配置的审批流（共 {definitions.length} 个）</p>
        </div>
        {definitions.length === 0 ? (
          <p className="text-sm text-slate-400">暂无工作流定义，点击右上角「创建工作流」。</p>
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
                        目标对象: {def.targetObject} · 初始状态: {def.initialState} · 状态数: {def.states.length}
                      </p>
                    </div>
                    <span className="app-badge bg-indigo-50 text-indigo-700">{defInstances.length} 实例</span>
                    <button onClick={() => setStartFor(def)} className="app-button-secondary"><Play size={14} />启动实例</button>
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
          <h3 className="font-bold text-slate-900">最近工作流实例</h3>
          <p className="mt-1 text-xs text-slate-500">工作区中所有运行中的工作流（共 {instances.length} 个）</p>
        </div>
        {instances.length === 0 ? (
          <p className="text-sm text-slate-400">暂无工作流实例</p>
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

      {showCreateModal && (
        <CreateWorkflowModal submitting={submitting} onClose={() => setShowCreateModal(false)} onSubmit={handleCreateWorkflow} />
      )}
      {startFor && (
        <StartInstanceModal definition={startFor} submitting={submitting} onClose={() => setStartFor(null)}
          onSubmit={(ot, rid) => handleStartInstance(startFor.id, ot, rid)} />
      )}
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
            {instance.objectType} · {instance.recordId} · 历史 {instance.history.length} 步
          </p>
        </div>
        <span className="app-badge bg-slate-100 text-slate-700">{stateLabel}</span>
      </div>
      {!terminal && transitions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
          {transitions.map(t => {
            const tid = `${t.fromStatus}->${t.toStatus}`;
            const active = isThisExecuting && executing?.transitionId === tid;
            return (
              <button key={tid} onClick={() => onPickTransition(tid)}
                className={`app-button-secondary min-h-9 ${active ? "ring-2 ring-indigo-400" : ""}`}
                disabled={submitting}>
                <ArrowRight size={14} />{t.label}
                {t.requiresApproval && <span className="text-amber-600">·需审批</span>}
              </button>
            );
          })}
        </div>
      )}
      {isThisExecuting && (
        <div className="mt-2 flex flex-col gap-2 pl-12 sm:flex-row sm:items-center">
          <input type="text" value={comment} onChange={e => onCommentChange(e.target.value)}
            placeholder="备注（可选）" className="app-input h-9 flex-1" disabled={submitting} />
          <div className="flex gap-2">
            <button onClick={onExecute} className="app-button-primary min-h-9" disabled={submitting}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}确认执行
            </button>
            <button onClick={onCancelTransition} className="app-button-secondary min-h-9" disabled={submitting}>取消</button>
          </div>
        </div>
      )}
    </li>
  );
}

// ── Create Workflow Modal (state machine editor) ──

interface CreateWorkflowModalProps {
  submitting: boolean;
  onClose: () => void;
  onSubmit: (def: WorkflowDefinition) => void;
}

function CreateWorkflowModal({ submitting, onClose, onSubmit }: CreateWorkflowModalProps) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [targetObject, setTargetObject] = useState("");
  const [initialState, setInitialState] = useState("");
  const [states, setStates] = useState<EditorState[]>([
    { name: "draft", label: "草稿", type: "initial" },
    { name: "approved", label: "已批准", type: "approved" },
  ]);
  const [transitions, setTransitions] = useState<EditorTransition[]>([]);

  const addState = () => setStates(s => [...s, { name: "", label: "", type: "intermediate" }]);
  const removeState = (i: number) => setStates(s => s.filter((_, idx) => idx !== i));
  const updateState = (i: number, patch: Partial<EditorState>) =>
    setStates(s => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));

  const addTransition = () => setTransitions(t => [...t, {
    fromStatus: states[0]?.name ?? "", toStatus: states[0]?.name ?? "",
    label: "", requiresApproval: false, requiredRole: "member",
  }]);
  const removeTransition = (i: number) => setTransitions(t => t.filter((_, idx) => idx !== i));
  const updateTransition = (i: number, patch: Partial<EditorTransition>) =>
    setTransitions(t => t.map((tr, idx) => (idx === i ? { ...tr, ...patch } : tr)));

  const canSubmit = Boolean(id && name && targetObject && initialState)
    && states.every(s => s.name && s.label)
    && transitions.every(t => t.fromStatus && t.toStatus && t.label);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ id, name, targetObject, initialState, states, transitions });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">创建工作流</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="工作流 ID">
              <input className="app-input" value={id} onChange={e => setId(e.target.value)} placeholder="如 quote-approval" />
            </Field>
            <Field label="名称">
              <input className="app-input" value={name} onChange={e => setName(e.target.value)} placeholder="如 报价审批流" />
            </Field>
            <Field label="目标对象">
              <input className="app-input" value={targetObject} onChange={e => setTargetObject(e.target.value)} placeholder="如 quote" />
            </Field>
            <Field label="初始状态">
              <input className="app-input" value={initialState} onChange={e => setInitialState(e.target.value)} placeholder="如 draft" />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">状态列表</p>
              <button onClick={addState} className="app-button-secondary min-h-8"><Plus size={14} />添加状态</button>
            </div>
            <div className="space-y-2">
              {states.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="app-input h-9 w-32" value={s.name} onChange={e => updateState(i, { name: e.target.value })} placeholder="name" />
                  <input className="app-input h-9 flex-1" value={s.label} onChange={e => updateState(i, { label: e.target.value })} placeholder="显示标签" />
                  <select className="app-input h-9 w-32" value={s.type} onChange={e => updateState(i, { type: e.target.value as StateType })}>
                    {STATE_TYPES.map(t => <option key={t} value={t}>{STATE_TYPE_LABELS[t]}</option>)}
                  </select>
                  <button onClick={() => removeState(i)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">流转规则</p>
              <button onClick={addTransition} className="app-button-secondary min-h-8"><Plus size={14} />添加流转</button>
            </div>
            <div className="space-y-2">
              {transitions.length === 0 && <p className="text-xs text-slate-400">暂无流转规则</p>}
              {transitions.map((t, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-slate-100 p-2">
                  <div className="flex items-center gap-2">
                    <select className="app-input h-9 flex-1" value={t.fromStatus} onChange={e => updateTransition(i, { fromStatus: e.target.value })}>
                      <option value="">起始状态</option>
                      {states.map(s => <option key={s.name} value={s.name}>{s.label || s.name}</option>)}
                    </select>
                    <ArrowRight size={14} className="shrink-0 text-slate-400" />
                    <select className="app-input h-9 flex-1" value={t.toStatus} onChange={e => updateTransition(i, { toStatus: e.target.value })}>
                      <option value="">目标状态</option>
                      {states.map(s => <option key={s.name} value={s.name}>{s.label || s.name}</option>)}
                    </select>
                    <button onClick={() => removeTransition(i)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="app-input h-9 flex-1" value={t.label} onChange={e => updateTransition(i, { label: e.target.value })} placeholder="操作标签（如 提交审批）" />
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input type="checkbox" checked={t.requiresApproval} onChange={e => updateTransition(i, { requiresApproval: e.target.checked })} />需审批
                    </label>
                    <select className="app-input h-9 w-28" value={t.requiredRole} onChange={e => updateTransition(i, { requiredRole: e.target.value as Role })}>
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="app-button-secondary" disabled={submitting}>取消</button>
          <button onClick={handleSubmit} className="app-button-primary" disabled={submitting || !canSubmit}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}创建
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Start Instance Modal ──

interface StartInstanceModalProps {
  definition: WorkflowDefinition;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (objectType: string, recordId: string) => void;
}

function StartInstanceModal({ definition, submitting, onClose, onSubmit }: StartInstanceModalProps) {
  const [objectType, setObjectType] = useState(definition.targetObject);
  const [recordId, setRecordId] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">启动实例 · {definition.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <Field label="对象类型">
            <input className="app-input" value={objectType} onChange={e => setObjectType(e.target.value)} />
          </Field>
          <Field label="记录 ID">
            <input className="app-input" value={recordId} onChange={e => setRecordId(e.target.value)} placeholder="如 rec_001" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="app-button-secondary" disabled={submitting}>取消</button>
          <button onClick={() => onSubmit(objectType, recordId)} className="app-button-primary" disabled={submitting || !objectType || !recordId}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}启动
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
