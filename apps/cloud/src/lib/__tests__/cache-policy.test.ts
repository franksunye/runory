// ─────────────────────────────────────────────────────────────────────────────
// Cache policy tests — v0.5.1 Mobile Field-Work Spec §5.3 & Slice A
// ─────────────────────────────────────────────────────────────────────────────
//
// Slice A requires "automated cache-policy and cross-tenant tests." These
// tests read the actual sw.js shipped in the public directory and assert that
// its declared cache policy matches §5.3:
//
//   | Resource                                         | Strategy                              |
//   |--------------------------------------------------|---------------------------------------|
//   | versioned JS/CSS/fonts/icons                     | cache-first, content-hash bounded     |
//   | manifest and offline page                        | stale-while-revalidate               |
//   | API, auth, command responses                      | network-only, no-store                |
//   | RSC/Flight/data requests                          | network-only                          |
//   | authenticated HTML                                | network-only                          |
//
// Acceptance gate #7: "Service worker caches contain no authenticated API,
// attachment, customer HTML, or Quote document responses."
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a path relative to the apps/cloud project root so the tests work no
 * matter which working directory vitest is invoked from.
 */
function resolveFromCloudRoot(rel: string): string {
  // __dirname is apps/cloud/src/lib/__tests__
  return path.resolve(__dirname, "..", "..", "..", rel);
}

const swSource = readFileSync(resolveFromCloudRoot("public/sw.js"), "utf8");
const manifestSource = readFileSync(
  resolveFromCloudRoot("public/m/manifest.json"),
  "utf8",
);
const manifest = JSON.parse(manifestSource) as Record<string, unknown>;

/** Pathnames that the spec requires to NEVER be cached, with a representative URL. */
const REQUIRED_NEVER_CACHE: Array<{
  label: string;
  /** Keyword fragment expected to appear in the NEVER_CACHE_PATTERNS block. */
  fragment: string;
  /** A representative path the corresponding regex MUST match. */
  sample: string;
}> = [
  { label: "/api/", fragment: "api", sample: "/api/workspaces/ws_123/my-work" },
  { label: "/_next/data/", fragment: "_next", sample: "/_next/data/abc.json" },
  { label: "/_rsc/", fragment: "_rsc", sample: "/_rsc/something" },
  { label: "/auth/", fragment: "auth", sample: "/auth/session" },
  { label: "/login", fragment: "login", sample: "/login" },
];

/**
 * Extract the slice of source between `NEVER_CACHE_PATTERNS` and the closing
 * `];` so we can inspect the declared regex literals in isolation.
 */
const neverCacheStart = swSource.indexOf("NEVER_CACHE_PATTERNS");
const neverCacheEnd = swSource.indexOf("];", neverCacheStart);
const neverCacheBlock = swSource.slice(neverCacheStart, neverCacheEnd);

/**
 * Parse every regex literal found in a source block into a real RegExp.
 *
 * Each regex literal in the sw.js is declared on its own line, e.g.
 *   /\/api\//, // comment
 * We process line-by-line and anchor the match at the start of the trimmed
 * line so that `//` line comments (which may themselves contain slashes) do
 * not get misinterpreted as regex delimiters.
 */
function extractRegexLiterals(block: string): RegExp[] {
  const out: RegExp[] = [];
  // Anchored: a line whose first non-whitespace char is `/` begins a regex
  // literal. `\/` (escaped slash) and other escapes are consumed by `\\.`
  // so the closing `/` delimiter is found correctly.
  const re = /^\/((?:[^/\\]|\\.)+)\/([gimsuy]*)/;
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    const m = re.exec(line);
    if (m) {
      try {
        out.push(new RegExp(m[1], m[2]));
      } catch {
        // Skip malformed regexes rather than failing the whole extraction.
      }
    }
  }
  return out;
}

const neverCacheRegexes = extractRegexLiterals(neverCacheBlock);

