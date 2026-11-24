#!/usr/bin/env node
/** Reproducible G1/G2 checks against a new, isolated local database only. */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";

const root = path.resolve(import.meta.dirname, "..");
const cloud = path.join(root, "apps/cloud");
const require = createRequire(import.meta.url);
// Each CI browser project gets its own server, database and upload directory.
// Without a selection, local verification continues to run both projects.
const browserProject = process.env.RUNORY_BROWSER_PROJECT;
if (browserProject && !["desktop-chromium", "mobile-chromium"].includes(browserProject)) {
  throw new Error("RUNORY_BROWSER_PROJECT must name a configured release browser project");
}
const expectedCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
function assertCleanCommit() {
  const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const changes = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).trim();
  if (changes || currentCommit !== expectedCommit) throw new Error("Release verification requires an unchanged, clean commit including untracked source files");
}
assertCleanCommit();
// Next loads dotenv files itself. A fresh checkout is required so no hidden
// file can inject provider credentials into this isolated verification.
for (const directory of [root, cloud]) {
  for (const filename of [".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local", ".env.test", ".env.test.local"]) {
    if (existsSync(path.join(directory, filename))) throw new Error("Use a clean checkout without dotenv files for isolated release verification");
  }
}
const run = mkdtempSync(path.join(tmpdir(), "runory-release-"));
const artifactRoot = path.join(cloud, "test-results/release");
mkdirSync(artifactRoot, { recursive: true });
const artifacts = mkdtempSync(path.join(artifactRoot, "run-"));
const port = Number(process.env.RUNORY_VERIFY_PORT ?? "3100");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local verification port");
const base = `http://127.0.0.1:${port}`;
const inheritedKeys = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP", "LANG", "TZ", "CI", "COREPACK_HOME", "PNPM_HOME", "XDG_CACHE_HOME", "RUNORY_CHROMIUM_EXECUTABLE_PATH"];
const inheritedEnvironment = Object.fromEntries(inheritedKeys.flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
const env = {
  ...inheritedEnvironment, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
  LIBSQL_URL: `file:${path.join(run, "platform.db")}`, LIBSQL_AUTH_TOKEN: "",
  PLATFORM_DEPLOYMENT_MODE: "local", PLATFORM_DEV_BOOTSTRAP: "true",
  PLATFORM_OTP_RETURN_DEV_CODE: "false", PLATFORM_TRUST_IDENTITY_HEADERS: "false",
  PLATFORM_MAIL_PROVIDER_URL: "", RUNORY_MAIL_PROVIDER_URL: "",
  STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", STRIPE_CONNECT_WEBHOOK_SECRET: "",
  RETELL_API_KEY: "", BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "",
  RUNORY_ATTACHMENT_STORAGE: "local", RUNORY_LOCAL_UPLOADS_DIR: path.join(run, "uploads"),
  MALWARE_SCAN_ENDPOINT: "", RUNORY_MALWARE_SCAN_REQUIRED: "false",
  CUSTOMER_ACCESS_SESSION_SECRET: randomBytes(32).toString("hex"),
  RUNORY_API_BASE: base, RUNORY_E2E_ENVIRONMENT: "dev",
  RUNORY_ISOLATED_VERIFICATION: "true",
  RUNORY_VERIFICATION_DATABASE_URL: `file:${path.join(run, "platform.db")}`,
  RUNORY_COMMIT_SHA: expectedCommit,
  RUNORY_E2E_RESULT_PATH: path.join(artifacts, "api-result.json"),
};

function execute(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)));
  });
}

