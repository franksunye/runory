#!/usr/bin/env node
/**
 * Reset the local dev environment and bootstrap demo data in one command.
 *
 * Usage: pnpm reset
 *
 * What it does (one-shot):
 *   1. Deletes the SQLite database files (apps/cloud/data/*.db*)
 *   2. Cleans the .next build cache
 *   3. Starts the dev server (in this process — stays in foreground)
 *   4. Waits for the server to become healthy
 *   5. Seeds the catalog, creates a Demo Workspace, installs CRM Lite + FSM + Sales Quote packs with demo data
 *   6. Prints the workspace URL — start testing
 *   7. Press Ctrl+C to stop the server when done
 *
 * Prerequisites: pnpm install has been run.
 */
import { existsSync, unlinkSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLOUD_DATA = path.join(ROOT, "apps", "cloud", "data");
const CLOUD_NEXT = path.join(ROOT, "apps", "cloud", ".next");
const CLOUD_NEXT_DEV = path.join(ROOT, "apps", "cloud", ".next-dev");
const BASE = process.env.RUNORY_API_BASE ?? "http://localhost:3000";
const WORKSPACE_NAME = "Demo Workspace";
const PACKS = [
  { id: "crm-lite-pack", label: "CRM Lite Pack" },
  { id: "fsm-pack", label: "FSM Pack" },
  { id: "sales-quote-pack", label: "Sales Quote Pack" },
];

// ── Step 1 + 2: Clean slate ──

function deleteDbFiles() {
  if (!existsSync(CLOUD_DATA)) return 0;
  let n = 0;
  for (const f of readdirSync(CLOUD_DATA)) {
    if (f.endsWith(".db") || f.endsWith(".db-wal") || f.endsWith(".db-shm")) {
      unlinkSync(path.join(CLOUD_DATA, f));
      n++;
    }
  }
  return n;
}

function cleanBuildCache() {
  for (const dir of [CLOUD_NEXT, CLOUD_NEXT_DEV]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

// ── Step 3: Start dev server (foreground) ──

function startDevServer() {
  const child = spawn("pnpm", ["--filter", "@runory/cloud", "dev"], {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code) => process.exit(code ?? 0));
  return child;
}

// ── Step 4: Wait for health ──

async function waitForServer(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs / 1000}s`);
}

// ── Step 5: Bootstrap ──

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", ...opts.headers },
  });
  return { ok: res.ok, json: await res.json() };
}

async function bootstrap() {
  console.log("\n--- Bootstrapping demo data ---\n");

  // Seed catalog
  console.log("Seeding catalog...");
  const seedRes = await fetchJson(`${BASE}/api/platform/catalog/seed`, { method: "POST" });
  if (seedRes.ok && seedRes.json.success) {
    const r = seedRes.json.data;
    console.log(`  ✓ Imported ${r.imported.length}, published ${r.published.length}, skipped ${r.skipped.length}`);
  } else {
    console.log(`  ⚠ Catalog seed: ${seedRes.json.error?.message ?? "skipped"}`);
  }

  // Create workspace
  console.log(`\nCreating workspace: "${WORKSPACE_NAME}"...`);
  const createRes = await fetchJson(`${BASE}/api/workspaces`, {
    method: "POST",
    body: JSON.stringify({ name: WORKSPACE_NAME }),
  });
  if (!createRes.ok || !createRes.json.success) {
    throw new Error(`Failed to create workspace: ${createRes.json.error?.message ?? "unknown"}`);
  }
  const workspaceId = createRes.json.data.id;
  const workspaceSlug = createRes.json.data.slug;
  console.log(`  ✓ ${workspaceId} (slug: ${workspaceSlug})`);

  // Install packs with demo data
  for (const pack of PACKS) {
    console.log(`\nInstalling ${pack.label}...`);
    const res = await fetchJson(`${BASE}/api/workspaces/${workspaceId}/packs/${pack.id}/install`, {
      method: "POST",
      body: JSON.stringify({ includeDemoData: true }),
    });
    if (res.ok && res.json.success) {
      const r = res.json.data;
      console.log(`  ✓ Modules: ${r.modulesInstalled?.join(", ") || "none"}`);
      console.log(`  ✓ Demo records: ${r.demoRecordsCreated ?? 0}`);
    } else {
      console.error(`  ✗ Failed: ${res.json.error?.message ?? "unknown"}`);
    }
  }

  return { workspaceId, workspaceSlug };
}

// ── Main ──

async function main() {
  console.log("=== Reset Dev Environment ===\n");

  const deleted = deleteDbFiles();
  console.log(`✓ Deleted ${deleted} DB file(s)`);
  cleanBuildCache();
  console.log("✓ Cleaned .next build cache");

  console.log("\nStarting dev server (this stays in foreground)...");
  startDevServer();

  console.log("Waiting for server to be ready...");
  await waitForServer();
  console.log("✓ Server is healthy\n");

  const { workspaceSlug } = await bootstrap();

  console.log("\n========================================");
  console.log("  ✓ Dev environment ready!");
  console.log("========================================");
  console.log(`\n  Workspace URL: ${BASE}/w/${workspaceSlug}`);
  console.log("  (Dev auto-login is active via PLATFORM_DEV_BOOTSTRAP=true)\n");
  console.log("  Press Ctrl+C to stop the server.\n");
  // The dev server child keeps the process alive in foreground.
}

main().catch((err) => {
  console.error("\n✗ Reset failed:", err.message ?? err);
  process.exit(1);
});
