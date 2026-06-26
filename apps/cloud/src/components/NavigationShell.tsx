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
  Building2, ClipboardList, MapPin, GitBranch, Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { NavigationItem } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

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

type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

const ROLE_LABEL_KEY: Record<string, { labelKey: MessageKey; sub: string; initialKey: MessageKey }> = {
  owner: { labelKey: "workspace.nav.roleOwner", sub: "Owner", initialKey: "workspace.nav.roleOwnerInitial" },
  admin: { labelKey: "workspace.nav.roleAdmin", sub: "Admin", initialKey: "workspace.nav.roleAdminInitial" },
  member: { labelKey: "workspace.nav.roleMember", sub: "Member", initialKey: "workspace.nav.roleMemberInitial" },
  viewer: { labelKey: "workspace.nav.roleViewer", sub: "Viewer", initialKey: "workspace.nav.roleViewerInitial" },
};

function getRoleDisplay(role: string, t: TFunc) {
  const entry = ROLE_LABEL_KEY[role] ?? ROLE_LABEL_KEY.member;
  return {
    label: t(entry.labelKey),
    sub: entry.sub,
    initial: t(entry.initialKey),
  };
}

const MANAGEMENT_ROUTES = [
  "/manage", "/modules", "/customize", "/members",
  "/audit", "/trash", "/export", "/api-keys", "/settings", "/billing",
];

// ── Pack category display names ──

const CATEGORY_LABEL_KEY: Record<string, MessageKey> = {
  crm: "workspace.nav.categoryCrm",
  field_service: "workspace.nav.categoryFieldService",
  sales: "workspace.nav.categorySales",
  marketing: "workspace.nav.categoryMarketing",
  ai_visibility: "workspace.nav.categoryAiVisibility",
  customer_service: "workspace.nav.categoryCustomerService",
  after_sales: "workspace.nav.categoryAfterSales",
  general: "workspace.nav.categoryGeneral",
};

function getCategoryLabel(category: string, t: TFunc): string | undefined {
  const key = CATEGORY_LABEL_KEY[category];
  return key ? t(key) : undefined;
}

// ── Object navigation label resolution ──
// Maps canonical routes to i18n keys so that navigation labels are always
// locale-aware, regardless of what raw string was persisted in the DB at
// install time. For FSM-installed workspaces, variant keys are used for
// objects that the FSM pack relabels (company → customer, task → service task).
const ROUTE_LABEL_KEY: Record<string, { defaultKey: MessageKey; fsmKey?: MessageKey }> = {
  "/companies": { defaultKey: "workspace.nav.objectCompany", fsmKey: "workspace.nav.objectCustomer" },
  "/contacts": { defaultKey: "workspace.nav.objectContact" },
  "/deals": { defaultKey: "workspace.nav.objectDeal" },
  "/tasks": { defaultKey: "workspace.nav.objectTask", fsmKey: "workspace.nav.objectServiceTask" },
  "/assets": { defaultKey: "workspace.nav.objectAsset" },
  "/work-orders": { defaultKey: "workspace.nav.objectWorkOrder" },
  "/service-sites": { defaultKey: "workspace.nav.objectServiceSite" },
  "/technicians": { defaultKey: "workspace.nav.objectTechnician" },
  "/service-reports": { defaultKey: "workspace.nav.objectServiceReport" },
  "/service-visits": { defaultKey: "workspace.nav.objectServiceVisit" },
  "/campaigns": { defaultKey: "workspace.nav.objectCampaign" },
  "/landing-pages": { defaultKey: "workspace.nav.objectLandingPage" },
  "/forms": { defaultKey: "workspace.nav.objectForm" },
  "/submissions": { defaultKey: "workspace.nav.objectSubmission" },
  "/tickets": { defaultKey: "workspace.nav.objectTicket" },
  "/conversations": { defaultKey: "workspace.nav.objectConversation" },
  "/knowledge": { defaultKey: "workspace.nav.objectKnowledge" },
  "/product-services": { defaultKey: "workspace.nav.objectProductService" },
  "/price-books": { defaultKey: "workspace.nav.objectPriceBook" },
  "/quotes": { defaultKey: "workspace.nav.objectQuote" },
  "/quote-approvals": { defaultKey: "workspace.nav.objectQuoteApproval" },
  "/entity-profiles": { defaultKey: "workspace.nav.objectEntityProfile" },
  "/citation-sources": { defaultKey: "workspace.nav.objectCitationSource" },
  "/answer-blocks": { defaultKey: "workspace.nav.objectAnswerBlock" },
  "/question-maps": { defaultKey: "workspace.nav.objectQuestionMap" },
  "/ai-visibility-checks": { defaultKey: "workspace.nav.objectAiVisibilityCheck" },
  "/return-requests": { defaultKey: "workspace.nav.objectReturnRequest" },
  "/repair-requests": { defaultKey: "workspace.nav.objectRepairRequest" },
  "/warranties": { defaultKey: "workspace.nav.objectWarranty" },
  "/maintenance-plans": { defaultKey: "workspace.nav.objectMaintenancePlan" },
  "/customer-successes": { defaultKey: "workspace.nav.objectCustomerSuccess" },
  "/support-slas": { defaultKey: "workspace.nav.objectSupportSla" },
  "/consents": { defaultKey: "workspace.nav.objectConsent" },
};

