import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeVolume } from "./initialize.mjs";

const commit = "a".repeat(40);
const bytes = Buffer.from("synthetic catalog");
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "runory-init-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = join(root, "data"), bundle = join(root, "bundle");
  await mkdir(data); await mkdir(bundle); await mkdir(join(data, "uploads"));
  await writeFile(join(bundle, "catalog.db"), bytes);
  const meta = { format: "runory.self-host.catalog/v1", sourceCommit: commit,
    status: "engineering_candidate", databaseSha256: createHash("sha256").update(bytes).digest("hex") };
  await writeFile(join(bundle, "catalog.json"), JSON.stringify(meta));
  return { data, bundle, meta };
}
test("initializes a new volume once and never replaces a modified existing database", async t => {
  const f = await fixture(t);
  assert.equal((await initializeVolume(f.data, f.bundle, commit)).status, "initialized");
  assert.deepEqual(await readFile(join(f.data, "platform.db")), bytes);
  assert.equal((await stat(join(f.data, "platform.db"))).mode & 0o777, 0o600);
  assert.equal((await stat(join(f.data, "release.json"))).mode & 0o777, 0o600);
  await writeFile(join(f.data, "platform.db"), "customer data");
  assert.equal((await initializeVolume(f.data, f.bundle, commit)).status, "existing");
  assert.equal(await readFile(join(f.data, "platform.db"), "utf8"), "customer data");
});
test("rejects a corrupted packaged database without modifying the volume", async t => {
  const f = await fixture(t);
  await writeFile(join(f.bundle, "catalog.db"), "tampered");
  await assert.rejects(initializeVolume(f.data, f.bundle, commit), /checksum_mismatch/);
  assert.deepEqual(await readdir(f.data), ["uploads"]);
});
test("rejects old or partial volumes instead of implicit upgrade or reinitialization", async t => {
  const f = await fixture(t);
  await writeFile(join(f.data, "platform.db"), "old customer data");
  await assert.rejects(initializeVolume(f.data, f.bundle, commit), /unrecognized_or_partial_volume/);
  assert.equal(await readFile(join(f.data, "platform.db"), "utf8"), "old customer data");
  await rm(join(f.data, "platform.db"));
  await initializeVolume(f.data, f.bundle, commit);
  const newCommit = "b".repeat(40);
  await writeFile(join(f.bundle, "catalog.json"), JSON.stringify({ ...f.meta, sourceCommit: newCommit }));
  await assert.rejects(initializeVolume(f.data, f.bundle, newCommit), /volume_release_mismatch/);
});
test("refuses preexisting attachment data and symbolic-link database", async t => {
  const f = await fixture(t);
  await writeFile(join(f.data, "uploads", "existing"), "retain");
  await assert.rejects(initializeVolume(f.data, f.bundle, commit), /new_volume_not_empty/);
  await symlink(join(f.bundle, "catalog.db"), join(f.data, "platform.db"));
  await assert.rejects(initializeVolume(f.data, f.bundle, commit), /unrecognized_or_partial_volume/);
});
