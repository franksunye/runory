"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Database, LayoutGrid, PackagePlus,
  RefreshCw, Sparkles, AlertCircle, ChevronRight,
} from "lucide-react";
import { notifyWorkspaceNavigationChanged } from "@/lib/workspace-events";

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
  installation?: {
    packVersion: string;
    installedAt: string;
    demoDataStatus: "none" | "loaded" | "error";
    demoDataLoadedAt: string | null;
  };
  release?: { channel: string; releasedAt: string };
}

export default function ModulesPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [loadingDemoId, setLoadingDemoId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/packs`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "加载失败");
      setPacks(json.data);
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "加载数据失败" });
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleInstall = async (pack: PackSummary, includeDemoData: boolean) => {
    setInstallingId(pack.packId);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/packs/${pack.packId}/install`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ includeDemoData }),
        }
      );
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "安装失败");
      }
      await loadData();
      notifyWorkspaceNavigationChanged();
      router.refresh();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "安装失败" });
    } finally {
      setInstallingId(null);
    }
  };

  const handleLoadDemo = async (pack: PackSummary) => {
    setLoadingDemoId(pack.packId);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/packs/${pack.packId}/demo-data`,
        {
          method: "POST",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        }
      );
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "加载示例数据失败");
      }
      await loadData();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "加载示例数据失败" });
    } finally {
      setLoadingDemoId(null);
    }
  };

  const recommendedPacks = packs.filter((p) => p.recommended && !p.installed);
  const installedPacks = packs.filter((p) => p.installed);
  const otherPacks = packs.filter((p) => !p.recommended && !p.installed);

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Module center</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">
            模块中心
          </h1>
          <p className="mt-2 text-sm text-slate-500">浏览、安装和管理功能包</p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadData(); }}
          className="app-button-secondary self-start"
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </header>

      <Link
        href={`/w/${workspaceId}/dashboard`}
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        <ArrowLeft size={14} />
        返回工作台
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

      {packs.length === 0 ? (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <LayoutGrid size={32} className="text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">暂无可用功能包</p>
        </div>
      ) : (
        <>
          {/* Recommended Packs */}
          {recommendedPacks.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <Sparkles size={16} className="text-amber-500" />
                推荐安装
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
                已安装 ({installedPacks.length})
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
                全部功能包
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
              推荐
            </span>
          )}
          {pack.installed && (
            <span className="app-badge bg-slate-100 text-slate-600">
              <CheckCircle2 size={12} />
              已安装
            </span>
          )}
        </div>
      </div>

      <h3 className="mt-3 text-base font-bold text-slate-950">{pack.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
        {pack.description ?? "暂无描述"}
      </p>

      <dl className="mt-4 space-y-1.5 text-xs text-slate-500">
        <div className="flex justify-between">
          <dt>版本</dt>
          <dd className="font-medium text-slate-700">v{pack.version}</dd>
        </div>
        {pack.marketplace && (
          <div className="flex justify-between">
            <dt>分类</dt>
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
            {demoLoaded ? "示例数据已加载" : demoError ? "示例数据加载失败" : "示例数据未加载"}
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
                {loadingDemo ? "加载中..." : "加载示例数据"}
              </button>
            )}
            <Link
              href={`/w/${workspaceId}/modules/${pack.packId}`}
              className="app-button-secondary flex items-center gap-1"
            >
              查看详情
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
              {installing ? "安装中..." : "安装并加载示例数据"}
            </button>
            <button
              type="button"
              onClick={() => onInstall(false)}
              disabled={installing}
              className="app-button-secondary w-full"
            >
              仅安装（不加载示例数据）
            </button>
            <button
              type="button"
              onClick={() => setShowInstallOptions(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              取消
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
            安装
          </button>
        )}
      </div>
    </article>
  );
}
