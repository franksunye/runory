"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  ChevronUp, LogOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { NavigationItem } from "@runory/platform-core";
import type { WorkspaceSurfaceKey } from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import UserAvatar from "./UserAvatar";

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
  modulePresentation?: Record<string, { visibility: string; surface?: string; audience?: string[] }>;
  platformSurfaces: WorkspaceSurfaceKey[];
  workspaceId: string;
  workspaceName: string;
  role?: string;
  currentUser?: {
    userId: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
    authMethod: string;
  };
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

function getCategoryLabel(category: string, t: TFunc): string {
  const key = CATEGORY_LABEL_KEY[category];
  if (key) return t(key);

  // Unknown category — title-case the raw value as a defensive fallback
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
  modulePresentation,
  platformSurfaces,
  workspaceId,
  workspaceName,
  role = "member",
  currentUser,
  children,
}: NavigationShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupsInitialized, setGroupsInitialized] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuButtonRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        accountMenuButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname]);

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

  const isAdministrationActive = () => canManage && MANAGEMENT_ROUTES
    .filter((route) => route !== "/settings")
    .some((route) => {
      const full = `/w/${workspaceId}${route}`;
      return pathname === full || pathname.startsWith(`${full}/`);
    });

  const toggleGroup = (packId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(packId)) next.delete(packId);
      else next.add(packId);
      return next;
    });
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      localStorage.removeItem("runory:sidebar-collapsed");
      localStorage.removeItem("runory:extension-notice-dismissed");
      localStorage.removeItem("runory:early-access-dismissed");
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
      setAccountMenuOpen(false);
    }
  };

  // ── Build navigation structure ──
  // Filter navigation items based on presentation metadata before grouping.
  // Items whose module declares a visibility other than "top_level" are
  // hidden from the primary sidebar: "contextual" objects (service_visit,
  // service_report) surface inside their parent record, "hidden" objects
  // (quote-approval) never appear, and "management" objects are admin/owner
  // only. When presentation data is missing (older installs) we fall back to
  // showing everything for backward compatibility.
  const isNavItemVisible = (item: NavigationItem): boolean => {
    // If we don't have presentation data for this item's module, show it (backward compat)
    if (!item.moduleId || !modulePresentation || !modulePresentation[item.moduleId]) {
      return true;
    }
    const presentation = modulePresentation[item.moduleId];

    // Hidden items never appear
    if (presentation.visibility === "hidden") {
      return false;
    }

    // Management items only for admin/owner
    if (presentation.visibility === "management" && !canManage) {
      return false;
    }

    // Contextual items don't appear in top-level navigation
    if (presentation.visibility === "contextual") {
      return false;
    }

    // top_level items are always visible (audience filtering is a future enhancement
    // since we don't yet have permission group info in the client)
    return true;
  };

  const visibleNavigation = navigation.filter(isNavItemVisible);

  // Group nav items by pack, preserving pack installation order.
  // Items without a pack mapping go into an "Other" group.
  const packGroups = packs.map((pack) => ({
    pack,
    items: visibleNavigation
      .filter((item) => {
        const itemPackId = item.moduleId ? modulePackMap[item.moduleId] : undefined;
        return itemPackId === pack.packId;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  // Items not associated with any installed pack
  const ungroupedItems = visibleNavigation
    .filter((item) => {
      const itemPackId = item.moduleId ? modulePackMap[item.moduleId] : undefined;
      return !itemPackId || !packs.some((p) => p.packId === itemPackId);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const hasPlatformSurfaces = platformSurfaces.length > 0;
  const hasBusinessNavigation = packGroups.some(({ items }) => items.length > 0) || ungroupedItems.length > 0;

  const roleDisplay = getRoleDisplay(role, t);
  const userName = currentUser?.displayName || t("workspace.nav.currentUserFallback");
  const userSecondary = currentUser?.email || roleDisplay.label;

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

        {/* Cross-Pack work surfaces stay flat and high in the hierarchy. */}
        {hasPlatformSurfaces && (
          <div className="mt-1 space-y-0.5">
            {platformSurfaces.includes("my_work")
              && renderNavItem({ id: "my-work", label: t("workspace.nav.myWork"), route: "/my-work", icon: CheckSquare })}
            {platformSurfaces.includes("planning")
              && renderNavItem({ id: "planning", label: t("workspace.nav.planning"), route: "/planning", icon: Calendar })}
            {platformSurfaces.includes("activity")
              && renderNavItem({ id: "activity", label: t("workspace.nav.activity"), route: "/activity", icon: Activity })}
          </div>
        )}

        {/* A quiet spatial boundary separates shared work surfaces from installed applications. */}
        {hasBusinessNavigation && <div className={collapsed ? "mx-2 my-4 border-t border-slate-200" : "mx-2 my-4 border-t border-slate-200/80"} />}

        {/* Pack Groups */}
        <div className={collapsed ? "space-y-1" : "space-y-1"}>
          {packGroups.map(({ pack, items }) => {
            if (items.length === 0) return null;
            const groupLabel = getCategoryLabel(pack.category, t);
            const isExpanded = expandedGroups.has(pack.packId) || collapsed;

            if (collapsed) {
              // Collapsed mode: show items directly with tooltips
              return items.map((item) =>
                renderNavItem(item, pack.category, `${pack.packId}-${item.id}`)
              );
            }

            return (
              <div key={pack.packId} className="pt-3 first:pt-0">
                <button
                  onClick={() => toggleGroup(pack.packId)}
                  className="sidebar-group-label flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 transition hover:bg-slate-50 hover:text-slate-600"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>{groupLabel}</span>
                </button>
                {isExpanded && (
                  <div className="ml-3 space-y-0.5 border-l border-slate-200 pl-2">
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
            <div className="ml-3 border-l border-slate-200 pl-2 pt-1">
              {ungroupedItems.map((item) => renderNavItem(item, undefined, `ungrouped-${item.id}`))}
            </div>
          )}
        </div>
      </nav>

      {/* Compact identity / workspace utility menu. */}
      <div ref={accountMenuRef} className="relative border-t border-slate-200/80 p-2">
        <button
          ref={accountMenuButtonRef}
          type="button"
          aria-label={t("workspace.nav.accountMenu")}
          aria-expanded={accountMenuOpen}
          onClick={() => setAccountMenuOpen((open) => !open)}
          className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-slate-100 ${collapsed ? "justify-center" : ""}`}
          title={collapsed ? `${userName} · ${roleDisplay.label}` : undefined}
        >
          <UserAvatar name={userName} avatarUrl={currentUser?.avatarUrl} size="md" />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-950">{userName}</p>
                <p className="truncate text-xs text-slate-500">{workspaceName} · {roleDisplay.label}</p>
              </div>
              {accountMenuOpen ? <ChevronDown size={17} className="text-slate-400" /> : <ChevronUp size={17} className="text-slate-400" />}
            </>
          )}
        </button>

        {accountMenuOpen && (
          <div
            role="group"
            aria-label={t("workspace.nav.accountMenu")}
            className={`absolute bottom-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,.18)] ${collapsed ? "left-2 w-72" : "left-2 right-2"}`}
          >
            <Link
              href="/account"
              onClick={() => { setAccountMenuOpen(false); setMobileOpen(false); }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-slate-50"
            >
              <UserAvatar name={userName} avatarUrl={currentUser?.avatarUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-950">{userName}</p>
                <p className="truncate text-xs text-slate-500">{userSecondary}</p>
              </div>
              <ChevronRight size={17} className="text-slate-400" />
            </Link>

            <div className="my-1 border-t border-slate-100" />

            {canManage && (
              <Link
                href={`/w/${workspaceId}/manage`}
                onClick={() => { setAccountMenuOpen(false); setMobileOpen(false); }}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isAdministrationActive() ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <ShieldCheck size={18} />
                <span>{t("workspace.nav.manage")}</span>
              </Link>
            )}
            <Link
              href={`/w/${workspaceId}/settings`}
              onClick={() => { setAccountMenuOpen(false); setMobileOpen(false); }}
              className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActiveRoute("/settings") ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"}`}
            >
              <Settings size={18} />
              <span>{t("workspace.nav.workspaceSettings")}</span>
            </Link>
            <Link
              href="/dashboard"
              onClick={() => { setAccountMenuOpen(false); setMobileOpen(false); }}
              className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={18} />
              <span>{t("workspace.nav.myWorkspaces")}</span>
            </Link>

            <div className="my-1 border-t border-slate-100" />

            <button
              type="button"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
              className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <LogOut size={18} />
              <span>{t("switcher.logout")}</span>
            </button>

            <p className="mt-1 border-t border-slate-100 px-3 pt-2 text-[10px] leading-relaxed text-slate-400">
              {t("workspace.nav.dataBoundary")}
            </p>
          </div>
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
