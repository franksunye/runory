#!/usr/bin/env node
/** Read-only backup and isolated local restore. Never migrates/seeds the source. */
import { createClient } from "@libsql/client";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createDatabaseBackup, restoreDatabaseBackup, verifyDatabaseBackup, type DatabaseBackup } from "../../../packages/platform-core/src/database-backup";

const [command, ...args] = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing ${name} value`);
  return args[index + 1];
}
function required(name: string): string {
  const value = option(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function save(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, data, { flag: "wx", mode: 0o600 });
}
function openNewTarget(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Exclusive creation prevents both accidental overwrite and a path race.
  closeSync(openSync(path, "wx", 0o600));
  return createClient({ url: `file:${path}`, intMode: "bigint" });
}

async function main() {
  if (!["backup", "restore", "drill"].includes(command ?? "")) {
    throw new Error("Usage: database-backup.mts backup --source URL --output FILE | restore --input FILE --target NEW_LOCAL_DB | drill --source URL --output FILE --target NEW_LOCAL_DB --report FILE");
  }
  let backup: DatabaseBackup;
  let sourceKind = "archive";
  const startedAt = new Date().toISOString();
  const started = performance.now();
  if (command === "restore") {
    backup = JSON.parse(gunzipSync(readFileSync(resolve(required("--input")))).toString("utf8"));
  } else {
    const sourceUrl = option("--source") ?? process.env.LIBSQL_URL;
    if (!sourceUrl) throw new Error("--source or LIBSQL_URL is required; there is no implicit database");
    sourceKind = sourceUrl.startsWith("file:") ? "local" : "remote-read-only";
    if (sourceKind === "local") {
      const sourcePath = sourceUrl.startsWith("file://") ? fileURLToPath(sourceUrl) : resolve(sourceUrl.slice(5));
      if (!existsSync(sourcePath)) throw new Error("Source database does not exist");
    }
    const source = createClient({
      url: sourceUrl, intMode: "bigint",
      ...(sourceKind === "local" ? {} : { authToken: process.env.LIBSQL_AUTH_TOKEN }),
    });
    try { backup = await createDatabaseBackup(source); } finally { source.close(); }
    save(resolve(required("--output")), gzipSync(JSON.stringify(backup)));
  }

  const targetPath = command === "backup" ? undefined : resolve(required("--target"));
  if (targetPath) {
    const target = openNewTarget(targetPath);
    try { await restoreDatabaseBackup(target, backup); } finally { target.close(); }
    // Reopen the physical target: a passing in-memory snapshot is insufficient.
    const reopened = createClient({ url: `file:${targetPath}`, intMode: "bigint" });
    try { await verifyDatabaseBackup(reopened, backup); } finally { reopened.close(); }
  }
  const migrationTable = backup.tables.find(table => table.name === "sys_schema_migrations");
  const rowCount = (suffix: string) => backup.tables
    .filter(table => table.name.endsWith(suffix))
    .reduce((sum, table) => sum + table.rows.length, 0);
  const report = {
    format: "runory.database-recovery-evidence/v1", command,
    startedAt, finishedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started),
    sourceKind, sourceWrites: false, restoredToNewLocalDatabase: Boolean(targetPath),
    reopenedAndVerified: Boolean(targetPath),
    tables: backup.tables.length,
    rows: backup.tables.reduce((sum, table) => sum + table.rows.length, 0),
    appliedMigrations: migrationTable?.rows.length ?? 0,
    applicationInventory: {
      catalogItems: rowCount("catalog_items"),
      catalogVersions: rowCount("catalog_versions"),
      installations: rowCount("runtime_installations"),
    },
    schemaChecksum: backup.schemaChecksum, dataChecksum: backup.dataChecksum, archiveChecksum: backup.checksum,
    providerDisasterRecoveryVerified: false,
    attachmentBytesIncluded: false,
    note: "Database rows include attachment references, not file bytes. Verify the immutable attachment store separately. A local restore does not certify managed-provider RPO/RTO.",
    status: "PASS",
  };
  if (option("--report")) save(resolve(required("--report")), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Database recovery failed");
  process.exitCode = 1;
});
