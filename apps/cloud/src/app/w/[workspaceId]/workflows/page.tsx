"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  GitBranch,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type {
  WorkflowDefinition,
  WorkflowTransition,
} from "@runory/contracts";
import type {
  WorkflowInstance,
} from "@runory/platform-core";

interface PendingApproval extends WorkflowInstance {
  definition: WorkflowDefinition;
}

export default function WorkflowsPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [defsRes, instRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/workflows`),
        fetch(`/api/workspaces/${workspaceId}/workflows/instances`),
      ]);
      const defsJson = await defsRes.json();
      const instJson = await instRes.json();
      if (defsJson.success) setDefinitions(defsJson.data);
      if (instJson.success) setInstances(instJson.data);

      // Compute pending approvals client-side: instances whose current state
      // has at least one transition requiring approval in the linked definition.
      if (defsJson.success && instJson.success) {
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Approval flows</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">工作流</h1>
          <p className="mt-2 text-sm text-slate-500">
            管理审批流定义与运行中的工作流实例。
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="app-button-secondary self-start"
        >
          <RefreshCw size={16} />刷新
        </button>
      </header>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Pending Approvals */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">待审批</h3>
            <p className="mt-1 text-xs text-slate-500">
              当前状态需要审批的工作流实例
            </p>
          </div>
          <span className="app-badge bg-amber-50 text-amber-700">
            {pending.length} 项
          </span>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">暂无待审批项</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map(p => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-600">
                  <Clock3 size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {p.definition.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {p.objectType} · {p.recordId} · 当前状态: {p.currentState}
                  </p>
                </div>
                <span className="app-badge bg-amber-50 text-amber-700">
                  待审批
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Workflow Definitions */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">工作流定义</h3>
            <p className="mt-1 text-xs text-slate-500">
              已配置的审批流（共 {definitions.length} 个）
            </p>
          </div>
          <button className="app-button-primary" disabled>
            <Plus size={16} />创建工作流
          </button>
        </div>
        {definitions.length === 0 ? (
          <p className="text-sm text-slate-400">
            暂无工作流定义。可由管理员通过 API 创建。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {definitions.map(def => {
              const defInstances = instances.filter(i => i.workflowId === def.id);
              return (
                <li key={def.id} className="py-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                      <GitBranch size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {def.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        目标对象: {def.targetObject} · 初始状态: {def.initialState} · 状态数: {def.states.length}
                      </p>
                    </div>
                    <span className="app-badge bg-indigo-50 text-indigo-700">
                      {defInstances.length} 实例
                    </span>
                  </div>
                  {/* State chips */}
                  <div className="mt-3 flex flex-wrap gap-1.5 pl-12">
                    {def.states.map((s: WorkflowDefinition["states"][number]) => (
                      <span
                        key={s.name}
                        className={`app-badge ${
                          s.type === "approved"
                            ? "bg-emerald-50 text-emerald-700"
                            : s.type === "rejected"
                            ? "bg-red-50 text-red-700"
                            : s.type === "initial"
                            ? "bg-sky-50 text-sky-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {s.label}
                      </span>
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
          <p className="mt-1 text-xs text-slate-500">
            工作区中所有运行中的工作流（共 {instances.length} 个）
          </p>
        </div>
        {instances.length === 0 ? (
          <p className="text-sm text-slate-400">暂无工作流实例</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {instances.slice(0, 20).map(inst => {
              const def = definitions.find(d => d.id === inst.workflowId);
              const stateType = def?.states.find((s: WorkflowDefinition["states"][number]) => s.name === inst.currentState)?.type;
              const isTerminal =
                stateType === "approved" || stateType === "rejected" || stateType === "final";
              const Icon = isTerminal
                ? stateType === "approved"
                  ? CheckCircle2
                  : XCircle
                : Clock3;
              const tone = isTerminal
                ? stateType === "approved"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-red-50 text-red-600"
                : "bg-slate-100 text-slate-600";
              return (
                <li key={inst.id} className="flex items-center gap-3 py-3">
                  <span className={`grid size-9 place-items-center rounded-lg ${tone}`}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {def?.name ?? inst.workflowId}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {inst.objectType} · {inst.recordId} · 历史 {inst.history.length} 步
                    </p>
                  </div>
                  <span className="app-badge bg-slate-100 text-slate-700">
                    {inst.currentState}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
