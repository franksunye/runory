"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Calendar,
  ChevronRight,
  Circle,
  ClipboardList,
  FileText,
  Home,
  LayoutGrid,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch } from "@/lib/api-fetch";

export const dynamic = "force-dynamic";

type IconType = typeof Home;

interface MobileCapability {
  key: string;
  label: string;
  route: string;
  icon?: string;
  order?: number;
}

interface InstalledPack {
  packId: string;
  name: string;
  installed: boolean;
  marketplace?: { category: string; license: string; publisher: string } | null;
  mobileNavigation?: MobileCapability[];
}

const ICONS: Record<string, IconType> = {
  building: Building2,
  calendar: Calendar,
  "clipboard-list": ClipboardList,
  "file-text": FileText,
  home: Home,
  "layout-grid": LayoutGrid,
};

function categoryLabel(pack: InstalledPack): string {
  const category = pack.marketplace?.category ?? "apps";
  switch (category) {
    case "crm":
      return "CRM";
    case "sales_quote":
      return "Sales";
    case "field_service":
      return "Field Service";
    default:
      return pack.name;
  }
}

function categoryRank(pack: InstalledPack): number {
  const category = pack.marketplace?.category ?? "apps";
  switch (category) {
    case "crm":
      return 10;
    case "sales_quote":
      return 20;
    case "field_service":
      return 30;
    default:
      return 100;
  }
}

function normalizeRoute(workspaceId: string, route: string): string {
  const normalized = route === "/" ? "" : route.startsWith("/") ? route : `/${route}`;
  return `/m/w/${workspaceId}${normalized}`;
}

export default function MobileExplorePageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileExplorePage />
    </Suspense>
  );
}

function MobileExplorePage() {
  const workspaceId = useParams().workspaceId as string;
  const { t } = useI18n();

  const [packs, setPacks] = useState<InstalledPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const json = await apiFetch<{
          success: boolean;
          error?: { message: string };
          data?: InstalledPack[];
        }>(`/api/workspaces/${workspaceId}/packs`, { cache: "no-store" });
        if (!json.success) throw new Error(json.error?.message ?? t("mobile.errorOccurred"));
        setPacks((json.data ?? []).filter((pack) => pack.installed));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("mobile.errorOccurred"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const dedupedByGroup = new Map<string, Map<string, MobileCapability & { href: string; packName: string }>>();
    const seenKeys = new Set<string>();

    for (const pack of [...packs].sort((a, b) => categoryRank(a) - categoryRank(b))) {
      const group = categoryLabel(pack);
      const groupMap = dedupedByGroup.get(group) ?? new Map();
      for (const capability of pack.mobileNavigation ?? []) {
        if (capability.key === "today") continue;
        if (!capability.key || !capability.route) continue;
        if (seenKeys.has(capability.key)) continue;
        seenKeys.add(capability.key);
        const existing = groupMap.get(capability.key);
        if (!existing || (capability.order ?? 100) < (existing.order ?? 100)) {
          groupMap.set(capability.key, {
            ...capability,
            href: normalizeRoute(workspaceId, capability.route),
            packName: pack.name,
          });
        }
      }
      if (groupMap.size > 0) dedupedByGroup.set(group, groupMap);
    }

    return [...dedupedByGroup.entries()].map(([group, items]) => ({
      group,
      items: [...items.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    }));
  }, [packs, workspaceId]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Explore</h1>
            <p className="mt-0.5 text-xs text-slate-400">Mobile apps from installed packs</p>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
            aria-label={t("workspace.refresh")}
          >
            {refreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-slate-400" />
            <p className="mt-3 text-xs text-slate-400">{t("mobile.loading")}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <AlertTriangle size={28} className="text-red-400" />
            <p className="text-center text-sm text-red-600">{error}</p>
            <button
              onClick={() => void load()}
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.retry")}
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <LayoutGrid size={32} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No mobile apps yet</p>
            <p className="mt-1 text-center text-xs text-slate-400">
              Install packs that expose mobile capabilities.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.group}>
                <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                  {group.group}
                </h2>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const Icon = ICONS[item.icon ?? ""] ?? Circle;
                    return (
                      <Link
                        key={`${group.group}:${item.key}`}
                        href={item.href}
                        className="flex min-h-[56px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm active:scale-[0.98]"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">{item.label}</p>
                          <p className="truncate text-xs text-slate-400">{item.packName}</p>
                        </div>
                        <ChevronRight size={16} className="shrink-0 text-slate-300" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
