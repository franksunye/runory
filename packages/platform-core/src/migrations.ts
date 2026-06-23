import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { db } from "./db";
import { tablePrefix } from "./contracts";
import {
  renderSqlWithPrefix,
  getBusinessTablePrefix,
  getTableNamespacePrefixes,
} from "./platform-config";

// ── Migration Types ──

export interface MigrationFile {
  version: string;      // e.g., "0001"
  name: string;         // e.g., "baseline"
  filename: string;     // e.g., "0001_baseline.sql"
  sql: string;          // raw SQL with {{PLATFORM_TABLE_PREFIX}} (or legacy {{RUNORY_TABLE_PREFIX}}) placeholders
  checksum: string;     // SHA-256 hex of the raw SQL
  transactional: boolean;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: string;
}

export interface MigrationResult {
  applied: MigrationFile[];
  skipped: MigrationFile[];
  checksumMismatches: Array<{ file: MigrationFile; stored: string }>;
}

// ── Migration Directory Resolution ──

function migrationsDir(): string {
  const candidates = [
    resolve(process.cwd(), ".resources", "schema", "migrations"),
    resolve(process.cwd(), "schema", "migrations"),
    resolve(process.cwd(), "..", "..", "schema", "migrations"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(
    `Migrations directory not found (tried: ${candidates.join(", ")})`
  );
}

// ── Load Migration Files ──

const MIGRATION_FILENAME = /^(\d{4})_([a-z0-9_]+)\.sql$/i;

// 0008 was edited twice during pre-release:
//   1. POC-era edit (53d6b8...) — 0011 normalizes the resulting schema.
//   2. v0.2.2 edit (ef1274...) — CRM object model correction: removed deprecated
//      customer table, updated contact to use primary_company_id, added company/
//      deal/task tables for cloud-mode pre-creation.
// 0011 was edited in v0.2.2: removed the contact table repair section since 0008
// now creates the correct contact schema. The platform table renames are unchanged.
// Unknown checksum changes still fail.
const ACCEPTED_HISTORICAL_CHECKSUMS: Readonly<Record<string, readonly string[]>> = {
  "0008": [
    "53d6b833c0338c0a805da9cbf90519baa42b866d000e061a0c37e0ec247ab6bb",
    "ef1274f395990fb639796db16d25e1cd13762a10cb1b07d39cac1bf14fa50517",
  ],
  "0011": ["22d273441f560b0d2f1bf39f5d147901bdf053e21073a07a81207eb8a810a5ad"],
};

function checksumMatches(file: MigrationFile, stored: string): boolean {
  return file.checksum === stored
    || (ACCEPTED_HISTORICAL_CHECKSUMS[file.version] ?? []).includes(stored);
}

export function loadMigrationFiles(): MigrationFile[] {
  const dir = migrationsDir();
  const files = readdirSync(dir)
    .filter((f) => MIGRATION_FILENAME.test(f))
    .sort();

  return files.map((filename) => {
    const match = filename.match(MIGRATION_FILENAME)!;
    const version = match[1];
    const name = match[2];
    const sql = readFileSync(join(dir, filename), "utf-8");
    const checksum = createHash("sha256").update(sql, "utf-8").digest("hex");
    const transactional = /^-- Transaction:\s*required\s*$/im.test(sql);
    return { version, name, filename, sql, checksum, transactional };
  });
}

// ── Render SQL with prefix ──

function renderSql(sql: string, prefix: string): string {
  return renderSqlWithPrefix(sql, prefix, getBusinessTablePrefix());
}

// ── Split SQL into statements ──

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => line.trim() && !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((s) => s.length > 0)
    .map((s) => s + ";");
}

// ── Internal helpers (use db directly, NOT ensureSchema, to avoid circular dependency) ──

function now(): string {
  return new Date().toISOString();
}

async function rawExecute(sql: string, args: unknown[] = []): Promise<void> {
  await db.execute({ sql, args: args as never });
}

async function rawQueryAll<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T[]> {
  const result = await db.execute({ sql, args: args as never });
  return result.rows as T[];
}

// ── Ensure schema_migrations table exists ──

async function tableExists(name: string): Promise<boolean> {
  const rows = await rawQueryAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name]
  );
  return rows.length > 0;
}

