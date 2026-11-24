// Offline, same-release snapshot of an independent instance. The operator
// must stop all writers first. The CLI uses fixed mounts (/data and /backup);
// the original volume is mounted read-only for backup. Never upload snapshots
// containing real customer data or runtime credentials to CI artifacts.
import { createHash } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { chmod, copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const format = "runory.self-host.snapshot/v1";
class SnapshotError extends Error {}
const requireCheck = (ok, code) => { if (!ok) throw new SnapshotError(code); };
const validCommit = value => /^[a-f0-9]{40}$/.test(value ?? "");
async function digest(path) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}
async function directory(path) {
  const info = await lstat(path);
  requireCheck(info.isDirectory() && !info.isSymbolicLink(), "invalid_snapshot_directory");
  return realpath(path);
}
async function distinctDirectories(source, target) {
  const a = await directory(source), b = await directory(target);
  requireCheck(a !== b && !a.startsWith(b + sep) && !b.startsWith(a + sep), "overlapping_snapshot_paths");
}
async function empty(path) {
  requireCheck((await readdir(path)).length === 0, "target_not_empty");
}
export async function inventory(root) {
  await directory(root);
  const result = [];
  async function walk(parent) {
    for (const name of (await readdir(parent)).sort()) {
      const path = join(parent, name);
      const key = relative(root, path).split(sep).join("/");
      const info = await lstat(path);
      requireCheck(!info.isSymbolicLink(), "unsupported_snapshot_entry");
      if (info.isDirectory()) {
        result.push({ path: key, kind: "dir" });
        await walk(path);
      } else {
        requireCheck(info.isFile() && Number.isSafeInteger(info.size), "unsupported_snapshot_entry");
        result.push({ path: key, kind: "file", bytes: info.size, sha256: await digest(path) });
      }
    }
  }
  await walk(root);
  return result;
}
const equalInventory = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasDatabase = entries => entries.some(e => e.path === "platform.db" && e.kind === "file" && e.bytes > 0);
async function copyInventory(source, target, items) {
  // Only paths obtained from a filesystem inventory are used, not arbitrary
  // paths supplied by an archive manifest. Exclusive creation never overwrites.
  for (const item of items) {
    const src = join(source, item.path), dst = join(target, item.path);
    if (item.kind === "dir") await mkdir(dst, { mode: 0o700 });
    else {
      await copyFile(src, dst, constants.COPYFILE_EXCL);
      await chmod(dst, 0o600);
    }
  }
}
export async function backupSnapshot(source, target, sourceCommit) {
  requireCheck(validCommit(sourceCommit), "invalid_source_commit");
  await distinctDirectories(source, target);
  await empty(target);
  const before = await inventory(source);
  requireCheck(hasDatabase(before), "database_missing");
  const files = join(target, "files");
  await mkdir(files, { mode: 0o700 });
  await copyInventory(source, files, before);
  requireCheck(equalInventory(before, await inventory(source)), "source_changed_during_backup");
  requireCheck(equalInventory(before, await inventory(files)), "backup_checksum_mismatch");
  // Written last: a partial backup never has a successful completion marker.
  const manifest = { format, sourceCommit, entries: before };
  await writeFile(join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { files: before.filter(e => e.kind === "file").length, sourceCommit };
}
export async function restoreSnapshot(source, target, sourceCommit) {
  requireCheck(validCommit(sourceCommit), "invalid_source_commit");
  await distinctDirectories(source, target);
  await empty(target);
  const rootEntries = (await readdir(source)).sort();
  requireCheck(JSON.stringify(rootEntries) === JSON.stringify(["files", "manifest.json"]), "incomplete_snapshot");
  const manifestPath = join(source, "manifest.json");
  const manifestInfo = await lstat(manifestPath);
  requireCheck(manifestInfo.isFile() && !manifestInfo.isSymbolicLink(), "invalid_snapshot_manifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  requireCheck(manifest?.format === format && manifest.sourceCommit === sourceCommit, "snapshot_release_mismatch");
  const files = join(source, "files");
  const actual = await inventory(files);
  requireCheck(hasDatabase(actual) && equalInventory(manifest.entries, actual), "backup_checksum_mismatch");
  // Validate the entire snapshot before copying into the new volume.
  await copyInventory(files, target, actual);
  requireCheck(equalInventory(actual, await inventory(target)), "restore_checksum_mismatch");
  return { files: actual.filter(e => e.kind === "file").length, sourceCommit };
}
async function main() {
  const operation = process.argv[2];
  try {
    requireCheck(process.argv.length === 3 && ["backup", "restore"].includes(operation), "invalid_snapshot_operation");
    const commit = process.env.RUNORY_RELEASE_COMMIT;
    const result = operation === "backup" ? await backupSnapshot("/data", "/backup", commit)
      : await restoreSnapshot("/backup", "/data", commit);
    console.log(JSON.stringify({ operation: "offline-volume-" + operation, status: "PASS", ...result }));
  } catch (error) {
    // Never include raw path names, archive bytes, tokens, or provider errors.
    console.error(JSON.stringify({ operation: "offline-volume-snapshot", status: "FAIL",
      reason: error instanceof SnapshotError ? error.message : "snapshot_io_or_format_error" }));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
