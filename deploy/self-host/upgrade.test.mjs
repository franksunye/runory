import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupSnapshot, inventory } from "./snapshot.mjs";
import { assertCompatibleRelease, prepareUpgrade } from "./upgrade.mjs";
import { readImageProfile, validateVolumeRelease } from "./release-profile.mjs";

const source = { format:"runory.self-host.release-profile/v1",sourceCommit:"a".repeat(40),
  catalogTemplateSha256:"1".repeat(64),resourceSha256:"2".repeat(64),catalogItemsSha256:"3".repeat(64) };
const target = { ...source, sourceCommit:"b".repeat(40),catalogTemplateSha256:"4".repeat(64) };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),"runory-upgrade-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  const original=join(root,"original"), backup=join(root,"backup"), clone=join(root,"clone");
  for(const path of [original,backup,clone]) await mkdir(path);
  await mkdir(join(original,"uploads"));
  await writeFile(join(original,"platform.db"),"synthetic persisted business database");
  await writeFile(join(original,"uploads","evidence"),"synthetic evidence");
  await writeFile(join(original,"release.json"),JSON.stringify({format:"runory.self-host.volume/v1",
    sourceCommit:source.sourceCommit,initialCatalogSha256:source.catalogTemplateSha256}));
  const before=await inventory(original);
  await backupSnapshot(original,backup,source.sourceCommit);
  return {original,backup,clone,before};
}
test("prepares only the clone and preserves original Catalog provenance and bytes",async t=>{
  const f=await fixture(t);
  let checked=false;
  const result=await prepareUpgrade(f.backup,f.clone,source,target,async provenance=>{
    assert.equal(provenance,source.sourceCommit);
    assert.equal(await readFile(join(f.clone,"platform.db"),"utf8"),"synthetic persisted business database");
    checked=true;
  });
  assert.ok(checked);
  assert.equal(result.status,"prepared");
  assert.deepEqual(await inventory(f.original),f.before);
  assert.equal(await readFile(join(f.clone,"uploads","evidence"),"utf8"),"synthetic evidence");
  const marker=JSON.parse(await readFile(join(f.clone,"release.json"),"utf8"));
  assert.equal(validateVolumeRelease(marker,target),source.sourceCommit);
  assert.throws(()=>validateVolumeRelease(marker,source),/volume_release_mismatch/);
});
test("rejects incompatible schema, locks and identical release before copying",async t=>{
  const f=await fixture(t);
  for(const changed of [{...target,resourceSha256:"5".repeat(64)}, {...target,catalogItemsSha256:"6".repeat(64)},source]){
    await assert.rejects(prepareUpgrade(f.backup,f.clone,source,changed,()=>assert.fail("unexpected DB verification")));
    assert.deepEqual(await readdir(f.clone),[]);
  }
});
test("injected verification failure preserves rollback and leaves the clone unprepared",async t=>{
  const f=await fixture(t);
  await assert.rejects(prepareUpgrade(f.backup,f.clone,source,target,()=>{throw Error("injected validation failure")}),/injected validation failure/);
  assert.deepEqual(await inventory(f.original),f.before);
  const marker=JSON.parse(await readFile(join(f.clone,"release.json"),"utf8"));
  assert.equal(validateVolumeRelease(marker,source),source.sourceCommit);
  assert.throws(()=>validateVolumeRelease(marker,target),/volume_release_mismatch/);
});

test("profiles hash actual schema and catalog resource bytes, not version labels", async t => {
  const root = await mkdtemp(join(tmpdir(),"runory-profile-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  const bundle=join(root,"bundle"), resources=join(root,"resources");
  await mkdir(bundle); await mkdir(join(resources,"schema"),{recursive:true});
  await mkdir(join(resources,"catalog"));
  const bytes=Buffer.from("template");
  await writeFile(join(bundle,"catalog.db"),bytes);
  await writeFile(join(bundle,"catalog.json"),JSON.stringify({format:"runory.self-host.catalog/v1",
    status:"engineering_candidate",sourceCommit:source.sourceCommit,
    databaseSha256:createHash("sha256").update(bytes).digest("hex"),items:[{id:"fsm-pack",version:"1.0.0"}]}));
  await writeFile(join(resources,"schema","migration.sql"),"SELECT 1;");
  await writeFile(join(resources,"catalog","manifest.yaml"),"version: 1.0.0");
  const old=await readImageProfile(source.sourceCommit,bundle,resources);
  await writeFile(join(resources,"schema","migration.sql"),"SELECT 2;");
  const changed=await readImageProfile(source.sourceCommit,bundle,resources);
  assert.notEqual(changed.resourceSha256,old.resourceSha256);
  assert.equal(changed.catalogItemsSha256,old.catalogItemsSha256);
  await writeFile(join(bundle,"catalog.db"),"corrupted");
  await assert.rejects(readImageProfile(source.sourceCommit,bundle,resources),/checksum_mismatch/);
});
