#!/usr/bin/env node
/**
 * Reset the local development database.
 *
 * Usage: pnpm db:reset
 *
 * Deletes the SQLite database file(s) in the data/ directory.
 * After reset, the next `pnpm dev` or `pnpm build` will recreate
 * the schema from migrations. All workspace data will be lost.
 */
import { existsSync, unlinkSync, readdirSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");

if (!existsSync(dataDir)) {
  console.log("No data/ directory found. Nothing to reset.");
  console.log("Run `pnpm dev` to create a fresh database.");
  process.exit(0);
}

let deleted = 0;
const files = readdirSync(dataDir);

for (const file of files) {
  // Delete .db, .db-wal, .db-shm files
  if (file.endsWith(".db") || file.endsWith(".db-wal") || file.endsWith(".db-shm")) {
    const filePath = path.join(dataDir, file);
    console.log(`Deleting: ${filePath}`);
    unlinkSync(filePath);
    deleted++;
  }
}

if (deleted > 0) {
  console.log(`\n✓ Deleted ${deleted} file(s). Run \`pnpm dev\` to recreate the schema.`);
} else {
  console.log("\n✓ No database files found in data/. Run `pnpm dev` to create a fresh database.");
}
process.exit(0);
