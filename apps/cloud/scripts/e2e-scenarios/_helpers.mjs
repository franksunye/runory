/**
 * Shared helpers for E2E scenario scripts.
 *
 * Usage:
 *   import { assert, api, checkServer, printSummary, BASE_URL } from "./_helpers.mjs";
 */

export const BASE_URL = process.env.RUNORY_API_BASE ?? "http://localhost:3000";

let pass = 0;
let fail = 0;
const failures = [];

export function assert(cond, label) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

// Simple cookie jar for session persistence (opt-in via options.useCookies)
let cookieHeader = "";

async function api(path, method = "GET", body, options = {}) {
  const { useCookies = false } = options;
  const headers = {};
  if (useCookies && cookieHeader) headers["Cookie"] = cookieHeader;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  // Capture Set-Cookie for session persistence
  if (useCookies) {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      const parsed = setCookies
        .map((c) => c.split(";")[0])
        .join("; ");
      cookieHeader = parsed;
    }
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, headers: res.headers };
}

export { api };

export async function checkServer(baseUrl = BASE_URL) {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export function printSummary(scenario) {
  console.log(`\n=== ${scenario} Summary ===`);
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  if (failures.length > 0) {
    console.log("  Failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  return fail;
}

export function getFailCount() {
  return fail;
}
