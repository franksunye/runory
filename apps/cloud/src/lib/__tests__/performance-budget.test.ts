// ─────────────────────────────────────────────────────────────────────────────
// Performance budget test — v0.5.1 Mobile Field-Work Spec §5.7
// ─────────────────────────────────────────────────────────────────────────────
//
// §5.7 requires: "mobile-shell initial JS <= 220 KB gzip, excluding lazy
// form/map/upload features".
//
// This test reads the Next.js build manifest and measures the gzipped size of
// the mobile-shell JS bundle (the framework/runtime chunks plus the /m layout
// route chunk, excluding lazy chunks). It skips gracefully when no production
// build is present (e.g. during local dev where the manifest is empty) so it
// does not block development, while acting as a real gate in CI production
// builds.
//
// Acceptance gate #12: "Performance budgets in Section 5.7 are measured and met
// or explicitly waived before the pilot."
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gzipSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLOUD_ROOT = path.resolve(__dirname, "..", "..", "..");

/** §5.7 budget for the mobile-shell initial JS, in gzip bytes. */
const MOBILE_SHELL_JS_BUDGET_BYTES = 220 * 1024; // 220 KB

interface BuildManifest {
  polyfillFiles?: string[];
  devFiles?: string[];
  lowPriorityFiles?: string[];
  rootMainFiles?: string[];
  rootMainFilesTree?: Record<string, unknown>;
  pages?: Record<string, string[]>;
  ampFirstPages?: string[];
}

interface AppBuildManifest {
  pages?: Record<string, string[]>;
}

/**
 * Locate the most relevant build manifest. Production builds emit to `.next`;
 * the dev server emits to `.next-dev`. We only enforce the JS budget on
 * production builds — dev builds contain unminified chunks and are not
 * representative of the shipped bundle size.
 */
function findBuildManifestDirs(): string[] {
  const candidates = [
    path.join(CLOUD_ROOT, ".next"),
  ];
  return candidates.filter((dir) => existsSync(dir));
}

function readJsonIfExists(filePath: string): unknown | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

/** Resolve a build-manifest chunk path to an absolute file on disk. */
function resolveChunkFile(buildDir: string, chunk: string): string {
  // Build manifest paths are relative to the build dir, e.g.
  // "static/chunks/app/m/layout-abc.js".
  return path.join(buildDir, chunk);
}

/** Return the gzipped byte length of a file, or 0 if it is missing. */
function gzipSize(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const buf = readFileSync(filePath);
  return gzipSync(buf).length;
}

/**
 * Determine the set of JS files that constitute the mobile-shell initial bundle.
 *
 * Per §5.7, this excludes lazy form/map/upload chunks. We include:
 *   - polyfill files
 *   - root main files (App Router runtime/framework chunks)
 *   - the /m layout route chunk (from app-build-manifest)
 * and exclude lowPriorityFiles (manifests) and obviously lazy chunks.
 */
function collectMobileShellFiles(
  buildDir: string,
  buildManifest: BuildManifest,
  appManifest: AppBuildManifest,
): string[] {
  const files: string[] = [];

  // Shared polyfills + framework runtime — loaded by every route.
  for (const f of buildManifest.polyfillFiles ?? []) {
    files.push(resolveChunkFile(buildDir, f));
  }
  for (const f of buildManifest.rootMainFiles ?? []) {
    files.push(resolveChunkFile(buildDir, f));
  }

  // Route-specific chunks for the mobile shell (/m and nested /m/* layouts).
  // We intentionally pick up the /m layout chunk but NOT deep lazy routes
  // (form renderer, map, upload) which are code-split and loaded on demand.
  const routePages = appManifest.pages ?? {};
  for (const [route, chunks] of Object.entries(routePages)) {
    if (route === "/m" || route === "/m/layout" || route.startsWith("/m/")) {
      // Only include the layout/shared chunks (not per-page lazy chunks). The
      // layout chunk filename contains "layout"; per-page work chunks are lazy.
      for (const chunk of chunks ?? []) {
        if (/layout|_app|_not-found/i.test(chunk)) {
          files.push(resolveChunkFile(buildDir, chunk));
        }
      }
    }
  }

  // De-duplicate while preserving order.
  return Array.from(new Set(files));
}

describe("mobile-shell JS performance budget (v0.5.1 Spec §5.7)", () => {
  const buildDirs = findBuildManifestDirs();

  const buildDir = buildDirs[0];
  const buildManifest = buildDir
    ? (readJsonIfExists(path.join(buildDir, "build-manifest.json")) as
        | BuildManifest
        | undefined)
    : undefined;
  const appManifest = buildDir
    ? (readJsonIfExists(path.join(buildDir, "app-build-manifest.json")) as
        | AppBuildManifest
        | undefined)
    : undefined;

  const hasProductionBuild =
    !!buildDir &&
    !!buildManifest &&
    !!appManifest &&
    (buildManifest.rootMainFiles?.length ?? 0) > 0;

  it.skipIf(!hasProductionBuild)(
    "mobile-shell initial JS (gzip) is within the 220 KB budget",
    () => {
      assertBuildArtifacts(buildDir, buildManifest, appManifest);

      const shellFiles = collectMobileShellFiles(
        buildDir!,
        buildManifest!,
        appManifest!,
      );

      // If the dev build present has no mobile shell chunks, fail loudly rather
      // than silently passing — the gate must be exercised on a real build.
      const existing = shellFiles.filter((f) => existsSync(f));
      expect(
        existing.length,
        "Expected at least one mobile-shell JS chunk to measure. Run `pnpm --filter @runory/cloud build` first.",
      ).toBeGreaterThan(0);

      const totalGzipBytes = existing.reduce((sum, f) => sum + gzipSize(f), 0);
      const totalGzipKB = totalGzipBytes / 1024;

      // eslint-disable-next-line no-console
      console.info(
        `[perf-budget] mobile-shell initial JS = ${totalGzipKB.toFixed(1)} KB gzip across ${existing.length} chunk(s) — budget 220 KB`,
      );

      expect(
        totalGzipBytes,
        `Mobile-shell JS gzip size ${totalGzipKB.toFixed(1)} KB exceeds the 220 KB budget (§5.7).`,
      ).toBeLessThanOrEqual(MOBILE_SHELL_JS_BUDGET_BYTES);
    },
  );

  it("skips with a message when no production build manifest exists", () => {
    if (hasProductionBuild) {
      // A build exists; the budget test above covers it. Nothing to assert here.
      return;
    }
    // eslint-disable-next-line no-console
    console.info(
      "[perf-budget] No production build manifest found (.next/build-manifest.json with rootMainFiles). " +
        "Skipping mobile-shell JS budget check. Run `pnpm --filter @runory/cloud build` to enable it.",
    );
    expect(true).toBe(true);
  });
});

function assertBuildArtifacts(
  buildDir: string | undefined,
  buildManifest: BuildManifest | undefined,
  appManifest: AppBuildManifest | undefined,
): void {
  if (!buildDir) {
    throw new Error("No build directory found");
  }
  if (!buildManifest) {
    throw new Error(`build-manifest.json missing in ${buildDir}`);
  }
  if (!appManifest) {
    throw new Error(`app-build-manifest.json missing in ${buildDir}`);
  }
}

// Guard so the helper is considered used even when the budget test is skipped.
void statSync;
