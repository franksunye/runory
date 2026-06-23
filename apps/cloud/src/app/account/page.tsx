"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  LogOut,
  Mail,
  Monitor,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import TrustIndicators from "@/components/TrustIndicators";

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

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString("zh-CN");
  } catch {
    return ts;
  }
}

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Profile editing
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Account deletion
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Early Access explanation
  const [eaExpanded, setEaExpanded] = useState(false);

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
      setDisplayName(meJson.data.principal?.displayName ?? "");
    } catch {
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!displayName.trim()) return;
    setSavingProfile(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage("显示名称已更新");
        setMe((prev) =>
          prev && prev.principal
            ? { ...prev, principal: { ...prev.principal, displayName: json.data.displayName } }
            : prev
        );
      } else {
        setError(json.error?.message ?? "更新失败");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
    router.push("/login");
    router.refresh();
  };

  const handleLogoutAll = async () => {
    await fetch("/api/auth/sessions", { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
    router.push("/login");
    router.refresh();
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const json = await res.json();
      if (json.success) {
        router.push("/login");
        router.refresh();
      } else {
        setError(json.error?.message ?? "删除账户失败");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除账户失败");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fc]">
        <p className="text-sm text-slate-500">加载中...</p>
      </main>
    );
  }

  if (!me?.authenticated || !me.principal) return null;

  const workspaces = me.workspaces ?? [];
  const firstWorkspaceSlug = workspaces[0]?.workspaceSlug;
  const exportHref = firstWorkspaceSlug ? `/w/${firstWorkspaceSlug}/export` : "/dashboard";
  const billingHref = firstWorkspaceSlug ? `/w/${firstWorkspaceSlug}/billing` : "/dashboard";
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <main className="relative min-h-screen bg-[#f7f8fc]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-slate-950 font-bold text-white">R</div>
            <span className="text-base font-bold tracking-tight">Runory</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              我的工作区
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut size={15} /> 退出登录
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
            <User size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">账户</h1>
            <p className="mt-0.5 text-sm text-slate-600">管理你的个人资料、会话与账户安全</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        <div className="mt-8 space-y-6">
          {/* Profile Section */}
          <section className="app-card p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <User size={18} className="text-slate-500" /> 个人资料
            </h2>
            <p className="mt-1 text-xs text-slate-500">你的账户基本信息</p>
            <form onSubmit={handleSaveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">邮箱</label>
                <div className="relative">
                  <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={me.principal.email ?? ""}
                    readOnly
                    className="app-input cursor-not-allowed bg-slate-50 pl-10 text-slate-500"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="displayName" className="mb-1.5 block text-xs font-semibold text-slate-600">显示名称</label>
                <input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={64}
                  className="app-input"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" disabled={savingProfile || !displayName.trim()} className="app-button-primary">
                  {savingProfile ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </section>

          {/* Sessions Section */}
          <section className="app-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Monitor size={18} className="text-slate-500" /> 会话管理
                </h2>
                <p className="mt-1 text-xs text-slate-500">当前登录的设备与会话</p>
              </div>
              {otherSessions.length > 0 && (
                <button
                  onClick={handleLogoutAll}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  注销所有其他会话
                </button>
              )}
            </div>
            <ul className="mt-4 divide-y divide-slate-100">
              {sessions.length === 0 ? (
                <li className="py-4 text-center text-sm text-slate-500">暂无活跃会话</li>
              ) : (
                sessions.map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Monitor size={15} className="text-slate-400" />
                      <span className="text-sm font-semibold text-slate-700">
                        {s.isCurrent ? "当前会话" : "其他设备"}
                      </span>
                      {s.isCurrent && (
                        <span className="app-badge bg-emerald-50 text-emerald-700">当前</span>
                      )}
                    </div>
                    <div className="flex flex-col text-xs text-slate-500 sm:flex-row sm:gap-4">
                      <span>最后使用：{formatTime(s.lastUsedAt)}</span>
                      <span>过期时间：{formatTime(s.expiresAt)}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleLogout}
                className="app-button-secondary"
              >
                <LogOut size={15} /> 注销当前会话
              </button>
            </div>
          </section>

          {/* Security Section */}
          <section className="app-card p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <ShieldCheck size={18} className="text-slate-500" /> 安全与数据
            </h2>
            <p className="mt-1 text-xs text-slate-500">导出你的数据或管理账户生命周期</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center gap-2">
                  <Download size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">导出我的数据</h3>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">进入工作区导出页面，下载你的业务数据</p>
                <Link
                  href={exportHref}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Download size={13} /> 前往导出
                </Link>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={18} className="text-red-600" />
                  <h3 className="text-sm font-bold text-red-700">删除账户</h3>
                </div>
                <p className="mt-1.5 text-xs text-red-600/80">永久删除账户及所有关联数据，此操作不可撤销</p>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen((v) => !v)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  <AlertTriangle size={13} /> 删除账户
                </button>
                {deleteConfirmOpen && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-white p-3">
                    <p className="text-xs font-semibold text-red-700">
                      请输入 <span className="font-mono font-bold">删除我的账户</span> 以确认
                    </p>
                    <input
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="删除我的账户"
                      className="mt-2 w-full rounded-lg border border-red-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    />
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleting || deleteConfirmText.trim() !== "删除我的账户"}
                      className="mt-2 w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleting ? "删除中..." : "确认删除账户"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Early Access Section */}
          <section className="app-card overflow-hidden bg-[linear-gradient(110deg,#fff_0%,#fff_58%,#f0f2ff_100%)] p-6">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">方案与权益</h2>
            </div>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="app-badge bg-indigo-100 text-indigo-700">
                  <CheckCircle2 size={14} /> Early Access
                </span>
                <span className="text-sm font-semibold text-slate-600">免费</span>
              </div>
              <Link
                href={billingHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <CreditCard size={13} /> 查看账单详情
              </Link>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setEaExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                什么是 Early Access？
                {eaExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {eaExpanded && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white/70 p-4 text-sm leading-6 text-slate-600">
                  <p>
                    Early Access 是 Runory 当前阶段的公开方案。你可以在免费使用核心平台能力的同时，
                    体验受控扩展、审计与回滚等企业级治理功能。部分高级功能（如 Stripe 订阅计费、
                    高级分析）仍在开发中，正式发布后将提供平滑升级路径。
                  </p>
                  <p className="mt-2">
                    你的所有数据均可随时导出，账户可随时删除——Runory 不是黑盒。
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Trust Indicators */}
          <TrustIndicators />
        </div>
      </div>
    </main>
  );
}
