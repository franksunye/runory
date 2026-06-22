#!/usr/bin/env node
// Build script for runory.customer 1.1.0 artifact.
//
// This script drives the SDK validate → scan → compile pipeline by delegating
// to vitest (which natively handles TypeScript imports across the workspace).
// The actual build logic lives in:
//   packages/sdk-testing/src/build-customer-v11.test.ts
//
// Usage: node build.mjs
//
import { execSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const sdkTestingDir = resolve(__dirname, "../../../packages/sdk-testing")

console.log("Building runory.customer 1.1.0 artifact via SDK pipeline...")
console.log(`  SDK test dir: ${sdkTestingDir}`)

try {
  execSync("npx vitest run src/build-customer-v11.test.ts", {
    stdio: "inherit",
    cwd: sdkTestingDir,
  })
  console.log("✓ Build complete. See dist/ for artifact files.")
} catch (err) {
  console.error("✗ Build failed:", err instanceof Error ? err.message : err)
  process.exit(1)
}
