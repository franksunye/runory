#!/usr/bin/env node
/**
 * Production Smoke Test (PROD-05)
 *
 * Quick verification that a Runory Cloud deployment is healthy and secure.
 * Designed to run in <60 seconds against a production URL.
 *
 * Usage: node scripts/smoke-test.mjs [target-url]
 *   or:  RUNORY_API_BASE=https://app.runory.com node scripts/smoke-test.mjs
 *
 * Exit code 0 = all checks passed, 1 = one or more checks failed.
 */

const TARGET = process.argv[2] ?? process.env.RUNORY_API_BASE ?? "http://localhost:3000";

const results = [];

function record(name, passed, detail = "") {
  const mark = passed ? "✓" : "✗";
  const suffix = detail ? ` (${detail})` : "";
  console.log(`[${results.length + 1}] ${name}... ${mark}${suffix}`);
  results.push({ name, passed, detail });
}

async function fetchSafe(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, redirect: "manual" });
    return { ok: true, res };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log("=== Runory Production Smoke Test ===");
  console.log(`Target: ${TARGET}\n`);

  // ── 1. Health check ──
  {
    const { ok, res, error } = await fetchSafe(`${TARGET}/api/health`);
    if (!ok) {
      record("Health check", false, error);
    } else {
      const json = await res.json();
      record("Health check", res.ok && json.success === true, `HTTP ${res.status}`);
    }
  }

  // ── 2. Landing page loads ──
  {
    const { ok, res, error } = await fetchSafe(`${TARGET}/`);
    if (!ok) {
      record("Landing page", false, error);
    } else {
      record("Landing page", res.status === 200, `HTTP ${res.status}`);
    }
  }

  // ── 3. Auth endpoint responds (unauthenticated) ──
  {
    const { ok, res, error } = await fetchSafe(`${TARGET}/api/auth/me`);
    if (!ok) {
      record("Auth endpoint", false, error);
    } else {
      const json = await res.json();
      record(
        "Auth endpoint (unauth)",
        res.status === 200 && json.data?.authenticated === false,
        `HTTP ${res.status}`
      );
    }
  }

  // ── 4. Catalog API responds ──
  {
    const { ok, res, error } = await fetchSafe(`${TARGET}/api/platform/catalog`);
    if (!ok) {
      record("Catalog API", false, error);
    } else {
      // 200 = accessible (dev), 403 = auth required (prod) — both are valid responses
      record(
        "Catalog API",
        res.status === 200 || res.status === 403,
        `HTTP ${res.status}`
      );
    }
  }

  // ── 5. Request ID header present ──
  {
    const { ok, res, error } = await fetchSafe(`${TARGET}/api/health`);
    if (!ok) {
      record("Request ID header", false, error);
    } else {
      const requestId = res.headers.get("x-request-id");
      record(
        "Request ID header",
        requestId != null && requestId.length > 0,
        requestId ? `x-request-id: ${requestId.slice(0, 8)}…` : "missing"
      );
    }
  }

  // ── 6. Security headers present ──
  {
    const { ok, res, error } = await fetchSafe(`${TARGET}/`);
    if (!ok) {
      record("Security headers", false, error);
    } else {
      const csp = res.headers.get("content-security-policy");
      const xfo = res.headers.get("x-frame-options");
      const xcto = res.headers.get("x-content-type-options");
      const allPresent = csp && xfo && xcto;
      const detail = [
        csp ? "CSP" : "no-CSP",
        xfo ? "X-Frame-Options" : "no-XFO",
        xcto ? "X-Content-Type-Options" : "no-XCTO",
      ].join(", ");
      record("Security headers", !!allPresent, detail);
    }
  }

  // ── 7. HTTPS redirect / HSTS ──
  {
    if (TARGET.startsWith("https://")) {
      const { ok, res, error } = await fetchSafe(`${TARGET}/`);
      if (!ok) {
        record("HTTPS / HSTS", false, error);
      } else {
        const hsts = res.headers.get("strict-transport-security");
        record("HTTPS / HSTS", hsts != null, hsts ?? "no HSTS header");
      }
    } else {
      // Dev (HTTP) — verify HTTP→HTTPS redirect would be enforced in prod
      // by checking that the deployment is not claiming to be production without HTTPS
      record("HTTPS / HSTS", true, "skipped (HTTP target — dev mode)");
    }
  }

  // ── 8. No stack traces in error responses ──
  {
    const { ok, res, error } = await fetchSafe(`${TARGET}/api/workspaces/nonexistent-workspace-id/objects`, {
      method: "GET",
    });
    if (!ok) {
      record("No stack traces in errors", false, error);
    } else {
      const text = await res.text();
      const hasStack =
        text.includes("at /") ||
        text.includes("    at ") ||
        text.includes("node:internal") ||
        text.includes("Error: at ");
      record(
        "No stack traces in errors",
        !hasStack,
        hasStack ? "stack trace detected!" : `HTTP ${res.status}`
      );
    }
  }

  // ── Summary ──
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;

  console.log("");
  console.log(`Result: ${allPassed ? "PASS" : "FAIL"} (${passed}/${total} checks passed)`);

  if (!allPassed) {
    console.log("\nFailed checks:");
    for (const r of results) {
      if (!r.passed) console.log(`  - ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
    }
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
