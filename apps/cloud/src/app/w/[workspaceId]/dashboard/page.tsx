"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Database, PackagePlus, Plus, RefreshCw, Settings2, X,
} from "lucide-react";
import type { WidgetDeclaration, DashboardZone } from "@runory/contracts";
import { notifyWorkspaceNavigationChanged, notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useWorkspaceChangeEvent } from "@/lib/api-hooks";
import WidgetRenderer from "@/components/widgets/WidgetRenderer";
import DashboardEditMode from "@/components/widgets/DashboardEditMode";

const DASHBOARD_ZONES: DashboardZone[] = ["metrics", "trends", "lists", "activity"];

const CRM_LITE_PACK_ID = "crm-lite-pack";

// ── Types ──

interface LayoutItem {
  zone: DashboardZone;
  moduleId: string;
  widgetKey: string;
  instance: string;
  position: number;
  hidden: boolean;
  configOverride: Record<string, unknown> | null;
  widget: WidgetDeclaration;
}

interface AvailableWidget {
  moduleId: string;
  widgetKey: string;
  label: string;
  type: string;
  icon: string;
}

// ── Main Page ──

export default function DashboardPage() {
  const workspaceId = useParams().workspaceId as string;
  const [installing, setInstalling] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [availableWidgets, setAvailableWidgets] = useState<AvailableWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPack, setHasPack] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useWorkspaceChangeEvent(workspaceId);

  const loadLayout = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/dashboard/layout`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setLayout(json.data.layout);
        setAvailableWidgets(json.data.availableWidgets);
        const packInstalled = json.data.layout.length > 0 || json.data.availableWidgets.length > 0;
        setHasPack(packInstalled);
        if (!packInstalled) {
          setHasData(false);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const checkHasData = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/objects/company/records?limit=1`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setHasData(Array.isArray(json.data) && json.data.length > 0);
      }
    } catch {
      // ignore — object may not exist yet
      setHasData(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void (async () => {
      await loadLayout();
      if (hasPack) await checkHasData();
    })();
    const interval = setInterval(() => {
      void loadLayout();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadLayout, checkHasData]);

  const handleInstallPack = async () => {
    setInstalling(true); setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/packs/${CRM_LITE_PACK_ID}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ includeDemoData: false }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error?.message ?? "安装失败");
      notifyWorkspaceNavigationChanged(); notifyWorkspaceDataChanged();
      await loadLayout();
      await checkHasData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "安装失败"); }
    finally { setInstalling(false); }
  };

  const handleSeedDemo = async () => {
    setSeeding(true); setError(null);
    try {
      // Re-install the pack with demo data enabled. installPack is idempotent:
      // already-installed modules are skipped, and demo records use `match`
      // fields so re-running will not create duplicates.
      const response = await fetch(`/api/workspaces/${workspaceId}/packs/${CRM_LITE_PACK_ID}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ includeDemoData: true }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error?.message ?? "加载示例数据失败");
      notifyWorkspaceDataChanged();
      await checkHasData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "加载示例数据失败"); }
    finally { setSeeding(false); }
  };

  if (loading) return <DashboardSkeleton />;

  // ── Empty State: No Pack ──
  if (!hasPack) {
    return (
      <div className="space-y-6">
        <header>
          <p className="app-eyebrow">Workbench</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">工作台</h1>
          <p className="mt-2 text-sm text-slate-500">今天需要关注什么？</p>
        </header>
        {error && <div role="alert" className="app-error">{error}</div>}
        <div className="app-card overflow-hidden bg-[linear-gradient(110deg,#fff_0%,#fff_58%,#f0f2ff_100%)] p-8 sm:p-12">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-indigo-100">
              <PackagePlus size={32} className="text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">从安装 CRM Lite 开始</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              CRM Lite 提供公司、联系人、商机和任务管理。安装后即可加载示例数据，立即体验完整的业务工作台。
            </p>
            <button onClick={handleInstallPack} disabled={installing} className="app-button-primary mt-6">
              <PackagePlus size={18} />{installing ? "正在安装..." : "安装 CRM Lite Pack"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty State: Pack installed but no data ──
  if (!hasData) {
    return (
      <div className="space-y-6">
        <header>
          <p className="app-eyebrow">Workbench</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">工作台</h1>
          <p className="mt-2 text-sm text-slate-500">今天需要关注什么？</p>
        </header>
        {error && <div role="alert" className="app-error">{error}</div>}
        <div className="app-card p-8 sm:p-12">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-emerald-100">
              <Database size={32} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">业务工作台已就绪</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              CRM Lite 已安装。加载示例数据可以立即看到公司、联系人、商机和任务的完整业务视图，帮助你快速了解 Runory 的能力。
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button onClick={handleSeedDemo} disabled={seeding} className="app-button-primary">
                <Database size={18} />{seeding ? "正在加载..." : "加载示例数据"}
              </button>
              <Link href={`/w/${workspaceId}/companies/new`} className="app-button-secondary">
                <Plus size={18} />手动创建
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Business Workbench (Composition Shell) ──
  const metricsWidgets = layout.filter((item) => item.zone === "metrics");
  const trendsWidgets = layout.filter((item) => item.zone === "trends");
  const listsWidgets = layout.filter((item) => item.zone === "lists");
  const activityWidgets = layout.filter((item) => item.zone === "activity");

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Workbench</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">工作台</h1>
          <p className="mt-2 text-sm text-slate-500">今天需要关注什么？</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <button onClick={() => setEditMode(false)} className="app-button-primary">
              <X size={16} />退出编辑
            </button>
          ) : (
            <>
              <button onClick={() => void loadLayout()} className="app-button-secondary">
                <RefreshCw size={16} />刷新
              </button>
              <button onClick={() => setEditMode(true)} className="app-button-secondary">
                <Settings2 size={16} />编辑工作台
              </button>
            </>
          )}
        </div>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}

      {editMode ? (
        <DashboardEditMode
          workspaceId={workspaceId}
          layout={layout}
          availableWidgets={availableWidgets}
          zones={DASHBOARD_ZONES}
          onLayoutChange={setLayout}
          onReset={() => void loadLayout()}
          onClose={() => setEditMode(false)}
        />
      ) : layout.length === 0 ? (
        <div className="app-card p-12 text-center">
          <p className="text-sm text-slate-500">工作台暂无组件。请安装包含 dashboard 组件的模块。</p>
        </div>
      ) : (
        <>
          {/* Metrics Zone */}
          {metricsWidgets.length > 0 && (
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metricsWidgets.map((item) => (
                <WidgetRenderer
                  key={`${item.moduleId}:${item.widgetKey}:${item.instance}`}
                  workspaceId={workspaceId}
                  moduleId={item.moduleId}
                  widgetKey={item.widgetKey}
                  instance={item.instance}
                  zone={item.zone}
                  widget={item.widget}
                  editMode={editMode}
                />
              ))}
            </section>
          )}

          {/* Trends Zone */}
          {trendsWidgets.length > 0 && (
            <section className="grid gap-4 lg:grid-cols-2">
              {trendsWidgets.map((item) => (
                <WidgetRenderer
                  key={`${item.moduleId}:${item.widgetKey}:${item.instance}`}
                  workspaceId={workspaceId}
                  moduleId={item.moduleId}
                  widgetKey={item.widgetKey}
                  instance={item.instance}
                  zone={item.zone}
                  widget={item.widget}
                  editMode={editMode}
                />
              ))}
            </section>
          )}

          {/* Lists Zone */}
          {listsWidgets.length > 0 && (
            <section className="grid gap-4 lg:grid-cols-2">
              {listsWidgets.map((item) => (
                <WidgetRenderer
                  key={`${item.moduleId}:${item.widgetKey}:${item.instance}`}
                  workspaceId={workspaceId}
                  moduleId={item.moduleId}
                  widgetKey={item.widgetKey}
                  instance={item.instance}
                  zone={item.zone}
                  widget={item.widget}
                  editMode={editMode}
                />
              ))}
            </section>
          )}

          {/* Activity Zone */}
          {activityWidgets.length > 0 && (
            <section>
              {activityWidgets.map((item) => (
                <WidgetRenderer
                  key={`${item.moduleId}:${item.widgetKey}:${item.instance}`}
                  workspaceId={workspaceId}
                  moduleId={item.moduleId}
                  widgetKey={item.widgetKey}
                  instance={item.instance}
                  zone={item.zone}
                  widget={item.widget}
                  editMode={editMode}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ── Skeleton ──

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <header>
        <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded bg-slate-100" />
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="app-card p-5">
            <div className="size-10 animate-pulse rounded-lg bg-slate-200" />
            <div className="mt-4 h-8 w-16 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </section>
      <div className="app-card h-48 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}
