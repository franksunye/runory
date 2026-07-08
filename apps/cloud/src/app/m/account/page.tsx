"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Building2, Globe, Info, ChevronRight, Monitor, Loader2,
  AlertTriangle, Shield,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/config";
import { apiFetch } from "@/lib/api-fetch";

export const dynamic = "force-dynamic";

// ── Workspace info type ──

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
  organizationId?: string;
  organizationRole?: string;
}

// ── Page ──

export default function MobileAccountPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileAccountPage />
    </Suspense>
  );
}

function MobileAccountPage() {
  const params = useParams();
  const workspaceId = params?.workspaceId as string | undefined;
  const { t, locale, setLocale } = useI18n();

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      setError(null);
      const json = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: WorkspaceInfo | null;
      }>(`/api/workspaces/${workspaceId}`, { cache: "no-store" });
      if (!json.success) {
        throw new Error(json.error?.message ?? t("mobile.errorOccurred"));
      }
      setWorkspace(json.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mobile.errorOccurred"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, t]);

  useEffect(() => {
    if (workspaceId) void load();
  }, [load]);

  const appVersion = "v0.5.1";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md">
        <h1 className="text-xl font-bold text-slate-900">{t("mobile.accountTitle")}</h1>
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-4">
        {workspaceId && loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-slate-400" />
            <p className="mt-3 text-xs text-slate-400">{t("mobile.loading")}</p>
          </div>
        ) : workspaceId && error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <AlertTriangle size={28} className="text-red-400" />
            <p className="text-center text-sm text-red-600">{error}</p>
            <button
              onClick={() => void load()}
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.retry")}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Workspace info */}
            {workspace && (
              <section>
                <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {t("mobile.accountWorkspace")}
                </h2>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <Building2 size={20} className="text-indigo-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{workspace.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {workspace.slug}
                      </p>
                    </div>
                  </div>
                  {workspace.organizationRole && (
                    <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                      <Shield size={14} className="text-slate-400" />
                      <span className="text-xs text-slate-400">{t("mobile.accountRole")}:</span>
                      <span className="text-xs font-semibold capitalize text-slate-700">
                        {workspace.organizationRole}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Language selector */}
            <section>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("mobile.accountLanguage")}
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {SUPPORTED_LOCALES.map((loc: Locale, idx: number) => (
                  <button
                    key={loc}
                    onClick={() => setLocale(loc)}
                    className={`flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition ${
                      idx > 0 ? "border-t border-slate-100" : ""
                    } ${locale === loc ? "bg-indigo-50" : "active:bg-slate-50"}`}
                  >
                    <Globe
                      size={18}
                      className={locale === loc ? "text-indigo-600" : "text-slate-400"}
                    />
                    <span
                      className={`flex-1 text-sm font-medium ${
                        locale === loc ? "text-indigo-900" : "text-slate-700"
                      }`}
                    >
                      {loc === "en" ? "English" : "中文"}
                    </span>
                    {locale === loc && (
                      <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* About */}
            <section>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("mobile.accountAbout")}
              </h2>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Info size={20} className="text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{t("mobile.appName")}</p>
                    <p className="text-xs text-slate-400">
                      {t("mobile.accountVersion")}: {appVersion}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  {t("footer.description")}
                </p>
              </div>
            </section>

            {/* Back to desktop */}
            <section>
              <a
                href={workspaceId ? `/w/${workspaceId}` : "/"}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm transition active:bg-slate-50"
              >
                <Monitor size={18} className="text-slate-400" />
                <span className="flex-1 text-sm font-medium text-slate-700">
                  {t("mobile.accountBackToDesktop")}
                </span>
                <ChevronRight size={18} className="text-slate-300" />
              </a>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
