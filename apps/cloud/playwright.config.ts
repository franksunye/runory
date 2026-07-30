import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

function gitValue(args: string[], fallback: string | boolean) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

const commit = gitValue(["rev-parse", "HEAD"], "unknown");
const workingTreeDirty = String(gitValue(
  ["status", "--porcelain", "--untracked-files=no"],
  true,
)).length > 0;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results/e2e/browser-artifacts",
  metadata: {
    evidenceLayer: "automated_browser_e2e",
    commit,
    workingTreeDirty,
    apiResultPath: process.env.RUNORY_E2E_RESULT_PATH ?? null,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/e2e/browser-report.json" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.RUNORY_API_BASE ?? "http://localhost:3000",
    trace: "on",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
