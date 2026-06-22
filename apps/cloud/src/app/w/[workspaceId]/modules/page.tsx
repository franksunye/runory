"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  LayoutGrid,
  PackagePlus,
  RefreshCw,
} from "lucide-react";
import { notifyWorkspaceNavigationChanged } from "@/lib/workspace-events";

type ItemType = "module" | "pack" | "template";

interface CatalogItem {
  id: string;
  itemType: ItemType;
  name: string;
  description: string | null;
  publisherId: string;
  status: string;
}

interface CatalogVersion {
  version: string;
  manifestSummary?: { publisher?: string } | null;
  manifestJson?: string;
  artifactChecksum: string | null;
}

interface CatalogRelease {
  channel: string;
  releasedAt: string;
}

interface CatalogEntry {
  item: CatalogItem;
  release: CatalogRelease;
  version: CatalogVersion;
}

interface Installation {
  id: string;
  moduleId: string;
  moduleVersion: string;
  packId?: string | null;
  status: string;
}

const TYPE_BADGE: Record<ItemType, { label: string; className: string }> = {
  module: { label: "Module", className: "bg-blue-50 text-blue-700" },
  pack: { label: "Pack", className: "bg-emerald-50 text-emerald-700" },
  template: { label: "Template", className: "bg-purple-50 text-purple-700" },
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function resolvePublisher(version: CatalogVersion, item: CatalogItem): string | null {
  if (version.manifestSummary?.publisher) return version.manifestSummary.publisher;
  if (version.manifestJson) {
    try {
      const parsed = JSON.parse(version.manifestJson);
      const fromManifest = parsed?.publisher ?? parsed?.metadata?.publisher ?? null;
      if (fromManifest) return fromManifest;
    } catch {
      /* ignore parse errors */
    }
  }
  return item.publisherId ?? null;
}

export default function ModulesPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [catalogRes, instRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/catalog`),
        fetch(`/api/workspaces/${workspaceId}/installations`),
      ]);
      if (!catalogRes.ok || !instRes.ok) throw new Error("模块数据暂时无法加载");
      const [catalogJson, instJson] = await Promise.all([
        catalogRes.json(),
        instRes.json(),
      ]);
      if (catalogJson.success) setEntries(catalogJson.data);
      if (instJson.success) setInstallations(instJson.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isInstalled = (item: CatalogItem) =>
    installations.some(
      (inst) => inst.moduleId === item.id || inst.packId === item.id
    );

  const handleInstall = async (item: CatalogItem) => {
    setInstallingId(item.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/installations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packId: item.id }),
        }
      );
      const json = await response.json();
      if (!json.success) throw new Error(json.error?.message ?? "安装失败");
      await loadData();
      notifyWorkspaceNavigationChanged();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "安装失败");
    } finally {
      setInstallingId(null);
    }
  };

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
          <p className="mt-2 text-sm text-slate-500">浏览和安装可用模块</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadData();
          }}
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
        返回仪表盘
      </Link>

      {error && <div role="alert" className="app-error">{error}</div>}

      {entries.length === 0 ? (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <LayoutGrid size={32} className="text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">暂无可用模块</p>
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(({ item, release, version }) => {
            const installed = isInstalled(item);
            const badge = TYPE_BADGE[item.itemType];
            const publisher = resolvePublisher(version, item);
            const installing = installingId === item.id;
            return (
              <article key={item.id} className="app-card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className={`app-badge ${badge.className}`}>{badge.label}</span>
                  {installed && (
                    <span className="app-badge bg-slate-100 text-slate-600">
                      <CheckCircle2 size={13} />
                      已安装
                    </span>
                  )}
                </div>

                <h3 className="mt-3 text-base font-bold text-slate-950">{item.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                  {item.description ?? "暂无描述"}
                </p>

                <dl className="mt-4 space-y-1.5 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <dt>版本</dt>
                    <dd className="font-medium text-slate-700">v{version.version}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>发布渠道</dt>
                    <dd className="font-medium text-slate-700">{release.channel}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>发布时间</dt>
                    <dd className="font-medium text-slate-700">
                      {formatDate(release.releasedAt)}
                    </dd>
                  </div>
                  {publisher && (
                    <div className="flex justify-between">
                      <dt>发布者</dt>
                      <dd className="font-medium text-slate-700">{publisher}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-5 flex items-center gap-2 pt-1">
                  {item.itemType === "pack" ? (
                    installed ? (
                      <span className="app-badge bg-emerald-50 text-emerald-700">
                        <CheckCircle2 size={13} />
                        已安装
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleInstall(item)}
                        disabled={installing}
                        className="app-button-primary flex-1"
                      >
                        <PackagePlus size={16} />
                        {installing ? "安装中..." : "安装"}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="app-button-secondary flex-1 opacity-70"
                      title="仅 Pack 类型支持直接安装"
                    >
                      <Eye size={16} />
                      查看
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
