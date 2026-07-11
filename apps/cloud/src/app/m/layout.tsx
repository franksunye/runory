"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Calendar,
  Circle,
  ClipboardList,
  FileText,
  Home,
  LayoutGrid,
  RefreshCw,
  User,
  WifiOff,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch } from "@/lib/api-fetch";
import { initPerformanceMeasurement } from "@/lib/performance";

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
  const [mobileNavigation, setMobileNavigation] = useState<MobileTabContribution[] | null>(null);

  // ── Online / offline detection (v0.5.1 Spec §5.6: visible online/offline state) ──
  const [isOffline, setIsOffline] = useState(false);

  // ── Service worker update recovery (v0.5.1 Spec §5.3: "safe update/reload path") ──
  // When a new sw.js is fetched, the browser installs it. We listen for the
  // `updatefound` event on the installing worker and the `controllerchange`
  // event on the registration to detect when a new version has taken control,
  // then surface a non-blocking banner that lets the field worker refresh.
  const [updateAvailable, setUpdateAvailable] = useState(false);

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

  // ── Service worker registration + update recovery (v0.5.1 Spec §5.3) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Mutable handle to the periodic update interval so it can be cleared on
    // unmount. It is assigned inside the async registration callback.
    let updateInterval: ReturnType<typeof setInterval> | undefined;
    let attachedControllerListener = false;
    let pendingLoadListener: (() => void) | undefined;

    // A new service worker has taken control of the page. Only surface the
    // banner when a controller already existed (not on the very first
    // install) so the field worker is not bothered on first load.
    const handleControllerChange = () => {
      if (navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }
    };

    const doRegister = () => {
      navigator.serviceWorker
        .register(SW_PATH, { scope: SW_SCOPE })
        .then((registration) => {
          // `updatefound` fires when a new service worker starts installing.
          registration.addEventListener("updatefound", () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;
            installingWorker.addEventListener("statechange", () => {
              // When the new worker finishes installing, prompt the user to
              // refresh so they pick up the updated app shell safely.
              if (
                installingWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setUpdateAvailable(true);
              }
            });
          });

          // Periodically check for updates while the app is open so a deployed
          // fix reaches an already-open PWA without a manual reload.
          updateInterval = setInterval(() => {
            registration.update().catch(() => {
              // Update checks are best-effort; ignore network failures.
            });
          }, 60 * 1000);
        })
        .catch(() => {
          // Registration failed — the app still works online-only.
        });

      // Listen for the controller swapping over (happens after the new SW
      // activates, e.g. following a SKIP_WAITING message).
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      );
      attachedControllerListener = true;
    };

    // Register on load to avoid competing with first paint.
    if (document.readyState === "complete") {
      doRegister();
    } else {
      pendingLoadListener = () => doRegister();
      window.addEventListener("load", pendingLoadListener, { once: true });
    }

    return () => {
      if (pendingLoadListener) {
        window.removeEventListener("load", pendingLoadListener);
      }
      if (updateInterval) clearInterval(updateInterval);
      if (attachedControllerListener) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        );
      }
    };
  }, []);

  // ── Performance measurement (v0.5.1 Spec §5.7) ──
  // Initialize Web Vitals (LCP, INP, CLS, FCP, TTFB) capture in the browser.
  // Metrics are logged to the console; endpoint reporting is opt-in.
  useEffect(() => {
    return initPerformanceMeasurement({
      logToConsole: true,
      reportToEndpoint: false,
    });
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setMobileNavigation(null);
      return;
    }

    let cancelled = false;
    void apiFetch<{
      success: boolean;
      data?: Array<{
        packId: string;
        installed: boolean;
        mobileNavigation?: MobileTabContribution[];
      }>;
    }>(`/api/workspaces/${workspaceId}/packs`, { cache: "no-store" })
      .then((json) => {
        if (cancelled) return;
        const contributions = (json.data ?? [])
          .filter((pack) => pack.installed)
          .flatMap((pack) => pack.mobileNavigation ?? []);
        setMobileNavigation(contributions);
      })
      .catch(() => {
        if (!cancelled) setMobileNavigation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Reload the page so the new service worker controls all subsequent fetches.
  const handleRefresh = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  // Tabs are only relevant inside a workspace context.
  // On /m (entry) and /m/account we render without the bottom nav.
  const showBottomNav = Boolean(workspaceId);

  interface TabDef {
    key: string;
    label: string;
    icon: IconType;
    href: string;
    matchPrefix: string;
  }

  const configuredTabs = buildMobileTabs(workspaceId, mobileNavigation);
  const primaryTabs = configuredTabs.slice(0, 3);
  const hasExplore = configuredTabs.length > primaryTabs.length;
  const tabs: TabDef[] = [
    ...primaryTabs,
    ...(hasExplore
      ? [
          {
            key: "explore",
            label: "Explore",
            icon: LayoutGrid,
            href: `/m/w/${workspaceId}/explore`,
            matchPrefix: `/m/w/${workspaceId}/explore`,
          },
        ]
      : []),
    {
      key: "me",
      label: t("mobile.tabMe"),
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

      {/* Update recovery banner — surfaces a new SW version (v0.5.1 Spec §5.3) */}
      {updateAvailable && (
        <button
          type="button"
          onClick={handleRefresh}
          className="fixed left-1/2 z-[61] w-full max-w-[480px] -translate-x-1/2 bg-indigo-600"
          style={{
            top: isOffline ? "calc(env(safe-area-inset-top) + 34px)" : "env(safe-area-inset-top)",
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-2 py-2">
            <RefreshCw size={14} className="shrink-0 text-white" />
            <span className="text-xs font-semibold text-white">
              New version available, tap to refresh
            </span>
          </div>
        </button>
      )}

      {/* Main content area with safe-area top padding */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          // When the offline banner is visible, add space for it below the
          // safe-area inset so it doesn't cover the page header. The update
          // banner sits below the offline banner and overlays content (it is
          // dismissable via refresh), so it does not add extra padding.
          paddingTop:
            isOffline && updateAvailable
              ? "calc(env(safe-area-inset-top) + 68px)"
              : isOffline
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
                  key={tab.key}
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
                    {tab.label}
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

type IconType = typeof Home;

interface MobileTabContribution {
  key: string;
  label: string;
  route: string;
  icon?: string;
  order?: number;
}

const ICONS: Record<string, IconType> = {
  building: Building2,
  calendar: Calendar,
  "clipboard-list": ClipboardList,
  "file-text": FileText,
  home: Home,
  "layout-grid": LayoutGrid,
};

function buildMobileTabs(
  workspaceId: string | undefined,
  contributions: MobileTabContribution[] | null
): Array<{
  key: string;
  label: string;
  icon: IconType;
  href: string;
  matchPrefix: string;
}> {
  if (!workspaceId) return [];

  const base: MobileTabContribution[] =
    contributions && contributions.length > 0
      ? contributions
      : [
          {
            key: "today",
            label: "Today",
            route: "/",
            icon: "home",
            order: 10,
          },
        ];

  const deduped = new Map<string, MobileTabContribution>();
  for (const item of base) {
    if (!item.key || !item.route) continue;
    const existing = deduped.get(item.key);
    if (!existing || (item.order ?? 100) < (existing.order ?? 100)) {
      deduped.set(item.key, item);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
    .map((item) => {
      const normalizedRoute =
        item.route === "/" ? "" : item.route.startsWith("/") ? item.route : `/${item.route}`;
      const href = `/m/w/${workspaceId}${normalizedRoute}`;
      return {
        key: item.key,
        label: item.label,
        icon: ICONS[item.icon ?? ""] ?? Circle,
        href,
        matchPrefix: href,
      };
    });
}
