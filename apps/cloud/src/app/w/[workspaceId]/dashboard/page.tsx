"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown, ChevronUp, Database, PackagePlus, Plus, RefreshCw, Settings2, X,
} from "lucide-react";
import type { WidgetDeclaration, DashboardZone } from "@runory/contracts";
import { notifyWorkspaceNavigationChanged, notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useNavigation, useWorkspaceChangeEvent } from "@/lib/api-hooks";
import WidgetRenderer, { type WidgetDataResponse } from "@/components/widgets/WidgetRenderer";
import DashboardEditMode from "@/components/widgets/DashboardEditMode";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch, apiPost } from "@/lib/api-fetch";

const DASHBOARD_ZONES: DashboardZone[] = ["metrics", "trends", "lists", "activity"];
const DASHBOARD_PREVIEW_LIMIT: Record<DashboardZone, number> = {
  metrics: 8,
  trends: 4,
  lists: 4,
  activity: 1,
};

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
  const { t } = useI18n();
  const {
    data: navigationData,
    isLoading: navigationLoading,
    mutate: refreshNavigation,
  } = useNavigation(workspaceId);
  const hasPack = (navigationData?.packs.length ?? 0) > 0;
  const [installing, setInstalling] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [availableWidgets, setAvailableWidgets] = useState<AvailableWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [expandedZones, setExpandedZones] = useState<Set<DashboardZone>>(() => new Set());
  // Batch widget data: keyed by `${moduleId}:${widgetKey}:${instance}`.
  const [widgetDataMap, setWidgetDataMap] = useState<Record<string, WidgetDataResponse | null>>({});
  const [widgetErrorMap, setWidgetErrorMap] = useState<Record<string, string | null>>({});
  const [widgetsLoading, setWidgetsLoading] = useState(true);

  useWorkspaceChangeEvent(workspaceId);

  const loadLayout = useCallback(async (): Promise<boolean> => {
    try {
      const json = await apiFetch<{
        success: boolean;
        data?: { layout: LayoutItem[]; availableWidgets: AvailableWidget[] };
      }>(`/api/workspaces/${workspaceId}/dashboard/layout`);
      if (json.success) {
        setLayout(json.data!.layout);
        setAvailableWidgets(json.data!.availableWidgets);
        return json.data!.layout.length > 0;
      }
    } catch {
      // ignore
    }
    return false;
  }, [workspaceId]);

  const checkHasData = useCallback(async () => {
    try {
      const json = await apiFetch<{
        success: boolean;
        data?: unknown[];
      }>(`/api/workspaces/${workspaceId}/objects/company/records?limit=1`, { cache: "no-store" });
      if (json.success) {
        setHasData(Array.isArray(json.data) && json.data.length > 0);
      }
    } catch {
      // ignore — object may not exist yet
      setHasData(false);
    }
  }, [workspaceId]);

  // Batch-fetch all widget data in a single request, sharing the expensive
  // installations/manifest/override lookups on the backend (eliminates N+1).
  const loadWidgetData = useCallback(async (items: LayoutItem[]) => {
    if (items.length === 0) {
      setWidgetDataMap({});
      setWidgetErrorMap({});
      setWidgetsLoading(false);
      return;
    }
    setWidgetsLoading(true);
    try {
      const json = await apiPost<{
        success: boolean;
        data?: { results: Array<{
          key: string;
          ok: boolean;
          widget?: WidgetDeclaration;
          data?: { kind: string; count?: number; groups?: Array<{ key: string; count: number }>; records?: Array<Record<string, unknown>>; series?: Array<{ date: string; count: number }> };
          events?: Array<Record<string, unknown>>;
          sub?: { count: number; label: string } | null;
          error?: string;
        }> };
      }>(
        `/api/workspaces/${workspaceId}/widgets/batch`,
        {
          items: items.map((i) => ({
            moduleId: i.moduleId,
            widgetKey: i.widgetKey,
            instance: i.instance,
            zone: i.zone,
          })),
        }
      );
      if (json.success) {
        const dataMap: Record<string, WidgetDataResponse | null> = {};
        const errMap: Record<string, string | null> = {};
        for (const r of json.data!.results) {
          if (r.ok && r.widget) {
            dataMap[r.key] = r.events
              ? { widget: r.widget, data: { kind: "activity_feed", events: r.events as WidgetDataResponse["data"]["events"] } }
              : { widget: r.widget, data: r.data ?? { kind: "count" }, sub: r.sub ?? null };
          } else {
            dataMap[r.key] = null;
            errMap[r.key] = r.error ?? "Failed to load widget";
          }
        }
        setWidgetDataMap(dataMap);
        setWidgetErrorMap(errMap);
      }
    } catch {
      // ignore — widgets will keep showing skeleton via widgetsLoading
    } finally {
      setWidgetsLoading(false);
    }
  }, [workspaceId]);

  // Initial load: fetch layout + hasData in parallel; only clear the page-level
  // loading flag once BOTH resolve, so the empty-state never flashes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([loadLayout(), checkHasData()]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const interval = setInterval(() => {
      void loadLayout();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadLayout, checkHasData]);

  // When layout changes (initial load, 30s refresh, install, manual refresh),
  // batch-fetch all widget data.
  useEffect(() => {
    if (!hasPack || layout.length === 0) {
      setWidgetDataMap({});
      setWidgetErrorMap({});
      setWidgetsLoading(false);
      return;
    }
    void loadWidgetData(layout);
  }, [layout, hasPack, loadWidgetData]);

  const handleInstallPack = async () => {
    setInstalling(true); setError(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/packs/${CRM_LITE_PACK_ID}/install`,
        { includeDemoData: false }
      );
      if (!json.success) throw new Error(json.error?.message ?? t("dashboard.installFailed"));
      notifyWorkspaceNavigationChanged(); notifyWorkspaceDataChanged();
      await Promise.all([loadLayout(), refreshNavigation()]);
      await checkHasData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("dashboard.installFailed")); }
    finally { setInstalling(false); }
  };

  const handleSeedDemo = async () => {
    setSeeding(true); setError(null);
    try {
      // Re-install the pack with demo data enabled. installPack is idempotent:
      // already-installed modules are skipped, and demo records use `match`
      // fields so re-running will not create duplicates.
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/packs/${CRM_LITE_PACK_ID}/install`,
        { includeDemoData: true }
      );
      if (!json.success) throw new Error(json.error?.message ?? t("dashboard.loadDemoFailed"));
      notifyWorkspaceDataChanged();
      await checkHasData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("dashboard.loadDemoFailed")); }
    finally { setSeeding(false); }
  };

  if (loading || navigationLoading) return <DashboardSkeleton />;

  // ── Empty State: No Pack ──
  if (!hasPack) {
    const canManage = navigationData?.canManage ?? false;
    return (
      <div className="space-y-6">
        <header>
          <p className="app-eyebrow">Workbench</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("dashboard.title")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("dashboard.subtitle")}</p>
        </header>
        {error && <div role="alert" className="app-error">{error}</div>}
        <div className="app-card overflow-hidden bg-[linear-gradient(110deg,#fff_0%,#fff_58%,#f0f2ff_100%)] p-8 sm:p-12">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-indigo-100">
              <PackagePlus size={32} className="text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">
              {t(canManage ? "dashboard.emptyStartTitle" : "dashboard.emptyMemberTitle")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {t(canManage ? "dashboard.emptyStartBody" : "dashboard.emptyMemberBody")}
            </p>
            {canManage && (
              <button onClick={handleInstallPack} disabled={installing} className="app-button-primary mt-6">
                <PackagePlus size={18} />{installing ? t("dashboard.installing") : t("dashboard.installCrmLite")}
              </button>
            )}
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
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("dashboard.title")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("dashboard.subtitle")}</p>
        </header>
        {error && <div role="alert" className="app-error">{error}</div>}
        <div className="app-card p-8 sm:p-12">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-emerald-100">
              <Database size={32} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">{t("dashboard.readyTitle")}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {t("dashboard.readyBody")}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button onClick={handleSeedDemo} disabled={seeding} className="app-button-primary">
                <Database size={18} />{seeding ? t("dashboard.loadingDemo") : t("dashboard.loadDemoData")}
              </button>
              <Link href={`/w/${workspaceId}/companies/new`} className="app-button-secondary">
                <Plus size={18} />{t("dashboard.createManually")}
              </Link>
            </div>
          </div>
          <div className="mt-8 border-t border-slate-100 pt-6">
            <h3 className="text-sm font-bold text-slate-900">{t("onboarding.packInstalledTitle")}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("onboarding.packInstalledBody")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Link href={`/w/${workspaceId}/companies`} className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-200">
                <p className="text-sm font-semibold text-slate-800">{t("onboarding.stepExploreObjects")}</p>
                <p className="mt-1 text-xs text-slate-500">{t("onboarding.stepExploreObjectsDesc")}</p>
              </Link>
              <Link href={`/w/${workspaceId}/modules`} className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-200">
                <p className="text-sm font-semibold text-slate-800">{t("onboarding.stepGoToModules")}</p>
                <p className="mt-1 text-xs text-slate-500">{t("onboarding.stepGoToModulesDesc")}</p>
              </Link>
              <Link href={`/w/${workspaceId}/customize`} className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-200">
                <p className="text-sm font-semibold text-slate-800">{t("onboarding.stepSafeCustomize")}</p>
                <p className="mt-1 text-xs text-slate-500">{t("onboarding.stepSafeCustomizeDesc")}</p>
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
  const widgetKeyOf = (item: LayoutItem) => `${item.moduleId}:${item.widgetKey}:${item.instance}`;
  const toggleZone = (zone: DashboardZone) => {
    setExpandedZones((current) => {
      const next = new Set(current);
      if (next.has(zone)) next.delete(zone);
      else next.add(zone);
      return next;
    });
  };
  const visibleMetricsWidgets = expandedZones.has("metrics") ? metricsWidgets : metricsWidgets.slice(0, DASHBOARD_PREVIEW_LIMIT.metrics);
  const visibleTrendsWidgets = expandedZones.has("trends") ? trendsWidgets : trendsWidgets.slice(0, DASHBOARD_PREVIEW_LIMIT.trends);
  const visibleListsWidgets = expandedZones.has("lists") ? listsWidgets : listsWidgets.slice(0, DASHBOARD_PREVIEW_LIMIT.lists);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Workbench</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("dashboard.title")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <button onClick={() => setEditMode(false)} className="app-button-primary">
              <X size={16} />{t("dashboard.exitEdit")}
            </button>
          ) : (
            <>
              <button
                onClick={() => void loadLayout()}
                className="app-button-ghost"
                aria-label={t("workspace.refresh")}
                title={t("workspace.refresh")}
              >
                <RefreshCw size={16} />
              </button>
              <button onClick={() => setEditMode(true)} className="app-button-secondary">
                <Settings2 size={16} />{t("dashboard.editDashboard")}
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
          <p className="text-sm text-slate-500">{t("dashboard.noWidgets")}</p>
        </div>
      ) : (
        <>
          {/* Metrics Zone */}
          {metricsWidgets.length > 0 && (
            <section className="space-y-3" aria-labelledby="dashboard-metrics-heading">
              <DashboardZoneHeader
                id="dashboard-metrics-heading"
                title={t("dashboard.section.metrics")}
                count={metricsWidgets.length}
                expanded={expandedZones.has("metrics")}
                collapsible={metricsWidgets.length > DASHBOARD_PREVIEW_LIMIT.metrics}
                onToggle={() => toggleZone("metrics")}
                showMoreLabel={t("dashboard.showMore")}
                showLessLabel={t("dashboard.showLess")}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleMetricsWidgets.map((item) => (
                <WidgetRenderer
                  key={widgetKeyOf(item)}
                  workspaceId={workspaceId}
                  moduleId={item.moduleId}
                  widgetKey={item.widgetKey}
                  instance={item.instance}
                  zone={item.zone}
                  widget={item.widget}
                  editMode={editMode}
                  batchData={widgetDataMap[widgetKeyOf(item)] ?? null}
                  batchError={widgetErrorMap[widgetKeyOf(item)] ?? null}
                  batchLoading={widgetsLoading}
                  onRefreshAll={() => void loadWidgetData(layout)}
                />
              ))}
              </div>
            </section>
          )}

          {/* Trends Zone */}
          {trendsWidgets.length > 0 && (
            <section className="space-y-3" aria-labelledby="dashboard-trends-heading">
              <DashboardZoneHeader
                id="dashboard-trends-heading"
                title={t("dashboard.section.trends")}
                count={trendsWidgets.length}
                expanded={expandedZones.has("trends")}
                collapsible={trendsWidgets.length > DASHBOARD_PREVIEW_LIMIT.trends}
                onToggle={() => toggleZone("trends")}
                showMoreLabel={t("dashboard.showMore")}
                showLessLabel={t("dashboard.showLess")}
              />
              <div className="grid gap-4 lg:grid-cols-2">
              {visibleTrendsWidgets.map((item) => (
                <WidgetRenderer
                  key={widgetKeyOf(item)}
                  workspaceId={workspaceId}
                  moduleId={item.moduleId}
                  widgetKey={item.widgetKey}
                  instance={item.instance}
                  zone={item.zone}
                  widget={item.widget}
                  editMode={editMode}
                  batchData={widgetDataMap[widgetKeyOf(item)] ?? null}
                  batchError={widgetErrorMap[widgetKeyOf(item)] ?? null}
                  batchLoading={widgetsLoading}
                  onRefreshAll={() => void loadWidgetData(layout)}
                />
              ))}
              </div>
            </section>
          )}

          {/* Lists Zone */}
          {listsWidgets.length > 0 && (
            <section className="space-y-3" aria-labelledby="dashboard-lists-heading">
              <DashboardZoneHeader
                id="dashboard-lists-heading"
                title={t("dashboard.section.lists")}
                count={listsWidgets.length}
                expanded={expandedZones.has("lists")}
                collapsible={listsWidgets.length > DASHBOARD_PREVIEW_LIMIT.lists}
                onToggle={() => toggleZone("lists")}
                showMoreLabel={t("dashboard.showMore")}
                showLessLabel={t("dashboard.showLess")}
              />
              <div className="grid gap-4 lg:grid-cols-2">
              {visibleListsWidgets.map((item) => (
                <WidgetRenderer
                  key={widgetKeyOf(item)}
                  workspaceId={workspaceId}
                  moduleId={item.moduleId}
                  widgetKey={item.widgetKey}
                  instance={item.instance}
                  zone={item.zone}
                  widget={item.widget}
                  editMode={editMode}
                  batchData={widgetDataMap[widgetKeyOf(item)] ?? null}
                  batchError={widgetErrorMap[widgetKeyOf(item)] ?? null}
                  batchLoading={widgetsLoading}
                  onRefreshAll={() => void loadWidgetData(layout)}
                />
              ))}
              </div>
            </section>
          )}

          {/* Activity Zone */}
          {activityWidgets.length > 0 && (
            <section className="space-y-3" aria-labelledby="dashboard-activity-heading">
              <DashboardZoneHeader
                id="dashboard-activity-heading"
                title={t("dashboard.section.activity")}
                count={activityWidgets.length}
                expanded={false}
                collapsible={false}
                onToggle={() => undefined}
                showMoreLabel={t("dashboard.showMore")}
                showLessLabel={t("dashboard.showLess")}
              />
              {activityWidgets.map((item) => (
                <WidgetRenderer
                  key={widgetKeyOf(item)}
                  workspaceId={workspaceId}
                  moduleId={item.moduleId}
                  widgetKey={item.widgetKey}
                  instance={item.instance}
                  zone={item.zone}
                  widget={item.widget}
                  editMode={editMode}
                  batchData={widgetDataMap[widgetKeyOf(item)] ?? null}
                  batchError={widgetErrorMap[widgetKeyOf(item)] ?? null}
                  batchLoading={widgetsLoading}
                  onRefreshAll={() => void loadWidgetData(layout)}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DashboardZoneHeader({
  id,
  title,
  count,
  expanded,
  collapsible,
  onToggle,
  showMoreLabel,
  showLessLabel,
}: {
  id: string;
  title: string;
  count: number;
  expanded: boolean;
  collapsible: boolean;
  onToggle: () => void;
  showMoreLabel: string;
  showLessLabel: string;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-2">
        <h2 id={id} className="text-sm font-semibold text-slate-800">{title}</h2>
        <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{count}</span>
      </div>
      {collapsible ? (
        <button type="button" onClick={onToggle} className="app-button-ghost h-8 px-2.5 text-xs">
          {expanded ? showLessLabel : showMoreLabel}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      ) : null}
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
