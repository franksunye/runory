"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  ChevronRight,
  CreditCard,
  DatabaseZap,
  Download,
  FileInput,
  FileText,
  GitBranch,
  KeyRound,
  MessageCircle,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch } from "@/lib/api-fetch";

interface ManageItem {
  label: { en: string; zh: string };
  description: { en: string; zh: string };
  route: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

interface ManageGroup {
  title: { en: string; zh: string };
  description: { en: string; zh: string };
  items: ManageItem[];
  advanced?: boolean;
}

const MANAGE_GROUPS: ManageGroup[] = [
  {
    title: { en: "Workspace", zh: "工作区" },
    description: { en: "Identity, access, subscription, and workspace preferences.", zh: "管理工作区身份、访问权限、订阅与常规偏好。" },
    items: [
      { label: { en: "General", zh: "常规设置" }, description: { en: "Workspace name, language, and lifecycle settings", zh: "工作区名称、语言与生命周期设置" }, route: "/settings", icon: Settings },
      { label: { en: "People & access", zh: "人员与访问" }, description: { en: "Members, business roles, resources, and data scopes", zh: "成员、业务角色、资源身份与数据范围" }, route: "/members", icon: Users },
      { label: { en: "Billing", zh: "账单与订阅" }, description: { en: "Plan, usage, entitlements, and payment details", zh: "套餐、用量、权益与付款信息" }, route: "/billing", icon: CreditCard, adminOnly: true },
    ],
  },
  {
    title: { en: "Business configuration", zh: "业务配置" },
    description: { en: "Shape the business objects, apps, and governed processes used by your team.", zh: "配置团队使用的业务对象、应用与受治理流程。" },
    items: [
      { label: { en: "Business apps", zh: "业务应用" }, description: { en: "Installed business capabilities, versions, and health", zh: "已安装的业务能力、版本与健康状态" }, route: "/modules", icon: Boxes },
      { label: { en: "Objects & fields", zh: "对象与字段" }, description: { en: "Safely adapt the workspace data model", zh: "安全调整工作区业务数据模型" }, route: "/customize", icon: SlidersHorizontal },
      { label: { en: "Workflows", zh: "工作流" }, description: { en: "Govern approvals and multi-step business processes", zh: "治理审批与多步骤业务流程" }, route: "/workflows", icon: GitBranch },
      { label: { en: "Automations", zh: "自动化" }, description: { en: "Configure triggers, conditions, and actions", zh: "配置触发器、条件与自动动作" }, route: "/automations", icon: Zap },
      { label: { en: "Forms & checklists", zh: "表单与检查清单" }, description: { en: "Define required input and operational evidence", zh: "定义必填信息与业务执行凭证" }, route: "/forms", icon: FileText },
    ],
  },
  {
    title: { en: "Integrations & agents", zh: "集成与 Agent" },
    description: { en: "Connect approved tools and provide controlled programmatic access.", zh: "连接获准工具，并提供可控的程序化访问。" },
    items: [
      { label: { en: "Developer access", zh: "开发者访问" }, description: { en: "Create and govern programmatic workspace access", zh: "创建并治理程序化工作区访问" }, route: "/api-keys", icon: KeyRound },
      { label: { en: "Communication channels", zh: "沟通渠道" }, description: { en: "Review connected customer communication activity", zh: "查看已连接的客户沟通活动" }, route: "/conversations", icon: MessageCircle },
    ],
  },
  {
    title: { en: "Data governance", zh: "数据治理" },
    description: { en: "Review changes, manage retention, and move governed workspace data.", zh: "审查变更、管理保留策略并安全迁移工作区数据。" },
    items: [
      { label: { en: "Audit log", zh: "审计日志" }, description: { en: "Review governed changes and responsible actors", zh: "审查受治理变更及其责任主体" }, route: "/audit", icon: ScrollText },
      { label: { en: "Data export", zh: "数据导出" }, description: { en: "Prepare portable workspace data packages", zh: "生成可移交的工作区数据包" }, route: "/export", icon: Download },
      { label: { en: "Trash", zh: "回收站" }, description: { en: "Review and restore deleted business records", zh: "查看并恢复已删除的业务记录" }, route: "/trash", icon: Trash2 },
    ],
  },
  {
    title: { en: "Advanced operations", zh: "高级运维" },
    description: { en: "Specialized diagnostics and controlled data-change tools for administrators.", zh: "供管理员使用的专项诊断与受控数据变更工具。" },
    advanced: true,
    items: [
      { label: { en: "Delivery diagnostics", zh: "交付诊断" }, description: { en: "Inspect failed external deliveries and controlled retries", zh: "检查外部交付失败并执行受控重试" }, route: "/outbox", icon: DatabaseZap },
      { label: { en: "Data changes", zh: "数据变更" }, description: { en: "Review planned migrations and compatibility conflicts", zh: "审查计划迁移与兼容性冲突" }, route: "/migration", icon: FileInput },
    ],
  },
];

export default function ManagePage() {
  const workspaceId = useParams().workspaceId as string;
  const { t, locale } = useI18n();
  const language = locale === "zh" ? "zh" : "en";
  const [role, setRole] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data?: { organizationRole?: string } }>(`/api/workspaces/${workspaceId}`)
      .then((json) => {
        if (active) setRole(json.success ? json.data?.organizationRole ?? "member" : "member");
      })
      .catch(() => {
        if (active) setRole("member");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [workspaceId]);

  const canManageBilling = role === "owner" || role === "admin";

  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.03)]">
        <div className="grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-1 text-xs font-semibold text-indigo-700">
              <ShieldCheck size={14} />
              {language === "zh" ? "工作区管理" : "Workspace administration"}
            </div>
            <h1 className="text-3xl font-bold tracking-[-.035em] text-slate-950">{t("manage.title")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              {language === "zh"
                ? "在一个清晰、受控的空间中管理人员、业务能力、数据治理与集成。"
                : "Manage people, business capabilities, data governance, and integrations in one controlled workspace."}
            </p>
          </div>
          <Link href={`/w/${workspaceId}/dashboard`} className="app-button-secondary w-fit">
            <ArrowLeft size={16} />
            {language === "zh" ? "返回工作区" : "Back to workspace"}
          </Link>
        </div>
        <div className="grid border-t border-slate-100 bg-slate-50/60 sm:grid-cols-3">
          {[
            { label: language === "zh" ? "访问治理" : "Access governance", value: language === "zh" ? "角色与数据范围" : "Roles & data scopes" },
            { label: language === "zh" ? "安全变更" : "Safe changes", value: language === "zh" ? "预览、审计、回滚" : "Preview, audit, rollback" },
            { label: language === "zh" ? "高级工具" : "Advanced tools", value: language === "zh" ? "按权限渐进披露" : "Permission-gated" },
          ].map((item) => (
            <div key={item.label} className="border-b border-slate-100 px-6 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-8">
              <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{item.value}</p>
            </div>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2" aria-label={t("workspace.loading")}>
          {[0, 1, 2, 3].map((item) => <div key={item} className="app-skeleton h-64 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {MANAGE_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => !item.adminOnly || canManageBilling);
            if (group.advanced && !canManageBilling) return null;

            return (
              <section
                key={group.title.en}
                className={`overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,.03)] ${group.advanced ? "border-slate-300 lg:col-span-2" : "border-slate-200"}`}
              >
                <div className={`border-b px-5 py-4 sm:px-6 ${group.advanced ? "border-slate-200 bg-slate-100/70" : "border-slate-100"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-bold text-slate-950">{group.title[language]}</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{group.description[language]}</p>
                    </div>
                    {group.advanced ? (
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">
                        {language === "zh" ? "管理员" : "Admin"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className={group.advanced ? "grid md:grid-cols-2" : undefined}>
                  {visibleItems.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.route}
                        href={`/w/${workspaceId}${item.route}`}
                        className={`group flex min-h-[88px] items-center gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6 ${index > 0 ? "border-t border-slate-100" : ""} ${group.advanced && index === 1 ? "md:border-l md:border-t-0" : ""}`}
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-700">
                          <Icon size={18} strokeWidth={1.9} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">{item.label[language]}</span>
                          <span className="mt-1 line-clamp-1 block text-xs text-slate-500">{item.description[language]}</span>
                        </span>
                        <ChevronRight size={17} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <footer className="flex flex-col gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>{language === "zh" ? "所有管理操作均遵循工作区权限与审计边界。" : "All administration actions follow workspace permissions and audit boundaries."}</span>
        <Link href={`/w/${workspaceId}/audit`} className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-indigo-700">
          {language === "zh" ? "查看审计日志" : "View audit log"}<ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
