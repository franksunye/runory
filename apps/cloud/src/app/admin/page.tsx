"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Activity,
  Building2,
  CheckCircle2,
  Database,
  FileCode,
  FolderKanban,
  KeyRound,
  Loader2,
  Monitor,
  Package,
  Plus,
  Rocket,
  ShieldCheck,
  UserCheck,
  Users,
  ChevronRight,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type AdminStats,
  type CatalogItem,
  ITEM_TYPE_BADGE,
} from "./_components/shared";
import { apiFetch, apiPost } from "@/lib/api-fetch";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

// ── Stat Cards Config ──

type NumericStatKey =
  | "organizations"
  | "users"
  | "workspaces"
  | "activeSessions"
  | "installations"
  | "apiKeys"
  | "workspaceMemberships"
  | "organizationMemberships";

const STAT_CARDS: { key: NumericStatKey; label: MessageKey; icon: LucideIcon }[] = [
  { key: "organizations", label: "admin.overview.organizations", icon: Building2 },
  { key: "users", label: "admin.overview.users", icon: Users },
  { key: "workspaces", label: "admin.overview.workspaces", icon: FolderKanban },
  { key: "activeSessions", label: "admin.overview.activeSessions", icon: Monitor },
  { key: "installations", label: "admin.overview.installations", icon: Package },
  { key: "apiKeys", label: "admin.overview.apiKeys", icon: KeyRound },
  { key: "workspaceMemberships", label: "admin.overview.workspaceMemberships", icon: UserCheck },
  { key: "organizationMemberships", label: "admin.overview.organizationMemberships", icon: ShieldCheck },
];

// ── Main Component ──

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const tab = searchParams.get("tab") === "catalog" ? "catalog" : "overview";
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await apiFetch<{ data?: AdminStats }>("/api/admin/stats", { cache: "no-store" });
        if (!cancelled) setStats(json.data ?? null);
      } catch (e) {
        if (e instanceof Error && e.message.includes("403")) {
          router.replace("/login");
          return;
        }
        // ignore other errors
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (statsLoading && tab === "overview") {
    return <p className="text-sm text-slate-500">{t("admin.overview.loading")}</p>;
  }

  return (
    <>
      {tab === "overview" && <OverviewTab stats={stats} />}
      {tab === "catalog" && <CatalogTab />}
    </>
  );
}

// ── Insight Cards Config ──

const INSIGHT_CARDS: {
  key: "activeWorkspaces" | "demoDataLoaded" | "auditEvents24h";
  label: MessageKey;
  icon: LucideIcon;
}[] = [
  { key: "activeWorkspaces", label: "admin.overview.activeWorkspaces", icon: CheckCircle2 },
  { key: "demoDataLoaded", label: "admin.overview.demoDataLoaded", icon: Database },
  { key: "auditEvents24h", label: "admin.overview.auditEvents24h", icon: Activity },
];

// ── Overview Tab ──

