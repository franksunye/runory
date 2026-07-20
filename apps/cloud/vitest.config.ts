import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      LIBSQL_URL: `file:${process.cwd()}/data/cloud-test.db`,
    },
    // Database-backed route tests reset shared schema and must not overlap.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
