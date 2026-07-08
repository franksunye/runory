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
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch, apiPatch, apiPost } from "@/lib/api-fetch";

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

function formatTime(ts: string, locale: string): string {
  try {
    return new Date(ts).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  } catch {
    return ts;
  }
}

export default function AccountPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
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
      const [meJson, sessJson] = await Promise.all([
        apiFetch<{ success: boolean; data?: MeResponse }>("/api/auth/me", { cache: "no-store" }),
        apiFetch<{ success: boolean; data?: SessionInfo[] }>("/api/auth/sessions", { cache: "no-store" }),
      ]);

      if (!meJson.success || !meJson.data?.authenticated) {
        router.replace("/login");
        return;
      }

      setMe(meJson.data);
      setSessions(sessJson.success ? (sessJson.data ?? []) : []);
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
      const json = await apiPatch<{ success: boolean; data?: { displayName: string }; error?: { message?: string } }>("/api/auth/me", { displayName: displayName.trim() });
      if (json.success) {
        setMessage(t("account.profileUpdated"));
        setMe((prev) =>
          prev && prev.principal && json.data
            ? { ...prev, principal: { ...prev.principal, displayName: json.data.displayName } }
            : prev
        );
      } else {
        setError(json.error?.message ?? t("account.updateFailed"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("account.updateFailed"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    await apiPost("/api/auth/logout").catch(() => {});
    // Clear ephemeral UI state per v0.5.1 Spec §7
    try {
      localStorage.removeItem("runory:sidebar-collapsed");
      localStorage.removeItem("runory:extension-notice-dismissed");
      localStorage.removeItem("runory:early-access-dismissed");
    } catch {
      // localStorage may not be available
    }
    router.push("/login");
    router.refresh();
  };

  const handleLogoutAll = async () => {
    await apiPost("/api/auth/sessions").catch(() => {});
    router.push("/login");
    router.refresh();
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message?: string } }>("/api/account/delete");
      if (json.success) {
        router.push("/login");
        router.refresh();
      } else {
        setError(json.error?.message ?? t("account.deleteFailed"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("account.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fc]">
        <p className="text-sm text-slate-500">{t("switcher.loading")}</p>
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
              {t("account.myWorkspaces")}
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut size={15} /> {t("switcher.logout")}
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">{t("account.title")}</h1>
            <p className="mt-0.5 text-sm text-slate-600">{t("account.subtitle")}</p>
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
              <User size={18} className="text-slate-500" /> {t("account.profileTitle")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{t("account.profileHint")}</p>
            <form onSubmit={handleSaveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">{t("account.emailLabel")}</label>
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
                <label htmlFor="displayName" className="mb-1.5 block text-xs font-semibold text-slate-600">{t("account.displayNameLabel")}</label>
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
                  {savingProfile ? t("account.saving") : t("account.save")}
                </button>
              </div>
            </form>
          </section>

          {/* Sessions Section */}
          <section className="app-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Monitor size={18} className="text-slate-500" /> {t("account.sessionsTitle")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">{t("account.sessionsHint")}</p>
              </div>
              {otherSessions.length > 0 && (
                <button
                  onClick={handleLogoutAll}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  {t("account.logoutAllOthers")}
                </button>
              )}
            </div>
            <ul className="mt-4 divide-y divide-slate-100">
              {sessions.length === 0 ? (
                <li className="py-4 text-center text-sm text-slate-500">{t("account.noSessions")}</li>
              ) : (
                sessions.map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Monitor size={15} className="text-slate-400" />
                      <span className="text-sm font-semibold text-slate-700">
                        {s.isCurrent ? t("account.currentSession") : t("account.otherDevice")}
                      </span>
                      {s.isCurrent && (
                        <span className="app-badge bg-emerald-50 text-emerald-700">{t("account.current")}</span>
                      )}
                    </div>
                    <div className="flex flex-col text-xs text-slate-500 sm:flex-row sm:gap-4">
                      <span>{t("account.lastUsed", { time: formatTime(s.lastUsedAt, locale) })}</span>
                      <span>{t("account.expiresAt", { time: formatTime(s.expiresAt, locale) })}</span>
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
                <LogOut size={15} /> {t("account.logoutCurrent")}
              </button>
            </div>
          </section>

          {/* Security Section */}
          <section className="app-card p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <ShieldCheck size={18} className="text-slate-500" /> {t("account.securityTitle")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{t("account.securityHint")}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center gap-2">
                  <Download size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">{t("account.exportTitle")}</h3>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{t("account.exportHint")}</p>
                <Link
                  href={exportHref}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Download size={13} /> {t("account.goExport")}
                </Link>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={18} className="text-red-600" />
                  <h3 className="text-sm font-bold text-red-700">{t("account.deleteAccountTitle")}</h3>
                </div>
                <p className="mt-1.5 text-xs text-red-600/80">{t("account.deleteAccountHint")}</p>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen((v) => !v)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  <AlertTriangle size={13} /> {t("account.deleteAccount")}
                </button>
                {deleteConfirmOpen && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-white p-3">
                    <p className="text-xs font-semibold text-red-700">
                      {t("account.deleteConfirmPrompt", { confirm: t("account.deleteConfirmText") }).split(t("account.deleteConfirmText"))[0]}
                      <span className="font-mono font-bold">{t("account.deleteConfirmText")}</span>
                      {t("account.deleteConfirmPrompt", { confirm: t("account.deleteConfirmText") }).split(t("account.deleteConfirmText"))[1]}
                    </p>
                    <input
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={t("account.deleteConfirmText")}
                      className="mt-2 w-full rounded-lg border border-red-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    />
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleting || deleteConfirmText.trim().toLowerCase() !== t("account.deleteConfirmText").toLowerCase()}
                      className="mt-2 w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleting ? t("account.deleting") : t("account.confirmDelete")}
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
              <h2 className="text-base font-bold text-slate-900">{t("account.planTitle")}</h2>
            </div>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="app-badge bg-indigo-100 text-indigo-700">
                  <CheckCircle2 size={14} /> Early Access
                </span>
                <span className="text-sm font-semibold text-slate-600">{t("account.free")}</span>
              </div>
              <Link
                href={billingHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <CreditCard size={13} /> {t("account.viewBilling")}
              </Link>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setEaExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {t("account.whatIsEarlyAccess")}
                {eaExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {eaExpanded && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white/70 p-4 text-sm leading-6 text-slate-600">
                  <p>
                    {t("account.earlyAccessBody1")}
                  </p>
                  <p className="mt-2">
                    {t("account.earlyAccessBody2")}
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
