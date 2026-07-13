"use client";

import { useI18n } from "@/i18n/locale-provider";
import { useAdminFetch, formatDateTime } from "../_components/shared";

interface CompatibilityReport {
  id: string;
  workspaceId: string;
  catalogItemId: string;
  fromVersionId: string | null;
  toVersionId: string;
  status: "compatible" | "warning" | "blocked";
  createdAt: string;
}

const STATUS_BADGE: Record<
  CompatibilityReport["status"],
  { color: string }
> = {
  compatible: { color: "bg-emerald-100 text-emerald-700" },
  warning: { color: "bg-amber-100 text-amber-700" },
  blocked: { color: "bg-red-100 text-red-700" },
};

export default function CompatibilityPage() {
  const { t } = useI18n();
  const { data: reports, loading, error } = useAdminFetch<CompatibilityReport[]>(
    "/api/admin/compatibility"
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {t("admin.compatibility.title")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("admin.compatibility.description")}
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">加载中...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !reports || reports.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            {t("admin.compatibility.empty")}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.compatibility.workspace")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.compatibility.item")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.compatibility.fromVersion")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.compatibility.toVersion")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.compatibility.status")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.compatibility.generatedAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {report.workspaceId}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {report.catalogItemId}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {report.fromVersionId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {report.toVersionId}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[report.status].color}`}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(report.createdAt)}
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
