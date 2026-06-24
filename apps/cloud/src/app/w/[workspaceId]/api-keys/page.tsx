"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Copy,
  Key,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: "active" | "revoked" | "expired";
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ApiKeyWithToken extends ApiKey {
  token: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

export default function ApiKeysPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const { t } = useI18n();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Create form
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);

  // Newly created/rotated key (shown once)
  const [revealedKey, setRevealedKey] = useState<ApiKeyWithToken | null>(null);
  const [copied, setCopied] = useState(false);

  // Action tracking
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);

  // Confirmation modals
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKey | null>(null);
  const [confirmRotate, setConfirmRotate] = useState<ApiKey | null>(null);

  const loadKeys = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`);
      const json = await res.json();
      if (json.success) setKeys(json.data);
      else setError(json.error?.message ?? t("workspace.loadFailed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: ["workspace:read"] }),
      });
      const json = await res.json();
      if (json.success) {
        setRevealedKey(json.data);
        setNewKeyName("");
        setMessage("API 密钥已创建，请立即保存下方显示的完整密钥");
        await loadKeys();
      } else {
        setError(json.error?.message ?? "创建失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevokingId(keyId);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys/${keyId}`, {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const json = await res.json();
      if (json.success) {
        setMessage("已吊销 API 密钥");
        setConfirmRevoke(null);
        await loadKeys();
      } else {
        setError(json.error?.message ?? "吊销失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "吊销失败");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRotate = async (keyId: string) => {
    setRotatingId(keyId);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys/${keyId}/rotate`, {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const json = await res.json();
      if (json.success) {
        setRevealedKey(json.data);
        setMessage("API 密钥已轮换，请立即保存下方显示的新密钥");
        setConfirmRotate(null);
        await loadKeys();
      } else {
        setError(json.error?.message ?? "轮换失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "轮换失败");
    } finally {
      setRotatingId(null);
    }
  };

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">API Keys</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">API 密钥</h1>
          <p className="mt-1 text-sm text-slate-500">管理用于程序化访问工作区的 API 密钥</p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadKeys(); }}
          className="app-button-secondary self-start"
        >
          <RefreshCw size={16} />{t("workspace.refresh")}
        </button>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}
      {message && !revealedKey && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Revealed key (shown once after create/rotate) */}
      {revealedKey && (
        <section className="app-card border-amber-200 bg-amber-50/50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-600">
              <AlertTriangle size={20} />
            </span>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-amber-900">请妥善保存，此密钥不会再次显示</h2>
              <p className="mt-1 text-xs text-amber-700">
                密钥名称：{revealedKey.name} · 前缀：{revealedKey.keyPrefix}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="block flex-1 overflow-x-auto rounded-lg border border-amber-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-800">
                  {revealedKey.token}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(revealedKey.token)}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "已复制" : "复制"}
                </button>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => { setRevealedKey(null); setMessage(null); }}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  <Check size={14} />我已保存
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Create form */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Plus size={18} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">创建新密钥</h2>
        </div>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-600">密钥名称</label>
            <input
              type="text"
              required
              maxLength={100}
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="例如：生产环境集成"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button type="submit" disabled={creating} className="app-button-primary">
            <KeyRound size={16} />
            {creating ? "创建中..." : "创建密钥"}
          </button>
        </form>
        <p className="mt-3 text-[11px] text-slate-400">
          新密钥默认授予 <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">workspace:read</code> 权限。完整密钥仅在创建时显示一次。
        </p>
      </section>

      {/* Keys list */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Key size={18} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">活跃密钥</h2>
          <span className="app-badge bg-slate-100 text-slate-600">{keys.length}</span>
        </div>
        {keys.length === 0 ? (
          <div className="py-8 text-center">
            <KeyRound size={32} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-400">暂无 API 密钥，点击上方按钮创建第一个</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-col gap-3 py-3.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                    <KeyRound size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {k.name}
                      <span className="ml-2 font-mono text-xs font-normal text-slate-400">{k.keyPrefix}…</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      创建于 {formatDate(k.createdAt)} · 最后使用 {formatDate(k.lastUsedAt)}
                      {k.expiresAt && ` · 过期于 ${formatDate(k.expiresAt)}`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmRotate(k)}
                    disabled={rotatingId === k.id}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    {rotatingId === k.id ? "轮换中..." : "轮换"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(k)}
                    disabled={revokingId === k.id}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {revokingId === k.id ? "吊销中..." : "吊销"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Revoke confirmation */}
      {confirmRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-red-50 text-red-600">
                <Trash2 size={20} />
              </span>
              <h3 className="text-base font-bold text-slate-900">吊销 API 密钥</h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              确定要吊销密钥 <span className="font-semibold text-slate-800">{confirmRevoke.name}</span> 吗？
              吊销后，使用此密钥的所有请求将立即失败。此操作不可撤销。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmRevoke(null)} className="app-button-secondary">
                {t("workspace.cancel")}
              </button>
              <button
                type="button"
                onClick={() => handleRevoke(confirmRevoke.id)}
                disabled={revokingId === confirmRevoke.id}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <Check size={16} />
                {revokingId === confirmRevoke.id ? "吊销中..." : "确认吊销"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rotate confirmation */}
      {confirmRotate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-amber-50 text-amber-600">
                <RotateCcw size={20} />
              </span>
              <h3 className="text-base font-bold text-slate-900">轮换 API 密钥</h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              确定要轮换密钥 <span className="font-semibold text-slate-800">{confirmRotate.name}</span> 吗？
              旧密钥将立即失效，并生成新密钥。新密钥仅显示一次，请准备好保存。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmRotate(null)} className="app-button-secondary">
                {t("workspace.cancel")}
              </button>
              <button
                type="button"
                onClick={() => handleRotate(confirmRotate.id)}
                disabled={rotatingId === confirmRotate.id}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
              >
                <ShieldCheck size={16} />
                {rotatingId === confirmRotate.id ? "轮换中..." : "确认轮换"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
