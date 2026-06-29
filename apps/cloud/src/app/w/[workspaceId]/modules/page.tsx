"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Database, LayoutGrid, PackagePlus,
  RefreshCw, Sparkles, AlertCircle, ChevronRight,
} from "lucide-react";
import { notifyWorkspaceNavigationChanged } from "@/lib/workspace-events";
import { useI18n } from "@/i18n/locale-provider";

interface PackSummary {
  packId: string;
  name: string;
  version: string;
  description: string | null;
  recommended: boolean;
  onboardingChecklist: Array<{
    id: string;
    label: string;
    route?: string;
    description?: string;
  }>;
  marketplace: { category: string; license: string; publisher: string } | null;
  demoDataAvailable: boolean;
  installed: boolean;
  updateAvailable: boolean;
  installation?: {
    packVersion: string;
    installedAt: string;
    demoDataStatus: "none" | "loading" | "loaded" | "error";
    demoDataLoadedAt: string | null;
    installErrorMessage: string | null;
    demoDataErrorMessage: string | null;
  };
  release?: { channel: string; releasedAt: string };
}

export default function ModulesPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const { t } = useI18n();
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [loadingDemoId, setLoadingDemoId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/packs`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.loadFailed"));
      setPacks(json.data);
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : t("modules.loadDataFailed") });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleInstall = async (pack: PackSummary, includeDemoData: boolean) => {
    setInstallingId(pack.packId);
    setError(null);

    // Fire POST without awaiting — backend sets 'loading' status immediately.
    // We poll for completion instead of blocking on the response, which may
    // time out on Vercel if the install + demo data takes >60s.
    fetch(
      `/api/workspaces/${workspaceId}/packs/${pack.packId}/install`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ includeDemoData }),
      }
    ).catch(() => {});

    let attempts = 0;
    const maxAttempts = 100; // 5 minutes at 3s interval
    const poll = async () => {
      if (!mountedRef.current) return;
      attempts++;
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/packs`);
        const json = await res.json();
        if (json.success) {
          setPacks(json.data);
          const updated: PackSummary | undefined = json.data.find((p: PackSummary) => p.packId === pack.packId);
          if (updated) {
            const demoStatus = updated.installation?.demoDataStatus;
            const installError = updated.installation?.installErrorMessage;
            const done =
              (installError && !updated.installed) ||
              (updated.installed && !includeDemoData) ||
              (updated.installed && (demoStatus === "loaded" || demoStatus === "error"));
            if (done || attempts >= maxAttempts) {
              if (!mountedRef.current) return;
              setInstallingId(null);
              if (installError && !updated.installed) {
                setError({ message: installError });
              } else if (demoStatus === "error") {
                setError({ message: updated.installation?.demoDataErrorMessage ?? t("modules.installFailed") });
              } else if (attempts >= maxAttempts) {
                setError({ message: t("modules.installTimeout") });
              } else {
                notifyWorkspaceNavigationChanged();
                router.refresh();
              }
              return;
            }
          }
        }
      } catch {}
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 2000);
  };

  const handleLoadDemo = async (pack: PackSummary) => {
    setLoadingDemoId(pack.packId);
    setError(null);

    fetch(
      `/api/workspaces/${workspaceId}/packs/${pack.packId}/demo-data`,
      {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      }
    ).catch(() => {});

    let attempts = 0;
    const maxAttempts = 100;
    const poll = async () => {
      if (!mountedRef.current) return;
      attempts++;
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/packs`);
        const json = await res.json();
        if (json.success) {
          setPacks(json.data);
          const updated: PackSummary | undefined = json.data.find((p: PackSummary) => p.packId === pack.packId);
          if (updated) {
            const demoStatus = updated.installation?.demoDataStatus;
            if (demoStatus === "loaded" || demoStatus === "error" || attempts >= maxAttempts) {
              if (!mountedRef.current) return;
              setLoadingDemoId(null);
              if (demoStatus === "error") {
                setError({ message: updated.installation?.demoDataErrorMessage ?? t("modules.loadDemoFailed") });
              } else if (attempts >= maxAttempts) {
                setError({ message: t("modules.installTimeout") });
              }
              return;
            }
          }
        }
      } catch {}
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 2000);
  };

  const recommendedPacks = packs.filter((p) => p.recommended && !p.installed);
  const installedPacks = packs.filter((p) => p.installed);
  const otherPacks = packs.filter((p) => !p.recommended && !p.installed);

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Module center</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">
            {t("modules.title")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">{t("modules.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadData(); }}
          className="app-button-secondary self-start"
        >
          <RefreshCw size={16} />
          {t("workspace.refresh")}
        </button>
      </header>

      <Link
        href={`/w/${workspaceId}/dashboard`}
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        <ArrowLeft size={14} />
        {t("workspace.goDashboard")}
      </Link>

      {error && (
        <div role="alert" className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p>{error.message}</p>
              {error.requestId && (
                <p className="mt-1 text-xs opacity-70">{t("modules.requestId", { id: error.requestId })}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {packs.length === 0 ? (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <LayoutGrid size={32} className="text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">{t("modules.noPacksAvailable")}</p>
        </div>
      ) : (
        <>
          {/* Recommended Packs */}
          {recommendedPacks.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <Sparkles size={16} className="text-amber-500" />
                {t("modules.recommendedTitle")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendedPacks.map((pack) => (
                  <PackCard
                    key={pack.packId}
                    pack={pack}
                    workspaceId={workspaceId}
                    installing={installingId === pack.packId}
                    loadingDemo={loadingDemoId === pack.packId}
                    onInstall={(demo) => handleInstall(pack, demo)}
                    onLoadDemo={() => handleLoadDemo(pack)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Installed Packs */}
          {installedPacks.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <CheckCircle2 size={16} className="text-emerald-600" />
                {t("modules.installedCount", { count: installedPacks.length })}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {installedPacks.map((pack) => (
                  <PackCard
                    key={pack.packId}
                    pack={pack}
                    workspaceId={workspaceId}
                    installing={installingId === pack.packId}
                    loadingDemo={loadingDemoId === pack.packId}
                    onInstall={(demo) => handleInstall(pack, demo)}
                    onLoadDemo={() => handleLoadDemo(pack)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Other Available Packs */}
          {otherPacks.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <LayoutGrid size={16} className="text-slate-500" />
                {t("modules.allPacks")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {otherPacks.map((pack) => (
                  <PackCard
                    key={pack.packId}
                    pack={pack}
                    workspaceId={workspaceId}
                    installing={installingId === pack.packId}
                    loadingDemo={loadingDemoId === pack.packId}
                    onInstall={(demo) => handleInstall(pack, demo)}
                    onLoadDemo={() => handleLoadDemo(pack)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ── Pack Card ──

interface PackCardProps {
  pack: PackSummary;
  workspaceId: string;
  installing: boolean;
  loadingDemo: boolean;
  onInstall: (includeDemoData: boolean) => void;
  onLoadDemo: () => void;
}

function PackCard({ pack, workspaceId, installing, loadingDemo, onInstall, onLoadDemo }: PackCardProps) {
  const { t } = useI18n();
  const [showInstallOptions, setShowInstallOptions] = useState(false);
  const demoLoaded = pack.installation?.demoDataStatus === "loaded";
  const demoError = pack.installation?.demoDataStatus === "error";

  return (
    <article className="app-card flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="app-badge bg-emerald-50 text-emerald-700">Pack</span>
        <div className="flex items-center gap-1.5">
          {pack.recommended && (
            <span className="app-badge bg-amber-50 text-amber-700">
              <Sparkles size={12} />
              {t("modules.recommendedBadge")}
            </span>
          )}
          {pack.installed && (
            <span className="app-badge bg-slate-100 text-slate-600">
              <CheckCircle2 size={12} />
              {t("modules.installedBadge")}
            </span>
          )}
          {pack.updateAvailable && (
            <span className="app-badge bg-blue-50 text-blue-700">
              <RefreshCw size={12} />
              {t("modules.updateAvailable")}
            </span>
          )}
        </div>
      </div>

      <h3 className="mt-3 text-base font-bold text-slate-950">{pack.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
        {pack.description ?? t("modules.noDescription")}
      </p>

      <dl className="mt-4 space-y-1.5 text-xs text-slate-500">
        <div className="flex justify-between">
          <dt>{t("modules.version")}</dt>
          <dd className="font-medium text-slate-700">v{pack.version}</dd>
        </div>
        {pack.marketplace && (
          <div className="flex justify-between">
            <dt>{t("modules.category")}</dt>
            <dd className="font-medium text-slate-700">{pack.marketplace.category}</dd>
          </div>
        )}
      </dl>

      {/* Demo Data Status */}
      {pack.installed && pack.demoDataAvailable && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <Database size={12} className={
            demoLoaded ? "text-emerald-500" : demoError ? "text-red-500" : "text-slate-400"
          } />
          <span className={
            demoLoaded ? "text-emerald-600" : demoError ? "text-red-600" : "text-slate-500"
          }>
            {demoLoaded ? t("modules.demoLoaded") : demoError ? t("modules.demoError") : t("modules.demoNotLoaded")}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2 pt-1">
        {pack.installed ? (
          <>
            {pack.demoDataAvailable && !demoLoaded && (
              <button
                type="button"
                onClick={onLoadDemo}
                disabled={loadingDemo}
                className="app-button-secondary flex-1"
              >
                <Database size={14} />
                {loadingDemo ? t("workspace.loading") : t("modules.loadDemoData")}
              </button>
            )}
            <Link
              href={`/w/${workspaceId}/modules/${pack.packId}`}
              className="app-button-secondary flex items-center gap-1"
            >
              {t("modules.viewDetails")}
              <ChevronRight size={14} />
            </Link>
          </>
        ) : showInstallOptions ? (
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={() => onInstall(true)}
              disabled={installing}
              className="app-button-primary w-full"
            >
              <PackagePlus size={14} />
              {installing ? t("modules.installing") : t("modules.installWithDemo")}
            </button>
            <button
              type="button"
              onClick={() => onInstall(false)}
              disabled={installing}
              className="app-button-secondary w-full"
            >
              {t("modules.installOnly")}
            </button>
            <button
              type="button"
              onClick={() => setShowInstallOptions(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              {t("workspace.cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowInstallOptions(true)}
            disabled={installing}
            className="app-button-primary flex-1"
          >
            <PackagePlus size={16} />
            {t("modules.install")}
          </button>
        )}
      </div>
    </article>
  );
}
