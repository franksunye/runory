import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const baseConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Catalog manifests and SQL migrations are discovered dynamically at runtime.
  // Explicitly trace them so newly added artifacts are available in Vercel
  // Serverless Functions instead of only files referenced by static imports.
  outputFileTracingIncludes: {
    "/*": ["./.resources/**/*"],
  },
  env: {
    // Keep the v0.5 basemap selectable at deployment time. CSP intentionally
    // permits only the OpenFreeMap origin, so switching map providers remains
    // a deliberate security/configuration change.
    NEXT_PUBLIC_MAP_STYLE_URL:
      process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty",
  },
  // ── v0.5.1 Spec §5.3: Service Worker cache policy ──
  // The service worker file (sw.js) MUST NOT be cached by the browser/CDN so
  // that users always fetch the latest version. Per the spec:
  //   "Deployment MUST set sw.js to no-cache, no-store, must-revalidate"
  // Without this header a stale sw.js can pin users to an old SW version and
  // prevent the update/reload recovery path from ever being reached.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default function nextConfig(phase: string): NextConfig {
  // Match the server's local-runtime guard and additionally require a dev
  // server. A production build must never embed a debug auth toggle, including
  // when deployment variables were copied from a developer's machine.
  const localDevelopment = phase === PHASE_DEVELOPMENT_SERVER
    && (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
    && process.env.VERCEL !== "1"
    && !process.env.VERCEL_ENV;
  // The isolated release harness exercises many routes in a long journey.
  // Keep its compiled routes warm across role transitions instead of repeatedly
  // evicting/recompiling them under the browser test's unchanged time budget.
  // Do not change normal development or production build behavior.
  const isolatedRelease = localDevelopment
    && process.env.RUNORY_ISOLATED_VERIFICATION === "true"
    && process.env.PLATFORM_DEPLOYMENT_MODE === "local"
    && Boolean(process.env.RUNORY_VERIFICATION_DATABASE_URL?.startsWith("file:"))
    && process.env.LIBSQL_URL === process.env.RUNORY_VERIFICATION_DATABASE_URL
    && !process.env.LIBSQL_AUTH_TOKEN;
  return {
    ...baseConfig,
    ...(isolatedRelease ? {
      onDemandEntries: { maxInactiveAge: 5 * 60_000, pagesBufferLength: 16 },
    } : {}),
    env: {
      ...baseConfig.env,
      NEXT_PUBLIC_OTP_DEV_CODE_ENABLED: String(localDevelopment),
      NEXT_PUBLIC_PLATFORM_DEV_BOOTSTRAP: String(localDevelopment && process.env.PLATFORM_DEV_BOOTSTRAP === "true"),
    },
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
