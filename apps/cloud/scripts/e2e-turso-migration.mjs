#!/usr/bin/env node
/**
 * E2E verification for Turso migration (better-sqlite3 → @libsql/client).
 *
 * Tests the full stack: API routes → async lib functions → @libsql/client → SQLite.
 * Setup operations (workspace/pack) use API directly; agent operations respect
 * the project rule of using MCP tools when operating Runory in production.
 *
 * Usage: node scripts/e2e-turso-migration.mjs
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
  const json = await res.json();
  return { status: res.status, json };
}

async function main() {
  console.log("=== Runory E2E: Turso Migration Verification ===\n");

  // ── 1. Health ──
  console.log("[1] Health check");
  {
    const { json } = await api("/api/health");
    assert(json.success === true, "health endpoint returns success");
  }

  // ── 2. Create workspace ──
  console.log("\n[2] Create workspace");
  let workspaceId;
  {
    const { status, json } = await api("/api/workspaces", "POST", {
      name: `E2E Turso Test ${Date.now()}`,
    });
    assert(status === 201, "workspace created (201)");
    assert(json.data?.id != null, "workspace has id");
    workspaceId = json.data?.id;
  }
  if (!workspaceId) {
    console.log("\nFATAL: No workspace ID, aborting.");
    process.exit(1);
  }

  // ── 3. Install CRM Lite pack ──
  console.log("\n[3] Install CRM Lite pack");
  {
    const { status, json } = await api(
      `/api/workspaces/${workspaceId}/packs/crm-lite-pack/install`,
      "POST"
    );
    assert(status === 201 || status === 200, `pack installed (${status})`);
    assert(json.success === true, "install returns success");
  }

  // ── 4. Verify objects exist ──
  console.log("\n[4] Verify objects (customer, contact)");
  {
    const { json } = await api(`/api/workspaces/${workspaceId}/objects`);
    const objects = json.data || [];
    assert(objects.length >= 2, `≥2 objects installed (got ${objects.length})`);
    assert(objects.some((o) => o.objectKey === "customer"), "customer object exists");
    assert(objects.some((o) => o.objectKey === "contact"), "contact object exists");
  }

  // ── 5. Verify customer fields ──
  console.log("\n[5] Verify customer schema");
  {
    const { json } = await api(`/api/workspaces/${workspaceId}/objects/customer`);
    const fields = json.data?.fields || [];
    assert(fields.length >= 3, `≥3 customer fields (got ${fields.length})`);
    assert(fields.some((f) => f.fieldKey === "name"), "customer.name field exists");
  }

  // ── 6. Create customer record ──
  console.log("\n[6] Create customer record");
  {
    const { status, json } = await api(
      `/api/workspaces/${workspaceId}/objects/customer/records`,
      "POST",
      { name: "Acme Corp", email: "info@acme.com", phone: "555-0100" }
    );
    assert(status === 201, `customer created (${status})`);
    assert(json.data?.id != null, "record has id");
  }

  // ── 7. List customer records ──
  console.log("\n[7] List customer records");
  {
    const { json } = await api(
      `/api/workspaces/${workspaceId}/objects/customer/records`
    );
    const records = json.data || [];
    assert(records.length >= 1, `≥1 customer record (got ${records.length})`);
    assert(
      records.some((r) => r.name === "Acme Corp"),
      "Acme Corp record found"
    );
  }

  // ── 8. Extension plan ──
  console.log("\n[8] Submit extension plan");
  const plan = {
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
  {
    const { json } = await api(
      `/api/workspaces/${workspaceId}/agent/plan`,
      "POST",
      plan
    );
    assert(json.success === true, "plan validation succeeds");
    assert(json.data?.valid === true, "plan is valid");
  }

  // ── 9. Extension preview ──
  console.log("\n[9] Preview extension diff");
  {
    const { json } = await api(
      `/api/workspaces/${workspaceId}/agent/preview`,
      "POST",
      plan
    );
    assert(json.success === true, "preview succeeds");
    assert(
      json.data?.addedFields?.length >= 1,
      "preview shows added fields"
    );
  }

  // ── 10. Apply extension ──
  console.log("\n[10] Apply extension");
  let extensionId;
  {
    const { json } = await api(
      `/api/workspaces/${workspaceId}/agent/apply`,
      "POST",
      { plan, createdBy: "e2e-test" }
    );
    assert(json.success === true, "apply succeeds");
    extensionId = json.data?.extensionId;
    assert(extensionId != null, "extension has id");
  }

  // ── 11. Verify extension field appears ──
  console.log("\n[11] Verify extension field in schema");
  {
    const { json } = await api(`/api/workspaces/${workspaceId}/objects/customer`);
    const fields = json.data?.fields || [];
    assert(
      fields.some((f) => f.fieldKey === "tier"),
      "tier field appears in customer schema"
    );
  }

  // ── 12. Rollback extension ──
  console.log("\n[12] Rollback extension");
  {
    const { json } = await api(
      `/api/workspaces/${workspaceId}/agent/rollback`,
      "POST",
      { extensionId, rolledBy: "e2e-test" }
    );
    assert(json.success === true, "rollback succeeds");
  }

  // ── 13. Verify extension field removed ──
  console.log("\n[13] Verify extension field removed after rollback");
  {
    const { json } = await api(`/api/workspaces/${workspaceId}/objects/customer`);
    const fields = json.data?.fields || [];
    assert(
      !fields.some((f) => f.fieldKey === "tier"),
      "tier field removed after rollback"
    );
  }

  // ── 14. Audit log ──
  console.log("\n[14] Verify audit log");
  {
    const { json } = await api(`/api/workspaces/${workspaceId}/audit`);
    const logs = json.data || [];
    assert(logs.length >= 2, `≥2 audit entries (got ${logs.length})`);
    assert(
      logs.some((l) => l.action?.includes("apply") || l.action?.includes("apply_extension")),
      "audit has apply entry"
    );
    assert(
      logs.some((l) => l.action?.includes("rollback") || l.action?.includes("rollback_extension")),
      "audit has rollback entry"
    );
  }

  // ── 15. Export workspace ──
  console.log("\n[15] Export workspace");
  {
    const { json } = await api(
      `/api/workspaces/${workspaceId}/export`,
      "POST"
    );
    assert(json.success === true, "export succeeds");
    assert(json.data != null, "export returns data");
    assert(
      json.data?.objects?.length >= 2 || json.data?.records != null,
      "export contains objects/records"
    );
  }

  // ── Summary ──
  console.log("\n=== Summary ===");
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  if (failures.length > 0) {
    console.log("  Failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E test crashed:", e);
  process.exit(1);
});
