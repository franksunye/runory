#!/usr/bin/env node
/**
 * Local Demo Stripe Connect setup for Workspace customer payments.
 *
 * Makes Demo Workspace Invoice → Request payment → Checkout work by:
 *   1. installing runory.payment
 *   2. mapping a charges_enabled Stripe connected account into the DB
 *   3. marking Connect onboarding complete + freshly synced
 *   4. aligning STRIPE_PAYMENT_WORKSPACE_ID / STRIPE_CONNECT_ACCOUNT_ID in .env.local
 *
 * Usage (from apps/cloud):
 *   pnpm stripe:payments:setup
 *   pnpm stripe:payments:verify
 */
import { resolve } from "node:path";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import Stripe from "stripe";
import {
  businessTable,
  execute,
  installModule,
  queryAll,
  queryOne,
  repairWorkspaceCommandContracts,
  updateConnectOnboardingStatus,
  upsertPaymentProviderAccount,
  getConnectProviderAccount,
  assertConnectReady,
} from "@runory/platform-core";

const command = process.argv[2] ?? "verify";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) throw new Error("Missing apps/cloud/.env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return envPath;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in .env.local`);
  return value;
}

async function resolveDemoWorkspaces() {
  const rows = await queryAll(
    `SELECT id, name, slug FROM saas_workspaces
     WHERE name = 'Demo Workspace'
     ORDER BY created_at DESC`,
  );
  if (rows.length === 0) {
    throw new Error(
      'No "Demo Workspace" found. Run `pnpm bootstrap:demo` with the dev server up first.',
    );
  }
  return rows;
}

async function resolveConnectedAccountId(stripe) {
  const configured = process.env.STRIPE_CONNECT_ACCOUNT_ID?.trim();
  if (configured) {
    const account = await stripe.accounts.retrieve(configured);
    if (!account.charges_enabled) {
      throw new Error(
        `STRIPE_CONNECT_ACCOUNT_ID=${configured} does not have charges_enabled=true.`,
      );
    }
    return account.id;
  }

  const listed = await stripe.accounts.list({ limit: 20 });
  const ready = listed.data.find((account) => account.charges_enabled);
  if (ready) return ready.id;

  throw new Error(
    "No charges_enabled Stripe connected account found. "
      + "Create/onboard a test connected account, set STRIPE_CONNECT_ACCOUNT_ID=acct_..., "
      + "then re-run setup. (Platform account alone is not enough for Direct Charges.)",
  );
}

function providerAccountIdFor(workspaceId, baseId, primaryWorkspaceId) {
  // Primary Demo keeps the env-stable id; additional demos get a deterministic suffix.
  if (workspaceId === primaryWorkspaceId) return baseId;
  return `${baseId}_${workspaceId.slice(-8)}`;
}

async function ensurePaymentModule(workspaceId) {
  try {
    await installModule(workspaceId, "runory.payment");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already installed|ALREADY_INSTALLED/i.test(message)) throw error;
  }
  await repairWorkspaceCommandContracts(workspaceId);
}

