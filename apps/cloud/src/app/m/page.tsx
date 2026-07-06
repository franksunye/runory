"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2, ChevronRight, Monitor } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";

export const dynamic = "force-dynamic";

interface WorkspaceEntry {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceStatus: string;
  organizationName: string;
  effectiveRole: string;
}

export default function MobileEntryPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/workspaces`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? t("mobile.errorOccurred"));
      }
      setWorkspaces(json.data?.workspaces ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mobile.errorOccurred"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelect = (ws: WorkspaceEntry) => {
    router.push(`/m/w/${ws.workspaceSlug || ws.workspaceId}`);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col px-5 py-8">
      {/* Branding */}
      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200">
          <span className="text-2xl font-black text-white">R</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{t("mobile.appName")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("mobile.tagline")}</p>
      </header>

      {/* Body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={28} className="animate-spin text-indigo-500" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-center text-sm font-medium text-red-600">{error}</p>
          <button
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 active:bg-slate-100"
          >
            {t("mobile.retry")}
          </button>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Building2 size={28} className="text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">{t("mobile.noWorkspaces")}</p>
          <p className="max-w-[280px] text-xs text-slate-400">{t("mobile.noWorkspacesHint")}</p>
        </div>
      ) : (
        <>
          <h2 className="mb-1 text-base font-bold text-slate-800">{t("mobile.selectWorkspace")}</h2>
          <p className="mb-4 text-xs text-slate-400">{t("mobile.selectWorkspaceHint")}</p>
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <button
                key={ws.workspaceId}
                onClick={() => handleSelect(ws)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.98]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                  <Building2 size={20} className="text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{ws.workspaceName}</p>
                  <p className="truncate text-xs text-slate-400">
                    {ws.organizationName}
                    {ws.effectiveRole ? ` · ${ws.effectiveRole}` : ""}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Footer link to desktop */}
      <footer className="mt-auto pt-8">
        <a
          href="/"
          className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-400 active:text-slate-600"
        >
          <Monitor size={14} />
          {t("mobile.openDesktop")}
        </a>
      </footer>
    </div>
  );
}
