"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  RefreshCw, Loader2, AlertTriangle, CheckCircle2, Send,
  Inbox, Clock3, AlertCircle,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch, apiPost } from "@/lib/api-fetch";

interface OutboxMessage {
  id: string;
  messageType: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

interface Toast { type: "success" | "error"; message: string }

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  delivered: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-600",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function OutboxPage() {
  const workspaceId = useParams().workspaceId as string;
  const { t } = useI18n();

  const [messages, setMessages] = useState<OutboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [executing, setExecuting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const query = filterStatus ? `?status=${filterStatus}` : "";
      const json = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: OutboxMessage[];
      }>(`/api/workspaces/${workspaceId}/outbox${query}`, { cache: "no-store" });
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
      setMessages(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filterStatus]);

  useEffect(() => { void load(); }, [load]);

  const handleRetry = async (id: string) => {
    try {
      setExecuting(`retry-${id}`);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/outbox`,
        { messageId: id, action: "retry" }
      );
      if (!json.success) throw new Error(json.error?.message ?? "Retry failed");
      showToast("success", "Message queued for retry");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Retry failed");
    } finally {
      setExecuting(null);
    }
  };

  const handleMarkDelivered = async (id: string) => {
    try {
      setExecuting(`deliver-${id}`);
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/outbox`,
        { messageId: id, action: "mark_delivered" }
      );
      if (!json.success) throw new Error(json.error?.message ?? "Mark delivered failed");
      showToast("success", "Message marked as delivered");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Mark delivered failed");
    } finally {
      setExecuting(null);
    }
  };

  const counts = {
    pending: messages.filter(m => m.status === "pending").length,
    failed: messages.filter(m => m.status === "failed").length,
    delivered: messages.filter(m => m.status === "delivered").length,
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed right-4 top-20 z-[60] flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("outbox.title")}</h1>
          <div className="mt-1 flex gap-3 text-sm text-slate-500">
            <span className="text-amber-600">{counts.pending} {t("outbox.statusPending")}</span>
            <span className="text-red-600">{counts.failed} {t("outbox.statusFailed")}</span>
            <span className="text-green-600">{counts.delivered} {t("outbox.statusDelivered")}</span>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="app-button-ghost">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {t("workspace.refresh")}
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="">{t("myWork.filterAll")}</option>
          <option value="pending">{t("outbox.statusPending")}</option>
          <option value="failed">{t("outbox.statusFailed")}</option>
          <option value="delivered">{t("outbox.statusDelivered")}</option>
        </select>
      </div>

      {error && <div className="app-error">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : messages.length === 0 ? (
        <div className="app-card p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Inbox size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">{t("outbox.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="app-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`app-badge ${STATUS_BADGE[msg.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {t(`outbox.status${msg.status.charAt(0).toUpperCase()}${msg.status.slice(1)}` as any)}
                    </span>
                    <span className="font-mono text-sm font-semibold text-slate-700">{msg.messageType}</span>
                    <span className="app-badge bg-slate-100 text-slate-600">
                      {t("outbox.attempts")}: {msg.attempts}
                    </span>
                  </div>
                  {msg.lastError && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      <span className="break-all">{msg.lastError}</span>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock3 size={12} />
                      {t("outbox.createdAt")}: {formatDate(msg.createdAt)}
                    </span>
                    {msg.deliveredAt && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 size={12} />
                        {t("outbox.deliveredAt")}: {formatDate(msg.deliveredAt)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
                    className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    {expanded === msg.id ? "Hide payload" : "Show payload"}
                  </button>
                  {expanded === msg.id && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                      {JSON.stringify(msg.payload, null, 2)}
                    </pre>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {msg.status === "failed" && (
                    <button
                      onClick={() => void handleRetry(msg.id)}
                      disabled={executing === `retry-${msg.id}`}
                      className="app-button-secondary text-xs"
                    >
                      {executing === `retry-${msg.id}` ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      {t("outbox.actionRetry")}
                    </button>
                  )}
                  {msg.status !== "delivered" && (
                    <button
                      onClick={() => void handleMarkDelivered(msg.id)}
                      disabled={executing === `deliver-${msg.id}`}
                      className="app-button-ghost text-xs"
                    >
                      {executing === `deliver-${msg.id}` ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      {t("outbox.actionMarkDelivered")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
