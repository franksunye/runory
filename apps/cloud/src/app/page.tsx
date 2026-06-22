"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Layers3, LockKeyhole, Sparkles } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAuthed(j.success && j.data?.authenticated === true))
      .catch(() => setAuthed(false));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("请输入工作区名称");
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const json = await res.json();
      if (json.success && json.data) router.push(`/w/${json.data.slug}/dashboard`);
      else setError(json.error?.message ?? "创建工作区失败");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建工作区失败");
    } finally { setLoading(false); }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f8fc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(86,100,245,.15),transparent_30%),radial-gradient(circle_at_90%_82%,rgba(22,166,106,.1),transparent_28%)]" />
      <header className="relative mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-10">
        <div className="flex items-center">
          <div className="grid size-9 place-items-center rounded-[10px] bg-slate-950 font-bold text-white">R</div>
          <span className="ml-3 text-lg font-bold tracking-tight">Runory</span>
          <span className="ml-3 hidden rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-500 sm:block">Cloud Preview</span>
        </div>
        <nav className="flex items-center gap-3">
          {authed === true && (
            <button onClick={() => router.push("/dashboard")} className="text-sm font-medium text-slate-700 hover:text-slate-950">
              进入工作台
            </button>
          )}
          {authed === false && (
            <button onClick={() => router.push("/login")} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              登录
            </button>
          )}
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pb-20 pt-10 lg:grid-cols-[1.12fr_.88fr] lg:px-10 lg:pt-20">
        <div>
          <div className="app-eyebrow flex items-center gap-2"><Sparkles size={15} /> Cloud-first business platform</div>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.12] tracking-[-.04em] text-slate-950 sm:text-6xl">把业务系统，变成可以持续生长的工作区。</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">从客户管理开始，按需安装业务能力。Runory 用受控扩展、审计与租户隔离，为团队提供一套稳定的云端业务底座。</p>
          <div className="mt-8 grid max-w-xl gap-3 text-sm text-slate-600 sm:grid-cols-3">
            {["元数据驱动", "全链路审计", "企业级隔离"].map((item) => <div key={item} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" />{item}</div>)}
          </div>
        </div>

        <div className="app-card relative p-2 sm:p-3">
          <div className="rounded-xl bg-slate-950 p-6 text-white sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-300">创建企业工作区</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">几分钟内开始运行</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">创建后可安装 CRM Lite Pack，并通过 Agent 安全扩展字段和视图。</p>
            <form onSubmit={handleSubmit} className="mt-7">
              <label htmlFor="workspace-name" className="mb-2 block text-sm font-semibold text-slate-200">工作区名称</label>
              <input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：星海贸易" className="app-input border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:border-indigo-400" autoFocus />
              {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
              <button type="submit" disabled={loading} className="app-button-primary mt-4 w-full">{loading ? "正在创建..." : "创建工作区"}<ArrowRight size={17} /></button>
            </form>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl p-3 text-sm text-slate-600"><Layers3 size={19} className="text-indigo-600" /><span><strong className="block text-slate-800">组合式能力</strong>模块按需安装</span></div>
            <div className="flex items-center gap-3 rounded-xl p-3 text-sm text-slate-600"><LockKeyhole size={19} className="text-emerald-600" /><span><strong className="block text-slate-800">安全变更</strong>预览、批准、回滚</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
