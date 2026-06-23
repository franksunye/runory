"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, Boxes, CheckCircle2, CheckSquare, Clock3, PackagePlus, Puzzle, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import AuditTimeline from "@/components/AuditTimeline";
import { notifyWorkspaceNavigationChanged, notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useInstallations, useExtensions, useAuditLogs, useRecords, useWorkspaceChangeEvent } from "@/lib/api-hooks";

const CRM_LITE_PACK_ID = "crm-lite-pack";

export default function DashboardPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: installations = [], isLoading: loadingInst, mutate: mutateInstallations } = useInstallations(workspaceId);
  const { data: extensions = [], isLoading: loadingExt, mutate: mutateExtensions } = useExtensions(workspaceId);
  const { data: auditLogs = [], isLoading: loadingAudit, mutate: mutateAudit } = useAuditLogs(workspaceId, 5);
  const { data: taskRecords = [], isLoading: loadingTasks } = useRecords(workspaceId, "task");
  const loading = loadingInst && loadingExt && loadingAudit && loadingTasks;

  useWorkspaceChangeEvent(workspaceId);

  const refreshAll = async () => {
    await Promise.all([mutateInstallations(), mutateExtensions(), mutateAudit()]);
  };

  const handleInstallPack = async () => {
    setInstalling(true); setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/packs/${CRM_LITE_PACK_ID}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ includeDemoData: true }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error?.message ?? "安装失败");
      await refreshAll(); notifyWorkspaceNavigationChanged(); notifyWorkspaceDataChanged(); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "安装失败"); }
    finally { setInstalling(false); }
  };

  if (loading) return <DashboardSkeleton />;
  const hasPack = installations.length > 0;
  const cards = [
    { label: "已安装模块", value: installations.length, note: "官方能力正常运行", icon: Boxes, tone: "bg-indigo-50 text-indigo-600" },
    { label: "工作区扩展", value: extensions.length, note: "受控配置与定制", icon: Puzzle, tone: "bg-violet-50 text-violet-600" },
    { label: "任务总数", value: taskRecords.length, note: "跨模块任务管理", icon: CheckSquare, tone: "bg-blue-50 text-blue-600" },
    { label: "近期变更", value: auditLogs.length, note: "全部操作可追溯", icon: Activity, tone: "bg-emerald-50 text-emerald-600" },
  ];

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="app-eyebrow">Workspace overview</p><h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">工作区仪表盘</h1><p className="mt-2 text-sm text-slate-500">管理已安装能力、扩展状态与最近活动。</p></div>
      <button onClick={() => { void refreshAll(); }} className="app-button-secondary self-start"><RefreshCw size={16} />刷新数据</button>
    </header>
    {error && <div role="alert" className="app-error">{error}</div>}

    <section className="app-card overflow-hidden bg-[linear-gradient(110deg,#fff_0%,#fff_58%,#f0f2ff_100%)] p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
        <div><div className="flex items-center gap-2 text-sm font-bold text-indigo-600"><Sparkles size={17} />可组合业务工作区</div><h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{hasPack ? "核心业务能力已就绪" : "从安装第一个业务 Pack 开始"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{hasPack ? "CRM 模块已接入当前工作区。所有扩展都会经过校验、差异预览、审计与回滚流程。" : "CRM Lite 提供客户与联系人管理，并保留可治理的 Agent 扩展能力。"}</p></div>
        {hasPack ? <div className="flex min-w-fit items-center gap-3 rounded-xl border border-emerald-200 bg-white/80 px-4 py-3 text-sm font-semibold text-emerald-700"><CheckCircle2 size={19} />平台运行正常</div> : <button onClick={handleInstallPack} disabled={installing} className="app-button-primary min-w-fit"><PackagePlus size={18} />{installing ? "正在安装..." : "安装 CRM Lite Pack"}</button>}
      </div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(({ label, value, note, icon: Icon, tone }) => <article key={label} className="app-card p-5"><div className="flex items-start justify-between"><p className="text-sm font-semibold text-slate-600">{label}</p><span className={`grid size-9 place-items-center rounded-lg ${tone}`}><Icon size={18} /></span></div><strong className="mt-5 block text-3xl tracking-tight text-slate-950">{value}</strong><p className="mt-1 text-xs text-slate-500">{note}</p></article>)}</section>

    <section className="grid gap-5 lg:grid-cols-[1.08fr_.92fr]">
      <article className="app-card p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">最近活动</h3><p className="mt-1 text-xs text-slate-500">工作区配置与业务变更</p></div><Link href={`/w/${workspaceId}/audit`} className="flex items-center gap-1 text-xs font-bold text-indigo-600">查看全部 <ArrowRight size={14} /></Link></div><AuditTimeline logs={auditLogs} /></article>
      <article className="app-card p-5 sm:p-6"><div className="mb-5"><h3 className="font-bold text-slate-900">平台状态</h3><p className="mt-1 text-xs text-slate-500">企业级治理能力检查</p></div><div className="space-y-2">{[[ShieldCheck,"租户数据边界","已启用"],[Clock3,"审计与回滚","持续记录"],[Puzzle,"受控扩展","策略生效"]].map(([Icon,label,status]) => { const I=Icon as typeof ShieldCheck; return <div key={label as string} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5"><span className="grid size-9 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm"><I size={17} /></span><span className="flex-1 text-sm font-semibold text-slate-700">{label as string}</span><span className="app-badge bg-emerald-50 text-emerald-700">{status as string}</span></div>; })}</div></article>
    </section>
  </div>;
}

function DashboardSkeleton() { return <div className="animate-pulse space-y-6" aria-label="正在加载仪表盘"><div className="h-20 w-2/3 rounded-xl bg-slate-200" /><div className="h-44 rounded-2xl bg-slate-200" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map((key) => <div key={key} className="h-36 rounded-2xl bg-slate-200" />)}</div></div>; }
