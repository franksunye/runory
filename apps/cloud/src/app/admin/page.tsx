"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  FolderKanban,
  KeyRound,
  Monitor,
  Package,
  ShieldCheck,
  UserCheck,
  Users,
  type LucideIcon,
  ChevronRight,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Snowflake,
  ArrowUpCircle,
  Ban,
  Loader2,
  X,
} from "lucide-react";

// ── Types ──

interface AdminStats {
  organizations: number;
  users: number;
  workspaces: number;
  activeSessions: number;
  installations: number;
  apiKeys: number;
  workspaceMemberships: number;
  organizationMemberships: number;
}

interface CatalogItem {
  id: string;
  itemType: "module" | "pack" | "template";
  name: string;
  description: string | null;
  publisherId: string;
  visibility: "internal" | "public";
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

interface CatalogVersion {
  id: string;
  catalogItemId: string;
  version: string;
  lifecycleStatus: "draft" | "validating" | "rejected" | "ready" | "deprecated" | "withdrawn";
  manifestJson: string;
  manifestSchemaVersion: string;
  artifactUri: string | null;
  artifactChecksum: string | null;
  sourceRepository: string | null;
  sourceCommit: string | null;
  buildId: string | null;
  createdBy: string;
  frozenAt: string | null;
  createdAt: string;
}

interface CatalogRelease {
  id: string;
  catalogVersionId: string;
  channel: "internal" | "beta" | "stable";
  status: "active" | "superseded" | "paused" | "withdrawn";
  releaseNotes: string | null;
  approvedBy: string | null;
  releasedAt: string;
  createdAt: string;
}

type Tab = "overview" | "catalog" | "releases";

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

// ── Lifecycle Status Badges ──

const LIFECYCLE_BADGE: Record<CatalogVersion["lifecycleStatus"], { label: string; color: string; icon: LucideIcon }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-600", icon: Clock },
  validating: { label: "Validating", color: "bg-blue-100 text-blue-700", icon: Loader2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700", icon: XCircle },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  deprecated: { label: "Deprecated", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  withdrawn: { label: "Withdrawn", color: "bg-red-100 text-red-700", icon: Ban },
};

const RELEASE_BADGE: Record<CatalogRelease["channel"], { label: string; color: string }> = {
  internal: { label: "Internal", color: "bg-slate-100 text-slate-700" },
  beta: { label: "Beta", color: "bg-purple-100 text-purple-700" },
  stable: { label: "Stable", color: "bg-emerald-100 text-emerald-700" },
};

const ITEM_TYPE_BADGE: Record<CatalogItem["itemType"], { label: string; color: string }> = {
  module: { label: "Module", color: "bg-indigo-100 text-indigo-700" },
  pack: { label: "Pack", color: "bg-violet-100 text-violet-700" },
  template: { label: "Template", color: "bg-teal-100 text-teal-700" },
};

// ── Confirm Dialog Config ──

const CONFIRM_CONFIG: Record<
  "withdraw" | "deprecate" | "reject" | "promote",
  { title: string; description: string; confirmLabel: string; variant: "danger" | "warning" | "success" }
> = {
  withdraw: {
    title: "确认下架",
    description: "此操作不可撤销。下架后，所有已安装该版本的工作区将无法再获取该版本，且相关 Release 将被标记为 withdrawn。请输入下架原因（如安全问题、严重缺陷等）。",
    confirmLabel: "确认下架",
    variant: "danger",
  },
  deprecate: {
    title: "确认弃用",
    description: "弃用后，该版本将不再推荐安装，但已安装的工作区可继续使用。将通知所有已安装的工作区该版本已弃用。请输入弃用原因。",
    confirmLabel: "确认弃用",
    variant: "warning",
  },
  reject: {
    title: "确认拒绝",
    description: "此操作不可撤销。拒绝后，该版本将进入 Rejected 状态，需要重新创建版本才能再次提交。请输入拒绝原因以便记录。",
    confirmLabel: "确认拒绝",
    variant: "danger",
  },
  promote: {
    title: "确认发布",
    description: "发布后，该版本将通过所选通道对所有符合条件的工作区可见，并通知已订阅的工作区。请输入发布说明/原因。",
    confirmLabel: "确认发布",
    variant: "success",
  },
};

// ── Main Component ──

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/stats", { cache: "no-store" });
        if (res.status === 403) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("加载统计数据失败");
          return;
        }
        const json = await res.json();
        if (!cancelled) setStats(json.data ?? null);
      } catch {
        if (!cancelled) setError("加载统计数据失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fc]">
        <p className="text-sm text-slate-500">加载中...</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[#f7f8fc]">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-slate-950 font-bold text-white">R</div>
            <span className="text-base font-bold tracking-tight">Runory</span>
            <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">Platform Console</span>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={15} /> 返回工作区
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Tabs */}
        <div className="mb-6 flex gap-1 border-b border-slate-200">
          {([
            { key: "overview" as Tab, label: "概览" },
            { key: "catalog" as Tab, label: "Catalog" },
            { key: "releases" as Tab, label: "Releases" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                tab === key
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {tab === "overview" && <OverviewTab stats={stats} />}
        {tab === "catalog" && <CatalogTab />}
        {tab === "releases" && <ReleasesTab />}
      </div>
    </main>
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
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/catalog", { cache: "no-store" });
      const json = await res.json();
      if (json.success) setItems(json.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selectedItem) {
    return <ItemDetail item={selectedItem} onBack={() => setSelectedItem(null)} onChanged={load} />;
  }

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
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
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
                      <button onClick={() => setSelectedItem(item)} className="text-slate-400 hover:text-slate-700">
                        <ChevronRight size={18} />
                      </button>
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

// ── Item Detail (versions + actions) ──

function ItemDetail({ item, onBack, onChanged }: { item: CatalogItem; onBack: () => void; onChanged: () => void }) {
  const [versions, setVersions] = useState<CatalogVersion[]>([]);
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "withdraw" | "deprecate" | "reject" | "promote";
    versionId: string;
    channel?: "internal" | "beta" | "stable";
  } | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, rRes] = await Promise.all([
        fetch(`/api/platform/catalog/${item.id}/versions`, { cache: "no-store" }),
        fetch(`/api/platform/releases?catalogVersionId=all`, { cache: "no-store" }),
      ]);
      const vJson = await vRes.json();
      const rJson = await rRes.json();
      if (vJson.success) setVersions(vJson.data ?? []);
      if (rJson.success) setReleases(rJson.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (versionId: string, action: string, body?: Record<string, unknown>) => {
    setActionLoading(`${versionId}:${action}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/platform/catalog/versions/${versionId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json();
      if (!json.success) {
        setActionError(json.error?.message ?? `${action} 失败`);
      } else {
        await load();
        onChanged();
      }
    } catch {
      setActionError(`${action} 失败`);
    } finally {
      setActionLoading(null);
    }
  };

  const openConfirm = (
    type: "withdraw" | "deprecate" | "reject" | "promote",
    versionId: string,
    channel?: "internal" | "beta" | "stable"
  ) => {
    setConfirmAction({ type, versionId, channel });
    setConfirmReason("");
    setActionError(null);
  };

  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirmAction(null);
    setConfirmReason("");
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    if (confirmReason.trim().length < 10) return;
    const { type, versionId, channel } = confirmAction;
    setConfirmBusy(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { reason: confirmReason.trim() };
      if (type === "promote" && channel) {
        body.channel = channel;
      }
      const res = await fetch(`/api/platform/catalog/versions/${versionId}/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        setActionError(json.error?.message ?? `${type} 失败`);
      } else {
        setConfirmAction(null);
        setConfirmReason("");
        await load();
        onChanged();
      }
    } catch {
      setActionError(`${type} 失败`);
    } finally {
      setConfirmBusy(false);
    }
  };

  const getReleasesForVersion = (versionId: string) => releases.filter((r) => r.catalogVersionId === versionId);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> 返回 Catalog
      </button>

      <div className="mt-4 flex items-center gap-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ITEM_TYPE_BADGE[item.itemType].color}`}>
          {ITEM_TYPE_BADGE[item.itemType].label}
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{item.name}</h1>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {item.description ?? "无描述"} · 可见性: {item.visibility} · 创建于 {new Date(item.createdAt).toLocaleString("zh-CN")}
      </p>

      {actionError && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      <h2 className="mt-8 text-lg font-bold text-slate-950">版本</h2>

      {loading ? (
        <p className="mt-2 text-sm text-slate-500">加载中...</p>
      ) : versions.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">暂无版本。</p>
      ) : (
        <div className="mt-3 space-y-3">
          {versions.map((version) => {
            const badge = LIFECYCLE_BADGE[version.lifecycleStatus];
            const versionReleases = getReleasesForVersion(version.id);
            const isExpanded = expandedVersion === version.id;
            const manifest = (() => { try { return JSON.parse(version.manifestJson) as Record<string, unknown>; } catch { return null; } })();
            return (
              <div key={version.id} className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-slate-900">v{version.version}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.color}`}>
                      <badge.icon size={12} /> {badge.label}
                    </span>
                    {version.frozenAt && (
                      <span className="text-xs text-slate-400">冻结于 {new Date(version.frozenAt).toLocaleString("zh-CN")}</span>
                    )}
                  </div>
                  <button onClick={() => setExpandedVersion(isExpanded ? null : version.id)} className="text-slate-400 hover:text-slate-700">
                    <ChevronRight size={18} className={`transition ${isExpanded ? "rotate-90" : ""}`} />
                  </button>
                </div>

                {/* Release badges for this version */}
                {versionReleases.length > 0 && (
                  <div className="flex gap-2 px-4 pb-2">
                    {versionReleases.map((rel) => (
                      <span key={rel.id} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RELEASE_BADGE[rel.channel].color}`}>
                        {RELEASE_BADGE[rel.channel].label} · {rel.status}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-4">
                    {/* Manifest summary */}
                    {manifest && (
                      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-slate-500">Schema 版本:</span>{" "}
                          <span className="font-medium text-slate-700">{version.manifestSchemaVersion}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Core 兼容:</span>{" "}
                          <span className="font-medium text-slate-700">{String(manifest.coreCompatibility ?? "—")}</span>
                        </div>
                        {manifest.publisher ? (
                          <div>
                            <span className="text-slate-500">发布者:</span>{" "}
                            <span className="font-medium text-slate-700">{String(manifest.publisher)}</span>
                          </div>
                        ) : null}
                        {manifest.dependencies && Array.isArray(manifest.dependencies) ? (
                          <div>
                            <span className="text-slate-500">依赖:</span>{" "}
                            <span className="font-medium text-slate-700">{(manifest.dependencies as string[]).join(", ")}</span>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Checksum */}
                    {version.artifactChecksum && (
                      <div className="mb-4 rounded-lg bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-500">Artifact Checksum (SHA-256)</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-600">{version.artifactChecksum}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {version.lifecycleStatus === "draft" && (
                        <>
                          <ActionButton
                            label="验证"
                            icon={ShieldCheck}
                            loading={actionLoading === `${version.id}:validate`}
                            onClick={() => doAction(version.id, "validate")}
                          />
                          <ActionButton
                            label="冻结"
                            icon={Snowflake}
                            loading={actionLoading === `${version.id}:freeze`}
                            onClick={() => doAction(version.id, "freeze")}
                          />
                          <ActionButton
                            label="拒绝"
                            icon={XCircle}
                            variant="danger"
                            loading={actionLoading === `${version.id}:reject`}
                            onClick={() => openConfirm("reject", version.id)}
                          />
                        </>
                      )}
                      {version.lifecycleStatus === "ready" && (
                        <>
                          <ActionButton
                            label="发布 Internal"
                            icon={ArrowUpCircle}
                            loading={actionLoading === `${version.id}:promote:internal`}
                            onClick={() => openConfirm("promote", version.id, "internal")}
                          />
                          <ActionButton
                            label="发布 Beta"
                            icon={ArrowUpCircle}
                            loading={actionLoading === `${version.id}:promote:beta`}
                            onClick={() => openConfirm("promote", version.id, "beta")}
                          />
                          <ActionButton
                            label="发布 Stable"
                            icon={ArrowUpCircle}
                            variant="success"
                            loading={actionLoading === `${version.id}:promote:stable`}
                            onClick={() => openConfirm("promote", version.id, "stable")}
                          />
                          <ActionButton
                            label="废弃"
                            icon={AlertTriangle}
                            variant="warning"
                            loading={actionLoading === `${version.id}:deprecate`}
                            onClick={() => openConfirm("deprecate", version.id)}
                          />
                          <ActionButton
                            label="撤回"
                            icon={Ban}
                            variant="danger"
                            loading={actionLoading === `${version.id}:withdraw`}
                            onClick={() => openConfirm("withdraw", version.id)}
                          />
                          {item.itemType === "pack" && (
                            <ActionButton
                              label="解析 Pack Lock"
                              icon={Package}
                              loading={actionLoading === `${version.id}:lock`}
                              onClick={() => doAction(version.id, "lock")}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          type={confirmAction.type}
          channel={confirmAction.channel}
          reason={confirmReason}
          onReasonChange={setConfirmReason}
          busy={confirmBusy}
          onCancel={closeConfirm}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

// ── Action Button ──

function ActionButton({
  label,
  icon: Icon,
  onClick,
  loading,
  variant = "default",
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  loading: boolean;
  variant?: "default" | "success" | "danger" | "warning";
}) {
  const colors = {
    default: "border-slate-300 text-slate-700 hover:bg-slate-50",
    success: "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
    danger: "border-red-300 text-red-700 hover:bg-red-50",
    warning: "border-amber-300 text-amber-700 hover:bg-amber-50",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${colors[variant]}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {label}
    </button>
  );
}

// ── Confirm Dialog ──

function ConfirmDialog({
  type,
  channel,
  reason,
  onReasonChange,
  busy,
  onCancel,
  onConfirm,
}: {
  type: "withdraw" | "deprecate" | "reject" | "promote";
  channel?: "internal" | "beta" | "stable";
  reason: string;
  onReasonChange: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const config = CONFIRM_CONFIG[type];
  const reasonValid = reason.trim().length >= 10;
  const channelLabel = channel ? RELEASE_BADGE[channel].label : null;

  const confirmColors = {
    danger: "bg-red-600 hover:bg-red-700 disabled:bg-red-300",
    warning: "bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300",
    success: "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">
            {config.title}
            {channelLabel && (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {channelLabel}
              </span>
            )}
          </h2>
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600">{config.description}</p>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            操作原因 <span className="font-normal text-slate-400">（至少 10 个字符）</span>
          </label>
          <textarea
            className="app-input min-h-[96px] resize-y"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="请详细描述执行此操作的原因，将记录在审计日志中..."
            disabled={busy}
            autoFocus
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className={reasonValid ? "text-emerald-600" : "text-slate-400"}>
              {reasonValid ? "✓ 已满足最小长度" : `还需 ${Math.max(0, 10 - reason.trim().length)} 个字符`}
            </span>
            <span className="text-slate-400">{reason.trim().length} / 500</span>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!reasonValid || busy}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed ${confirmColors[config.variant]}`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "执行中..." : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Releases Tab ──

function ReleasesTab() {
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "internal" | "beta" | "stable">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/releases", { cache: "no-store" });
      const json = await res.json();
      if (json.success) setReleases(json.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? releases : releases.filter((r) => r.channel === filter);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">Releases</h1>
      <p className="mt-1 text-sm text-slate-600">查看所有发布记录及其通道状态。</p>

      <div className="mt-4 flex gap-2">
        {(["all", "internal", "beta", "stable"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f ? "bg-slate-950 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "全部" : RELEASE_BADGE[f].label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">加载中...</p>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <ArrowUpCircle size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">暂无发布记录。</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">通道</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">状态</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">版本 ID</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">发布时间</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">批准人</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((release) => (
                <tr key={release.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RELEASE_BADGE[release.channel].color}`}>
                      {RELEASE_BADGE[release.channel].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      release.status === "active" ? "bg-emerald-100 text-emerald-700" :
                      release.status === "superseded" ? "bg-slate-100 text-slate-500" :
                      release.status === "paused" ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {release.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{release.catalogVersionId}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(release.releasedAt).toLocaleString("zh-CN")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{release.approvedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
