import { createClient, type Client, type Transaction } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { runMigrations } from "./migrations";
import { PLATFORM_CONFIG, getDbFilename } from "./platform-config";
import { InvalidInputError } from "./context";
import { AsyncLocalStorage } from "node:async_hooks";

// Opt-in transaction propagation for service functions composed from the
// query helpers below. Existing explicit Transaction callers are unchanged.
const databaseTransaction = new AsyncLocalStorage<Transaction>();
// Track ownership separately so opting into helper propagation from inside an
// existing explicit transaction can reuse it without changing callers outside
// that opt-in scope.
const owningTransaction = new AsyncLocalStorage<Transaction>();
let localServiceWriteQueue: Promise<void> = Promise.resolve();

// ── Lazy Client (Proxy pattern, safe for Next.js hot-reload & next build) ──

declare global {
  // eslint-disable-next-line no-var
  var __platformDb: Client | undefined;
  // eslint-disable-next-line no-var
  var __platformSchemaReady: Promise<void> | undefined;
}

function makeClient(): Client {
  const url = process.env.LIBSQL_URL ?? `file:${process.cwd()}/data/${getDbFilename()}`;
  const authToken = process.env.LIBSQL_AUTH_TOKEN;
  return createClient(authToken ? { url, authToken } : { url });
}

function getDb(): Client {
  if (!globalThis.__platformDb) {
    globalThis.__platformDb = makeClient();
  }
  return globalThis.__platformDb;
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
  if (!globalThis.__platformSchemaReady) {
    globalThis.__platformSchemaReady = (async () => {
      await runMigrations();
    })();
  }
  return globalThis.__platformSchemaReady;
}

// ── Helpers ──

export function genId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function now(): string {
  return new Date().toISOString();
}

/**
 * Validate a SQL identifier (e.g., column or table name) before interpolation.
 * Rejects anything that is not a plain alphanumeric/underscore identifier
 * starting with a letter or underscore, preventing SQL injection via
 * dynamically-constructed column names from field_definitions.
 */
export function validateIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new InvalidInputError(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

// ── Query Helpers ──

export async function query(sql: string, args: unknown[] = []) {
  await ensureSchema();
  return (databaseTransaction.getStore() ?? db).execute({ sql, args: args as never });
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

export interface BatchStatement {
  sql: string;
  args?: unknown[];
  /**
   * Optimistic write guard. When present, the whole transaction rolls back if
   * this statement did not affect exactly the expected number of rows.
   */
  expectedRowsAffected?: number;
}

export class BatchRowsAffectedError extends Error {
  constructor(
    public readonly statementIndex: number,
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(
      `Atomic batch statement ${statementIndex} affected ${actual} row(s); expected ${expected}`,
    );
    this.name = "BatchRowsAffectedError";
  }
}

/**
 * Run multiple statements in a transaction.
 * Note: @libsql/client supports batch with "write" mode for atomicity.
 */
export async function batch(statements: BatchStatement[]): Promise<void> {
  if (statements.length === 0) return;
  await ensureSchema();
  const currentTransaction = databaseTransaction.getStore();
  if (currentTransaction) {
    await executeStatementsInTransaction(currentTransaction, statements);
    return;
  }
  if (statements.some((statement) => statement.expectedRowsAffected !== undefined)) {
    const transaction = await db.transaction("write");
    try {
      for (let index = 0; index < statements.length; index++) {
        const statement = statements[index];
        const result = await transaction.execute({
          sql: statement.sql,
          args: (statement.args ?? []) as never,
        });
        if (
          statement.expectedRowsAffected !== undefined
          && result.rowsAffected !== statement.expectedRowsAffected
        ) {
          throw new BatchRowsAffectedError(
            index,
            statement.expectedRowsAffected,
            result.rowsAffected,
          );
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    return;
  }
  await db.batch(
    statements.map((s) => ({ sql: s.sql, args: (s.args ?? []) as never })),
    "write"
  );
}

export type { Transaction };

/**
 * Execute a callback within a write transaction.
 *
 * The callback receives a Transaction object that supports `execute()`.
 * If the callback throws, the transaction is rolled back. If it succeeds,
 * the transaction is committed. The transaction is always closed.
 *
 * Use this when you need to interleave reads and writes atomically
 * (e.g., checking a dedupe_key before inserting, or reading and
 * incrementing a sequence counter).
 */
export async function runInTransaction<T>(
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  // Within an explicitly propagated transaction, nested work joins the same
  // unit of work. Only the outer caller owns commit/rollback; no second write
  // connection or independently committed nested transaction is opened.
  const currentTransaction = databaseTransaction.getStore() ?? owningTransaction.getStore();
  if (currentTransaction) return fn(currentTransaction);
  await ensureSchema();
  const tx = await db.transaction("write");
  try {
    const result = await owningTransaction.run(tx, () => fn(tx));
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

/**
 * Atomically compose services that use query/execute/batch helpers.
 * Nested calls reuse the outer transaction and must propagate errors when the
 * entire operation needs to roll back. Raw db methods bypass this context and
 * must not be used inside it. Keep external delivery in the durable outbox.
 */
export async function runWithDatabaseTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (databaseTransaction.getStore()) return fn();
  const run = () => runInTransaction((tx) => databaseTransaction.run(tx, fn));
  // The file: driver's synchronous busy wait cannot let another transaction
  // in this process resume and release its write lock. Queue these composed
  // services locally; the database transaction remains the cross-process
  // correctness boundary. Never queue nested work behind its own outer lock.
  if (owningTransaction.getStore() || (process.env.LIBSQL_URL && !process.env.LIBSQL_URL.startsWith("file:"))) {
    return run();
  }
  const previous = localServiceWriteQueue;
  let release!: () => void;
  localServiceWriteQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await run();
  } finally {
    release();
  }
}

/**
 * Execute a BatchStatement[] within a provided transaction.
 * Useful when statements need to be part of a larger transaction
 * managed by runInTransaction().
 */
export async function executeStatementsInTransaction(
  tx: Transaction,
  statements: BatchStatement[],
): Promise<void> {
  for (let index = 0; index < statements.length; index++) {
    const statement = statements[index];
    const result = await tx.execute({
      sql: statement.sql,
      args: (statement.args ?? []) as never,
    });
    if (
      statement.expectedRowsAffected !== undefined
      && result.rowsAffected !== statement.expectedRowsAffected
    ) {
      throw new BatchRowsAffectedError(
        index,
        statement.expectedRowsAffected,
        result.rowsAffected,
      );
    }
  }
}