async function resolveMigrationsTable(legacyPrefix: string): Promise<string> {
  const desired = `${getTableNamespacePrefixes().system}schema_migrations`;
  if (await tableExists(desired)) return desired;

  const legacyCandidates = [
    `${legacyPrefix}schema_migrations`,
    "platform_schema_migrations",
    "runory_schema_migrations",
  ].filter((value, index, values) => values.indexOf(value) === index);

  for (const legacy of legacyCandidates) {
    if (await tableExists(legacy)) {
      await rawExecute(`ALTER TABLE ${legacy} RENAME TO ${desired}`);
      return desired;
    }
  }
  return desired;
}

async function ensureMigrationsTable(table: string): Promise<void> {
  await rawExecute(
    `CREATE TABLE IF NOT EXISTS ${table} (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`
  );
}

// ── Get applied migrations ──

async function getAppliedMigrations(table: string): Promise<Map<string, AppliedMigration>> {
  const rows = await rawQueryAll<{ version: string; name: string; checksum: string; applied_at: string }>(
    `SELECT version, name, checksum, applied_at FROM ${table} ORDER BY version`
  );
  return new Map(rows.map((r) => [r.version, r]));
}

// ── Run a single migration ──

async function runMigration(file: MigrationFile, prefix: string, migrationsTable: string): Promise<void> {
  const rendered = renderSql(file.sql, prefix);
  const statements = splitStatements(rendered);

  if (file.transactional) {
    await db.batch(
      [
        ...statements.map((sql) => ({ sql, args: [] })),
        {
          sql: `INSERT INTO ${migrationsTable} (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)`,
          args: [file.version, file.name, file.checksum, now()],
        },
      ] as never,
      "write"
    );
    return;
  }

  // Older migrations execute statement-by-statement for libSQL compatibility.
  for (const stmt of statements) {
    await db.execute(stmt);
  }

  // Record the migration
  await rawExecute(
    `INSERT INTO ${migrationsTable} (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)`,
    [file.version, file.name, file.checksum, now()]
  );
}

// ── Main Migration Runner ──

declare global {
  // eslint-disable-next-line no-var
  var __platformMigrationsRun: Promise<MigrationResult> | undefined;
}

export function runMigrations(): Promise<MigrationResult> {
  if (!globalThis.__platformMigrationsRun) {
    globalThis.__platformMigrationsRun = (async () => {
      const prefix = tablePrefix();
      const files = loadMigrationFiles();
      const migrationsTable = await resolveMigrationsTable(prefix);
      await ensureMigrationsTable(migrationsTable);
      const applied = await getAppliedMigrations(migrationsTable);

      const toApply: MigrationFile[] = [];
      const skipped: MigrationFile[] = [];
      const checksumMismatches: Array<{ file: MigrationFile; stored: string }> = [];

      for (const file of files) {
        const record = applied.get(file.version);
        if (!record) {
          toApply.push(file);
        } else if (!checksumMatches(file, record.checksum)) {
          checksumMismatches.push({ file, stored: record.checksum });
        } else {
          skipped.push(file);
        }
      }

      if (checksumMismatches.length > 0) {
        const details = checksumMismatches
          .map((m) => `version ${m.file.version} (${m.file.filename}): expected ${m.file.checksum}, stored ${m.stored}`)
          .join("; ");
        throw new Error(`Migration checksum mismatch — migrations are immutable. ${details}`);
      }

      for (const file of toApply) {
        await runMigration(file, prefix, migrationsTable);
      }

      return {
        applied: toApply,
        skipped,
        checksumMismatches: [],
      };
    })();
  }
  return globalThis.__platformMigrationsRun;
}

// ── Reset migration cache (for tests) ──

export function resetMigrationCache(): void {
  globalThis.__platformMigrationsRun = undefined;
}

// ── Get migration status ──

export async function getMigrationStatus(): Promise<{
  applied: AppliedMigration[];
  pending: MigrationFile[];
}> {
  const prefix = tablePrefix();
  const migrationsTable = await resolveMigrationsTable(prefix);
  await ensureMigrationsTable(migrationsTable);
  const appliedMap = await getAppliedMigrations(migrationsTable);
  const files = loadMigrationFiles();
  const applied: AppliedMigration[] = [];
  const pending: MigrationFile[] = [];

  for (const file of files) {
    const record = appliedMap.get(file.version);
    if (record) {
      applied.push(record);
    } else {
      pending.push(file);
    }
  }

  return { applied, pending };
}
