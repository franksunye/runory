// Offline verification of the restored clone before its release marker is
// changed. No migration, Catalog republish, or source database modification.
import { readFile } from "node:fs/promises";
import {
  computeManifestChecksum, db, ensureSchema, getMigrationStatus,
  listCatalogItems, getActiveReleaseForItem, queryAll, TABLES,
  type CatalogItemType,
} from "@runory/platform-core";
import { assertBundledPack, BUNDLED_FSM_PACKS } from "../src/lib/self-host-catalog";

const provenance = process.argv[2] ?? "";
if (process.argv.length !== 3 || !/^[a-f0-9]{40}$/.test(provenance) ||
    process.env.RUNORY_SELF_HOST_CANDIDATE !== "1" || process.env.NODE_ENV !== "production" ||
    process.env.PLATFORM_DEPLOYMENT_MODE !== "local" ||
    process.env.LIBSQL_URL !== "file:/data/platform.db" || process.env.LIBSQL_AUTH_TOKEN ||
    process.env.VERCEL === "1" || process.env.VERCEL_ENV) throw new Error("Invalid offline upgrade context");

type BundledItem = { type: CatalogItemType; id: string; version: string; checksum: string };
try {
  // The source and target images have already been compared byte-for-byte
  // for schema and Catalog resources. Missing migrations are not supported.
  const integrity = await db.execute("PRAGMA quick_check");
  if (integrity.rows.length !== 1 || String(integrity.rows[0][0]) !== "ok") throw new Error("Database integrity failed");
  if ((await getMigrationStatus()).pending.length) throw new Error("Pending migration requires a separate upgrade path");
  await ensureSchema(); // checks existing immutable migration checksums
  const manifest = JSON.parse(await readFile("/app/deploy/self-host/bundle/catalog.json", "utf8")) as { items: BundledItem[] };
  const expected = new Map(manifest.items.map(item => [item.type + ":" + item.id, item]));
  const actual = await listCatalogItems();
  if (actual.length !== expected.size) throw new Error("Unsupported Catalog inventory");
  for (const item of actual) {
    const wanted = expected.get(item.itemType + ":" + item.name);
    const active = await getActiveReleaseForItem(item.id, "stable");
    if (!wanted || item.status !== "active" || !active ||
        active.version.version !== wanted.version || active.version.lifecycleStatus !== "ready" ||
        active.version.sourceCommit !== provenance || active.version.artifactChecksum !== wanted.checksum ||
        computeManifestChecksum(JSON.parse(active.version.manifestJson)) !== wanted.checksum) {
      throw new Error("Catalog provenance or version mismatch");
    }
  }
  for (const pack of BUNDLED_FSM_PACKS) await assertBundledPack(pack, provenance);
  const packs = await queryAll<{ pack_id: string; pack_version: string }>(
    `SELECT pack_id, pack_version FROM ${TABLES.packInstallations}`,
  );
  for (const pack of packs) {
    if (expected.get("pack:" + pack.pack_id)?.version !== pack.pack_version) throw new Error("Unsupported installed Pack");
  }
  const modules = await queryAll<{ module_id: string; module_version: string; status: string }>(
    `SELECT module_id, module_version, status FROM ${TABLES.installations}`,
  );
  for (const module of modules) {
    if (module.status !== "installed" || expected.get("module:" + module.module_id)?.version !== module.module_version)
      throw new Error("Unsupported installed Module");
  }
  console.log(JSON.stringify({ operation: "offline-upgrade-database-check", status: "PASS", catalogItems: actual.length }));
} finally { db.close(); }
