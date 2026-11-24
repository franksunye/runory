// Build-only offline preparation of a fresh, exact-source Catalog database.
// No request identity, owner credential, Cloud connection or live volume is
// accepted. The synthetic build actor is used solely by existing in-process
// Catalog services; it is not a provisioned user or an HTTP login.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import {
  computeManifestChecksum, db, ensureSchema, freezeCatalogVersion,
  getPackLock, getCatalogVersion, importCatalogCandidate, loadModuleManifest,
  loadPackManifest, loadTemplateManifest, parseModuleRef, promoteCatalogRelease,
  queryOne, resolvePackLock, runCatalogValidation, TABLES, type Principal,
} from "@runory/platform-core";
import { assertBundledPack, BUNDLED_FSM_PACKS } from "../src/lib/self-host-catalog";

const sourceDb = "/tmp/runory-catalog-build/catalog.db";
const bundleDir = "/app/deploy/self-host/bundle";
const buildEmail = "offline-catalog-builder@runory.invalid";
const commit = process.env.RUNORY_CATALOG_SOURCE_SHA ?? "";
if (process.env.RUNORY_CANDIDATE_CATALOG_BUILD !== "1" ||
    process.env.NODE_ENV !== "production" ||
    process.env.PLATFORM_DEPLOYMENT_MODE !== "local" ||
    process.env.PLATFORM_DEV_BOOTSTRAP !== "false" ||
    process.env.PLATFORM_ADMIN_EMAILS !== buildEmail ||
    process.env.LIBSQL_URL !== "file:" + sourceDb || process.env.LIBSQL_AUTH_TOKEN ||
    process.env.VERCEL === "1" || process.env.VERCEL_ENV ||
    !/^[a-f0-9]{40}$/.test(commit) ||
    existsSync(sourceDb) || existsSync(bundleDir)) {
  throw new Error("Catalog preparation requires a fresh isolated image build database");
}

const actor: Principal = {
  userId: "offline-catalog-build:" + commit,
  email: buildEmail,
  displayName: "Offline engineering candidate build",
  // Internal synthetic actor, not an authenticated production session.
  authMethod: "dev_bootstrap",
};
type ItemType = "module" | "pack" | "template";
type Manifest = ReturnType<typeof loadModuleManifest> | ReturnType<typeof loadPackManifest> | ReturnType<typeof loadTemplateManifest>;
type Item = { type: ItemType; manifest: Manifest; checksum: string; versionId: string };
const packs = BUNDLED_FSM_PACKS.map(loadPackManifest);
const modules = new Map(packs.flatMap(pack => pack.modules.map(ref => {
  const id = parseModuleRef(ref).moduleId;
  const manifest = loadModuleManifest(id);
  if (manifest.id !== id || manifest.status === "retired") throw new Error("Unsupported bundled module " + id);
  return [id, manifest] as const;
})));
const templates = ["small-business-field-service", "small-business-sales-quote"].map(loadTemplateManifest);

// Dependencies must close inside the selected FSM solution. Do not pick a
// second version or silently install unrelated modules from the whole repository.
const order: ReturnType<typeof loadModuleManifest>[] = [];
const active = new Set<string>(), done = new Set<string>();
function visit(id: string) {
  if (done.has(id)) return;
  if (active.has(id)) throw new Error("Bundled module dependency cycle: " + id);
  const module = modules.get(id);
  if (!module) throw new Error("Missing bundled dependency: " + id);
  active.add(id);
  for (const dep of module.dependencies ?? []) visit(dep);
  active.delete(id);
  done.add(id);
  order.push(module);
}
for (const id of modules.keys()) visit(id);

