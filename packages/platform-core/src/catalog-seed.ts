import { readdirSync, existsSync } from "node:fs";
import { MODULES_DIR, PACKS_DIR, TEMPLATES_DIR } from "./contracts";
import { importFromDevCatalog, listCatalogVersions, getCatalogItemByName, freezeCatalogVersion } from "./catalog-registry";
import { promoteCatalogRelease, resolvePackLock } from "./catalog-release";
import type { Principal } from "./context";
import type { CatalogItemType } from "./catalog-registry";

// ── Seed Dev Catalog (v0.2.4) ──
//
// Imports all manifests from the repo catalog/ directory and publishes them
// through the full release pipeline (draft → ready → internal → beta → stable)
// so they appear on the workspace modules installation page.
//
// This is a development convenience — production deployments use the manual
// import/freeze/promote workflow via the admin UI.

interface SeedResult {
  imported: Array<{ itemId: string; itemType: CatalogItemType; versionId: string }>;
  published: Array<{ itemId: string; itemType: CatalogItemType; channel: string }>;
  skipped: Array<{ itemId: string; itemType: CatalogItemType; reason: string }>;
  errors: Array<{ itemId: string; itemType: CatalogItemType; error: string }>;
}

function listCatalogIds(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export async function seedDevCatalog(principal: Principal): Promise<SeedResult> {
  const result: SeedResult = { imported: [], published: [], skipped: [], errors: [] };

  // Collect all catalog items in dependency order: modules → packs → templates
  const moduleIds = listCatalogIds(MODULES_DIR);
  const packIds = listCatalogIds(PACKS_DIR);
  const templateIds = listCatalogIds(TEMPLATES_DIR);

  const allItems: Array<{ itemId: string; itemType: CatalogItemType }> = [
    ...moduleIds.map((id) => ({ itemId: id, itemType: "module" as const })),
    ...packIds.map((id) => ({ itemId: id, itemType: "pack" as const })),
    ...templateIds.map((id) => ({ itemId: id, itemType: "template" as const })),
  ];

  // Phase 1: Import + Freeze all items
  for (const { itemId, itemType } of allItems) {
    try {
      // Check if already imported with a ready/stable version
      try {
        const item = await getCatalogItemByName(itemId, itemType);
        const versions = await listCatalogVersions(item.id);
        const readyOrBeyond = versions.find(
          (v) =>
            v.lifecycleStatus === "ready" ||
            v.lifecycleStatus === "deprecated"
        );
        if (readyOrBeyond) {
          result.skipped.push({
            itemId,
            itemType,
            reason: `already imported (${readyOrBeyond.lifecycleStatus})`,
          });
          continue;
        }
      } catch {
        // Item not yet in catalog — proceed with import
      }

      // Import (creates draft version)
      const { catalogVersionId } = await importFromDevCatalog(principal, itemId, itemType);
      result.imported.push({ itemId, itemType, versionId: catalogVersionId });

      // Freeze (draft → ready)
      await freezeCatalogVersion(principal, catalogVersionId);
    } catch (err) {
      result.errors.push({
        itemId,
        itemType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Phase 2: Promote all items through release channels
  // Modules first, then packs (packs need modules to be ready for lock resolution)
  const publishOrder: Array<{ itemId: string; itemType: CatalogItemType }> = [
    ...moduleIds.map((id) => ({ itemId: id, itemType: "module" as const })),
    ...packIds.map((id) => ({ itemId: id, itemType: "pack" as const })),
    ...templateIds.map((id) => ({ itemId: id, itemType: "template" as const })),
  ];

  for (const { itemId, itemType } of publishOrder) {
    try {
      const item = await getCatalogItemByName(itemId, itemType);
      const versions = await listCatalogVersions(item.id, { lifecycleStatus: "ready" });
      if (versions.length === 0) {
        // Might have been skipped because already published
        result.skipped.push({
          itemId,
          itemType,
          reason: "no ready version (possibly already published)",
        });
        continue;
      }
      const versionId = versions[0].id;

      // Promote through channels: internal → beta → stable
      for (const channel of ["internal", "beta", "stable"] as const) {
        try {
          await promoteCatalogRelease(principal, { catalogVersionId: versionId, channel });
          result.published.push({ itemId, itemType, channel });
        } catch (err) {
          // If already active on this channel, that's fine — skip
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("already") || msg.includes("active")) {
            continue;
          }
          throw err;
        }
      }

      // For packs, resolve the dependency lock after stable release
      if (itemType === "pack") {
        try {
          await resolvePackLock(principal, versionId);
        } catch (err) {
          result.errors.push({
            itemId,
            itemType,
            error: `pack lock resolution failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    } catch (err) {
      result.errors.push({
        itemId,
        itemType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
