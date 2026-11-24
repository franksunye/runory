#!/usr/bin/env node
// Compatibility entry point. Recovery must never migrate or seed its source.
// Use explicit --source, --output, --target and --report arguments.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const script = fileURLToPath(new URL("./database-backup.mts", import.meta.url));
const result = spawnSync(process.execPath, ["--import", "tsx", script, "drill", ...process.argv.slice(2)], {
  cwd: dirname(dirname(script)), env: process.env, stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
