"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, ArrowLeft, ChevronDown, ChevronRight,
  ContactRound, FileText, LayoutDashboard, Menu, Settings,
  UsersRound, X, CheckSquare, Search, PieChart, AlertCircle,
  Bookmark, Megaphone, CornerUpLeft, CheckCircle, HelpCircle,
  Package, Wrench, Shield, Calendar, Clock, ListChecks,
  TrendingUp, MessageCircle, UserPlus, ShieldCheck, Inbox,
  MessageSquare, Tag, Target, Heart, AlertTriangle, Gift,
  Headphones, Briefcase, PanelLeftClose, PanelLeftOpen,
  Building2, ClipboardList, MapPin,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { NavigationItem } from "@runory/platform-core";

// ── Types ──

interface InstalledPackGroup {
  packId: string;
  packName: string;
  category: string;
  installedAt: string;
}

interface NavigationShellProps {
  navigation: NavigationItem[];
  packs: InstalledPackGroup[];
  modulePackMap: Record<string, string>;
  workspaceId: string;
  workspaceName: string;
  role?: string;
  children: React.ReactNode;
}

// ── Icon Map ──

const iconMap: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  users: UsersRound,
  contact: ContactRound,
  "user-plus": UserPlus,
  file: FileText,
  "file-text": FileText,
  "check-square": CheckSquare,
  "list-checks": ListChecks,
  "check-circle": CheckCircle,
  search: Search,
  "pie-chart": PieChart,
  "alert-circle": AlertCircle,
  "alert-triangle": AlertTriangle,
  bookmark: Bookmark,
  megaphone: Megaphone,
  "corner-up-left": CornerUpLeft,
  "help-circle": HelpCircle,
  package: Package,
  wrench: Wrench,
  shield: Shield,
  "shield-check": ShieldCheck,
  calendar: Calendar,
  clock: Clock,
  "trending-up": TrendingUp,
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  inbox: Inbox,
  tag: Tag,
  target: Target,
  heart: Heart,
  gift: Gift,
  headphones: Headphones,
  briefcase: Briefcase,
  building: Building2,
  "clipboard-list": ClipboardList,
  "map-pin": MapPin,
};

// Default icon by pack category — used when module icon is "file" (the default)
const categoryDefaultIcon: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  crm: Briefcase,
  field_service: Wrench,
  sales: FileText,
  marketing: Megaphone,
  ai_visibility: Search,
  customer_service: Headphones,
  after_sales: ShieldCheck,
  general: FileText,
};

function resolveIcon(
  iconName: string,
  packCategory?: string
): React.ComponentType<{ size?: number; strokeWidth?: number }> {
  if (iconName && iconName !== "file" && iconMap[iconName]) {
    return iconMap[iconName];
  }
  if (packCategory && categoryDefaultIcon[packCategory]) {
    return categoryDefaultIcon[packCategory];
  }
  return FileText;
}

// ── Role Labels ──

const ROLE_LABELS: Record<string, { label: string; sub: string; initial: string }> = {
  owner: { label: "所有者", sub: "Owner", initial: "所" },
  admin: { label: "工作区管理员", sub: "Admin", initial: "管" },
  member: { label: "成员", sub: "Member", initial: "成" },
  viewer: { label: "访客", sub: "Viewer", initial: "访" },
};

const MANAGEMENT_ROUTES = [
  "/manage", "/modules", "/customize", "/workflows", "/members",
  "/audit", "/export", "/api-keys", "/settings", "/billing",
];

// ── Pack category display names ──

const CATEGORY_LABELS: Record<string, string> = {
  crm: "客户关系",
  field_service: "现场服务",
  sales: "销售报价",
  marketing: "营销获客",
  ai_visibility: "AI 可见性",
  customer_service: "客户服务",
  after_sales: "售后服务",
  general: "业务",
};

// ── Component ──

