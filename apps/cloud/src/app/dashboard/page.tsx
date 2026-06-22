"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, Monitor, Plus, ShieldCheck } from "lucide-react";

interface WorkspaceEntry {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceStatus: string;
  organizationName: string;
  effectiveRole: string;
}

interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface MeResponse {
  authenticated: boolean;
  principal?: { userId: string; email: string | null; displayName: string };
  workspaces?: WorkspaceEntry[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, sessRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/auth/sessions", { cache: "no-store" }),
      ]);
      const meJson = await meRes.json();
      const sessJson = await sessRes.json();

      if (!meJson.success || !meJson.data?.authenticated) {
        router.replace("/login");
        return;
      }

      setMe(meJson.data);
      setSessions(sessJson.success ? sessJson.data : []);
    } catch {
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        router.push(`/w/${json.data.slug}/dashboard`);
      } else {
        setError(json.error?.message ?? "创建工作区失败");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建工作区失败");
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const handleLogoutAll = async () => {
    await fetch("/api/auth/sessions", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fc]">
        <p className="text-sm text-slate-500">加载中...</p>
      </main>
    );
  }

  if (!me?.authenticated) return null;

  const workspaces = me.workspaces ?? [];

  return (
    <main className="relative min-h-screen bg-[#f7f8fc]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-slate-950 font-bold text-white">R</div>
            <span className="text-base font-bold tracking-tight">Runory</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{me.principal?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut size={15} /> 退出登录
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">我的工作区</h1>
        <p className="mt-1 text-sm text-slate-600">选择一个工作区进入，或创建新的工作区。</p>

        {error && (
          <div role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Workspace list */}
          <div className="space-y-3">
            {workspaces.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <p className="text-sm text-slate-500">暂无工作区。请在右侧创建你的第一个工作区。</p>
              </div>
            ) : (
              workspaces.map((ws) => (
                <button
                  key={ws.workspaceId}
                  onClick={() => router.push(`/w/${ws.workspaceSlug}/dashboard`)}
                  className="group flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">{ws.workspaceName}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {ws.effectiveRole}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{ws.organizationName}</p>
                  </div>
                  <ArrowRight size={18} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                </button>
              ))
            )}
          </div>

          {/* Side panel: create + sessions */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Plus size={16} /> 创建新工作区
              </h3>
              <form onSubmit={handleCreate} className="mt-3 space-y-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="工作区名称"
                  className="app-input"
                />
                <button type="submit" disabled={creating} className="app-button-primary w-full">
                  {creating ? "创建中..." : "创建"}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ShieldCheck size={16} /> 会话管理
              </h3>
              <ul className="mt-3 space-y-2">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <Monitor size={13} />
                      {s.isCurrent ? "当前会话" : "其他设备"}
                    </span>
                    <span className="text-slate-400">
                      {new Date(s.lastUsedAt).toLocaleString("zh-CN")}
                    </span>
                  </li>
                ))}
              </ul>
              {sessions.length > 1 && (
                <button
                  onClick={handleLogoutAll}
                  className="mt-3 w-full rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  注销所有会话
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
