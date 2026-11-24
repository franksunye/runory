#!/usr/bin/env node
import {
  loadPackManifest,
  queryAll,
  syncPackPermissionGroups,
  TABLES,
} from "@runory/platform-core";

const PACK_IDS = ["crm-lite-pack", "sales-quote-pack", "fsm-pack"];

async function main() {
  if (process.env.RUNORY_ISOLATED_VERIFICATION === "true" && (
    !process.env.RUNORY_VERIFICATION_DATABASE_URL?.startsWith("file:")
    || process.env.LIBSQL_URL !== process.env.RUNORY_VERIFICATION_DATABASE_URL
    || Boolean(process.env.LIBSQL_AUTH_TOKEN)
  )) throw new Error("Refusing permission sync outside the isolated verification database");
  const workspaces = await queryAll(
    `SELECT id, name FROM ${TABLES.workspaces}`,
  );
  let failures = 0;
  for (const workspace of workspaces) {
    for (const packId of PACK_IDS) {
      try {
        const pack = loadPackManifest(packId);
        if (!pack.permissionGroups?.length) continue;
        const result = await syncPackPermissionGroups(
          workspace.id,
          packId,
          pack.permissionGroups,
        );
        console.log(`${workspace.name} ${packId}:`, result);
      } catch (error) {
        failures++;
        console.error(
          `${workspace.name} ${packId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  if (failures > 0) throw new Error(`Permission sync failed for ${failures} Workspace/Pack pairs`);
}

await main();
