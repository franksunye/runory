"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, Monitor, Plus, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/locale-provider";

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
  const { t, locale } = useI18n();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
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

      // Check platform admin status (403 means not an admin)
      try {
        const adminRes = await fetch("/api/admin/stats", { cache: "no-store" });
        setIsAdmin(adminRes.ok);
      } catch {
        setIsAdmin(false);
      }
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
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        router.push(`/w/${json.data.slug}/dashboard`);
      } else {
        setError(json.error?.message ?? t("switcher.createFailed"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("switcher.createFailed"));
    } finally {
      setCreating(false);
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

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fc]">
        <p className="text-sm text-slate-500">{t("switcher.loading")}</p>
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
            {isAdmin && (
              <button
                onClick={() => router.push("/admin")}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <ShieldCheck size={15} /> {t("switcher.platformAdmin")}
              </button>
            )}
            <Link
              href="/account"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <User size={15} /> {t("switcher.account")}
            </Link>
            <span className="text-sm text-slate-600">{me.principal?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut size={15} /> {t("switcher.logout")}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{t("switcher.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {t("switcher.subtitle")}
        </p>

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
                <p className="text-sm text-slate-500">{t("switcher.noWorkspaces")}</p>
              </div>
            ) : (
              workspaces.map((ws) => {
                return (
                <button
                  key={ws.workspaceId}
                  onClick={() => router.push(`/w/${ws.workspaceSlug}/dashboard`)}
                  className="group flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-indigo-200 hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">{ws.workspaceName}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {ws.effectiveRole}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{ws.organizationName}</p>
                    <p className="mt-2 text-xs font-semibold text-indigo-600">
                      {t("switcher.enterDashboard")}
                    </p>
                  </div>
                  <ArrowRight size={18} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                </button>
                );
              })
            )}
          </div>

          {/* Side panel: create + sessions */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Plus size={16} /> {t("switcher.createTitle")}
              </h3>
              <form onSubmit={handleCreate} className="mt-3 space-y-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("switcher.workspaceNamePlaceholder")}
                  className="app-input"
                />
                <button type="submit" disabled={creating} className="app-button-primary w-full">
                  {creating ? t("switcher.creating") : t("switcher.create")}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ShieldCheck size={16} /> {t("switcher.sessionsTitle")}
              </h3>
              <ul className="mt-3 space-y-2">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <Monitor size={13} />
                      {s.isCurrent ? t("switcher.currentSession") : t("switcher.otherDevice")}
                    </span>
                    <span className="text-slate-400">
                      {new Date(s.lastUsedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
                    </span>
                  </li>
                ))}
              </ul>
              {sessions.length > 1 && (
                <button
                  onClick={handleLogoutAll}
                  className="mt-3 w-full rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  {t("switcher.logoutAll")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
