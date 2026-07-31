#!/usr/bin/env node
import {
  loadPackManifest,
  queryAll,
  syncPackPermissionGroups,
  TABLES,
} from "@runory/platform-core";

const PACK_IDS = ["crm-lite-pack", "sales-quote-pack", "fsm-pack"];

async function main() {
  const workspaces = await queryAll(
    `SELECT id, name FROM ${TABLES.workspaces}`,
  );
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
        console.error(
          `${workspace.name} ${packId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

await main();
