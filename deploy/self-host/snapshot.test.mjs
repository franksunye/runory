import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupSnapshot, restoreSnapshot, inventory } from "./snapshot.mjs";
const commit = "a".repeat(40);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "runory-snapshot-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source"), backup = join(root, "backup"), restore = join(root, "restore");
  for (const path of [source, backup, restore]) await mkdir(path);
  await mkdir(join(source, "uploads", "ws_test"), { recursive: true });
  await mkdir(join(source, "empty"));
  await writeFile(join(source, "platform.db"), "synthetic database bytes");
  await writeFile(join(source, "platform.db-wal"), "synthetic journal bytes");
  await writeFile(join(source, "uploads", "ws_test", "att_test"), Buffer.from([0, 1, 2, 255]));
  return { source, backup, restore };
}
test("offline snapshot preserves the entire volume and exact bytes in a new directory", async t => {
  const f = await fixture(t);
  const before = await inventory(f.source);
  await backupSnapshot(f.source, f.backup, commit);
  await restoreSnapshot(f.backup, f.restore, commit);
  assert.deepEqual(await inventory(f.source), before);
  assert.deepEqual(await inventory(f.restore), before);
  assert.deepEqual(await readFile(join(f.restore, "uploads", "ws_test", "att_test")), Buffer.from([0, 1, 2, 255]));
});
test("rejects mismatched release and tampered attachment before writing any restored data", async t => {
  const f = await fixture(t);
  await backupSnapshot(f.source, f.backup, commit);
  await assert.rejects(restoreSnapshot(f.backup, f.restore, "b".repeat(40)), /snapshot_release_mismatch/);
  await writeFile(join(f.backup, "files", "uploads", "ws_test", "att_test"), "tampered");
  await assert.rejects(restoreSnapshot(f.backup, f.restore, commit), /backup_checksum_mismatch/);
  assert.deepEqual(await readdir(f.restore), []);
});
test("rejects nonempty and overlapping targets without replacing existing data", async t => {
  const f = await fixture(t);
  await assert.rejects(backupSnapshot(f.source, f.source, commit), /overlapping_snapshot_paths/);
  await backupSnapshot(f.source, f.backup, commit);
  await writeFile(join(f.restore, "existing"), "retain");
  await assert.rejects(restoreSnapshot(f.backup, f.restore, commit), /target_not_empty/);
  assert.equal(await readFile(join(f.restore, "existing"), "utf8"), "retain");
  await assert.rejects(backupSnapshot(f.source, f.backup, commit), /target_not_empty/);
});
test("rejects symlinks and incomplete snapshots", async t => {
  const f = await fixture(t);
  await symlink(join(f.source, "platform.db"), join(f.source, "uploads", "link"));
  await assert.rejects(backupSnapshot(f.source, f.backup, commit), /unsupported_snapshot_entry/);
  await assert.rejects(restoreSnapshot(f.backup, f.restore, commit), /incomplete_snapshot/);
});
