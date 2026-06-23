"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  FolderKanban,
  KeyRound,
  Monitor,
  Package,
  Plus,
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
        const res = await fetch("/api/admin/stats", { cache: "no-store" });
        if (res.status === 403) {
          router.replace("/login");
          return;
        }
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setStats(json.data ?? null);
        }
      } catch {
        // ignore
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/catalog", { cache: "no-store" });
      if (res.status === 403) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (json.success) setItems(json.data ?? []);
    } catch {
      // ignore
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
        <button onClick={() => setShowImport(true)} className="app-button-primary">
          <Plus size={16} /> 导入制品
        </button>
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
      const res = await fetch("/api/platform/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ itemId: itemId.trim(), itemType }),
      });
      const json = await res.json();
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
