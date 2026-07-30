/**
 * Shared helpers for business E2E walkthrough scripts.
 *
 * Extends the release-scenario helpers with:
 *  - Persona switching (POST /api/dev/persona)
 *  - Workspace context discovery
 *  - Command execution (POST /api/workspaces/{id}/commands/{type})
 *  - Record CRUD helpers
 *  - Timeline / planning / workflow / form query helpers
 *
 * Usage:
 *   import { api, switchPersona, executeCommand, ... } from "./_helpers.mjs";
 */

export const BASE_URL = process.env.RUNORY_API_BASE ?? "http://localhost:3000";

// ── Counters ──
let pass = 0;
let fail = 0;
const failures = [];

export function assert(cond, label) {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m\u2713\x1b[0m ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  \x1b[31m\u2717\x1b[0m ${label}`);
  }
}

export function getFailCount() {
  return fail;
}

export function getPassCount() {
  return pass;
}

export function getFailures() {
  return failures;
}

// ── Output helpers ──

export function section(title) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}`);
}

export function step(num, desc) {
  console.log(`\n[${num}] ${desc}`);
}

export function personaHeader(personaId, label) {
  console.log(`\n${"~".repeat(70)}`);
  console.log(`  Persona: ${label} (${personaId})`);
  console.log(`${"~".repeat(70)}`);
}

export function printSummary(scenarioName) {
  console.log(`\n${"-".repeat(70)}`);
  console.log(`  ${scenarioName} Summary`);
  console.log(`${"-".repeat(70)}`);
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  if (failures.length > 0) {
    console.log("  Failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  return fail;
}

export function resetCounters() {
  pass = 0;
  fail = 0;
  failures.length = 0;
}

export function printGrandSummary(scenarios) {
  console.log(`\n${"=".repeat(70)}`);
  console.log("  GRAND SUMMARY — Business E2E Walkthrough");
  console.log(`${"=".repeat(70)}`);
  let totalPass = 0;
  let totalFail = 0;
  let skippedBlocked = 0;
  for (const s of scenarios) {
    // Derive status when a caller only supplied pass/fail counts (backward
    // compatible). Explicit status (PASS/FAIL/SKIPPED/BLOCKED) takes priority.
    const status = s.status ?? (s.fail > 0 ? "FAIL" : "PASS");
    const isPass = status === "PASS";
    if (status === "SKIPPED" || status === "BLOCKED") skippedBlocked += 1;
    let mark;
    if (isPass) {
      mark = "\x1b[32m PASS \x1b[0m";
    } else if (status === "SKIPPED" || status === "BLOCKED") {
      mark = `\x1b[33m ${status} \x1b[0m`;
    } else {
      mark = "\x1b[31m FAIL \x1b[0m";
    }
    console.log(`  ${mark}  ${s.name} (${s.pass} passed, ${s.fail} failed, ${status})`);
    totalPass += s.pass;
    totalFail += s.fail;
    // A required scenario that did not PASS (SKIPPED/BLOCKED/FAIL) must never
    // allow the process to exit 0. If it recorded zero failures (e.g. a
    // missing prerequisite that was not asserted), force at least one so the
    // grand total can never be zero for a non-PASS scenario.
    if (!isPass && s.fail === 0) {
      totalFail += 1;
    }
  }
  const note = skippedBlocked > 0 ? ` (${skippedBlocked} skipped/blocked)` : "";
  console.log(`\n  Total: ${totalPass} passed, ${totalFail} failed${note}`);
  console.log(`  Overall: ${totalFail === 0 ? "\x1b[32mALL PASSED\x1b[0m" : "\x1b[31mHAS FAILURES\x1b[0m"}`);
  return totalFail;
}

// ── Cookie jar ──
let cookieHeader = "";

function parseSetCookies(setCookies) {
  if (!setCookies || setCookies.length === 0) return null;
  const parsed = setCookies.map((c) => c.split(";")[0]).join("; ");
  // Merge with existing cookies (don't overwrite unrelated cookies)
  if (cookieHeader) {
    const existing = new Map(cookieHeader.split("; ").map((c) => c.split("=")));
    for (const c of setCookies) {
      const [name, val] = c.split(";")[0].split("=");
      existing.set(name, val);
    }
    return Array.from(existing.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  return parsed;
}

// ── Core API call ──

async function api(path, method = "GET", body, options = {}) {
  const { useCookies = true, headers: extraHeaders = {} } = options;
  const headers = { ...extraHeaders };
  if (useCookies && cookieHeader) headers["Cookie"] = cookieHeader;
  if (body) headers["Content-Type"] = "application/json";
  headers["X-Requested-With"] = "XMLHttpRequest";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

  if (useCookies) {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const merged = parseSetCookies(setCookies);
    if (merged) cookieHeader = merged;
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

// ── Server / dev mode checks ──

export async function checkServer() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkDevMode() {
  const { status, json } = await api("/api/dev/persona", "GET");
  return status === 200 && json.personas != null;
}

// ── Persona switching ──

export const PERSONAS = {
  OWNER: "dev-local-owner",
  SALES_REP: "persona:sales-rep",
  SALES_MANAGER: "persona:sales-manager",
  DISPATCHER: "persona:dispatcher",
  TECHNICIAN: "persona:technician",
  TECHNICIAN_JAMES: "persona:technician-james",
  TECHNICIAN_MARIA: "persona:technician-maria",
  SUPERVISOR: "persona:supervisor",
};

export const PERSONA_LABELS = {
  "dev-local-owner": "Workspace Owner",
  "persona:sales-rep": "Sarah Chen (Sales Rep)",
  "persona:sales-manager": "Michael Torres (Sales Manager)",
  "persona:dispatcher": "Lisa Wang (Dispatcher)",
  "persona:technician": "David Park (Technician)",
  "persona:technician-james": "James Wilson (Technician)",
  "persona:technician-maria": "Maria Garcia (Technician)",
  "persona:supervisor": "Robert Kim (Supervisor)",
};

export async function switchPersona(personaId) {
  const { status, json } = await api("/api/dev/persona", "POST", { personaId });
  if (status !== 200) {
    throw new Error(`Failed to switch persona to ${personaId}: ${json.error?.message ?? status}`);
  }
  return json.data;
}

export async function getCurrentPersona() {
  const { json } = await api("/api/dev/persona", "GET");
  return json.current;
}

// ── Workspace context ──

export async function getWorkspaceContext() {
  const { json } = await api("/api/auth/me", "GET");
  const workspaces = json.data?.workspaces ?? [];
  if (workspaces.length === 0) {
    throw new Error("No workspaces found. Run `pnpm reset` or `pnpm bootstrap:demo` first.");
  }
  // Find the Demo Workspace
  const demo = workspaces.find((w) => w.workspaceName === "Demo Workspace") ?? workspaces[0];
  return {
    workspaceId: demo.workspaceId ?? demo.id,
    workspaceSlug: demo.workspaceSlug ?? demo.slug,
    workspaceName: demo.workspaceName ?? demo.name,
  };
}

// ── Command execution ──

export async function executeCommand(workspaceId, commandType, body = {}) {
  const headers = {};
  // Generate idempotency key for CREATE commands
  const createCommands = [
    "quote.create_draft",
    "assignment.propose",
    "schedule.plan",
    "form_submission.save_draft",
    "form_submission.submit",
    "invoice.issue_from_work_order",
    "workflow.start",
  ];
  if (createCommands.includes(commandType)) {
    headers["idempotency-key"] = `e2e-${commandType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const { status, json } = await api(
    `/api/workspaces/${workspaceId}/commands/${commandType}`,
    "POST",
    body,
    { headers }
  );
  const ok = status === 200 && json.success !== false;
  if (!ok) {
    const errMsg = json.error?.message ?? json.error?.code ?? `HTTP ${status}`;
    console.log(`     [CMD ERROR] ${commandType}: ${errMsg}`);
    if (json.error?.code) {
      console.log(`     [CMD ERROR CODE] ${json.error.code}`);
    }
  }
  return { status, json, ok };
}

// ── Record helpers ──

export async function listRecords(workspaceId, objectKey, params = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) query.set(k, String(v));
  }
  const qs = query.toString();
  const { status, json } = await api(
    `/api/workspaces/${workspaceId}/objects/${objectKey}/records${qs ? `?${qs}` : ""}`,
    "GET"
  );
  return { status, records: json.data ?? [], json };
}

export async function getRecord(workspaceId, objectKey, recordId) {
  const { status, json } = await api(
    `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`,
    "GET"
  );
  return { status, record: json.data, json };
}

export async function createRecord(workspaceId, objectKey, data) {
  const { status, json } = await api(
    `/api/workspaces/${workspaceId}/objects/${objectKey}/records`,
    "POST",
    data
  );
  return { status, record: json.data, json };
}

export async function updateRecord(workspaceId, objectKey, recordId, data) {
  const { status, json } = await api(
    `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`,
    "PUT",
    data
  );
  return { status, record: json.data, json };
}

export function findRecord(records, field, value) {
  return records.find((r) => r[field] === value);
}

export function findRecordByDomain(records, domain) {
  return records.find((r) => r.domain === domain);
}

// ── Object metadata ──

export async function listObjects(workspaceId) {
  const { json } = await api(`/api/workspaces/${workspaceId}/objects`, "GET");
  return json.data ?? [];
}

export async function listPacks(workspaceId) {
  const { json } = await api(`/api/workspaces/${workspaceId}/packs`, "GET");
  return json.data ?? [];
}

export async function getNavigation(workspaceId) {
  const { json } = await api(`/api/workspaces/${workspaceId}/navigation`, "GET");
  return json.data?.items ?? [];
}

// ── Workflow helpers ──

export async function listWorkflowInstances(workspaceId, params = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) query.set(k, String(v));
  }
  const qs = query.toString();
  const { json } = await api(
    `/api/workspaces/${workspaceId}/workflows/instances${qs ? `?${qs}` : ""}`,
    "GET"
  );
  return json.data ?? [];
}

export async function getRecordWorkflow(workspaceId, objectKey, recordId) {
  const { json } = await api(
    `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}/workflow`,
    "GET"
  );
  return json.data;
}

// ── Work item helpers ──

export async function getMyWork(workspaceId) {
  const { json } = await api(`/api/workspaces/${workspaceId}/my-work`, "GET");
  return json.data?.items ?? [];
}

// ── Timeline ──

export async function getTimeline(workspaceId, subjectType, subjectId, limit = 50) {
  const { json } = await api(
    `/api/workspaces/${workspaceId}/timeline?subjectType=${subjectType}&subjectId=${subjectId}&limit=${limit}`,
    "GET"
  );
  return json.data?.entries ?? [];
}

// ── Planning entries ──

export async function getPlanningEntries(workspaceId, params = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) query.set(k, String(v));
  }
  const { json } = await api(
    `/api/workspaces/${workspaceId}/planning/entries?${query.toString()}`,
    "GET"
  );
  return json.data?.entries ?? [];
}

// ── Form helpers ──

export async function listFormDefinitions(workspaceId) {
  const { json } = await api(`/api/workspaces/${workspaceId}/forms/definitions`, "GET");
  return json.data ?? [];
}

export async function listFormSubmissions(workspaceId, params = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) query.set(k, String(v));
  }
  const qs = query.toString();
  const { json } = await api(
    `/api/workspaces/${workspaceId}/forms/submissions${qs ? `?${qs}` : ""}`,
    "GET"
  );
  return json.data ?? [];
}

// ── Visit execution requirements ──

export async function getVisitExecution(workspaceId, visitId) {
  const { json } = await api(
    `/api/workspaces/${workspaceId}/service-visits/${visitId}/execution`,
    "GET"
  );
  return json.data?.requirements ?? [];
}

// ── Audit ──

export async function getAuditEvents(workspaceId, params = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) query.set(k, String(v));
  }
  const { json } = await api(
    `/api/workspaces/${workspaceId}/audit-events?${query.toString()}`,
    "GET"
  );
  return json.data ?? [];
}

// ── Permission groups ──

export async function getPermissionGroups(workspaceId) {
  const { json } = await api(`/api/workspaces/${workspaceId}/permission-groups`, "GET");
  return json.data ?? [];
}

// ── Sleep ──

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Date helpers for scheduling ──

export function isoOffset(days, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
