import { NextRequest, NextResponse } from "next/server";

const LOCALE_COOKIE = "runory_locale";
const SUPPORTED_LOCALES = ["en", "zh"] as const;
const DEFAULT_LOCALE = "en";

/**
 * Marketing paths that should be locale-prefixed.
 * If a user navigates to any of these without a locale prefix, middleware
 * redirects to /{locale}{path}.
 */
const MARKETING_PATHS = [
  "/product",
  "/pricing",
  "/resources",
  "/solutions",
  "/voice",
  "/agent",
  "/platform",
  "/pilot",
  "/security",
  "/open-source",
  "/packs",
  "/docs",
  "/login",
];

function isMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return MARKETING_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function hasLocalePrefix(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1];
  return (SUPPORTED_LOCALES as readonly string[]).includes(firstSegment);
}

function detectLocale(request: NextRequest): string {
  // Check cookie first
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookie && (SUPPORTED_LOCALES as readonly string[]).includes(cookie)) {
    return cookie;
  }
  // Fallback: Accept-Language header
  const acceptLang = request.headers.get("accept-language");
  if (acceptLang && acceptLang.toLowerCase().startsWith("zh")) {
    return "zh";
  }
  return DEFAULT_LOCALE;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Locale Redirect ──
  // If the path is a marketing path without a locale prefix, redirect to
  // /{locale}{path}. This enables static generation for all marketing pages
  // while keeping URLs locale-aware (e.g. /en/product, /zh/product).
  if (!hasLocalePrefix(pathname) && isMarketingPath(pathname)) {
    const locale = detectLocale(request);
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.next();
  const isDev = process.env.NODE_ENV !== "production";

  // ── Security Headers ──
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'`
  );

  if (!isDev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );

  // ── CSRF/Origin Protection ──
  const method = request.method.toUpperCase();
  const isStateChange = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isRetellIntegration = request.nextUrl.pathname.startsWith("/api/integrations/retell/");
  const isStripeWebhook = request.nextUrl.pathname === "/api/integrations/stripe/webhook";
  const isStripeBillingWebhook = request.nextUrl.pathname === "/api/integrations/stripe/billing-webhook";
  const isProviderCallback = isRetellIntegration || isStripeWebhook || isStripeBillingWebhook;

  if (isStateChange && !isProviderCallback) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return new NextResponse(
            JSON.stringify({ error: "Origin mismatch" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch {
        return new NextResponse(
          JSON.stringify({ error: "Invalid origin" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      const xRequestedWith = request.headers.get("x-requested-with");
      if (!xRequestedWith) {
        return new NextResponse(
          JSON.stringify({ error: "Missing Origin or X-Requested-With header" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
