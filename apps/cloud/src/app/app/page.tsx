"use client";

import { useEffect, useState } from "react";

/**
 * /app — PWA start_url resolver (v0.9.2 Spec §7)
 *
 * When the PWA is launched (from the home screen icon), the browser opens
 * `start_url` which is `/app`. This client component inspects the current
 * session state and redirects to the appropriate surface:
 *
 *   - Workspace session  → /m           (field operations app)
 *   - Customer-access    → /{locale}/access (customer self-service portal)
 *   - Neither            → /{locale}      (marketing home page)
 *
 * The redirect is performed client-side via `window.location.replace()` so
 * the resolver page never appears in the browser history.
 */

function getLocaleFromCookie(): string {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/runory_locale=(zh|en)/);
  return match ? match[1] : "en";
}

export default function AppResolverPage() {
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        // 1. Check for a workspace session by calling an authenticated API.
        //    /api/push/config requires a valid workspace session; a 2xx
        //    response means the user is logged in.
        const pushRes = await fetch("/api/push/config", {
          credentials: "same-origin",
          cache: "no-store",
        }).catch(() => null);

        if (pushRes && pushRes.ok) {
          if (!cancelled) window.location.replace("/m");
          return;
        }

        // 2. Check for a customer-access session cookie.
        const hasCustomerAccess = document.cookie.includes(
          "runory_customer_access",
        );

        if (hasCustomerAccess) {
          const locale = getLocaleFromCookie();
          if (!cancelled) window.location.replace(`/${locale}/access`);
          return;
        }

        // 3. No session — redirect to the marketing home page.
        const locale = getLocaleFromCookie();
        if (!cancelled) window.location.replace(`/${locale}`);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    resolve();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
        <p className="text-sm font-medium text-slate-500">
          {error ? "Unable to load. Please refresh." : "Loading\u2026"}
        </p>
      </div>
    </div>
  );
}
