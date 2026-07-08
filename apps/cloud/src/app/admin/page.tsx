"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
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

// ── Stat Cards Config ──

const STAT_CARDS: { key: keyof AdminStats; label: string; icon: LucideIcon }[] = [
  { key: "organizations", label: "组织总数", icon: Building2 },
  { key: "users", label: "用户总数", icon: Users },
  { key: "workspaces", label: "工作区总数", icon: FolderKanban },
  { key: "activeSessions", label: "活跃会话", icon: Monitor },
  { key: "installations", label: "模块安装", icon: Package },
  { key: "apiKeys", label: "API密钥", icon: KeyRound },
  { key: "workspaceMemberships", label: "工作区成员", icon: UserCheck },
  { key: "organizationMemberships", label: "组织成员", icon: ShieldCheck },
];

// ── Main Component ──

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    return <p className="text-sm text-slate-500">加载中...</p>;
  }

  return (
    <>
      {tab === "overview" && <OverviewTab stats={stats} />}
      {tab === "catalog" && <CatalogTab />}
    </>
  );
}

// ── Overview Tab ──

function OverviewTab({ stats }: { stats: AdminStats | null }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">平台概览</h1>
      <p className="mt-1 text-sm text-slate-600">查看平台全局统计数据。</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <Icon size={16} />
              <span className="text-sm">{label}</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-950">{stats ? stats[key] : "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Catalog Tab ──

function CatalogTab() {
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Catalog</h1>
          <p className="mt-1 text-sm text-slate-600">管理 Module、Pack、Template 制品。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSeed(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
            title="从 catalog/ 目录一键导入并发布全部制品到 stable 通道"
          >
            <Rocket size={16} /> 一键播种
          </button>
          <button onClick={() => setShowImport(true)} className="app-button-primary">
            <Plus size={16} /> 导入制品
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">加载中...</p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Package size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">Catalog 为空。点击"导入制品"从开发目录导入。</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">名称</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">类型</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">可见性</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">状态</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">创建时间</th>
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
  const [itemId, setItemId] = useState("");
  const [itemType, setItemType] = useState<"module" | "pack" | "template">("module");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <h2 className="text-lg font-bold text-slate-950">从开发目录导入</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <p className="mt-1 text-sm text-slate-500">从 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">catalog/</code> 目录导入制品作为 Draft candidate。</p>

        {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">制品 ID</label>
            <input
              className="app-input"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="runory.customer"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">类型</label>
            <select className="app-input" value={itemType} onChange={(e) => setItemType(e.target.value as "module" | "pack" | "template")}>
              <option value="module">Module</option>
              <option value="pack">Pack</option>
              <option value="template">Template</option>
            </select>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">可用制品：</p>
            <p className="mt-1">Module: <code>runory.customer</code>, <code>runory.contact</code></p>
            <p>Pack: <code>crm-lite-pack</code></p>
            <p>Template: <code>small-business-crm</code></p>
          </div>
        </div>

        <button onClick={handleImport} disabled={loading} className="app-button-primary mt-5 w-full">
          {loading ? "导入中..." : "导入"}
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
          <h2 className="text-lg font-bold text-slate-950">一键播种 Catalog</h2>
          <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-700 disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        {!result && !error && (
          <>
            <p className="mt-2 text-sm text-slate-600">
              从 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">catalog/</code> 目录读取所有 manifest，
              一次性完成 <b>导入 → 冻结 → 发布到 stable</b> 通道，使全部 Module / Pack / Template 出现在工作区的模块中心。
            </p>
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              此操作幂等，已导入的制品会被跳过。适用于新环境初始化或线上 catalog 为空时修复。
            </div>
            <button onClick={handleSeed} disabled={loading} className="app-button-primary mt-5 w-full">
              {loading ? (<><Loader2 size={16} className="mr-1.5 inline animate-spin" />播种中...</>) : (<><Rocket size={16} className="mr-1.5 inline" />开始播种</>)}
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
                {hasErrors ? "播种完成，但部分制品出错。" : "播种成功完成。"}
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
