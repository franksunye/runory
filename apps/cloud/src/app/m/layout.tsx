"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Calendar, ClipboardList, User, WifiOff } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

// Bump this when sw.js cache policy changes to force a clean update.
const SW_PATH = "/sw.js";
const SW_SCOPE = "/m/";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const { t } = useI18n();

  const workspaceId = params?.workspaceId as string | undefined;

  // ── Online / offline detection (v0.5.1 Spec §5.6: visible online/offline state) ──
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Initialize from the browser's current connectivity state.
    setIsOffline(!navigator.onLine);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ── Service worker registration (v0.5.1 Spec §5.3) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register(SW_PATH, { scope: SW_SCOPE })
        .catch(() => {
          // Registration failed — the app still works online-only.
        });
    };

    // Register on load to avoid competing with first paint.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

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
      {/* Offline banner — thin, non-intrusive bar at the top (v0.5.1 Spec §5.6) */}
      {isOffline && (
        <div
          className="fixed left-1/2 top-0 z-[60] w-full max-w-[480px] -translate-x-1/2 bg-amber-500"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-1.5 py-1.5">
            <WifiOff size={13} className="shrink-0 text-white" />
            <span className="text-xs font-semibold text-white">
              {t("mobile.offlineBanner")}
            </span>
          </div>
        </div>
      )}

      {/* Main content area with safe-area top padding */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          // When the offline banner is visible, add space for it below the
          // safe-area inset so it doesn't cover the page header.
          paddingTop: isOffline
            ? "calc(env(safe-area-inset-top) + 34px)"
            : "env(safe-area-inset-top)",
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