async function ensureConnectReadyAccount(workspaceId, providerAccountId, connectedAccountId) {
  const mode = process.env.STRIPE_PAYMENT_MODE ?? "test";
  if (mode !== "test") {
    throw new Error("Local payments setup only accepts STRIPE_PAYMENT_MODE=test");
  }

  const table = businessTable("payment_provider_account");
  const existing = await queryOne(
    `SELECT * FROM ${table} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, providerAccountId],
  );

  if (!existing) {
    // Orphan rows with the same id in another workspace would conflict — clear only local stale rows.
    const byId = await queryOne(`SELECT workspace_id FROM ${table} WHERE id = ?`, [providerAccountId]);
    if (byId && byId.workspace_id !== workspaceId) {
      await execute(`DELETE FROM ${table} WHERE id = ?`, [providerAccountId]);
    }
    await upsertPaymentProviderAccount({
      workspaceId,
      id: providerAccountId,
      provider: "stripe",
      mode,
      providerAccountRef: connectedAccountId,
    });
  } else if (existing.provider_account_ref !== connectedAccountId) {
    await execute(
      `UPDATE ${table}
       SET provider_account_ref = ?, status = 'active', disconnected_at = NULL, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`,
      [connectedAccountId, workspaceId, providerAccountId],
    );
  } else {
    await execute(
      `UPDATE ${table}
       SET status = 'active', disconnected_at = NULL, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, providerAccountId],
    );
  }

  await updateConnectOnboardingStatus(workspaceId, providerAccountId, "complete", {
    details_submitted: true,
    charges_enabled: true,
    payouts_enabled: true,
    requirements_status: "clear",
    requirements_json: null,
  });

  const account = await getConnectProviderAccount(workspaceId, mode);
  assertConnectReady(account);
  return account;
}

function patchEnvLocal(envPath, updates) {
  let content = readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) content = content.replace(pattern, line);
    else {
      content = `${content.trimEnd()}\n\n# Local Demo Workspace payments (stripe:payments:setup)\n${line}\n`;
    }
  }
  writeFileSync(envPath, content);
}

async function main() {
  const envPath = loadEnvLocal();
  const secretKey = required("STRIPE_SECRET_KEY");
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Local payments setup only accepts STRIPE_SECRET_KEY=sk_test_...");
  }
  const baseProviderAccountId = required("STRIPE_PAYMENT_PROVIDER_ACCOUNT_ID");
  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    appInfo: { name: "Runory Local Payments Setup", version: "0.9" },
  });

  const workspaces = await resolveDemoWorkspaces();
  const primary = workspaces[0];
  const connectedAccountId = await resolveConnectedAccountId(stripe);

  console.log(`\n=== Stripe payments ${command} ===\n`);
  console.log(`Connected account: ${connectedAccountId}`);
  console.log(`Primary Demo: ${primary.id} (${primary.slug})`);
  console.log(`All demos: ${workspaces.map((w) => w.id).join(", ")}\n`);

  for (const workspace of workspaces) {
    const providerAccountId = providerAccountIdFor(
      workspace.id,
      baseProviderAccountId,
      primary.id,
    );
    console.log(`→ ${workspace.slug} / ${providerAccountId}`);
    if (command === "setup") {
      await ensurePaymentModule(workspace.id);
      console.log("  ✓ runory.payment ready");
    }
    const account = await ensureConnectReadyAccount(
      workspace.id,
      providerAccountId,
      connectedAccountId,
    );
    console.log(
      `  ✓ Connect ready (charges=${Boolean(account.charges_enabled)}, ref=${account.provider_account_ref})`,
    );
  }

  if (command === "setup") {
    patchEnvLocal(envPath, {
      STRIPE_PAYMENT_WORKSPACE_ID: primary.id,
      STRIPE_CONNECT_ACCOUNT_ID: connectedAccountId,
      STRIPE_PAYMENT_MODE: process.env.STRIPE_PAYMENT_MODE?.trim() || "test",
    });
    console.log("\nUpdated .env.local:");
    console.log(`  STRIPE_PAYMENT_WORKSPACE_ID=${primary.id}`);
    console.log(`  STRIPE_CONNECT_ACCOUNT_ID=${connectedAccountId}`);
  }

  const verified = await getConnectProviderAccount(primary.id, "test");
  assertConnectReady(verified);
  console.log("\n✓ Demo Workspace customer-payment path is Connect-ready");
  console.log("  Next: restart `pnpm dev` if it was already running, then Request payment on an issued Invoice.");
  console.log("  Settle/webhook (optional):");
  console.log("    stripe listen --forward-to localhost:3000/api/integrations/stripe/connect-webhook \\\n"
    + "      --events checkout.session.completed,payment_intent.succeeded,charge.refunded,account.updated\n");
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
