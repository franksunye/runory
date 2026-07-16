#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const databaseUrl = process.env.LIBSQL_URL;
const authToken = process.env.LIBSQL_AUTH_TOKEN;

if (!databaseUrl?.startsWith("libsql://") || !authToken) {
  throw new Error("LIBSQL_URL (libsql://...) and LIBSQL_AUTH_TOKEN are required");
}

const endpoint = `${databaseUrl.replace(/^libsql:\/\//, "https://")}/v2/pipeline`;
const migrationsDir = resolve(process.cwd(), "schema", "migrations");
if (!existsSync(migrationsDir)) throw new Error(`Migration directory not found: ${migrationsDir}`);

const prefixes = {
  platform: process.env.PLATFORM_TABLE_PREFIX ?? process.env.RUNORY_TABLE_PREFIX ?? "platform_",
  system: process.env.SYSTEM_TABLE_PREFIX ?? "sys_",
  saas: process.env.SAAS_TABLE_PREFIX ?? "saas_",
  runtime: process.env.RUNORY_RUNTIME_TABLE_PREFIX ?? "runory_runtime_",
  catalog: process.env.RUNORY_CATALOG_TABLE_PREFIX ?? "runory_catalog_",
  business: process.env.BUSINESS_TABLE_PREFIX ?? process.env.RUNORY_BUSINESS_TABLE_PREFIX ?? "runory_business_",
};
const migrationsTable = `${prefixes.system}schema_migrations`;
const acceptedHistoricalChecksums = {
  "0008": [
    "53d6b833c0338c0a805da9cbf90519baa42b866d000e061a0c37e0ec247ab6bb",
    "ef1274f395990fb639796db16d25e1cd13762a10cb1b07d39cac1bf14fa50517",
  ],
  "0011": ["22d273441f560b0d2f1bf39f5d147901bdf053e21073a07a81207eb8a810a5ad"],
  "0022": ["2b4bc8c67b107fa2f664fffb424d154ca1840ed6488f19741befcb689d6bcfa7"],
  "0023": [
    "bec8ae49e7bdff205e5a43f806ca3c1c0677f757d08f09e37015a30b758d637c",
    "23b3e17bbb2b4e6321d62f3c7c84d167554f7cc37d2b4e208616e32b44fd13bb",
  ],
  "0024": ["d58707d86f5b83d02fa8c7f04f2ab21ee2dc6e552b1083eab712a50a4a8ea4cd"],
  "0025": ["096cf6186a4915b53de019485aaa83f7fce9897a6a29e274c5e641b79f500ebc"],
};

function pipeline(statements) {
  const payload = JSON.stringify({
    requests: [
      ...statements.map(({ sql, args = [] }) => ({ type: "execute", stmt: { sql, args } })),
      { type: "close" },
    ],
  });
  const output = execFileSync("curl", [
    "--silent", "--show-error", "--fail-with-body", "--connect-timeout", "15", "--max-time", "120",
    endpoint,
    "-H", `Authorization: Bearer ${authToken}`,
    "-H", "Content-Type: application/json",
    "--data-binary", "@-",
  ], { input: payload, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(output).results.slice(0, statements.length);
}

function render(sql) {
  return sql
    .replaceAll("{{PLATFORM_TABLE_PREFIX}}", prefixes.platform)
    .replaceAll("{{RUNORY_TABLE_PREFIX}}", prefixes.platform)
    .replaceAll("{{SYSTEM_TABLE_PREFIX}}", prefixes.system)
    .replaceAll("{{SAAS_TABLE_PREFIX}}", prefixes.saas)
    .replaceAll("{{RUNORY_RUNTIME_TABLE_PREFIX}}", prefixes.runtime)
    .replaceAll("{{RUNORY_CATALOG_TABLE_PREFIX}}", prefixes.catalog)
    .replaceAll("{{BUSINESS_TABLE_PREFIX}}", prefixes.business);
}

function splitStatements(sql) {
  return sql
    .split(";")
    .map((chunk) => chunk.split("\n").filter((line) => line.trim() && !line.trim().startsWith("--")).join("\n").trim())
    .filter(Boolean)
    .map((statement) => `${statement};`);
}

let result = pipeline([{ sql: `CREATE TABLE IF NOT EXISTS ${migrationsTable} (version TEXT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)` }]);
if (result[0]?.type === "error") throw new Error(result[0].error.message);

result = pipeline([{ sql: `SELECT version, checksum FROM ${migrationsTable} ORDER BY version` }]);
if (result[0]?.type === "error") throw new Error(result[0].error.message);
const rows = result[0]?.response?.result?.rows ?? [];
const applied = new Map(rows.map((row) => [row[0]?.value, row[1]?.value]));

const files = readdirSync(migrationsDir).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(name)).sort();
for (const filename of files) {
  const [version, ...nameParts] = filename.replace(/\.sql$/, "").split("_");
  const name = nameParts.join("_");
  const rawSql = readFileSync(join(migrationsDir, filename), "utf8");
  const checksum = createHash("sha256").update(rawSql).digest("hex");
  const storedChecksum = applied.get(version);
  if (storedChecksum === checksum || acceptedHistoricalChecksums[version]?.includes(storedChecksum)) {
    console.log(`skip ${version} ${name}`);
    continue;
  }
  if (applied.has(version)) throw new Error(`Checksum mismatch for migration ${version}`);

  const tolerant = /^-- Tolerant:\s*true\s*$/im.test(rawSql);
  const statements = splitStatements(render(rawSql)).map((sql) => ({ sql }));
  const results = pipeline(statements);
  for (const migrationResult of results) {
    if (migrationResult.type !== "error") continue;
    const message = migrationResult.error?.message ?? "Unknown migration error";
    if (tolerant && (/no such table/i.test(message) || /duplicate column name/i.test(message))) continue;
    throw new Error(`${filename}: ${message}`);
  }
  const insertResult = pipeline([{
    sql: `INSERT INTO ${migrationsTable} (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)`,
    args: [
      { type: "text", value: version },
      { type: "text", value: name },
      { type: "text", value: checksum },
      { type: "text", value: new Date().toISOString() },
    ],
  }]);
  if (insertResult[0]?.type === "error") throw new Error(`${filename}: ${insertResult[0].error.message}`);
  console.log(`apply ${version} ${name}`);
}

console.log(`Migration bootstrap complete (${files.length} migrations).`);
