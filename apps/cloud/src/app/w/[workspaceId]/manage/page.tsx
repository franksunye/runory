"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  CreditCard, Download, GitBranch, Key, Package, ScrollText,
  Settings, SlidersHorizontal, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ManageCard {
  title: string;
  description: string;
  route: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const MANAGE_CARDS: ManageCard[] = [
  { title: "模块与业务包", description: "浏览、安装和管理可用模块与 Pack", route: "/modules", icon: Package },
  { title: "定制工作区", description: "配置对象、字段与视图，定制业务模型", route: "/customize", icon: SlidersHorizontal },
  { title: "工作流配置", description: "管理审批流定义与运行中的工作流实例", route: "/workflows", icon: GitBranch },
  { title: "成员与权限", description: "管理工作区成员及其角色与访问权限", route: "/members", icon: Users },
  { title: "审计日志", description: "查看工作区内所有变更操作记录", route: "/audit", icon: ScrollText },
  { title: "数据导出", description: "导出工作区数据用于备份或迁移", route: "/export", icon: Download },
  { title: "API Keys", description: "管理用于程序化访问的 API 密钥", route: "/api-keys", icon: Key },
  { title: "工作区设置", description: "管理模块、扩展版本与工作区数据", route: "/settings", icon: Settings },
  { title: "账单", description: "查看当前方案、用量与功能权益", route: "/billing", icon: CreditCard, adminOnly: true },
];

export default function ManagePage() {
  const workspaceId = useParams().workspaceId as string;
  const [role, setRole] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}`);
        const json = await res.json();
        if (json.success) setRole(json.data.organizationRole ?? "member");
      } catch {
        setRole("member");
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  const canManageBilling = role === "owner" || role === "admin";
  const cards = MANAGE_CARDS.filter((c) => !c.adminOnly || canManageBilling);

  return (
    <div className="space-y-6">
      <header>
        <p className="app-eyebrow">Manage</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">管理</h1>
        <p className="mt-2 text-sm text-slate-500">工作区管理功能集中入口，涵盖模块、定制、工作流、成员与安全。</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ title, description, route, icon: Icon }) => (
          <Link
            key={route}
            href={`/w/${workspaceId}${route}`}
            className="app-card group flex flex-col p-5 transition hover:border-indigo-200 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-100">
                <Icon size={20} />
              </span>
              <h2 className="text-base font-bold text-slate-950">{title}</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 opacity-0 transition group-hover:opacity-100">
              进入
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
