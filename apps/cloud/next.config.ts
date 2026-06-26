import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const baseConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Expose the OTP dev-code toggle to client bundles. The value is resolved at
  // build time from PLATFORM_OTP_RETURN_DEV_CODE so that client components can
  // conditionally render the dev-code hint without a separate round-trip.
  env: {
    NEXT_PUBLIC_OTP_DEV_CODE_ENABLED: process.env.PLATFORM_OTP_RETURN_DEV_CODE ?? "false",
  },
};

export default function nextConfig(phase: string): NextConfig {
  return {
    ...baseConfig,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
