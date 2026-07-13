"use client";

import { useI18n } from "@/i18n/locale-provider";
import { useAdminFetch, formatDateTime } from "../_components/shared";

interface ApiKey {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  userId: string;
  userEmail: string | null;
  name: string;
  scopesJson: string;
  status: "active" | "revoked" | "expired";
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

const STATUS_BADGE: Record<
  ApiKey["status"],
  { label: string; color: string }
> = {
  active: { label: "active", color: "bg-emerald-100 text-emerald-700" },
  revoked: { label: "revoked", color: "bg-red-100 text-red-700" },
  expired: { label: "expired", color: "bg-amber-100 text-amber-700" },
};

const FALLBACK_BADGE = { label: "unknown", color: "bg-slate-100 text-slate-500" };

function parseScopes(scopesJson: string): string[] {
  try {
    const parsed = JSON.parse(scopesJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === "string");
    }
    return [];
  } catch {
    return [];
  }
}

export default function ApiKeysPage() {
  const { t } = useI18n();
  const { data: apiKeys, loading, error } = useAdminFetch<ApiKey[]>(
    "/api/admin/api-keys"
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {t("admin.apiKeys.title")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("admin.apiKeys.description")}
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">加载中...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !apiKeys || apiKeys.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            {t("admin.apiKeys.empty")}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.apiKeys.name")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.apiKeys.workspace")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.apiKeys.user")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.apiKeys.scopes")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.apiKeys.status")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.apiKeys.lastUsedAt")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.apiKeys.expiresAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apiKeys.map((apiKey) => {
                const badge = STATUS_BADGE[apiKey.status] ?? FALLBACK_BADGE;
                const scopes = parseScopes(apiKey.scopesJson);
                return (
                  <tr key={apiKey.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {apiKey.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {apiKey.workspaceName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {apiKey.userEmail ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {scopes.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {scopes.map((scope) => (
                            <span
                              key={scope}
                              className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(apiKey.lastUsedAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(apiKey.expiresAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
