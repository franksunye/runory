"use client";

import { useI18n } from "@/i18n/locale-provider";
import { useAdminFetch, formatDateTime } from "../_components/shared";

interface Member {
  id: string;
  email: string | null;
  displayName: string;
  externalId: string;
  orgRole: "owner" | "admin" | "member";
  orgName: string | null;
  joinedAt: string;
}

const ROLE_BADGE: Record<
  Member["orgRole"],
  { label: string; color: string }
> = {
  owner: { label: "owner", color: "bg-purple-100 text-purple-700" },
  admin: { label: "admin", color: "bg-blue-100 text-blue-700" },
  member: { label: "member", color: "bg-slate-100 text-slate-600" },
};

const FALLBACK_BADGE = { label: "member", color: "bg-slate-100 text-slate-600" };

export default function MembersPage() {
  const { t } = useI18n();
  const { data: members, loading, error } = useAdminFetch<Member[]>(
    "/api/admin/members"
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {t("admin.members.title")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("admin.members.description")}
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">加载中...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !members || members.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            {t("admin.members.empty")}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.members.email")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.members.name")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.members.orgRole")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.members.organization")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.members.joinedAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((member) => {
                const badge = ROLE_BADGE[member.orgRole] ?? FALLBACK_BADGE;
                return (
                  <tr key={`${member.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {member.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {member.displayName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {member.orgName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(member.joinedAt)}
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
