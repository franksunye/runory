"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { KeyRound, Mail, RefreshCw, ShieldCheck, Users } from "lucide-react";
import PeopleAccessPanel from "@/components/access/PeopleAccessPanel";
import RoleCatalogPanel from "@/components/access/RoleCatalogPanel";
import InvitationAccessPanel from "@/components/access/InvitationAccessPanel";
import type { AccessDirectory, AccessInvitation } from "@/components/access/access-types";
import { apiFetch } from "@/lib/api-fetch";
import { useI18n } from "@/i18n/locale-provider";

type TabKey = "people" | "roles" | "invitations";

export default function MembersPage() {
  const params = useParams();
  const workspaceRef = params.workspaceId as string;
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [directory, setDirectory] = useState<AccessDirectory | null>(null);
  const [invitations, setInvitations] = useState<AccessInvitation[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("people");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const access = await apiFetch<{ success: boolean; data?: AccessDirectory; error?: { message?: string } }>(
        `/api/workspaces/${workspaceRef}/access/members`,
        { cache: "no-store" }
      );
      if (!access.success || !access.data) throw new Error(access.error?.message ?? "Unable to load access directory");
      setDirectory(access.data);
      const invitationResult = await apiFetch<{ success: boolean; data?: AccessInvitation[] }>(
        `/api/organizations/${access.data.organizationId}/invitations`,
        { cache: "no-store" }
      );
      setInvitations(invitationResult.success ? invitationResult.data ?? [] : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load access directory");
    } finally {
      setLoading(false);
    }
  }, [workspaceRef]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="space-y-4"><div className="app-skeleton h-8 w-64" /><div className="app-skeleton h-72 w-full" /></div>;
  if (error || !directory) return <div className="app-card p-8 text-center"><ShieldCheck size={32} className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-red-600">{error ?? (zh ? "无法加载人员与访问" : "Unable to load people and access")}</p></div>;

  const tabs: Array<{ key: TabKey; label: string; icon: typeof Users; count: number }> = [
    { key: "people", label: zh ? "人员" : "People", icon: Users, count: directory.members.length },
    { key: "roles", label: zh ? "业务角色" : "Business roles", icon: KeyRound, count: directory.roles.length },
    { key: "invitations", label: zh ? "邀请" : "Invitations", icon: Mail, count: invitations.filter((item) => item.status === "pending").length },
  ];

  return (
    <div className="space-y-6 page-enter">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="app-eyebrow">{zh ? "身份与访问" : "Identity & access"}</p><h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{zh ? "人员与访问" : "People & access"}</h1><p className="mt-2 text-sm text-slate-500">{zh ? "管理谁可以进入工作区、负责什么业务，以及可以访问哪些数据。" : "Manage who can enter, what they can do, and which data they can access."}</p></div>
        <button type="button" onClick={() => { setLoading(true); void load(); }} className="app-button-secondary self-start"><RefreshCw size={16} />{zh ? "刷新" : "Refresh"}</button>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" aria-label={zh ? "人员与访问导航" : "People and access navigation"}>
        {tabs.map((tab) => { const Icon = tab.icon; const active = activeTab === tab.key; return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`inline-flex min-w-fit items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`} aria-current={active ? "page" : undefined}><Icon size={16} />{tab.label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{tab.count}</span></button>; })}
      </nav>

      {activeTab === "people" && <PeopleAccessPanel directory={directory} workspaceRef={workspaceRef} locale={locale} />}
      {activeTab === "roles" && <RoleCatalogPanel directory={directory} locale={locale} />}
      {activeTab === "invitations" && <InvitationAccessPanel directory={directory} invitations={invitations} locale={locale} onChanged={load} />}
    </div>
  );
}
