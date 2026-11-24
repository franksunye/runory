import { defineConfig } from "vitest/config";
import path from "node:path";
import { mkdirSync } from "node:fs";

mkdirSync(path.resolve(process.cwd(), "data"), { recursive: true });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      LIBSQL_URL: process.env.RUNORY_TEST_DATABASE_URL ?? `file:${process.cwd()}/data/cloud-test.db`,
    },
    // Database-backed route tests reset shared schema and must not overlap.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
