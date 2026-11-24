// Install only a build-verified catalog database into an empty persistent
// volume. Never replace an existing database or silently migrate it to a new
// release. This runs before the HTTP server, without any runtime auth bypass.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, link, lstat, open, readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const format = "runory.self-host.catalog/v1";
class InitializationError extends Error {}
const requireCheck = (ok, reason) => { if (!ok) throw new InitializationError(reason); };
const digest = data => createHash("sha256").update(data).digest("hex");
async function info(path) {
  try { return await lstat(path); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}
function regular(entry) {
  return !!entry && entry.isFile() && !entry.isSymbolicLink();
}
async function syncFile(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function initializeVolume(dataRoot, bundleRoot, commit) {
  requireCheck(/^[a-f0-9]{40}$/.test(commit ?? ""), "invalid_release_identity");
  const root = await info(dataRoot);
  requireCheck(root?.isDirectory() && !root.isSymbolicLink(), "invalid_data_volume");
  const metadataPath = join(bundleRoot, "catalog.json");
  const seedPath = join(bundleRoot, "catalog.db");
  requireCheck(regular(await info(metadataPath)) && regular(await info(seedPath)), "bundled_catalog_missing");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  requireCheck(metadata?.format === format && metadata.status === "engineering_candidate" &&
    metadata.sourceCommit === commit && /^[a-f0-9]{64}$/.test(metadata.databaseSha256 ?? ""),
    "bundled_catalog_identity_mismatch");
  const dbPath = join(dataRoot, "platform.db");
  const markerPath = join(dataRoot, "release.json");
  const expectedMarker = {
    format: "runory.self-host.volume/v1", sourceCommit: commit, initialCatalogSha256: metadata.databaseSha256,
  };
  const db = await info(dbPath), marker = await info(markerPath);
  if (db || marker) {
    requireCheck(regular(db) && db.size > 0 && regular(marker), "unrecognized_or_partial_volume");
    const existing = JSON.parse(await readFile(markerPath, "utf8"));
    requireCheck(existing?.format === expectedMarker.format &&
      existing.sourceCommit === commit && existing.initialCatalogSha256 === metadata.databaseSha256,
      "volume_release_mismatch_use_explicit_upgrade_or_restore");
    return { status: "existing", sourceCommit: commit };
  }
  // preflight creates an empty uploads directory. Reject all other files,
  // including sidecars or old attachments from a partially lost instance.
  for (const name of await readdir(dataRoot)) {
    const entry = await info(join(dataRoot, name));
    requireCheck(name === "uploads" && entry?.isDirectory() && !entry.isSymbolicLink()
      && (await readdir(join(dataRoot, name))).length === 0, "new_volume_not_empty");
  }
  requireCheck(digest(await readFile(seedPath)) === metadata.databaseSha256, "bundled_catalog_checksum_mismatch");
  const temporaryDb = join(dataRoot, ".catalog-" + randomUUID());
  const temporaryMarker = temporaryDb + ".json";
  try {
    await copyFile(seedPath, temporaryDb, constants.COPYFILE_EXCL);
    await chmod(temporaryDb, 0o600);
    requireCheck(digest(await readFile(temporaryDb)) === metadata.databaseSha256, "initial_catalog_copy_mismatch");
    const markerHandle = await open(temporaryMarker, "wx", 0o600);
    try {
      await markerHandle.writeFile(JSON.stringify(expectedMarker, null, 2) + "\n");
      await markerHandle.sync();
    } finally { await markerHandle.close(); }
    await syncFile(temporaryDb);
    // Hard links publish without overwriting a concurrent or existing file.
    // An interrupted pair fails closed rather than guessing which DB to use.
    await link(temporaryDb, dbPath);
    await link(temporaryMarker, markerPath);
    // Persist the directory entries as well as the two file contents.
    await syncFile(dataRoot);
    return { status: "initialized", sourceCommit: commit };
  } finally {
    await unlink(temporaryDb).catch(() => {});
    await unlink(temporaryMarker).catch(() => {});
  }
}
async function main() {
  try {
    const result = await initializeVolume("/data", "/app/deploy/self-host/bundle", process.env.RUNORY_RELEASE_COMMIT);
    console.log(JSON.stringify({ operation: "initialize-bundled-catalog", ...result }));
  } catch (error) {
    console.error(JSON.stringify({ operation: "initialize-bundled-catalog", status: "FAIL",
      reason: error instanceof InitializationError ? error.message : "volume_or_catalog_io_error" }));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
