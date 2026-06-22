import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // ── Security Headers ──
  // Content-Security-Policy: restrict to self, allow inline styles (Tailwind needs this)
  // Note: 'unsafe-inline' is kept for script-src because Next.js requires it without a nonce setup.
  // 'unsafe-eval' is intentionally omitted to keep XSS protection strong.
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
  );

  // HSTS: only in production (HTTPS)
  if (process.env.NODE_ENV === "production") {
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

  if (isStateChange) {
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
