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
  // Expose the OTP dev-code toggle to client bundles. The value is resolved at
  // build time from PLATFORM_OTP_RETURN_DEV_CODE so that client components can
  // conditionally render the dev-code hint without a separate round-trip.
  env: {
    NEXT_PUBLIC_OTP_DEV_CODE_ENABLED: process.env.PLATFORM_OTP_RETURN_DEV_CODE ?? "false",
    // Expose the dev bootstrap toggle to client bundles so the DevPersonaSwitcher
    // can conditionally render without a separate round-trip. The value is
    // resolved at build time from PLATFORM_DEV_BOOTSTRAP.
    NEXT_PUBLIC_PLATFORM_DEV_BOOTSTRAP: process.env.PLATFORM_DEV_BOOTSTRAP ?? "false",
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
  return {
    ...baseConfig,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