export default function NavigationShell({
  navigation,
  packs,
  modulePackMap,
  workspaceId,
  workspaceName,
  role = "member",
  children,
}: NavigationShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const canManage = role === "owner" || role === "admin";

  const isActiveRoute = (route: string) => {
    const href = `/w/${workspaceId}${route}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Persist collapsed state
  useEffect(() => {
    const saved = localStorage.getItem("runory:sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("runory:sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  // Auto-expand the group containing the active route
  useEffect(() => {
    for (const pack of packs) {
      const packItems = navigation.filter((item) => {
        const itemPackId = item.moduleId ? modulePackMap[item.moduleId] : undefined;
        return itemPackId === pack.packId;
      });
      const isActive = packItems.some((item) => isActiveRoute(item.route));
      if (isActive && !expandedGroups.has(pack.packId)) {
        setExpandedGroups((prev) => new Set(prev).add(pack.packId));
      }
    }
  }, [pathname, navigation, packs, modulePackMap]);

  const isManageActive = () => {
    if (canManage) {
      return MANAGEMENT_ROUTES.some((r) => {
        const full = `/w/${workspaceId}${r}`;
        return pathname === full || pathname.startsWith(`${full}/`);
      });
    }
    return isActiveRoute("/settings");
  };

  const toggleGroup = (packId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(packId)) next.delete(packId);
      else next.add(packId);
      return next;
    });
  };

  // ── Build navigation structure ──
  // Group nav items by pack, preserving pack installation order.
  // Items without a pack mapping go into an "Other" group.
  const packGroups = packs.map((pack) => ({
    pack,
    items: navigation
      .filter((item) => {
        const itemPackId = item.moduleId ? modulePackMap[item.moduleId] : undefined;
        return itemPackId === pack.packId;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  // Items not associated with any installed pack
  const ungroupedItems = navigation
    .filter((item) => {
      const itemPackId = item.moduleId ? modulePackMap[item.moduleId] : undefined;
      return !itemPackId || !packs.some((p) => p.packId === itemPackId);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Management items
  const managementItems = canManage
    ? [{ id: "manage", label: "管理", route: "/manage", icon: Settings, sortOrder: 90 }]
    : [{ id: "settings", label: "设置", route: "/settings", icon: Settings, sortOrder: 90 }];

  const roleDisplay = ROLE_LABELS[role] ?? ROLE_LABELS.member;

  // ── Sidebar content ──

  const renderNavItem = (
    item: { id: string; label: string; route: string; icon: string | React.ComponentType<{ size?: number; strokeWidth?: number }> },
    packCategory?: string,
    key?: string
  ) => {
    const href = `/w/${workspaceId}${item.route}`;
    const active = isActiveRoute(item.route);
    const Icon = typeof item.icon === "string"
      ? resolveIcon(item.icon, packCategory)
      : item.icon;
    return (
      <Link
        key={key ?? item.id}
        href={href}
        onClick={() => setMobileOpen(false)}
        className={`sidebar-nav-item relative ${active ? "sidebar-nav-item-active" : "sidebar-nav-item-default"} ${collapsed ? "justify-center px-0" : ""}`}
        title={collapsed ? item.label : undefined}
      >
        <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {collapsed && (
          <span className="sidebar-collapsed-tooltip group-hover:opacity-100">{item.label}</span>
        )}
      </Link>
    );
  };

  const sidebarContent = (
    <>
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-slate-200/80 px-4"
        style={{ height: "var(--sidebar-header-h)" }}
      >
        <Link href="/" className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-slate-950 font-bold text-white">
          R
        </Link>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold tracking-tight text-slate-950">Runory</div>
            <div className="truncate text-[11px] text-slate-500">Business Cloud</div>
          </div>
        )}
        <button
          className="ml-auto hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 md:block"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button
          className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="关闭导航"
        >
          <X size={20} />
        </button>
      </div>

      {/* Scrollable Nav Area */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="工作区导航">
        {/* Dashboard */}
        {renderNavItem({ id: "dashboard", label: "工作台", route: "/dashboard", icon: LayoutDashboard })}

        {/* Pack Groups */}
        {packGroups.length > 0 && !collapsed && (
          <p className="sidebar-group-label mt-5">业务</p>
        )}
        <div className={collapsed ? "mt-4 space-y-1" : "space-y-1"}>
          {packGroups.map(({ pack, items }) => {
            if (items.length === 0) return null;
            const groupLabel = CATEGORY_LABELS[pack.category] ?? pack.packName;
            const isExpanded = expandedGroups.has(pack.packId) || collapsed;

            if (collapsed) {
              // Collapsed mode: show items directly with tooltips
              return items.map((item) =>
                renderNavItem(item, pack.category, `${pack.packId}-${item.id}`)
              );
            }

            return (
              <div key={pack.packId} className="pt-1">
                <button
                  onClick={() => toggleGroup(pack.packId)}
                  className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 transition hover:text-slate-600"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>{groupLabel}</span>
                  <span className="ml-auto text-[10px] font-normal text-slate-300">{items.length}</span>
                </button>
                {isExpanded && (
                  <div className="space-y-0.5">
                    {items.map((item) =>
                      renderNavItem(item, pack.category, `${pack.packId}-${item.id}`)
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Ungrouped items */}
          {ungroupedItems.length > 0 && (
            <div className="pt-1">
              {ungroupedItems.map((item) => renderNavItem(item, undefined, `ungrouped-${item.id}`))}
            </div>
          )}
        </div>

        {/* Activity */}
        {renderNavItem({ id: "activity", label: "活动", route: "/activity", icon: Activity })}

        {/* Management */}
        {!collapsed && <p className="sidebar-group-label mt-5">管理</p>}
        <div className={collapsed ? "mt-4 space-y-1" : "space-y-1"}>
          {managementItems.map((item) => {
            const href = `/w/${workspaceId}${item.route}`;
            const active = isManageActive();
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`sidebar-nav-item relative ${active ? "sidebar-nav-item-active" : "sidebar-nav-item-default"} ${collapsed ? "justify-center px-0" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
                {!collapsed && <span>{item.label}</span>}
                {collapsed && (
                  <span className="sidebar-collapsed-tooltip group-hover:opacity-100">{item.label}</span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-200/80 px-3 py-3" style={{ minHeight: "var(--sidebar-footer-h)" }}>
        {/* Return to workspaces */}
        <Link
          href="/dashboard"
          onClick={() => setMobileOpen(false)}
          className={`mb-2 flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 ${collapsed ? "justify-center" : ""}`}
          title={collapsed ? "我的工作区" : undefined}
        >
          <ArrowLeft size={14} />
          {!collapsed && <span>我的工作区</span>}
        </Link>

        {/* Role display */}
        <div className={`flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50 ${collapsed ? "justify-center" : ""}`}>
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white">
            {roleDisplay.initial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{roleDisplay.label}</p>
              <p className="text-xs text-slate-500">{roleDisplay.sub}</p>
            </div>
          )}
        </div>

        {/* Data boundary notice */}
        {!collapsed && (
          <p className="mt-2 px-2 text-[10px] leading-relaxed text-slate-400">
            每个工作区独立管理其业务数据
          </p>
        )}
      </div>
    </>
  );

  const sidebarWidth = collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_85%_0%,rgba(86,100,245,.08),transparent_26%)] md:grid md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]"
         style={{ ["--sidebar-w" as string]: sidebarWidth }}>
      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white/90 backdrop-blur-xl md:flex"
        style={{ width: sidebarWidth }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setMobileOpen(false)}
            aria-label="关闭导航遮罩"
          />
          <aside className="relative flex h-full w-[min(86vw,300px)] flex-col bg-white shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="min-w-0 md:col-start-2">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200/80 bg-white/75 px-4 backdrop-blur-xl md:hidden">
          <button
            className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white"
            onClick={() => setMobileOpen(true)}
            aria-label="打开导航"
          >
            <Menu size={20} />
          </button>
          <span className="ml-3 font-bold">{workspaceName || "Runory"}</span>
        </header>

        <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
          <div className="page-enter">{children}</div>
        </div>
      </main>
    </div>
  );
}