function OverviewTab({ stats }: { stats: AdminStats | null }) {
  const { t } = useI18n();
  const packDist = stats?.packDistribution ?? [];
  const maxPackCount = packDist.length > 0 ? Math.max(...packDist.map((p) => p.count)) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">{t("admin.overview.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("admin.overview.description")}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <Icon size={16} />
              <span className="text-sm">{t(label)}</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-950">{stats ? stats[key] : "—"}</p>
          </div>
        ))}
      </div>

      {/* Platform Insights */}
      <h2 className="mt-10 text-lg font-bold tracking-tight text-slate-950">{t("admin.overview.insights")}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {INSIGHT_CARDS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <Icon size={16} />
              <span className="text-sm">{t(label)}</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-950">{stats ? stats[key] : "—"}</p>
          </div>
        ))}
        {/* Latest Migration — string value, truncate if long */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <FileCode size={16} />
            <span className="text-sm">{t("admin.overview.latestMigration")}</span>
          </div>
          <p className="mt-3 truncate text-sm font-bold text-slate-950" title={stats?.latestMigration ?? undefined}>
            {stats ? (stats.latestMigration ?? "—") : "—"}
          </p>
        </div>
      </div>

      {/* Pack Distribution */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-700">
          <Package size={16} />
          <span className="text-sm font-semibold">{t("admin.overview.packDistribution")}</span>
        </div>
        {packDist.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">—</p>
        ) : (
          <div className="mt-4 space-y-3">
            {packDist.map((p) => (
              <div key={p.packId} className="flex items-center gap-3">
                <span className="w-48 shrink-0 truncate font-mono text-xs text-slate-600" title={p.packId}>
                  {p.packId}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="flex h-full items-center justify-end rounded-full bg-violet-400 pr-2"
                    style={{ width: `${maxPackCount > 0 ? (p.count / maxPackCount) * 100 : 0}%`, minWidth: "2rem" }}
                  >
                    <span className="text-[10px] font-bold text-white">{p.count}</span>
                  </div>
                </div>
                <span className="w-20 shrink-0 text-xs text-slate-400">{p.count} {t("admin.overview.installs")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Catalog Tab ──

function CatalogTab() {
  const { t } = useI18n();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showSeed, setShowSeed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiFetch<{ success: boolean; data?: CatalogItem[] }>("/api/platform/catalog", { cache: "no-store" });
      if (json.success) setItems(json.data ?? []);
    } catch (e) {
      if (e instanceof Error && e.message.includes("403")) {
        window.location.href = "/login";
        return;
      }
      // ignore other errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">{t("admin.catalog.title")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("admin.catalog.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSeed(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
            title="从 catalog/ 目录一键导入并发布全部制品到 stable 通道"
          >
            <Rocket size={16} /> {t("admin.catalog.seed")}
          </button>
          <button onClick={() => setShowImport(true)} className="app-button-primary">
            <Plus size={16} /> {t("admin.catalog.import")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">{t("admin.overview.loading")}</p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Package size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">{t("admin.catalog.empty")}</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.catalog.name")}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.catalog.type")}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.catalog.visibility")}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.catalog.status")}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.catalog.createdAt")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const typeBadge = ITEM_TYPE_BADGE[item.itemType];
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link href={`/admin/catalog/${item.id}`} className="hover:text-slate-950 hover:underline">
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeBadge.color}`}>{typeBadge.label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.visibility}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/catalog/${item.id}`} className="text-slate-400 hover:text-slate-700">
                        <ChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load(); }} />}
      {showSeed && <SeedAllModal onClose={() => setShowSeed(false)} onSeeded={() => { setShowSeed(false); load(); }} />}
    </div>
  );
}

