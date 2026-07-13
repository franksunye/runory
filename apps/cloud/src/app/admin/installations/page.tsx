"use client";

import { useI18n } from "@/i18n/locale-provider";
import { useAdminFetch, formatDateTime } from "../_components/shared";

interface Installation {
  packId: string;
  workspaceId: string;
  workspaceName: string | null;
  status: string;
  demoDataStatus: string;
  installedAt: string | null;
  errorMessage: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string }> = {
    installed: { color: "bg-emerald-100 text-emerald-700" },
    error: { color: "bg-red-100 text-red-700" },
    installing: { color: "bg-blue-100 text-blue-700" },
  };
  const c = config[status] ?? { color: "bg-slate-100 text-slate-500" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.color}`}>
      {status}
    </span>
  );
}

function DemoDataBadge({ status }: { status: string }) {
  const config: Record<string, { color: string }> = {
    loaded: { color: "bg-emerald-100 text-emerald-700" },
    not_loaded: { color: "bg-slate-100 text-slate-500" },
    loading: { color: "bg-blue-100 text-blue-700" },
    error: { color: "bg-red-100 text-red-700" },
  };
  const c = config[status] ?? { color: "bg-slate-100 text-slate-500" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.color}`}>
      {status}
    </span>
  );
}

export default function InstallationsPage() {
  const { t } = useI18n();
  const { data: installations, loading, error } = useAdminFetch<Installation[]>(
    "/api/admin/installations"
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {t("admin.installations.title")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("admin.installations.description")}
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">{t("admin.common.loading")}</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !installations || installations.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            {t("admin.installations.empty")}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.installations.pack")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.installations.workspace")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.installations.status")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.installations.demoData")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.installations.installedAt")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.installations.error")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {installations.map((inst, i) => (
                <tr key={`${inst.packId}-${inst.workspaceId}-${i}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {inst.packId}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {inst.workspaceName ?? inst.workspaceId}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inst.status} />
                  </td>
                  <td className="px-4 py-3">
                    <DemoDataBadge status={inst.demoDataStatus} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(inst.installedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600">
                    {inst.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
