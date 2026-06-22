import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // ── Security Headers ──
  // Content-Security-Policy: restrict to self, allow inline styles (Tailwind needs this)
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
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
  // For state-changing methods, verify Origin matches the expected host
  const method = request.method.toUpperCase();
  const isStateChange = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  if (isStateChange && process.env.NODE_ENV === "production") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    // Allow same-origin requests (Origin host matches request host)
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return new NextResponse(
            JSON.stringify({ error: "Cross-origin request blocked" }),
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
    }
    // If no Origin header, allow it (API clients like curl may not send Origin)
    // Session cookies have SameSite=lax which provides additional CSRF protection
  }

  return response;
}

export const config = {
  // Run on all routes except static files and Next.js internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
