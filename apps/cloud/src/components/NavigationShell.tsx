"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2, ChevronDown, ContactRound, CreditCard, FileText, GitBranch,
  LayoutDashboard, LayoutGrid, Menu, ScrollText, Settings, UsersRound, X,
  CheckSquare,
} from "lucide-react";
import { useState } from "react";
import type { NavigationItem } from "@runory/platform-core";

interface NavigationShellProps {
  navigation: NavigationItem[];
  workspaceId: string;
  workspaceName: string;
  role?: string;
  children: React.ReactNode;
}

const iconMap = { users: UsersRound, contact: ContactRound, file: FileText, "check-square": CheckSquare };

const ROLE_LABELS: Record<string, { label: string; sub: string; initial: string }> = {
  owner: { label: "所有者", sub: "Owner", initial: "所" },
  admin: { label: "工作区管理员", sub: "Admin", initial: "管" },
  member: { label: "成员", sub: "Member", initial: "成" },
  viewer: { label: "访客", sub: "Viewer", initial: "访" },
};

export default function NavigationShell({ navigation, workspaceId, workspaceName, role = "member", children }: NavigationShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const canManageBilling = role === "owner" || role === "admin";
  const items = [
    { id: "dashboard", label: "仪表盘", route: "/dashboard", icon: LayoutDashboard, sortOrder: 10 },
    { id: "modules", label: "模块中心", route: "/modules", icon: LayoutGrid, sortOrder: 20 },
    ...navigation.map((item) => ({ ...item, icon: iconMap[item.icon as keyof typeof iconMap] ?? FileText })),
    { id: "workflows", label: "工作流", route: "/workflows", icon: GitBranch, sortOrder: 40 },
    ...(canManageBilling ? [{ id: "billing", label: "账单", route: "/billing", icon: CreditCard, sortOrder: 60 }] : []),
    { id: "audit", label: "审计日志", route: "/audit", icon: ScrollText, sortOrder: 90 },
    { id: "settings", label: "设置", route: "/settings", icon: Settings, sortOrder: 100 },
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  const roleDisplay = ROLE_LABELS[role] ?? ROLE_LABELS.member;

  const sidebar = (
    <>
      <div className="flex h-[76px] items-center gap-3 border-b border-slate-200/80 px-5">
        <Link href="/" className="grid size-9 place-items-center rounded-[10px] bg-slate-950 font-bold text-white">R</Link>
        <div className="min-w-0">
          <div className="font-bold tracking-tight text-slate-950">Runory</div>
          <div className="truncate text-xs text-slate-500">Business Cloud</div>
        </div>
        <button className="ml-auto md:hidden" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={20} /></button>
      </div>
      <div className="px-3 py-4">
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-100 text-indigo-600"><Building2 size={17} /></div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{workspaceName}</p><p className="text-[11px] text-slate-500">企业工作区</p></div>
          <ChevronDown size={15} className="text-slate-400" />
        </div>
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">工作空间</p>
        <nav className="space-y-1" aria-label="工作区导航">
          {items.map((item) => {
            const href = `/w/${workspaceId}${item.route}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const Icon = item.icon;
            return <Link key={item.id} href={href} onClick={() => setMobileOpen(false)} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}><Icon size={18} strokeWidth={active ? 2.3 : 1.9} /><span>{item.label}</span></Link>;
          })}
        </nav>
      </div>
      <div className="mt-auto border-t border-slate-200/80 p-4">
        <div className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50">
          <div className="grid size-9 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white">{roleDisplay.initial}</div>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{roleDisplay.label}</p><p className="text-xs text-slate-500">{roleDisplay.sub}</p></div>
          <ChevronDown size={15} className="text-slate-400" />
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_85%_0%,rgba(86,100,245,.08),transparent_26%)] md:grid md:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[244px] flex-col border-r border-slate-200 bg-white/90 backdrop-blur-xl md:flex">{sidebar}</aside>
      {mobileOpen && <div className="fixed inset-0 z-50 md:hidden"><button className="absolute inset-0 bg-slate-950/35" onClick={() => setMobileOpen(false)} aria-label="关闭导航遮罩" /><aside className="relative flex h-full w-[min(86vw,300px)] flex-col bg-white shadow-2xl">{sidebar}</aside></div>}
      <main className="min-w-0 md:col-start-2">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200/80 bg-white/75 px-4 backdrop-blur-xl md:hidden"><button className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={20} /></button><span className="ml-3 font-bold">Runory</span></header>
        <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9"><div className="page-enter">{children}</div></div>
      </main>
    </div>
  );
}
