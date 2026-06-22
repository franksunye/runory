#!/usr/bin/env node
/**
 * E2E Scenario B — Governed Workspace Extension
 *
 * Agent proposes customer tier field → Diff preview → Workspace Admin approval
 * → Apply → UI update → Audit → rollback point verified
 *
 * Usage: node scripts/e2e-scenarios/scenario-b-extension.mjs
 * Prereq: dev server running (pnpm dev:cloud)
 */

const API = process.env.RUNORY_API_BASE ?? "http://localhost:3000";

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

async function api(path, method = "GET", body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function checkServer() {
  try {
    const res = await fetch(`${API}/api/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

const EXTENSION_PLAN = {
  name: "VIP Customer Tier",
  description: "Add a tier field to customer for VIP classification",
  targetModules: ["runory.customer"],
  riskLevel: "low",
  customFields: [
    {
      targetObject: "customer",
      fieldKey: "tier",
      label: "Customer Tier",
      type: "select",
      ownership: "workspace_extension",
      validation: { options: ["bronze", "silver", "gold", "platinum"] },
      ui: { listColumn: true, slot: "after:email", order: 30 },
    },
  ],
};

async function main() {
  console.log("=== Runory E2E Scenario B: Governed Workspace Extension ===\n");

  if (!(await checkServer())) {
    console.log("FATAL: Dev server is not running at", API);
    console.log("Start it with: pnpm dev:cloud");
    process.exit(1);
  }

  // ── 1. Create workspace + install CRM Lite ──
  console.log("[1] Create workspace and install CRM Lite");
  let workspaceId;
  {
    const { status, json } = await api("/api/workspaces", "POST", {
      name: `E2E Scenario B ${Date.now()}`,
    });
    assert(status === 201, `workspace created (got ${status})`);
    workspaceId = json.data?.id;
    assert(workspaceId != null, "workspace has id");
  }
  if (!workspaceId) {
    console.log("\nFATAL: No workspace ID, aborting.");
    process.exit(1);
  }
  {
    const { status } = await api(
      `/api/workspaces/${workspaceId}/packs/crm-lite-pack/install`,
      "POST"
    );
    assert(status === 201 || status === 200, `CRM Lite installed (${status})`);
  }

  // ── 2. Submit extension plan ──
  console.log("\n[2] Submit extension plan (Agent proposes tier field)");
  {
    const { status, json } = await api(
      `/api/workspaces/${workspaceId}/agent/plan`,
      "POST",
      EXTENSION_PLAN
    );
    assert(status === 200, `plan validation returns 200 (got ${status})`);
    assert(json.success === true, "plan validation succeeds");
    assert(json.data?.valid === true, "plan is valid");
  }

  // ── 3. Preview diff ──
  console.log("\n[3] Preview extension diff");
  {
    const { status, json } = await api(
      `/api/workspaces/${workspaceId}/agent/preview`,
      "POST",
      EXTENSION_PLAN
    );
    assert(status === 200, `preview returns 200 (got ${status})`);
    assert(json.success === true, "preview succeeds");
    assert(
      json.data?.addedFields?.length >= 1,
      "preview shows ≥1 added field"
    );
  }

  // ── 4. Apply extension (Admin approval) ──
  console.log("\n[4] Apply extension (Admin approval)");
  let extensionId;
  {
    const { status, json } = await api(
      `/api/workspaces/${workspaceId}/agent/apply`,
      "POST",
      { plan: EXTENSION_PLAN, createdBy: "e2e-scenario-b" }
    );
    assert(status === 201, `apply returns 201 (got ${status})`);
    assert(json.success === true, "apply succeeds");
    extensionId = json.data?.extensionId;
    assert(extensionId != null, "extension has id");
  }

  // ── 5. Verify field appears in schema (UI update) ──
  console.log("\n[5] Verify tier field appears in customer schema");
  {
    const { json } = await api(
      `/api/workspaces/${workspaceId}/objects/customer`
    );
    const fields = json.data?.fields ?? [];
    assert(
      fields.some((f) => f.fieldKey === "tier"),
      "tier field appears in customer schema after apply"
    );
  }

  // ── 6. Check audit log for extension.apply ──
  console.log("\n[6] Check audit log for extension.apply event");
  {
    const { json } = await api(`/api/workspaces/${workspaceId}/audit`);
    const logs = json.data ?? [];
    assert(logs.length >= 1, `≥1 audit entry (got ${logs.length})`);
    assert(
      logs.some((l) => l.action?.includes("apply")),
      "audit log contains extension.apply event"
    );
  }

  // ── 7. Rollback extension ──
  console.log("\n[7] Rollback extension (rollback point verified)");
  {
    const { status, json } = await api(
      `/api/workspaces/${workspaceId}/agent/rollback`,
      "POST",
      { extensionId, rolledBy: "e2e-scenario-b" }
    );
    assert(status === 200, `rollback returns 200 (got ${status})`);
    assert(json.success === true, "rollback succeeds");
  }

  // ── 8. Verify field removed after rollback ──
  console.log("\n[8] Verify tier field removed after rollback");
  {
    const { json } = await api(
      `/api/workspaces/${workspaceId}/objects/customer`
    );
    const fields = json.data?.fields ?? [];
    assert(
      !fields.some((f) => f.fieldKey === "tier"),
      "tier field removed after rollback"
    );
  }

  // ── 9. Check audit log has rollback event ──
  console.log("\n[9] Check audit log for rollback event");
  {
    const { json } = await api(`/api/workspaces/${workspaceId}/audit`);
    const logs = json.data ?? [];
    assert(
      logs.some((l) => l.action?.includes("rollback")),
      "audit log contains extension.rollback event"
    );
  }

  // ── Summary ──
  console.log("\n=== Scenario B Summary ===");
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  if (failures.length > 0) {
    console.log("  Failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Scenario B crashed:", e);
  process.exit(1);
});