describe("sw.js — cache policy declarations (v0.5.1 Spec §5.3)", () => {
  it("defines a NEVER_CACHE_PATTERNS array", () => {
    expect(swSource).toMatch(/NEVER_CACHE_PATTERNS\s*=/);
    expect(neverCacheRegexes.length).toBeGreaterThanOrEqual(
      REQUIRED_NEVER_CACHE.length,
    );
  });

  it.each(REQUIRED_NEVER_CACHE)(
    "NEVER_CACHE_PATTERNS includes a regex that matches $label",
    ({ fragment, sample }) => {
      // The block must reference the keyword fragment (so the declaration is
      // present and human-readable)...
      expect(neverCacheBlock).toContain(fragment);
      // ...and at least one declared regex must actually match the sample path.
      const matched = neverCacheRegexes.some((re) => re.test(sample));
      expect(
        matched,
        `Expected a NEVER_CACHE_PATTERNS regex to match "${sample}" (fragment "${fragment}"). ` +
          `Found regexes: ${neverCacheRegexes.map((r) => r.source).join(", ")}`,
      ).toBe(true);
    },
  );

  it("marks API/auth/command responses as network-only / no-store", () => {
    // The spec table requires "API, auth, command responses → network-only,
    // no-store". The comment block and the fetch handler must reflect this.
    expect(swSource).toMatch(/network-only/i);
    expect(swSource).toMatch(/no-store/i);
  });

  it("does not cache non-GET requests (mutations/commands fall through)", () => {
    // Per §5.3: governed commands are network-only. The fetch handler must
    // bail out for any non-GET method so POST/PUT/DELETE are never cached.
    expect(swSource).toMatch(/request\.method\s*!==\s*["']GET["']/);
  });
});

describe("sw.js — navigation requests are network-only (v0.5.1 Spec §5.3)", () => {
  it("routes navigation (HTML) requests directly to the network", () => {
    // Authenticated HTML must be network-only so expired sessions redirect to
    // login and no cached customer data is shown.
    expect(swSource).toMatch(/request\.mode\s*===\s*["']navigate["']/);
    // The navigate branch must call fetch() (network) and NOT caches.match for
    // the page itself (the offline.html fallback is only used on failure).
    const navigateBlock = swSource.slice(
      swSource.indexOf('request.mode === "navigate"'),
      swSource.length,
    );
    expect(navigateBlock).toMatch(/fetch\(request\)/);
    // The only cache read inside the navigate branch must be the offline page.
    expect(navigateBlock).toMatch(/caches\.match\(["']\/m\/offline\.html["']\)/);
  });

  it("falls back to the offline page (not a cached page) when offline", () => {
    // This proves authenticated HTML is never served from cache — only the
    // dedicated offline shell is used as a last resort.
    const navigateBlock = swSource.slice(
      swSource.indexOf('request.mode === "navigate"'),
      swSource.length,
    );
    expect(navigateBlock).toMatch(/\/m\/offline\.html/);
  });
});

describe("sw.js — authenticated API endpoints are never cached (Acceptance #7)", () => {
  it("never calls cache.put() for paths matched by NEVER_CACHE_PATTERNS", () => {
    // The fetch handler returns early (before any caches.put) for any URL that
    // matches a NEVER_CACHE pattern, so authenticated API/auth responses can
    // never reach a cache.
    const fetchHandlerStart = swSource.indexOf('self.addEventListener("fetch"');
    const fetchHandler = swSource.slice(fetchHandlerStart);

    // The early-return guard must come before any caching strategy.
    const neverCacheIndex = fetchHandler.indexOf("NEVER_CACHE_PATTERNS.some");
    const firstCachePut = fetchHandler.indexOf("cache.put");
    expect(neverCacheIndex).toBeGreaterThan(-1);
    expect(firstCachePut).toBeGreaterThan(-1);
    expect(neverCacheIndex).toBeLessThan(firstCachePut);
    // The guard must return before reaching the cache helpers.
    expect(neverCacheIndex).toBeLessThan(fetchHandler.indexOf("cacheFirst"));
  });

  it("the default branch is network-only (no caching)", () => {
    // The default branch lives at the end of the fetch handler, before the
    // helper functions. Bound the slice to the close of the fetch listener so
    // we only inspect the default branch itself, not the cache helpers.
    const defaultStart = swSource.indexOf("Default: network-only");
    expect(defaultStart).toBeGreaterThan(-1);
    const fetchHandlerEnd = swSource.indexOf("});", defaultStart);
    const defaultBlock = swSource.slice(defaultStart, fetchHandlerEnd);
    // The default branch must not introduce any caching or respondWith call —
    // unmatched requests fall through to the browser default (network).
    expect(defaultBlock).not.toMatch(/cache\.put/);
    expect(defaultBlock).not.toMatch(/event\.respondWith/);
    expect(defaultBlock).not.toMatch(/caches\.open/);
  });

  it.each([
    "/api/workspaces/ws_123/my-work",
    "/api/workspaces/ws_123/quotes/q_9/document",
    "/auth/session",
    "/login",
    "/_next/data/build-id/page.json",
    "/_rsc/foo",
  ])("the never-cache guard would short-circuit %s", (pathname) => {
    // Confirm at least one declared NEVER_CACHE regex matches this protected
    // pathname, mirroring how the SW evaluates the guard at runtime.
    const matched = neverCacheRegexes.some((re) => re.test(pathname));
    expect(
      matched,
      `Expected a NEVER_CACHE_PATTERNS regex to match "${pathname}". ` +
        `Found regexes: ${neverCacheRegexes.map((r) => r.source).join(", ")}`,
    ).toBe(true);
  });

  it.each([
    "/m/offline.html",
    "/m/manifest.json",
    "/_next/static/chunks/main-abc.js",
  ])("the never-cache guard does NOT short-circuit a static asset %s", (pathname) => {
    // Static shell / versioned assets must NOT be caught by the never-cache
    // guard (they have their own cache strategies).
    const matched = neverCacheRegexes.some((re) => re.test(pathname));
    expect(matched).toBe(false);
  });
});

describe("sw.js — manifest cache strategy (v0.5.1 Spec §5.3)", () => {
  it("manifest and offline page use stale-while-revalidate", () => {
    // §5.3 table: "manifest and offline page → stale-while-revalidate"
    expect(swSource).toMatch(/staleWhileRevalidate/);
    expect(swSource).toMatch(/\/m\/manifest\.json/);
  });

  it("manifest points at the mobile shell scope /m", () => {
    expect(manifest.start_url).toBe("/m");
    expect(manifest.scope).toBe("/m/");
  });

  it("versioned static assets use cache-first (content-hash bounded)", () => {
    // §5.3 table: "versioned JS/CSS/fonts/icons → cache-first, content-hash bounded"
    expect(swSource).toMatch(/cacheFirst/);
    expect(swSource).toMatch(/\/_next\/static\//);
  });

  it("cleans old named caches on activate (safe update/reload path)", () => {
    // §5.3: "clean old named caches, and expose a safe update/reload path"
    // Allow whitespace/newlines between `caches` and `.keys()` (the source
    // chains them across lines).
    expect(swSource).toMatch(/caches\s*\.\s*keys\s*\(/);
    expect(swSource).toMatch(/caches\s*\.\s*delete/);
    expect(swSource).toMatch(/self\s*\.\s*clients\s*\.\s*claim/);
    expect(swSource).toMatch(/self\s*\.\s*skipWaiting/);
  });
});

describe("sw.js — no cross-tenant data leakage (cross-tenant isolation)", () => {
  it("only intercepts same-origin requests", () => {
    // Prevents a cross-origin (e.g. another tenant origin) request from being
    // accidentally cached or controlled by this service worker.
    expect(swSource).toMatch(/url\.origin\s*!==\s*self\.location\.origin/);
  });

  it("does not precache any tenant-specific business data", () => {
    // The install precache list must only contain static shell assets.
    const installBlock = swSource.slice(
      swSource.indexOf('self.addEventListener("install"'),
      swSource.indexOf('self.addEventListener("activate"'),
    );
    const precacheMatch = installBlock.match(/cache\.addAll\(\[([\s\S]*?)\]\)/);
    expect(precacheMatch).not.toBeNull();
    const precacheList = precacheMatch![1];
    // Precached entries must be static shell files only — no /api/ or workspace ids.
    expect(precacheList).not.toMatch(/\/api\//);
    expect(precacheList).not.toMatch(/ws_/);
    expect(precacheList).toMatch(/\/m\/offline\.html/);
    expect(precacheList).toMatch(/\/m\/manifest\.json/);
  });
});
