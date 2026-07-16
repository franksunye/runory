import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const isDev = process.env.NODE_ENV !== "production";

  // ── Security Headers ──
  // Content-Security-Policy: restrict to self, allow inline styles (Tailwind needs this).
  // MapLibre uses a blob worker and fetches the explicitly allowlisted OpenFreeMap
  // style, fonts, sprites, and vector tiles from its own origin.
  // Note: 'unsafe-inline' is kept for script-src because Next.js requires it without a nonce setup.
  // Next.js dev mode needs 'unsafe-eval' for React Refresh / webpack evaluation.
  // It remains omitted in production to keep XSS protection strong.
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'`
  );

  // HSTS: only in production (HTTPS)
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
  // For state-changing methods, verify Origin matches the expected host.
  // This check ALWAYS runs (not gated by NODE_ENV) so dev/test catches issues too.
  const method = request.method.toUpperCase();
  const isStateChange = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  // Provider callbacks are machine-to-machine requests without browser Origin
  // headers. Their routes authenticate the raw Retell signature or the scoped
  // Tool bearer secret and do not use cookie/session authorization.
  const isRetellIntegration = request.nextUrl.pathname.startsWith("/api/integrations/retell/");

  if (isStateChange && !isRetellIntegration) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin) {
      // Origin present — verify it matches host
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return new NextResponse(
            JSON.stringify({ error: "Origin mismatch" }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      } catch {
        return new NextResponse(
          JSON.stringify({ error: "Invalid origin" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } else {
      // No Origin header — require X-Requested-With custom header.
      // Plain HTML forms can't set custom headers, so this blocks CSRF.
      const xRequestedWith = request.headers.get("x-requested-with");
      if (!xRequestedWith) {
        return new NextResponse(
          JSON.stringify({ error: "Missing Origin or X-Requested-With header" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }
  }

  return response;
}

export const config = {
  // Run on all routes except static files and Next.js internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