await execute("node", ["scripts/sync-resources.mjs"], cloud);
await execute(process.execPath, ["--import", "tsx", "scripts/verify-connect-http.mts", `--report=${path.join(artifacts, "connect-result.json")}`], cloud);
// Refuse to reuse another process, which might point at a different database.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", error => reject(new Error(`Verification port ${port} cannot be reserved`, { cause: error })));
  probe.listen(port, "127.0.0.1", () => probe.close(error => error ? reject(error) : resolve()));
});
const serverLog = createWriteStream(path.join(artifacts, "server.log"), { mode: 0o600 });
const nextCli = require.resolve("next/dist/bin/next", { paths: [cloud] });
const playwrightCli = path.join(path.dirname(require.resolve("@playwright/test/package.json", { paths: [cloud] })), "cli.js");
const server = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: cloud, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
});
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let serverError;
server.on("error", error => { serverError = error; });
const stop = () => {
  if (!server.pid) return;
  try { process.platform === "win32" ? server.kill("SIGTERM") : process.kill(-server.pid, "SIGTERM"); } catch { /* already exited */ }
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const checks = { connectHttp: "PASS", api: "NOT_RUN", recovery: "NOT_RUN", browser: "NOT_RUN" };
function writeSummary(status, error) {
  const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const workingTreeDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).trim());
  writeFileSync(path.join(artifacts, "verification-summary.json"), JSON.stringify({
    status, commit: expectedCommit, currentCommit, workingTreeDirty, completedAt: new Date().toISOString(), checks,
    apiEvidence: "api-result.json", recoveryEvidence: "recovery-result.json",
    connectHttpEvidence: "connect-result.json",
    browserProject: browserProject ?? "all",
    providerAcceptance: "NOT RUN: isolated checks use no external provider credentials",
    productionDataAccessed: false,
    ...(error ? { error: error.message ?? String(error) } : {}),
  }, null, 2) + "\n");
}

try {
  const deadline = Date.now() + 120_000;
  let healthy = false;
  while (Date.now() < deadline) {
    if (serverError || server.exitCode !== null) throw serverError ?? new Error("Local server exited before readiness");
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) { healthy = true; break; }
    } catch { /* compilation in progress */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!healthy) throw new Error("Local server readiness timed out; inspect test-results/release/server.log");
  checks.api = "RUNNING";
  await execute("node", ["scripts/bootstrap-demo.mjs"], cloud);
  await execute("node", ["scripts/e2e-walkthrough/run-business-walkthrough.mjs"], cloud);
  await execute("node", ["scripts/validate-e2e-result.mjs", env.RUNORY_E2E_RESULT_PATH]);
  checks.api = "PASS";
  checks.recovery = "RUNNING";
  await execute(process.execPath, ["--import", "tsx", "scripts/database-backup.mts", "drill", "--source", env.LIBSQL_URL,
    "--output", path.join(run, "backup.json.gz"), "--target", path.join(run, "restored.db"),
    "--report", path.join(artifacts, "recovery-result.json")], cloud);
  const recovery = JSON.parse(readFileSync(path.join(artifacts, "recovery-result.json"), "utf8"));
  if (recovery.status !== "PASS" || recovery.sourceWrites !== false || !recovery.reopenedAndVerified
    || recovery.appliedMigrations < 54 || recovery.tables < 1 || recovery.rows < 1
    || !(recovery.applicationInventory?.catalogItems > 0)
    || !(recovery.applicationInventory?.catalogVersions > 0)
    || !(recovery.applicationInventory?.installations > 0)) {
    throw new Error("Recovery must verify a populated current-version database, Catalog and installations");
  }
  checks.recovery = "PASS";
  checks.browser = "RUNNING";
  // Finish fixture writes before any browser starts issuing concurrent requests.
  await execute(process.execPath, ["--import", "tsx", "scripts/sync-pack-permission-groups.mjs"], cloud);
  env.RUNORY_E2E_SYNCED_PERMISSIONS_DB = env.LIBSQL_URL;
  await execute(process.execPath, [playwrightCli, "test", "g2-", "release-evidence.pw.ts",
    ...(browserProject ? [`--project=${browserProject}`] : [])], cloud);
  checks.browser = "PASS";
  assertCleanCommit();
  writeSummary("PASS");
} catch (error) {
  for (const check of Object.keys(checks)) if (checks[check] === "RUNNING") checks[check] = "FAIL";
  writeSummary("FAIL", error);
  throw error;
} finally {
  stop();
  if (server.exitCode === null) await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]);
  serverLog.end();
}
