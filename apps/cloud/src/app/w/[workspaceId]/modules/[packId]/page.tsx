"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Database, PackagePlus, RefreshCw,
  AlertCircle, ChevronRight, Sparkles, Trash2, X,
} from "lucide-react";
import { notifyWorkspaceNavigationChanged } from "@/lib/workspace-events";
import { useI18n } from "@/i18n/locale-provider";

interface PackDetail {
  pack: {
    id: string;
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
    modules: string[];
    marketplace: { category: string; license: string; publisher: string } | null;
  };
  installation: {
    installed: boolean;
    packVersion?: string;
    installedAt?: string;
    demoDataStatus?: "none" | "loaded" | "error";
    demoDataLoadedAt?: string | null;
    installErrorMessage?: string | null;
    demoDataErrorMessage?: string | null;
    updateAvailable?: boolean;
  };
  demoDataAvailable: boolean;
}

export default function PackDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const packId = params.packId as string;
  const { t } = useI18n();
  const [detail, setDetail] = useState<PackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/packs/${packId}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.loadFailed"));
      setDetail(json.data);
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : t("workspace.loadFailed") });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, packId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleInstall = async (includeDemoData: boolean) => {
    setInstalling(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/packs/${packId}/install`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ includeDemoData }),
        }
      );
      const json = await res.json();
      if (!json.success) {
        setError({ message: json.error?.message ?? t("modules.installFailed"), requestId: json.error?.requestId });
        return;
      }
      await loadData();
      notifyWorkspaceNavigationChanged();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : t("modules.installFailed") });
    } finally {
      setInstalling(false);
    }
  };

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/packs/${packId}/demo-data`,
        {
          method: "POST",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        }
      );
      const json = await res.json();
      if (!json.success) {
        setError({ message: json.error?.message ?? t("modules.loadDemoFailed"), requestId: json.error?.requestId });
        return;
      }
      await loadData();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : t("modules.loadDemoFailed") });
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleUninstall = async () => {
    setUninstalling(true);
    setError(null);
    setShowUninstallConfirm(false);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/packs/${packId}`,
        {
          method: "DELETE",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        }
      );
      const json = await res.json();
      if (!json.success) {
        setError({ message: json.error?.message ?? t("modules.uninstallFailed"), requestId: json.error?.requestId });
        return;
      }
      await loadData();
      notifyWorkspaceNavigationChanged();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : t("modules.uninstallFailed") });
    } finally {
      setUninstalling(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  if (!detail) return <p className="text-sm text-slate-400">{t("modules.packNotFound")}</p>;

  const { pack, installation, demoDataAvailable } = detail;
  const demoLoaded = installation.demoDataStatus === "loaded";
  const demoError = installation.demoDataStatus === "error";

  return (
    <div className="space-y-6">
      <Link
        href={`/w/${workspaceId}/modules`}
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        <ArrowLeft size={14} />
        {t("modules.backToModules")}
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

      {/* Pack Header */}
      <header className="app-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">{pack.name}</h1>
              {pack.recommended && (
                <span className="app-badge bg-amber-50 text-amber-700">
                  <Sparkles size={12} />
                  {t("modules.recommendedBadge")}
                </span>
              )}
              {installation.installed && (
                <span className="app-badge bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={12} />
                  {t("modules.installedBadge")}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {pack.description ?? t("modules.noDescription")}
            </p>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
              <div className="flex gap-1.5">
                <dt>{t("modules.versionLabel")}</dt>
                <dd className="font-medium text-slate-700">v{pack.version}</dd>
              </div>
              {pack.marketplace && (
                <div className="flex gap-1.5">
                  <dt>{t("modules.categoryLabel")}</dt>
                  <dd className="font-medium text-slate-700">{pack.marketplace.category}</dd>
                </div>
              )}
              {pack.marketplace && (
                <div className="flex gap-1.5">
                  <dt>{t("modules.licenseLabel")}</dt>
                  <dd className="font-medium text-slate-700">{pack.marketplace.license}</dd>
                </div>
              )}
            </dl>
          </div>
          <button
            type="button"
            onClick={() => { setLoading(true); void loadData(); }}
            className="app-button-secondary shrink-0"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {!installation.installed ? (
            <>
              <button
                type="button"
                onClick={() => handleInstall(true)}
                disabled={installing}
                className="app-button-primary"
              >
                <PackagePlus size={16} />
                {installing ? t("modules.installing") : t("modules.installWithDemo")}
              </button>
              <button
                type="button"
                onClick={() => handleInstall(false)}
                disabled={installing}
                className="app-button-secondary"
              >
                {t("modules.installOnlyPlain")}
              </button>
            </>
          ) : (
            <>
              {demoDataAvailable && !demoLoaded && (
                <button
                  type="button"
                  onClick={handleLoadDemo}
                  disabled={loadingDemo}
                  className="app-button-secondary"
                >
                  <Database size={14} />
                  {loadingDemo ? t("workspace.loading") : t("modules.loadDemoData")}
                </button>
              )}
              {demoLoaded && (
                <span className="app-badge bg-emerald-50 text-emerald-700">
                  <Database size={12} />
                  {t("modules.demoLoaded")}
                </span>
              )}
              {demoError && (
                <span className="app-badge bg-red-50 text-red-700">
                  <AlertCircle size={12} />
                  {t("modules.demoError")}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowUninstallConfirm(true)}
                disabled={uninstalling}
                className="app-button-secondary ml-auto !text-red-600 hover:!bg-red-50 hover:!border-red-300"
              >
                <Trash2 size={14} />
                {uninstalling ? t("modules.uninstalling") : t("modules.uninstall")}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Update available indicator (v0.3.4) */}
      {installation.installed && installation.updateAvailable && (
        <section className="app-card border-l-4 border-l-blue-400 p-4">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-blue-600" />
            <div>
              <p className="text-sm font-bold text-blue-700">{t("modules.updateAvailableTitle")}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {t("modules.updateMeta", { installedVersion: String(installation.packVersion ?? ""), latestVersion: detail.pack.version })}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Diagnostics (v0.3.6) */}
      {installation.installed && (installation.installErrorMessage || installation.demoDataErrorMessage) && (
        <section className="app-card border-l-4 border-l-red-400 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-red-700">
            <AlertCircle size={14} />
            {t("modules.diagnostics")}
          </h2>
          {installation.installErrorMessage && (
            <div className="mb-2">
              <p className="text-xs font-medium text-slate-700">{t("modules.installError")}</p>
              <p className="mt-1 rounded bg-red-50 p-2 font-mono text-xs text-red-800">
                {installation.installErrorMessage}
              </p>
            </div>
          )}
          {installation.demoDataErrorMessage && (
            <div>
              <p className="text-xs font-medium text-slate-700">{t("modules.demoDataError")}</p>
              <p className="mt-1 rounded bg-red-50 p-2 font-mono text-xs text-red-800">
                {installation.demoDataErrorMessage}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Onboarding Checklist */}
      {pack.onboardingChecklist.length > 0 && installation.installed && (
        <section className="app-card p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-900">{t("modules.onboarding")}</h2>
          <p className="mb-4 text-xs text-slate-500">{t("modules.onboardingHint")}</p>
          <ol className="space-y-3">
            {pack.onboardingChecklist.map((step, index) => (
              <li key={step.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{step.label}</p>
                  {step.description && (
                    <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>
                  )}
                </div>
                {step.route && (
                  <Link
                    href={`/w/${workspaceId}${step.route}`}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    {t("modules.goTo")}
                    <ChevronRight size={12} />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Modules */}
      <section className="app-card p-6">
        <h2 className="mb-3 text-sm font-bold text-slate-900">{t("modules.includedModules")}</h2>
        <div className="flex flex-wrap gap-2">
          {pack.modules.map((mod) => (
            <span key={mod} className="app-badge bg-slate-100 text-slate-600">
              {mod}
            </span>
          ))}
        </div>
      </section>

      {/* Uninstall confirmation modal */}
      {showUninstallConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-slate-950">{t("modules.uninstallConfirmTitle")}</h3>
              <button
                type="button"
                onClick={() => setShowUninstallConfirm(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label={t("modules.uninstallCancel")}
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">{t("modules.uninstallConfirmBody")}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUninstallConfirm(false)}
                className="app-button-secondary"
              >
                {t("modules.uninstallCancel")}
              </button>
              <button
                type="button"
                onClick={handleUninstall}
                disabled={uninstalling}
                className="app-button-primary !bg-red-600 hover:!bg-red-700"
              >
                <Trash2 size={14} />
                {uninstalling ? t("modules.uninstalling") : t("modules.uninstallConfirmButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
