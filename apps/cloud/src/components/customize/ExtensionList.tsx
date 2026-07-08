"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch, apiPost } from "@/lib/api-fetch";

interface ExtensionSummary {
  id: string;
  name: string;
  namespace: string;
  status: string;
  currentVersion: number;
  createdAt: string;
}

interface ExtensionVersion {
  id: string;
  version: number;
  manifest: {
    customFields?: Array<{
      targetObject: string;
      fieldKey: string;
      label: string;
      type: string;
      required: boolean;
    }>;
    riskLevel?: string;
    description?: string;
  };
  riskLevel: string;
  changeSummary: string | null;
  rollbackOfVersion: number | null;
  createdAt: string;
}

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

const RISK_LABEL_KEY: Record<string, MessageKey> = {
  low: "extension.risk.low",
  medium: "extension.risk.medium",
  high: "extension.risk.high",
};

const TYPE_LABEL_KEY: Record<string, MessageKey> = {
  text: "extension.type.text",
  email: "extension.type.email",
  phone: "extension.type.phone",
  number: "extension.type.number",
  date: "extension.type.date",
  select: "extension.type.select",
  boolean: "extension.type.boolean",
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function ExtensionList() {
  const { t } = useI18n();
  const workspaceId = useParams().workspaceId as string;
  const [extensions, setExtensions] = useState<ExtensionSummary[]>([]);
  const [versions, setVersions] = useState<Record<string, ExtensionVersion[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<ExtensionSummary | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const extJson = await apiFetch<{ success: boolean; data: ExtensionSummary[] }>(
        `/api/workspaces/${workspaceId}/extensions`
      );
      if (extJson.success) {
        setExtensions(extJson.data);
        const versionsMap: Record<string, ExtensionVersion[]> = {};
        await Promise.all(
          extJson.data.map(async (ext: ExtensionSummary) => {
            const vJson = await apiFetch<{ success: boolean; data: ExtensionVersion[] }>(
              `/api/workspaces/${workspaceId}/extensions/${ext.id}/versions`
            );
            if (vJson.success) versionsMap[ext.id] = vJson.data;
          })
        );
        setVersions(versionsMap);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setRollingBack(true);
    setMessage(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message: string }; data: { version: number | string } }>(
        `/api/workspaces/${workspaceId}/agent/rollback`,
        { extensionId: rollbackTarget.id, rolledBy: "ui-user" }
      );
      if (json.success) {
        setMessage({
          type: "success",
          text: t("extension.rolledBack", { name: rollbackTarget.name, version: json.data.version }),
        });
        notifyWorkspaceDataChanged();
        await loadData();
      } else {
        setMessage({ type: "error", text: json.error?.message ?? t("extension.rollbackFailed") });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : t("extension.requestFailed") });
    } finally {
      setRollingBack(false);
      setRollbackTarget(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {t("extension.count", { count: extensions.length })}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadData();
          }}
          className="app-button-secondary"
        >
          <RefreshCw size={16} />
          {t("workspace.refresh")}
        </button>
      </div>

      {error && <div className="app-error">{error}</div>}

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {extensions.length === 0 ? (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <AlertCircle size={32} className="text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">{t("extension.empty")}</p>
          <p className="mt-1 text-xs text-slate-400">
            {t("extension.emptyHint")}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {extensions.map((ext) => {
            const extVersions = versions[ext.id] ?? [];
            const currentVer = extVersions.find((v) => v.version === ext.currentVersion);
            const riskLevel = currentVer?.riskLevel ?? "low";
            const isExpanded = expandedId === ext.id;
            const canRollback = ext.currentVersion > 0 && !currentVer?.rollbackOfVersion;
            return (
              <li key={ext.id} className="app-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-950">{ext.name}</h3>
                      <span
                        className={`app-badge ${riskColors[riskLevel] ?? riskColors.low}`}
                      >
                        {RISK_LABEL_KEY[riskLevel] ? t(RISK_LABEL_KEY[riskLevel]) : riskLevel}
                      </span>
                      <span className="app-badge bg-slate-100 text-slate-600">
                        v{ext.currentVersion}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("extension.createdAt", { date: formatDate(ext.createdAt) })} · {t("extension.status", { status: ext.status })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : ext.id)}
                      className="app-button-secondary !min-h-0 !px-3 !py-1.5 text-xs"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {t("extension.viewDetails")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRollbackTarget(ext)}
                      disabled={!canRollback || rollingBack}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      <RotateCcw size={14} />
                      {t("extension.rollback")}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    {currentVer?.manifest?.customFields &&
                    currentVer.manifest.customFields.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {t("extension.fieldsCount", { count: currentVer.manifest.customFields.length })}
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {currentVer.manifest.customFields.map((cf, i) => (
                            <li
                              key={i}
                              className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-slate-800">{cf.label}</span>
                              <span className="text-xs text-slate-500">
                                {cf.targetObject}.{cf.fieldKey}
                              </span>
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                {TYPE_LABEL_KEY[cf.type] ? t(TYPE_LABEL_KEY[cf.type]) : cf.type}
                              </span>
                              {cf.required && (
                                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                  {t("extension.required")}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">{t("extension.noFields")}</p>
                    )}

                    {extVersions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {t("extension.versionHistory")}
                        </p>
                        <ul className="mt-2 divide-y divide-slate-50">
                          {extVersions.map((v) => (
                            <li
                              key={v.id}
                              className="flex items-center justify-between py-1.5 text-xs"
                            >
                              <span className="text-slate-600">
                                <span className="font-medium text-slate-700">v{v.version}</span>
                                {" · "}
                                {v.changeSummary ?? "—"}
                                {v.rollbackOfVersion != null && (
                                  <span className="ml-1 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                                    {t("extension.rolledBackFrom", { version: v.rollbackOfVersion })}
                                  </span>
                                )}
                              </span>
                              <span className="text-slate-400">{formatDate(v.createdAt)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rollbackTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !rollingBack && setRollbackTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-950">{t("extension.confirmRollback")}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {t("extension.confirmRollbackBody", { name: rollbackTarget.name, version: rollbackTarget.currentVersion })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRollbackTarget(null)}
                disabled={rollingBack}
                className="app-button-secondary"
              >
                {t("workspace.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleRollback()}
                disabled={rollingBack}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <RotateCcw size={16} />
                {rollingBack ? t("extension.rollingBack") : t("extension.confirmRollback")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
