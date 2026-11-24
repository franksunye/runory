// Read an immutable image's actual packaged resources, not just version labels.
// The same trusted target script can inspect a verified older image offline.
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inventory } from "./snapshot.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
export const validCommit = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
export const validDigest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const profileFormat = "runory.self-host.release-profile/v1";
export function requireProfile(value) {
  if (value?.format !== profileFormat || !validCommit(value.sourceCommit) ||
      !validDigest(value.catalogTemplateSha256) || !validDigest(value.resourceSha256) ||
      !validDigest(value.catalogItemsSha256)) throw new Error("invalid_release_profile");
}
async function readRegular(path) {
  const entry = await lstat(path);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("invalid_image_resource");
  return readFile(path);
}
export async function readImageProfile(commit, bundleRoot = "/app/deploy/self-host/bundle", resourcesRoot = "/app/apps/cloud/.resources") {
  if (!validCommit(commit)) throw new Error("invalid_release_identity");
  const metadata = JSON.parse(await readRegular(join(bundleRoot, "catalog.json")));
  if (metadata?.format !== "runory.self-host.catalog/v1" ||
      metadata.status !== "engineering_candidate" || metadata.sourceCommit !== commit ||
      !validDigest(metadata.databaseSha256) || !Array.isArray(metadata.items) ||
      !metadata.items.length) throw new Error("invalid_catalog_metadata");
  if (hash(await readRegular(join(bundleRoot, "catalog.db"))) !== metadata.databaseSha256)
    throw new Error("bundled_catalog_checksum_mismatch");
  const profile = { format: profileFormat, sourceCommit: commit,
    catalogTemplateSha256: metadata.databaseSha256,
    resourceSha256: hash(JSON.stringify(await inventory(resourcesRoot))),
    catalogItemsSha256: hash(JSON.stringify(metadata.items)) };
  requireProfile(profile);
  return profile;
}

// v1 describes a fresh instance; v2 records an explicitly prepared,
// compatible runtime upgrade while preserving the actual Catalog provenance.
export function validateVolumeRelease(marker, profile) {
  requireProfile(profile);
  if (marker?.sourceCommit !== profile.sourceCommit || !validDigest(marker.initialCatalogSha256))
    throw new Error("volume_release_mismatch");
  if (marker.format === "runory.self-host.volume/v1") {
    if (marker.initialCatalogSha256 !== profile.catalogTemplateSha256) throw new Error("volume_catalog_template_mismatch");
    return marker.sourceCommit;
  }
  if (marker.format !== "runory.self-host.volume/v2" ||
      !validCommit(marker.catalogSourceCommit) || !validCommit(marker.previousSourceCommit) ||
      marker.previousSourceCommit === marker.sourceCommit ||
      marker.targetCatalogSha256 !== profile.catalogTemplateSha256 ||
      marker.resourceSha256 !== profile.resourceSha256 ||
      marker.catalogItemsSha256 !== profile.catalogItemsSha256)
    throw new Error("invalid_prepared_upgrade_marker");
  return marker.catalogSourceCommit;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await readImageProfile(process.env.RUNORY_RELEASE_COMMIT))); }
  catch { console.error("Release profile verification failed"); process.exitCode = 1; }
}
