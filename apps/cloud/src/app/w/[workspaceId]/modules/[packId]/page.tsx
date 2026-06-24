"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Database, PackagePlus, RefreshCw,
  AlertCircle, ChevronRight, Sparkles,
} from "lucide-react";
import { notifyWorkspaceNavigationChanged } from "@/lib/workspace-events";

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
  };
  demoDataAvailable: boolean;
}

export default function PackDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const packId = params.packId as string;
  const [detail, setDetail] = useState<PackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/packs/${packId}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "加载失败");
      setDetail(json.data);
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "加载失败" });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, packId]);

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
      if (!json.success) throw new Error(json.error?.message ?? "安装失败");
      await loadData();
      notifyWorkspaceNavigationChanged();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "安装失败" });
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
      if (!json.success) throw new Error(json.error?.message ?? "加载示例数据失败");
      await loadData();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "加载示例数据失败" });
    } finally {
      setLoadingDemo(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-400">加载中...</p>;
  if (!detail) return <p className="text-sm text-slate-400">未找到功能包</p>;

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
        返回模块中心
      </Link>

      {error && (
        <div role="alert" className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p>{error.message}</p>
              {error.requestId && (
                <p className="mt-1 text-xs opacity-70">请求 ID: {error.requestId}</p>
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
                  推荐
                </span>
              )}
              {installation.installed && (
                <span className="app-badge bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={12} />
                  已安装
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {pack.description ?? "暂无描述"}
            </p>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
              <div className="flex gap-1.5">
                <dt>版本:</dt>
                <dd className="font-medium text-slate-700">v{pack.version}</dd>
              </div>
              {pack.marketplace && (
                <div className="flex gap-1.5">
                  <dt>分类:</dt>
                  <dd className="font-medium text-slate-700">{pack.marketplace.category}</dd>
                </div>
              )}
              {pack.marketplace && (
                <div className="flex gap-1.5">
                  <dt>许可:</dt>
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
                {installing ? "安装中..." : "安装并加载示例数据"}
              </button>
              <button
                type="button"
                onClick={() => handleInstall(false)}
                disabled={installing}
                className="app-button-secondary"
              >
                仅安装
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
                  {loadingDemo ? "加载中..." : "加载示例数据"}
                </button>
              )}
              {demoLoaded && (
                <span className="app-badge bg-emerald-50 text-emerald-700">
                  <Database size={12} />
                  示例数据已加载
                </span>
              )}
              {demoError && (
                <span className="app-badge bg-red-50 text-red-700">
                  <AlertCircle size={12} />
                  示例数据加载失败
                </span>
              )}
            </>
          )}
        </div>
      </header>

      {/* Diagnostics (v0.3.6) */}
      {installation.installed && (installation.installErrorMessage || installation.demoDataErrorMessage) && (
        <section className="app-card border-l-4 border-l-red-400 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-red-700">
            <AlertCircle size={14} />
            诊断信息
          </h2>
          {installation.installErrorMessage && (
            <div className="mb-2">
              <p className="text-xs font-medium text-slate-700">安装错误:</p>
              <p className="mt-1 rounded bg-red-50 p-2 font-mono text-xs text-red-800">
                {installation.installErrorMessage}
              </p>
            </div>
          )}
          {installation.demoDataErrorMessage && (
            <div>
              <p className="text-xs font-medium text-slate-700">示例数据错误:</p>
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
          <h2 className="mb-4 text-sm font-bold text-slate-900">入门指引</h2>
          <p className="mb-4 text-xs text-slate-500">安装完成后，按照以下步骤快速上手</p>
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
                    前往
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
        <h2 className="mb-3 text-sm font-bold text-slate-900">包含模块</h2>
        <div className="flex flex-wrap gap-2">
          {pack.modules.map((mod) => (
            <span key={mod} className="app-badge bg-slate-100 text-slate-600">
              {mod}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