await ensureSchema();
const imported: Item[] = [];
async function register(type: ItemType, manifest: Manifest) {
  const record = manifest as unknown as Record<string, unknown>;
  const checksum = computeManifestChecksum(record);
  const result = await importCatalogCandidate(actor, {
    itemType: type, itemId: manifest.id, version: manifest.version,
    manifest: record, artifactChecksum: checksum,
    sourceRepository: "franksunye/runory", sourceCommit: commit,
  });
  imported.push({ type, manifest, checksum, versionId: result.catalogVersionId });
}
try {
  // Import all declarations first, so cross-pack relations can resolve;
  // validate modules in dependency order before freezing any Pack locks.
  for (const module of order) await register("module", module);
  for (const pack of packs) await register("pack", pack);
  for (const template of templates) await register("template", template);
  for (const item of imported) {
    const result = await runCatalogValidation(actor, item.versionId);
    if (result.result.status !== "passed") {
      const failures = result.result.checks.filter(check => check.status === "failed").map(check => check.name);
      throw new Error("Bundled catalog validation failed: " + item.manifest.id + " [" + failures.join(",") + "]");
    }
    await freezeCatalogVersion(actor, item.versionId);
    if (item.type === "pack") await resolvePackLock(actor, item.versionId);
    for (const channel of ["internal", "beta", "stable"] as const) {
      await promoteCatalogRelease(actor, {
        catalogVersionId: item.versionId, channel,
        releaseNotes: "Local engineering candidate catalog; not a Cloud promotion or production approval.",
      });
    }
  }
  for (const pack of BUNDLED_FSM_PACKS) await assertBundledPack(pack, commit);
  const publicItems = [];
  for (const item of imported) {
    const locks = item.type === "pack" ? await getPackLock(item.versionId) : [];
    const dependencies = [];
    for (const lock of locks) {
      const locked = await getCatalogVersion(lock.resolvedModuleVersionId);
      const manifest = JSON.parse(locked.manifestJson) as { id: string };
      dependencies.push({ id: manifest.id, version: locked.version, checksum: locked.artifactChecksum, range: lock.requestedRange });
    }
    publicItems.push({ type: item.type, id: item.manifest.id, version: item.manifest.version,
      checksum: item.checksum, ...(item.type === "pack" ? { dependencies } : {}) });
  }
  // A distributed initial database must not carry any existing identity,
  // session, credential, customer Workspace or business installation.
  for (const table of [TABLES.users, TABLES.authIdentities, TABLES.authChallenges,
    TABLES.sessions, TABLES.apiKeys, TABLES.workspaces, TABLES.organizations,
    TABLES.organizationEntitlements, TABLES.installations, TABLES.attachments]) {
    const row = await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM " + table);
    if (Number(row?.count) !== 0) throw new Error("Nonempty identity or business table in candidate template");
  }
  const integrity = await db.execute("PRAGMA quick_check");
  if (integrity.rows.length !== 1 || String(integrity.rows[0][0]) !== "ok") throw new Error("Catalog database integrity check failed");
  await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  await db.execute("PRAGMA journal_mode=DELETE");
  db.close();

  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(sourceDb + suffix) && (await stat(sourceDb + suffix)).size !== 0) {
      throw new Error("Unexpected catalog database sidecar after close");
    }
  }
  await mkdir(bundleDir, { mode: 0o700 });
  const dbPath = bundleDir + "/catalog.db";
  await copyFile(sourceDb, dbPath, constants.COPYFILE_EXCL);
  const databaseSha256 = createHash("sha256").update(await readFile(dbPath)).digest("hex");
  await writeFile(bundleDir + "/catalog.json", JSON.stringify({
    format: "runory.self-host.catalog/v1", sourceCommit: commit, databaseSha256,
    status: "engineering_candidate", items: publicItems,
  }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ operation: "prepare-bundled-catalog", status: "PASS",
    sourceCommit: commit, moduleCount: modules.size, packCount: packs.length, templateCount: templates.length }));
} catch (error) {
  // This is an isolated build without customer data or credentials; fail the
  // image build rather than suppress a manifest/lock/validation error.
  console.error(error instanceof Error ? error.message : "Catalog preparation failed");
  process.exitCode = 1;
}
