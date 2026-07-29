"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Boxes,
  ChevronRight,
  CircleGauge,
  CreditCard,
  DatabaseZap,
  Download,
  FileInput,
  FileText,
  GitBranch,
  KeyRound,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";

interface AdministrationNavigationProps {
  workspaceId: string;
  pathname: string;
  collapsed: boolean;
  canManage: boolean;
  onNavigate: () => void;
}

interface AdministrationItem {
  route: string;
  label: { en: string; zh: string };
  icon: typeof Settings;
  adminOnly?: boolean;
}

interface AdministrationGroup {
  label: { en: string; zh: string };
  items: AdministrationItem[];
  advanced?: boolean;
}

const OVERVIEW: AdministrationItem = {
  route: "/manage",
  label: { en: "Overview", zh: "管理概览" },
  icon: CircleGauge,
};

const ADMINISTRATION_GROUPS: AdministrationGroup[] = [
  {
    label: { en: "Workspace", zh: "工作区" },
    items: [
      { route: "/settings", label: { en: "General", zh: "常规设置" }, icon: Settings },
      { route: "/members", label: { en: "People & access", zh: "人员与访问" }, icon: Users },
      { route: "/billing", label: { en: "Billing", zh: "账单与订阅" }, icon: CreditCard, adminOnly: true },
    ],
  },
  {
    label: { en: "Business configuration", zh: "业务配置" },
    items: [
      { route: "/modules", label: { en: "Business apps", zh: "业务应用" }, icon: Boxes },
      { route: "/customize", label: { en: "Objects & fields", zh: "对象与字段" }, icon: SlidersHorizontal },
      { route: "/workflows", label: { en: "Workflows", zh: "工作流" }, icon: GitBranch },
      { route: "/automations", label: { en: "Automations", zh: "自动化" }, icon: Zap },
      { route: "/forms", label: { en: "Forms & checklists", zh: "表单与检查清单" }, icon: FileText },
    ],
  },
  {
    label: { en: "Integrations & agents", zh: "集成与 Agent" },
    items: [
      { route: "/api-keys", label: { en: "Developer access", zh: "开发者访问" }, icon: KeyRound },
      { route: "/conversations", label: { en: "Communication channels", zh: "沟通渠道" }, icon: Bot },
    ],
  },
  {
    label: { en: "Data governance", zh: "数据治理" },
    items: [
      { route: "/audit", label: { en: "Audit log", zh: "审计日志" }, icon: ScrollText },
      { route: "/export", label: { en: "Data export", zh: "数据导出" }, icon: Download },
      { route: "/trash", label: { en: "Trash", zh: "回收站" }, icon: Trash2 },
    ],
  },
  {
    label: { en: "Advanced operations", zh: "高级运维" },
    advanced: true,
    items: [
      { route: "/outbox", label: { en: "Delivery diagnostics", zh: "交付诊断" }, icon: DatabaseZap },
      { route: "/migration", label: { en: "Data changes", zh: "数据变更" }, icon: FileInput },
    ],
  },
];

export const ADMINISTRATION_ROUTES = [
  OVERVIEW.route,
  ...ADMINISTRATION_GROUPS.flatMap((group) => group.items.map((item) => item.route)),
];

export function isAdministrationPath(pathname: string, workspaceId: string): boolean {
  return ADMINISTRATION_ROUTES.some((route) => {
    const href = `/w/${workspaceId}${route}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}

export default function AdministrationNavigation({
  workspaceId,
  pathname,
  collapsed,
  canManage,
  onNavigate,
}: AdministrationNavigationProps) {
  const { locale } = useI18n();
  const language = locale === "zh" ? "zh" : "en";

  const renderItem = (item: AdministrationItem) => {
    const href = `/w/${workspaceId}${item.route}`;
    const active = pathname === href || pathname.startsWith(`${href}/`);
    const Icon = item.icon;
    const label = item.label[language];

    return (
      <Link
        key={item.route}
        href={href}
        onClick={onNavigate}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={`sidebar-nav-item group relative ${active ? "sidebar-nav-item-active" : "sidebar-nav-item-default"} ${collapsed ? "justify-center px-0" : ""}`}
      >
        <Icon size={18} strokeWidth={active ? 2.25 : 1.8} />
        {collapsed ? (
          <span className="sidebar-collapsed-tooltip group-hover:opacity-100">{label}</span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {active ? <span className="size-1.5 rounded-full bg-indigo-500" /> : <ChevronRight size={14} className="text-slate-300 opacity-0 transition group-hover:opacity-100" />}
          </>
        )}
      </Link>
    );
  };

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={language === "zh" ? "管理导航" : "Administration navigation"}>
      <Link
        href={`/w/${workspaceId}/dashboard`}
        onClick={onNavigate}
        className={`sidebar-nav-item group mb-4 border border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950 ${collapsed ? "justify-center px-0" : ""}`}
        title={collapsed ? (language === "zh" ? "返回工作区" : "Back to workspace") : undefined}
      >
        <ArrowLeft size={17} />
        {!collapsed && <span>{language === "zh" ? "返回工作区" : "Back to workspace"}</span>}
        {collapsed && <span className="sidebar-collapsed-tooltip group-hover:opacity-100">{language === "zh" ? "返回工作区" : "Back to workspace"}</span>}
      </Link>

      {renderItem(OVERVIEW)}

      <div className="mt-4 space-y-5">
        {ADMINISTRATION_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || canManage);
          if (items.length === 0 || (group.advanced && !canManage)) return null;

          const groupActive = items.some((item) => {
            const href = `/w/${workspaceId}${item.route}`;
            return pathname === href || pathname.startsWith(`${href}/`);
          });

          if (group.advanced && !collapsed) {
            return (
              <details key={group.label.en} open={groupActive} className="group/advanced border-t border-slate-200 pt-3">
                <summary className="sidebar-group-label flex cursor-pointer list-none items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-100">
                  <span>{group.label[language]}</span>
                  <ChevronRight size={13} className="transition group-open/advanced:rotate-90" />
                </summary>
                <div className="mt-1 space-y-0.5">{items.map(renderItem)}</div>
              </details>
            );
          }

          return (
            <section key={group.label.en} className={collapsed ? "border-t border-slate-200 pt-3" : undefined}>
              {!collapsed && <h2 className="sidebar-group-label px-2">{group.label[language]}</h2>}
              <div className="space-y-0.5">{items.map(renderItem)}</div>
            </section>
          );
        })}
      </div>
    </nav>
  );
}
