"use client";

import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Calendar, ClipboardList, User } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const { t } = useI18n();

  const workspaceId = params?.workspaceId as string | undefined;

  // Tabs are only relevant inside a workspace context.
  // On /m (entry) and /m/account we render without the bottom nav.
  const showBottomNav = Boolean(workspaceId);

  interface TabDef {
    labelKey: MessageKey;
    icon: typeof Home;
    href: string;
    matchPrefix: string;
  }

  const tabs: TabDef[] = [
    {
      labelKey: "mobile.tabToday",
      icon: Home,
      href: `/m/w/${workspaceId}`,
      matchPrefix: `/m/w/${workspaceId}`,
    },
    {
      labelKey: "mobile.tabSchedule",
      icon: Calendar,
      href: `/m/w/${workspaceId}/schedule`,
      matchPrefix: `/m/w/${workspaceId}/schedule`,
    },
    {
      labelKey: "mobile.tabWorkOrders",
      icon: ClipboardList,
      href: `/m/w/${workspaceId}/work-orders`,
      matchPrefix: `/m/w/${workspaceId}/work-orders`,
    },
    {
      labelKey: "mobile.tabMe",
      icon: User,
      href: `/m/account`,
      matchPrefix: `/m/account`,
    },
  ];

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col bg-slate-50">
      {/* Main content area with safe-area top padding */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: showBottomNav ? "calc(env(safe-area-inset-bottom) + 72px)" : "env(safe-area-inset-bottom)",
        }}
      >
        {children}
      </main>

      {/* Bottom navigation — only visible inside a workspace */}
      {showBottomNav && (
        <nav
          className="fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 border-t border-slate-200 bg-white/95 backdrop-blur-md"
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          aria-label={t("common.mobileNavigation")}
        >
          <div className="flex items-stretch justify-around">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              // Today tab is active when pathname starts with its prefix but
              // does NOT match the more-specific schedule/work-orders prefixes.
              const isTodayTab = tab.matchPrefix === `/m/w/${workspaceId}`;
              const isActive = isTodayTab
                ? pathname === tab.matchPrefix || (pathname.startsWith(`${tab.matchPrefix}/`) &&
                    !pathname.startsWith(`/m/w/${workspaceId}/schedule`) &&
                    !pathname.startsWith(`/m/w/${workspaceId}/work-orders`) &&
                    !pathname.startsWith(`/m/w/${workspaceId}/visits`))
                : pathname === tab.matchPrefix || pathname.startsWith(`${tab.matchPrefix}`);

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 py-2 transition ${
                    isActive
                      ? "text-indigo-600"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  <span className="text-[10px] font-semibold leading-none">
                    {t(tab.labelKey)}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
