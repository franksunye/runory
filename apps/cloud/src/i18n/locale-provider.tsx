"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LOCALE_COOKIE, SUPPORTED_LOCALES, type Locale } from "./config";
import { messages, type MessageKey } from "./messages";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Detects if the current pathname starts with a locale segment (e.g. `/en/...`).
 * Returns the matched locale or null if the path is not locale-prefixed.
 */
function localeFromPathname(pathname: string | null): Locale | null {
  if (!pathname) return null;
  const firstSegment = pathname.split("/")[1];
  return SUPPORTED_LOCALES.includes(firstSegment as Locale)
    ? (firstSegment as Locale)
    : null;
}

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [locale, updateLocale] = useState(initialLocale);

  // Sync internal state when initialLocale changes (e.g. navigating from
  // /en/product to /zh/product causes the [locale] layout to re-render
  // with a new initialLocale prop).
  useEffect(() => {
    updateLocale(initialLocale);
  }, [initialLocale]);

  // In the (app) route group there is no locale URL segment. On first mount,
  // read the locale cookie on the client and update state. App pages show
  // loading states, so the brief English→locale switch is invisible.
  useEffect(() => {
    if (localeFromPathname(pathname)) return; // locale comes from URL
    const match = document.cookie.match(new RegExp(`${LOCALE_COOKIE}=(zh|en)`));
    if (match && match[1] !== locale) {
      updateLocale(match[1] as Locale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep <html lang> in sync
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale(nextLocale) {
      updateLocale(nextLocale);
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;

      const urlLocale = localeFromPathname(pathname);
      if (urlLocale) {
        // In [locale] context: navigate to the same path with new locale
        const restOfPath = pathname!.split("/").slice(2).join("/");
        router.push(`/${nextLocale}${restOfPath ? "/" + restOfPath : ""}`);
      } else {
        // In (app) context: just refresh to pick up new locale from cookie
        router.refresh();
      }
    },
    t(key, params) {
      let str = messages[locale][key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    },
  }), [locale, router, pathname]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useI18n must be used within LocaleProvider");
  return context;
}
