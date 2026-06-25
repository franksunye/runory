#!/usr/bin/env node
/**
 * Print the current database migration status.
 *
 * Usage: pnpm db:status
 *
 * Checks the data/ directory for database files. To check detailed migration
 * status (applied vs pending), start the dev server first — migrations are
 * applied lazily on first DB access and logged to the console.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");

console.log("\n=== Database Status ===\n");

if (!existsSync(dataDir)) {
  console.log("No data/ directory found.");
  console.log("Run `pnpm dev` to create a fresh database with all migrations.");
  process.exit(0);
}

const files = readdirSync(dataDir).filter(
  (f) => f.endsWith(".db") || f.endsWith(".db-wal") || f.endsWith(".db-shm")
);

if (files.length > 0) {
  console.log("Database files in data/:");
  for (const f of files) {
    console.log(`  ${f}`);
  }
  console.log("\nMigrations are applied lazily on server startup.");
  console.log("Check the dev server console for migration logs, or run `pnpm db:reset` to start fresh.");
} else {
  console.log("No database files found in data/.");
  console.log("Run `pnpm dev` to create a fresh database with all migrations.");
}
process.exit(0);
