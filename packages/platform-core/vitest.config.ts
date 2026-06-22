import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      LIBSQL_URL: `file:${process.cwd()}/data/test.db`,
    },
    // Integration tests share a database — run sequentially
    fileParallelism: false,
  },
});
