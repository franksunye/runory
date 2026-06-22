import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { runMigrations } from "./migrations";

// ── Lazy Client (Proxy pattern, safe for Next.js hot-reload & next build) ──

declare global {
  // eslint-disable-next-line no-var
  var __runoryDb: Client | undefined;
  // eslint-disable-next-line no-var
  var __runorySchemaReady: Promise<void> | undefined;
}

function makeClient(): Client {
  const url = process.env.LIBSQL_URL ?? `file:${process.cwd()}/data/runory.db`;
  const authToken = process.env.LIBSQL_AUTH_TOKEN;
  return createClient(authToken ? { url, authToken } : { url });
}

function getDb(): Client {
  if (!globalThis.__runoryDb) {
    globalThis.__runoryDb = makeClient();
  }
  return globalThis.__runoryDb;
}

/** Lazy client — avoids opening sqlite during `next build` when env is unset. */
export const db: Client = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    const client = getDb();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * Versioned migration initialization.
 * Replaces the old idempotent ensureSchema() with the migration runner.
 * Cached on globalThis for hot-reload safety.
 */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__runorySchemaReady) {
    globalThis.__runorySchemaReady = (async () => {
      await runMigrations();
    })();
  }
  return globalThis.__runorySchemaReady;
}

// ── Helpers ──

export function genId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function now(): string {
  return new Date().toISOString();
}

// ── Query Helpers ──

export async function query(sql: string, args: unknown[] = []) {
  await ensureSchema();
  return db.execute({ sql, args: args as never });
}

export async function queryAll<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T[]> {
  const result = await query(sql, args);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T | undefined> {
  const rows = await queryAll<T>(sql, args);
  return rows[0];
}

export async function execute(sql: string, args: unknown[] = []): Promise<void> {
  await query(sql, args);
}

/**
 * Run multiple statements in a transaction.
 * Note: @libsql/client supports batch with "write" mode for atomicity.
 */
export async function batch(statements: Array<{ sql: string; args?: unknown[] }>): Promise<void> {
  if (statements.length === 0) return;
  await ensureSchema();
  await db.batch(
    statements.map((s) => ({ sql: s.sql, args: (s.args ?? []) as never })),
    "write"
  );
}
