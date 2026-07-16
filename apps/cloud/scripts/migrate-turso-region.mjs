#!/usr/bin/env node
/**
 * Copies one Turso/libSQL database into an empty regional replacement.
 *
 * Usage:
 *   RUNORY_TURSO_SOURCE_URL=... RUNORY_TURSO_SOURCE_AUTH_TOKEN=... \
 *   RUNORY_TURSO_TARGET_URL=... RUNORY_TURSO_TARGET_AUTH_TOKEN=... \
 *   node apps/cloud/scripts/migrate-turso-region.mjs --apply
 *
 * The source is read only. The target must not contain user tables unless
 * --allow-nonempty is deliberately supplied. This is a development-stage
 * region move, not a general online replication mechanism.
 */
import { createClient } from "@libsql/client";

const apply = process.argv.includes("--apply");
const allowNonempty = process.argv.includes("--allow-nonempty");
const required = [
  "RUNORY_TURSO_SOURCE_URL",
  "RUNORY_TURSO_SOURCE_AUTH_TOKEN",
  "RUNORY_TURSO_TARGET_URL",
  "RUNORY_TURSO_TARGET_AUTH_TOKEN",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
if (process.env.RUNORY_TURSO_SOURCE_URL === process.env.RUNORY_TURSO_TARGET_URL) throw new Error("Source and target URLs must differ");

const source = createClient({
  url: process.env.RUNORY_TURSO_SOURCE_URL,
  authToken: process.env.RUNORY_TURSO_SOURCE_AUTH_TOKEN,
});
const target = createClient({
  url: process.env.RUNORY_TURSO_TARGET_URL,
  authToken: process.env.RUNORY_TURSO_TARGET_AUTH_TOKEN,
});

const schemaSql = `SELECT type, name, tbl_name, sql
  FROM sqlite_master
  WHERE type IN ('table', 'index', 'trigger', 'view')
    AND sql IS NOT NULL
    AND name NOT LIKE 'sqlite_%'
  ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'view' THEN 2 WHEN 'index' THEN 3 WHEN 'trigger' THEN 4 END, name`;

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function userTables(client) {
  const result = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return result.rows.map((row) => String(row.name));
}

async function rowCount(client, table) {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
  return Number(result.rows[0].count);
}

async function copyTable(table) {
  const sourceData = await source.execute(`SELECT * FROM ${quoteIdentifier(table)}`);
  if (sourceData.rows.length === 0) return 0;
  const columns = sourceData.columns;
  const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  const statements = sourceData.rows.map((row) => ({ sql, args: columns.map((column) => row[column]) }));
  for (let offset = 0; offset < statements.length; offset += 100) {
    await target.batch(statements.slice(offset, offset + 100), "write");
  }
  return sourceData.rows.length;
}

try {
  const [sourceSchema, existingTargetTables] = await Promise.all([
    source.execute(schemaSql),
    userTables(target),
  ]);
  const sourceTables = sourceSchema.rows.filter((row) => row.type === "table").map((row) => String(row.name));

  console.log(JSON.stringify({
    mode: apply ? "apply" : "plan",
    sourceTables: sourceTables.length,
    targetTables: existingTargetTables.length,
  }));

  if (existingTargetTables.length && !allowNonempty) {
    throw new Error(`Refusing to write to non-empty target (${existingTargetTables.length} tables). Use --allow-nonempty only after an explicit backup and review.`);
  }
  if (!apply) {
    console.log("Plan only. Re-run with --apply to copy schema and data.");
    process.exit(0);
  }

  await target.execute("PRAGMA foreign_keys = OFF");

  for (const row of sourceSchema.rows.filter((row) => row.type === "table")) {
    await target.execute(String(row.sql));
  }

  const copied = [];
  for (const table of sourceTables) {
    const count = await copyTable(table);
    copied.push([table, count]);
  }

  for (const row of sourceSchema.rows.filter((row) => row.type !== "table")) {
    await target.execute(String(row.sql));
  }
  await target.execute("PRAGMA foreign_keys = ON");

  for (const [table, copiedCount] of copied) {
    const [from, to] = await Promise.all([rowCount(source, table), rowCount(target, table)]);
    if (from !== to || to !== copiedCount) throw new Error(`Verification failed for ${table}: source=${from}, copied=${copiedCount}, target=${to}`);
  }
  console.log(JSON.stringify({ status: "verified", tables: copied.length, copiedRows: copied.reduce((total, [, count]) => total + count, 0) }));
} finally {
  await Promise.allSettled([source.close(), target.close()]);
}