// ── Import Modal ──

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { t } = useI18n();
  const [itemId, setItemId] = useState("");
  const [itemType, setItemType] = useState<"module" | "pack" | "template">("module");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      try {
        const json = await apiFetch<{ success: boolean; data?: CatalogItem[] }>("/api/platform/catalog", { cache: "no-store" });
        if (!cancelled && json.success) setCatalogItems(json.data ?? []);
      } catch {
        // ignore — available items are an optional hint
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleImport = async () => {
    if (!itemId.trim()) return setError("请输入制品 ID");
    setLoading(true);
    setError(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message?: string } }>("/api/platform/catalog", { itemId: itemId.trim(), itemType });
      if (json.success) {
        onImported();
      } else {
        setError(json.error?.message ?? "导入失败");
      }
    } catch {
      setError("导入失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">{t("admin.catalog.importTitle")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <p className="mt-1 text-sm text-slate-500">{t("admin.catalog.importDescription")}</p>

        {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t("admin.catalog.itemId")}</label>
            <input
              className="app-input"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="runory.customer"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t("admin.catalog.itemType")}</label>
            <select className="app-input" value={itemType} onChange={(e) => setItemType(e.target.value as "module" | "pack" | "template")}>
              <option value="module">Module</option>
              <option value="pack">Pack</option>
              <option value="template">Template</option>
            </select>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">{t("admin.catalog.available")}：</p>
            {catalogLoading ? (
              <p className="mt-1 text-slate-400">加载中...</p>
            ) : catalogItems.length === 0 ? (
              <p className="mt-1 text-slate-400">—</p>
            ) : (
              <div className="mt-2 space-y-2">
                {(["module", "pack", "template"] as const).map((type) => {
                  const grouped = catalogItems.filter((i) => i.itemType === type);
                  if (grouped.length === 0) return null;
                  const badge = ITEM_TYPE_BADGE[type];
                  return (
                    <div key={type} className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.color}`}>{badge.label}</span>
                      {grouped.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => { setItemId(item.id); setItemType(type); }}
                          className={`rounded-full border px-2 py-0.5 font-mono text-[11px] transition hover:bg-slate-200 ${
                            itemId === item.id && itemType === type
                              ? "border-slate-900 bg-slate-200 text-slate-900"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {item.id}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <button onClick={handleImport} disabled={loading} className="app-button-primary mt-5 w-full">
          {loading ? t("admin.catalog.importing") : t("admin.catalog.importBtn")}
        </button>
      </div>
    </div>
  );
}

// ── Seed All Modal ──

interface SeedResult {
  imported: Array<{ itemId: string; itemType: string; versionId: string }>;
  published: Array<{ itemId: string; itemType: string; channel: string }>;
  skipped: Array<{ itemId: string; itemType: string; reason: string }>;
  errors: Array<{ itemId: string; itemType: string; error: string }>;
}

function SeedAllModal({ onClose, onSeeded }: { onClose: () => void; onSeeded: () => void }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSeed = async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiPost<{ success: boolean; data?: SeedResult; error?: { message?: string } }>("/api/platform/catalog/seed");
      if (json.success) {
        setResult(json.data ?? null);
      } else {
        setError(json.error?.message ?? "播种失败");
      }
    } catch {
      setError("播种失败");
    } finally {
      setLoading(false);
    }
  };

  const hasErrors = (result?.errors?.length ?? 0) > 0;
  const hasPublished = (result?.published?.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">{t("admin.catalog.seedTitle")}</h2>
          <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-700 disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        {!result && !error && (
          <>
            <p className="mt-2 text-sm text-slate-600">
              {t("admin.catalog.seedDescription")}
            </p>
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {t("admin.catalog.seedWarning")}
            </div>
            <button onClick={handleSeed} disabled={loading} className="app-button-primary mt-5 w-full">
              {loading ? (<><Loader2 size={16} className="mr-1.5 inline animate-spin" />{t("admin.catalog.seeding")}</>) : (<><Rocket size={16} className="mr-1.5 inline" />{t("admin.catalog.seedStart")}</>)}
            </button>
          </>
        )}

        {loading && !result && (
          <p className="mt-4 text-sm text-slate-500">正在导入并发布制品，请稍候...</p>
        )}

        {error && (
          <div className="mt-4">
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            <button onClick={handleSeed} disabled={loading} className="app-button-primary mt-4 w-full">重试</button>
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${hasErrors ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
              {hasErrors ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
              <div>
                {hasErrors ? t("admin.catalog.seedPartial") : t("admin.catalog.seedSuccess")}
                {hasPublished && ` 已发布 ${result.published.length} 条 release 记录。`}
                <div className="mt-1 text-xs">
                  导入 {result.imported.length} · 发布 {result.published.length} · 跳过 {result.skipped.length} · 错误 {result.errors.length}
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50/50 p-3">
                <p className="mb-2 text-xs font-semibold text-red-700">出错制品：</p>
                <ul className="space-y-1 text-xs text-red-700">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      <code className="font-semibold">{e.itemId}</code> ({e.itemType}): {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.skipped.length > 0 && (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer font-semibold text-slate-600">已跳过制品（{result.skipped.length}）</summary>
                <ul className="mt-1 space-y-0.5">
                  {result.skipped.map((s, i) => (
                    <li key={i}><code>{s.itemId}</code> ({s.itemType}) — {s.reason}</li>
                  ))}
                </ul>
              </details>
            )}

            <button onClick={onSeeded} className="app-button-primary w-full">完成</button>
          </div>
        )}
      </div>
    </div>
  );
}
