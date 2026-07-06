#!/usr/bin/env node
/**
 * Bootstrap a demo workspace with CRM Lite + FSM packs and demo data.
 *
 * Usage: pnpm bootstrap:demo
 *
 * Calls the running dev server's API to create a workspace, install packs,
 * and load demo data. Provides a reproducible canonical demo journey.
 *
 * Prerequisites:
 *   - Dev server must be running: pnpm dev
 *   - Database must exist (auto-created on first server start)
 */
const BASE = process.env.RUNORY_API_BASE ?? "http://localhost:3000";
const WORKSPACE_NAME = "Demo Workspace";
const PACKS = [
  { id: "crm-lite-pack", label: "CRM Lite Pack" },
  { id: "fsm-pack", label: "FSM Pack" },
  { id: "sales-quote-pack", label: "Sales Quote Pack" },
];

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...opts.headers,
    },
  });
  const json = await res.json();
  return { ok: res.ok, json };
}

async function main() {
  console.log("\n=== Bootstrap Demo Workspace ===\n");
  console.log(`Target: ${BASE}\n`);

  // Check server is running
  try {
    await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error("✗ Dev server is not running. Start it with: pnpm dev");
    process.exit(1);
  }

  // Step 0: Seed the dev catalog so packs appear on the modules page.
  // Idempotent — skips items already imported. Required on a fresh database.
  console.log("Seeding dev catalog...");
  const seedRes = await fetchJson(`${BASE}/api/platform/catalog/seed`, { method: "POST" });
  if (seedRes.ok && seedRes.json.success) {
    const r = seedRes.json.data;
    console.log(`  ✓ Imported ${r.imported.length}, published ${r.published.length}, skipped ${r.skipped.length}`);
  } else {
    console.log(`  ⚠ Catalog seed skipped: ${seedRes.json.error?.message ?? "unknown"}`);
  }

  // Step 1: Create workspace
  console.log(`Creating workspace: "${WORKSPACE_NAME}"...`);
  const createRes = await fetchJson(`${BASE}/api/workspaces`, {
    method: "POST",
    body: JSON.stringify({ name: WORKSPACE_NAME }),
  });

  let workspaceId, workspaceSlug;
  if (createRes.ok && createRes.json.success) {
    workspaceId = createRes.json.data.id;
    workspaceSlug = createRes.json.data.slug;
    console.log(`  ✓ Workspace created: ${workspaceId} (slug: ${workspaceSlug})`);
  } else {
    console.error(`  ✗ Failed to create workspace:`, createRes.json);
    process.exit(1);
  }

  // Step 2: Install packs with demo data
  for (const pack of PACKS) {
    console.log(`\nInstalling ${pack.label}...`);
    const installRes = await fetchJson(
      `${BASE}/api/workspaces/${workspaceId}/packs/${pack.id}/install`,
      {
        method: "POST",
        body: JSON.stringify({ includeDemoData: true }),
      }
    );

    if (installRes.ok && installRes.json.success) {
      const result = installRes.json.data;
      console.log(`  ✓ Modules: ${result.modulesInstalled?.join(", ") || "none"}`);
      console.log(`  ✓ Objects: ${result.objectsCreated?.join(", ") || "none"}`);
      console.log(`  ✓ Demo data: ${result.demoRecordsCreated > 0 ? `${result.demoRecordsCreated} records loaded` : "not loaded"}`);
    } else {
      console.error(`  ✗ Failed to install ${pack.label}:`, installRes.json);
      // Continue with remaining packs
    }
  }

  // Step 3: Print access info
  console.log("\n=== Demo Workspace Ready ===\n");
  console.log(`Workspace ID:   ${workspaceId}`);
  console.log(`Workspace slug: ${workspaceSlug}`);
  console.log(`URL:            ${BASE}/w/${workspaceSlug}`);
  console.log(`\nPacks installed:`);
  for (const pack of PACKS) {
    console.log(`  - ${pack.label}`);
  }
}

main().catch((err) => {
  console.error("\nBootstrap failed:", err);
  process.exit(1);
});
