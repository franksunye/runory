/**
 * Fix customer-access command contracts for the dev workspace.
 *
 * This script:
 * 1. Updates the payment module installation version to match the current manifest
 * 2. Runs the full contract repair
 *
 * Usage: npx tsx scripts/fix-customer-access-contracts.mts
 */
import { execute, queryAll, TABLES } from "@runory/platform-core";
import { repairWorkspaceCommandContracts } from "@runory/platform-core";

async function main() {
  // 1. Find all workspaces
  const workspaces = await queryAll<{ id: string; name: string }>(
    `SELECT id, name FROM ${TABLES.workspaces}`,
  );

  if (workspaces.length === 0) {
    console.error("No workspaces found.");
    process.exit(1);
  }

  for (const ws of workspaces) {
    console.log(`\nProcessing workspace: ${ws.name} (${ws.id})`);

    // 2. Check for version mismatches in installations
    const installations = await queryAll<{ module_id: string; module_version: string }>(
      `SELECT module_id, module_version FROM ${TABLES.installations}
       WHERE workspace_id = ? AND status = 'installed'`,
      [ws.id],
    );

    console.log(`  Found ${installations.length} installed modules`);

    // 3. Fix the payment module version if needed
    // The current manifest is 0.2.0, but it was installed as 0.1.0
    const paymentInstall = installations.find((i) => i.module_id === "runory.payment");
    if (paymentInstall && paymentInstall.module_version !== "0.2.0") {
      console.log(`  Fixing runory.payment version: ${paymentInstall.module_version} → 0.2.0`);
      await execute(
        `UPDATE ${TABLES.installations} SET module_version = '0.2.0'
         WHERE workspace_id = ? AND module_id = 'runory.payment' AND status = 'installed'`,
        [ws.id],
      );
    }

    // 4. Run the full contract repair
    console.log(`  Running contract repair...`);
    try {
      const result = await repairWorkspaceCommandContracts(ws.id);
      console.log(`  ✓ Repaired ${result.repairedSources.length} source(s):`);
      for (const src of result.repairedSources) {
        console.log(`    - ${src.sourceKind}:${src.sourceId}@${src.sourceVersion}`);
      }
    } catch (err) {
      console.error(`  ✗ Repair failed:`, err);
      // Continue to next workspace
    }
  }

  console.log("\nDone! Customer access grants can now be issued.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
