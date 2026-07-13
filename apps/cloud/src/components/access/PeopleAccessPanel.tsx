"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import type { AccessDirectory, DataScope } from "./access-types";
import UserAvatar from "@/components/UserAvatar";

interface PeopleAccessPanelProps {
  directory: AccessDirectory;
  workspaceRef: string;
  locale: string;
}

const SCOPE_STYLE: Record<DataScope, string> = {
  all: "bg-indigo-50 text-indigo-700",
  team: "bg-blue-50 text-blue-700",
  assigned: "bg-emerald-50 text-emerald-700",
  permitted: "bg-amber-50 text-amber-700",
  none: "bg-slate-100 text-slate-500",
};

function formatDate(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US");
}

export default function PeopleAccessPanel({ directory, workspaceRef, locale }: PeopleAccessPanelProps) {
  const router = useRouter();
  const zh = locale === "zh";
  const [query, setQuery] = useState("");
  const members = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? directory.members.filter((member) => `${member.displayName} ${member.email ?? ""}`.toLowerCase().includes(needle))
      : directory.members;
  }, [directory.members, query]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{zh ? "人员目录" : "People directory"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {zh ? "选择人员进入独立页面管理角色、权限和资源身份。" : "Select a person to manage roles, access, and resource identity on a dedicated page."}
          </p>
        </div>
        <label className="relative block w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <span className="sr-only">{zh ? "搜索人员" : "Search people"}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="app-input pl-9" placeholder={zh ? "搜索姓名或邮箱" : "Search name or email"} />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_130px_150px_minmax(220px,1fr)_120px_32px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
          <span>{zh ? "人员" : "Person"}</span><span>{zh ? "组织角色" : "Organization"}</span><span>{zh ? "工作区角色" : "Workspace"}</span><span>{zh ? "业务角色 / 资源" : "Business roles / Resource"}</span><span>{zh ? "数据范围" : "Data scope"}</span><span />
        </div>
        <ul className="divide-y divide-slate-100">
          {members.map((member) => (
            <li key={member.userId}>
              <button type="button" onClick={() => router.push(`/w/${workspaceRef}/members/${encodeURIComponent(member.userId)}`)} className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[minmax(220px,1.4fr)_130px_150px_minmax(220px,1fr)_120px_32px] lg:items-center">
                <span className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={member.displayName} avatarUrl={member.avatarUrl} size="lg" />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{member.displayName}</span><span className="block truncate text-xs text-slate-500">{member.email ?? (zh ? "演示身份" : "Demo identity")} · {formatDate(member.joinedAt, locale)}</span></span>
                </span>
                <span className="text-sm text-slate-700">{member.organizationRole ?? "—"}</span>
                <span className="text-sm font-medium text-slate-700">{member.workspaceRole ?? (zh ? "无访问" : "No access")}</span>
                <span className="flex flex-wrap gap-1.5">
                  {member.businessRoles.map((role) => <span key={role.id} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{role.label}</span>)}
                  {member.resources.map((resource) => <span key={resource.id} className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{resource.name}</span>)}
                  {member.businessRoles.length === 0 && member.resources.length === 0 && <span className="text-xs text-slate-400">—</span>}
                </span>
                <span><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${SCOPE_STYLE[member.dataScope]}`}>{member.dataScope}</span></span>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
