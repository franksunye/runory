import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { db } from "./db";
import { tablePrefix } from "./contracts";

// ── Migration Types ──

export interface MigrationFile {
  version: string;      // e.g., "0001"
  name: string;         // e.g., "baseline"
  filename: string;     // e.g., "0001_baseline.sql"
  sql: string;          // raw SQL with {{RUNORY_TABLE_PREFIX}} placeholders
  checksum: string;     // SHA-256 hex of the raw SQL
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
    return { version, name, filename, sql, checksum };
  });
}

// ── Render SQL with prefix ──

function renderSql(sql: string, prefix: string): string {
  return sql.replaceAll("{{RUNORY_TABLE_PREFIX}}", prefix);
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

async function ensureMigrationsTable(prefix: string): Promise<void> {
  await rawExecute(
    `CREATE TABLE IF NOT EXISTS ${prefix}schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`
  );
}

// ── Get applied migrations ──

async function getAppliedMigrations(prefix: string): Promise<Map<string, AppliedMigration>> {
  const rows = await rawQueryAll<{ version: string; name: string; checksum: string; applied_at: string }>(
    `SELECT version, name, checksum, applied_at FROM ${prefix}schema_migrations ORDER BY version`
  );
  return new Map(rows.map((r) => [r.version, r]));
}

// ── Run a single migration ──

async function runMigration(file: MigrationFile, prefix: string): Promise<void> {
  const rendered = renderSql(file.sql, prefix);
  const statements = splitStatements(rendered);

  // Execute each statement individually — libSQL batch doesn't support DDL in all cases
  for (const stmt of statements) {
    await db.execute(stmt);
  }

  // Record the migration
  await rawExecute(
    `INSERT INTO ${prefix}schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)`,
    [file.version, file.name, file.checksum, now()]
  );
}

// ── Main Migration Runner ──

declare global {
  // eslint-disable-next-line no-var
  var __runoryMigrationsRun: Promise<MigrationResult> | undefined;
}

export function runMigrations(): Promise<MigrationResult> {
  if (!globalThis.__runoryMigrationsRun) {
    globalThis.__runoryMigrationsRun = (async () => {
      const prefix = tablePrefix();
      const files = loadMigrationFiles();
      await ensureMigrationsTable(prefix);
      const applied = await getAppliedMigrations(prefix);

      const toApply: MigrationFile[] = [];
      const skipped: MigrationFile[] = [];
      const checksumMismatches: Array<{ file: MigrationFile; stored: string }> = [];

      for (const file of files) {
        const record = applied.get(file.version);
        if (!record) {
          toApply.push(file);
        } else if (record.checksum !== file.checksum) {
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
        await runMigration(file, prefix);
      }

      return {
        applied: toApply,
        skipped,
        checksumMismatches: [],
      };
    })();
  }
  return globalThis.__runoryMigrationsRun;
}

// ── Reset migration cache (for tests) ──

export function resetMigrationCache(): void {
  globalThis.__runoryMigrationsRun = undefined;
}

// ── Get migration status ──

export async function getMigrationStatus(): Promise<{
  applied: AppliedMigration[];
  pending: MigrationFile[];
}> {
  const prefix = tablePrefix();
  await ensureMigrationsTable(prefix);
  const appliedMap = await getAppliedMigrations(prefix);
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
