// Explicit offline clone upgrade. Never open the original volume for writing.
// Only same schema/Catalog resource compatibility is supported in B1.3.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { restoreSnapshot, inventory } from "./snapshot.mjs";
import { readImageProfile, requireProfile, validateVolumeRelease } from "./release-profile.mjs";

class UpgradeError extends Error {}
const check = (ok, code) => { if (!ok) throw new UpgradeError(code); };
export function assertCompatibleRelease(source, target) {
  requireProfile(source); requireProfile(target);
  check(source.sourceCommit !== target.sourceCommit, "same_release_use_restore");
  check(source.resourceSha256 === target.resourceSha256, "schema_or_catalog_resources_changed");
  check(source.catalogItemsSha256 === target.catalogItemsSha256, "catalog_versions_or_locks_changed");
}
async function publishMarker(root, marker) {
  const path = join(root, "release.json"), temporary = join(root, ".release-" + randomUUID());
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(marker, null, 2) + "\n"); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, path);
    const dir = await open(root, "r");
    try { await dir.sync(); } finally { await dir.close(); }
  } finally { await unlink(temporary).catch(() => {}); }
}
export async function prepareUpgrade(backupRoot, targetRoot, source, target, verifyDatabase) {
  // No target write occurs if the image profiles do not match.
  assertCompatibleRelease(source, target);
  await restoreSnapshot(backupRoot, targetRoot, source.sourceCommit);
  const markerPath = join(targetRoot, "release.json");
  const entry = await lstat(markerPath);
  check(entry.isFile() && !entry.isSymbolicLink(), "invalid_source_marker");
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  const catalogSourceCommit = validateVolumeRelease(marker, source);
  // On any failure, leave the original marker on the clone. The new image
  // refuses to start it; the original volume and offline backup are untouched.
  await verifyDatabase(catalogSourceCommit);
  const next = { format: "runory.self-host.volume/v2", sourceCommit: target.sourceCommit,
    previousSourceCommit: source.sourceCommit, catalogSourceCommit,
    initialCatalogSha256: marker.initialCatalogSha256,
    targetCatalogSha256: target.catalogTemplateSha256,
    resourceSha256: target.resourceSha256, catalogItemsSha256: target.catalogItemsSha256 };
  validateVolumeRelease(next, target);
  await publishMarker(targetRoot, next);
  return { sourceCommit: source.sourceCommit, targetCommit: target.sourceCommit,
    catalogSourceCommit, compatibility: "same_schema_and_catalog", status: "prepared" };
}
async function main() {
  try {
    const source = JSON.parse(await readFile("/upgrade/source-profile.json", "utf8"));
    check(source.sourceCommit === process.env.RUNORY_UPGRADE_FROM, "unexpected_source_image");
    const target = await readImageProfile(process.env.RUNORY_RELEASE_COMMIT);
    const result = await prepareUpgrade("/backup", "/data", source, target, async provenance => {
      // The only DB accessed is the restored clone, on a network-disabled
      // container. Never propagate provider credentials or open an old DB URL.
      execFileSync("pnpm", ["exec", "tsx", "scripts/check-self-host-upgrade.mts", provenance], {
        cwd: "/app/apps/cloud", stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000, env: { ...process.env, LIBSQL_URL: "file:/data/platform.db", LIBSQL_AUTH_TOKEN: "" },
      });
      const backup = JSON.parse(await readFile("/backup/manifest.json", "utf8"));
      check(JSON.stringify(await inventory("/source")) === JSON.stringify(backup.entries),
        "source_changed_before_prepared_marker");
    });
    console.log(JSON.stringify({ operation: "prepare-upgrade", ...result }));
  } catch (error) {
    console.error(JSON.stringify({ operation: "prepare-upgrade", status: "FAIL",
      reason: error instanceof UpgradeError ? error.message : "profile_snapshot_or_database_validation_failed" }));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
