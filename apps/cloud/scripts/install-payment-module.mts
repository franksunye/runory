/**
 * Install runory.payment module and set up Stripe provider account.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  installModule,
  repairWorkspaceCommandContracts,
  upsertPaymentProviderAccount,
  queryOne,
  businessTable,
} from "@runory/platform-core";

// Load .env.local manually
const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  // Remove surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const WORKSPACE_ID = "ws_aa0d5970-efa2-40cd-b8c5-6a223bcc4fef";

async function main() {
  console.log("=== Payment Module Installation ===\n");

  // 1. Install payment module
  console.log("1. Installing runory.payment module...");
  try {
    await installModule(WORKSPACE_ID, "runory.payment");
    console.log("   ✓ Payment module installed");
  } catch (err: any) {
    if (err.message?.includes("already installed") || err.message?.includes("ALREADY_INSTALLED")) {
      console.log("   ✓ Payment module already installed");
    } else {
      throw err;
    }
  }

  // 2. Repair command contracts
  console.log("2. Repairing command contracts...");
  await repairWorkspaceCommandContracts(WORKSPACE_ID);
  console.log("   ✓ Contracts repaired");

  // 3. Check if payment_provider_account table exists and has records
  console.log("3. Checking payment_provider_account table...");
  let ppa: { id: string; status: string; provider_account_ref: string } | undefined;
  try {
    ppa = await queryOne<{ id: string; status: string; provider_account_ref: string }>(
      `SELECT id, status, provider_account_ref FROM ${businessTable("payment_provider_account")}
       WHERE workspace_id = ? AND provider = 'stripe' AND mode = 'test'`,
      [WORKSPACE_ID],
    );
    if (ppa) {
      console.log(`   ✓ Existing provider account: ${ppa.id} (status=${ppa.status}, ref=${ppa.provider_account_ref})`);
    } else {
      console.log("   ℹ No provider account found yet");
    }
  } catch (err: any) {
    console.log(`   ⚠ Table query failed: ${err.message}`);
  }

  // 4. Try to initialize provider account from env vars
  if (!ppa) {
    console.log("4. Initializing Stripe provider account from env vars...");
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    const workspaceId = process.env.STRIPE_PAYMENT_WORKSPACE_ID?.trim();
    const providerAccountId = process.env.STRIPE_PAYMENT_PROVIDER_ACCOUNT_ID?.trim();

    if (!secretKey || !workspaceId || !providerAccountId) {
      console.log("   ⚠ Stripe env vars not fully configured:");
      console.log(`     STRIPE_SECRET_KEY: ${secretKey ? "✓ set" : "✗ missing"}`);
      console.log(`     STRIPE_PAYMENT_WORKSPACE_ID: ${workspaceId ? "✓ set" : "✗ missing"}`);
      console.log(`     STRIPE_PAYMENT_PROVIDER_ACCOUNT_ID: ${providerAccountId ? "✓ set" : "✗ missing"}`);
      console.log("   Please add these to .env.local and restart the dev server.");
    } else {
      const mode = (process.env.STRIPE_PAYMENT_MODE ?? "test") as "test" | "live";
      const providerAccountRef = process.env.STRIPE_ACCOUNT_ID?.trim() || "stripe-platform-account";
      const account = await upsertPaymentProviderAccount({
        workspaceId: WORKSPACE_ID,
        id: providerAccountId,
        provider: "stripe",
        mode,
        providerAccountRef,
      });
      console.log(`   ✓ Provider account created: ${account.id} (status=${account.status})`);
    }
  }

  // 5. Verify tables exist
  console.log("\n5. Verifying payment tables...");
  const tables = ["payment_request", "payment", "refund", "payment_provider_account", "payment_provider_reference"];
  for (const t of tables) {
    try {
      await queryOne(`SELECT COUNT(*) as count FROM ${businessTable(t)} WHERE 1=0`, []);
      console.log(`   ✓ ${t} table exists`);
    } catch {
      console.log(`   ✗ ${t} table MISSING`);
    }
  }

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
