import { defineConfig } from "vitest/config";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// A clean checkout must be testable without a preceding dev-server run.
mkdirSync(resolve(process.cwd(), "data"), { recursive: true });

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    env: {
      LIBSQL_URL: process.env.RUNORY_TEST_DATABASE_URL ?? `file:${process.cwd()}/data/test.db`,
    },
    // Integration tests share a database — run sequentially
    fileParallelism: false,
    // These suites install complete Packs and run real SQLite migrations.
    // Performance budgets are asserted by the dedicated benchmark suite.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
