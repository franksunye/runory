"use client";

import { useI18n } from "@/i18n/locale-provider";
import { useAdminFetch, formatDateTime } from "../_components/shared";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  status: string;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  active: { label: "active", color: "bg-emerald-100 text-emerald-700" },
  archived: { label: "archived", color: "bg-amber-100 text-amber-700" },
  pending_deletion: { label: "pending_deletion", color: "bg-red-100 text-red-700" },
};

const FALLBACK_BADGE = { label: "unknown", color: "bg-slate-100 text-slate-500" };

export default function WorkspacesPage() {
  const { t } = useI18n();
  const { data: workspaces, loading, error } = useAdminFetch<Workspace[]>(
    "/api/admin/workspaces"
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {t("admin.workspaces.title")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("admin.workspaces.description")}
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">加载中...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !workspaces || workspaces.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            {t("admin.workspaces.empty")}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.workspaces.name")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.workspaces.slug")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.workspaces.organization")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.workspaces.status")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.workspaces.createdAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workspaces.map((workspace) => {
                const badge = STATUS_BADGE[workspace.status] ?? FALLBACK_BADGE;
                return (
                  <tr key={workspace.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {workspace.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {workspace.slug}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {workspace.organizationName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(workspace.createdAt)}
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
