import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";

type SqlExecutor = Pick<Client, "execute">;
type StoredValue = string | number | null | { type: "integer" | "blob"; value: string };
interface SchemaEntry { type: string; name: string; sql: string }
interface TableBackup { name: string; columns: string[]; rows: StoredValue[][] }

export interface DatabaseBackup {
  format: "runory.database-backup/v1";
  createdAt: string;
  schema: SchemaEntry[];
  tables: TableBackup[];
  schemaChecksum: string;
  dataChecksum: string;
  checksum: string;
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

function storeValue(value: unknown, storageType: string): StoredValue {
  if (storageType === "null" && value === null) return null;
  if (storageType === "text" && typeof value === "string") return value;
  if (storageType === "integer") {
    if (typeof value === "bigint") return { type: "integer", value: value.toString() };
    if (typeof value === "string" && /^-?\d+$/.test(value)) return { type: "integer", value };
    if (typeof value === "number" && Number.isSafeInteger(value)) return { type: "integer", value: String(value) };
    throw new Error("Unsafe integer: open backup clients with intMode=bigint");
  }
  // SQLite REAL 1.0 and INTEGER 1 are different storage values, even though
  // both may appear as an integral JS number. Preserve SQLite's actual type,
  // including large finite REALs that are outside the safe-integer range.
  if (storageType === "real" && typeof value === "number" && Number.isFinite(value)) return value;
  if (storageType === "blob" && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) {
    const bytes = value instanceof ArrayBuffer
      ? Buffer.from(value)
      : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    return { type: "blob", value: bytes.toString("base64") };
  }
  throw new Error("Unsupported database value in backup");
}

function restoreValue(value: StoredValue): string | number | null | bigint | Uint8Array {
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  if (value.type === "integer" && /^-?\d+$/.test(value.value)) return BigInt(value.value);
  if (value.type === "blob") return Buffer.from(value.value, "base64");
  throw new Error("Invalid database value in backup");
}

async function readState(client: SqlExecutor) {
  const schemaResult = await client.execute(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type, name",
  );
  const schema: SchemaEntry[] = schemaResult.rows.map(row => ({
    type: String(row.type), name: String(row.name), sql: String(row.sql),
  }));
  const tableNames = schema.filter(entry => entry.type === "table").map(entry => entry.name);
  if (tableNames.length === 0) throw new Error("Refusing to certify an empty application database");
  const sequence = await client.execute("SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'");
  if (sequence.rows.length > 0) tableNames.push("sqlite_sequence");
  tableNames.sort();
  const tables: TableBackup[] = [];
  for (const name of tableNames) {
    // Generated columns must be recomputed, not inserted during recovery.
    const info = await client.execute(`PRAGMA table_xinfo(${identifier(name)})`);
    const columns = info.rows.filter(row => Number(row.hidden) === 0).map(row => String(row.name));
    const projection = [...columns.map(identifier), ...columns.map(column => `typeof(${identifier(column)})`)];
    const result = await client.execute(`SELECT ${projection.join(", ")} FROM ${identifier(name)}`);
    // Read by position so a real column named like a typeof expression cannot
    // collide with the extra storage-type projection.
    const rows = result.rows.map(row => columns.map((_column, index) => storeValue(row[index], String(row[columns.length + index]))));
    // Row order is not a business invariant. Canonical ordering makes hashes
    // independent of a restored database's physical query plan.
    rows.sort((a, b) => {
      const left = JSON.stringify(a), right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    tables.push({ name, columns, rows });
  }
  return { schema, tables, schemaChecksum: hash(schema), dataChecksum: hash(tables) };
}

async function assertIntegrity(client: SqlExecutor) {
  const integrity = await client.execute("PRAGMA integrity_check");
  if (integrity.rows.length !== 1 || String(integrity.rows[0][0]) !== "ok") {
    throw new Error("Database integrity check failed");
  }
  const foreignKeys = await client.execute("PRAGMA foreign_key_check");
  if (foreignKeys.rows.length > 0) throw new Error("Database foreign-key check failed");
}

/** Read-only, transaction-consistent logical backup. Never migrates or seeds its source. */
export async function createDatabaseBackup(client: Client): Promise<DatabaseBackup> {
  const tx = await client.transaction("read");
  try {
    await assertIntegrity(tx);
    const state = await readState(tx);
    const payload = { format: "runory.database-backup/v1" as const, createdAt: new Date().toISOString(), ...state };
    await tx.commit();
    return { ...payload, checksum: hash(payload) };
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  } finally {
    tx.close();
  }
}

export function validateDatabaseBackup(backup: DatabaseBackup): void {
  if (backup?.format !== "runory.database-backup/v1" || !Array.isArray(backup.schema) || !Array.isArray(backup.tables)) {
    throw new Error("Unsupported database backup format");
  }
  const { checksum, ...payload } = backup;
  if (hash(payload) !== checksum || hash(backup.schema) !== backup.schemaChecksum || hash(backup.tables) !== backup.dataChecksum) {
    throw new Error("Database backup checksum mismatch");
  }
  if (!backup.schema.some(entry => entry.type === "table")) throw new Error("Empty database backup");
}

/**
 * Restore a trusted backup into a NEW, EMPTY database only. No DROP, source
 * mutation or in-place production restore is supported. Integrity and complete
 * schema/data hashes are checked before the write transaction is committed.
 */
export async function restoreDatabaseBackup(client: Client, backup: DatabaseBackup): Promise<void> {
  validateDatabaseBackup(backup);
  const tx = await client.transaction("write");
  try {
    const existing = await tx.execute("SELECT name FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'");
    if (existing.rows.length > 0) throw new Error("Restore target is not empty; refusing to overwrite data");
    await tx.execute("PRAGMA defer_foreign_keys = ON");
    for (const entry of backup.schema.filter(entry => entry.type === "table")) await tx.execute(entry.sql);
    for (const table of backup.tables) {
      // AUTOINCREMENT counters may exceed MAX(id) after deletions.
      if (table.name === "sqlite_sequence") await tx.execute("DELETE FROM sqlite_sequence");
      const sql = `INSERT INTO ${identifier(table.name)} (${table.columns.map(identifier).join(", ")}) VALUES (${table.columns.map(() => "?").join(", ")})`;
      for (const row of table.rows) await tx.execute({ sql, args: row.map(restoreValue) });
    }
    // Triggers are created after rows, so recovery cannot replay side effects.
    for (const entry of backup.schema.filter(entry => entry.type !== "table")) await tx.execute(entry.sql);
    await assertIntegrity(tx);
    const restored = await readState(tx);
    if (restored.schemaChecksum !== backup.schemaChecksum || restored.dataChecksum !== backup.dataChecksum) {
      throw new Error("Restored schema/data do not match the backup");
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  } finally {
    tx.close();
  }
}

export async function verifyDatabaseBackup(client: Client, backup: DatabaseBackup) {
  validateDatabaseBackup(backup);
  const actual = await createDatabaseBackup(client);
  if (actual.schemaChecksum !== backup.schemaChecksum || actual.dataChecksum !== backup.dataChecksum) {
    throw new Error("Database does not match backup");
  }
  return {
    tables: backup.tables.length,
    rows: backup.tables.reduce((sum, table) => sum + table.rows.length, 0),
    schemaChecksum: actual.schemaChecksum,
    dataChecksum: actual.dataChecksum,
  };
}