function resolveNavLabel(
  route: string,
  rawLabel: string,
  hasFsm: boolean,
  t: TFunc
): string {
  const entry = ROUTE_LABEL_KEY[route];
  if (!entry) return rawLabel;
  const key = hasFsm && entry.fsmKey ? entry.fsmKey : entry.defaultKey;
  return t(key);
}

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
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupsInitialized, setGroupsInitialized] = useState(false);
  const canManage = role === "owner" || role === "admin";
  const hasFsm = packs.some((p) => p.category === "field_service");

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

  // Start with installed business packs expanded so local/demo workspaces show
  // the available product surface immediately.
  useEffect(() => {
    if (groupsInitialized || packs.length === 0) return;
    setExpandedGroups(new Set(packs.map((pack) => pack.packId)));
    setGroupsInitialized(true);
  }, [groupsInitialized, packs]);

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
    ? [{ id: "manage", label: t("workspace.nav.manage"), route: "/manage", icon: Settings, sortOrder: 90 }]
    : [{ id: "settings", label: t("workspace.nav.settings"), route: "/settings", icon: Settings, sortOrder: 90 }];

  const roleDisplay = getRoleDisplay(role, t);

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
    const resolvedLabel = resolveNavLabel(item.route, item.label, hasFsm, t);
    return (
      <Link
        key={key ?? item.id}
        href={href}
        onClick={() => setMobileOpen(false)}
        className={`sidebar-nav-item relative ${active ? "sidebar-nav-item-active" : "sidebar-nav-item-default"} ${collapsed ? "justify-center px-0" : ""}`}
        title={collapsed ? resolvedLabel : undefined}
      >
        <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
        {!collapsed && <span className="truncate">{resolvedLabel}</span>}
        {collapsed && (
          <span className="sidebar-collapsed-tooltip group-hover:opacity-100">{resolvedLabel}</span>
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
          aria-label={collapsed ? t("workspace.nav.expandSidebar") : t("workspace.nav.collapseSidebar")}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button
          className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label={t("workspace.nav.closeNav")}
        >
          <X size={20} />
        </button>
      </div>

      {/* Scrollable Nav Area */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={t("workspace.nav.workspaceNav")}>
        {/* Dashboard */}
        {renderNavItem({ id: "dashboard", label: t("workspace.nav.dashboard"), route: "/dashboard", icon: LayoutDashboard })}

        {/* Pack Groups */}
        <div className={collapsed ? "mt-4 space-y-1" : "space-y-1"}>
          {packGroups.map(({ pack, items }) => {
            if (items.length === 0) return null;
            const groupLabel = getCategoryLabel(pack.category, t) ?? pack.packName;
            const isExpanded = expandedGroups.has(pack.packId) || collapsed;

            if (collapsed) {
              // Collapsed mode: show items directly with tooltips
              return items.map((item) =>
                renderNavItem(item, pack.category, `${pack.packId}-${item.id}`)
              );
            }

            return (
              <div key={pack.packId}>
                <button
                  onClick={() => toggleGroup(pack.packId)}
                  className="sidebar-group-label mt-5 flex w-full items-center gap-1.5"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>{groupLabel}</span>
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
        {renderNavItem({ id: "activity", label: t("workspace.nav.activity"), route: "/activity", icon: Activity })}

        {/* Platform capabilities (admin/owner only) */}
        {canManage && (
          <>
            {!collapsed && <p className="sidebar-group-label mt-5">{t("workspace.nav.platform")}</p>}
            <div className={collapsed ? "mt-4 space-y-1" : "space-y-1"}>
              {renderNavItem({ id: "workflows", label: t("workspace.nav.workflows"), route: "/workflows", icon: GitBranch })}
              {renderNavItem({ id: "automations", label: t("workspace.nav.automations"), route: "/automations", icon: Zap })}
            </div>
          </>
        )}

        {/* Management */}
        {!collapsed && <p className="sidebar-group-label mt-5">{t("workspace.nav.management")}</p>}
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
          title={collapsed ? t("workspace.nav.myWorkspaces") : undefined}
        >
          <ArrowLeft size={14} />
          {!collapsed && <span>{t("workspace.nav.myWorkspaces")}</span>}
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
            {t("workspace.nav.dataBoundary")}
          </p>
        )}
      </div>
    </>
  );

  const sidebarWidth = collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)";

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_85%_0%,rgba(86,100,245,.08),transparent_26%)] md:grid md:grid-cols-[var(--workspace-sidebar-w)_minmax(0,1fr)]"
      style={{ ["--workspace-sidebar-w" as string]: sidebarWidth }}
    >
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
            aria-label={t("workspace.nav.closeOverlay")}
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
            aria-label={t("workspace.nav.openNav")}
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
