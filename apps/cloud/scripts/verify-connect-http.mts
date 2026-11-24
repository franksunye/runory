#!/usr/bin/env node
/**
 * Real Next HTTP regression for Stripe Connect's CSRF/signature boundary.
 * Run from apps/cloud (no package-manager network resolution is needed):
 *   node --import tsx scripts/verify-connect-http.mts
 * Optional: --port=3127 --report=/absolute/path/connect-http.json
 * Uses only synthetic credentials, an isolated temporary SQLite DB and loopback.
 */
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const guardPath = join(appDir, "scripts", "test-support", "loopback-only.cjs");
require(guardPath);
process.chdir(appDir);
const args = process.argv.slice(2);
const port = Number(args.find((arg) => arg.startsWith("--port="))?.slice(7) ?? "3127");
assert(Number.isInteger(port) && port >= 1024 && port <= 65535, "Invalid local test port");
const reportPath = args.find((arg) => arg.startsWith("--report="))?.slice(9);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(join(tmpdir(), "runory-connect-http-"));
const secret = `whsec_synthetic_${randomBytes(24).toString("hex")}`;
const fixtureEnv: Record<string, string> = {
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_IGNORE_INCORRECT_LOCKFILE: "1",
  LIBSQL_URL: `file:${join(tempDir, "connect.db")}`,
  LIBSQL_AUTH_TOKEN: "",
  PLATFORM_DEPLOYMENT_MODE: "local",
  PLATFORM_DEV_BOOTSTRAP: "false",
  PLATFORM_TRUST_IDENTITY_HEADERS: "false",
  RUNORY_TRUST_IDENTITY_HEADERS: "false",
  PLATFORM_TRUST_PROXY_VERIFIED: "false",
  PLATFORM_OTP_RETURN_DEV_CODE: "false",
  STRIPE_CONNECT_WEBHOOK_SECRET: secret,
  STRIPE_SECRET_KEY: "sk_test_synthetic_connect_http_only",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic_unused",
  STRIPE_PAYMENT_MODE: "test",
  STRIPE_CONNECT_ACCOUNT_ID: "acct_synthetic_connect_http",
  STRIPE_ACCOUNT_ID: "acct_synthetic_connect_http",
  RUNORY_BILLING_STRIPE_SECRET_KEY: "sk_test_synthetic_unused",
  RUNORY_BILLING_STRIPE_WEBHOOK_SECRET: "whsec_synthetic_unused",
  RUNORY_BILLING_STRIPE_MODE: "test",
  NEXT_PUBLIC_APP_URL: baseUrl,
};
Object.assign(process.env, fixtureEnv);

let server: ChildProcess | undefined;
let serverLog = "";
let closeDb: (() => void) | undefined;
let failure: unknown;

async function ensurePortIsFree() {
  const probe = createServer();
  await new Promise<void>((accept, reject) => {
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close((error) => error ? reject(error) : accept()));
  });
}

async function waitForNext() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`Next exited before becoming ready (${server?.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/api/integrations/stripe/connect-webhook`, { signal: AbortSignal.timeout(2500) });
      await response.arrayBuffer();
      if (response.status === 405) return;
    } catch { /* startup/initial compilation still in progress */ }
    await delay(400);
  }
  throw new Error("Next did not become ready within 120 seconds");
}

function signature(payload: string, signingSecret = secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", signingSecret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

async function deliver(event: unknown, valid = true) {
  const payload = JSON.stringify(event);
  // Deliberately omit Origin and X-Requested-With: this must traverse the real
  // Next middleware exemption before the actual route verifies the raw body.
  const response = await fetch(`${baseUrl}/api/integrations/stripe/connect-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature(payload, valid ? secret : "whsec_wrong_synthetic_secret") },
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function businessState(row: Record<string, unknown>) {
  const { last_synced_at: _lastSynced, updated_at: _updated, ...state } = row;
  return state;
}

try {
  await ensurePortIsFree();
  const { db, createWorkspace, installModule, upsertPaymentProviderAccount, queryOne, businessTable } = await import("@runory/platform-core");
  closeDb = () => db.close();
  const workspace = await createWorkspace("Synthetic Connect HTTP acceptance");
  await installModule(workspace.id, "runory.contact");
  await installModule(workspace.id, "runory.payment");
  const accountId = "ppa_synthetic_connect_http";
  const accountRef = "acct_synthetic_connect_http";
  await upsertPaymentProviderAccount({ workspaceId: workspace.id, id: accountId, provider: "stripe", mode: "test", providerAccountRef: accountRef });
  const table = businessTable("payment_provider_account");
  const readState = async () => {
    const row = await queryOne<Record<string, unknown>>(`SELECT * FROM ${table} WHERE workspace_id=? AND id=?`, [workspace.id, accountId]);
    assert(row, "Fixture provider account must exist");
    return row;
  };
  const before = await readState();
  assert.equal(before.onboarding_status, "not_started");

  const childEnv = { ...process.env, ...fixtureEnv, NODE_OPTIONS: `--require ${JSON.stringify(guardPath)}` };
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: appDir, env: childEnv, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
  });
  const capture = (chunk: Buffer) => { serverLog = (serverLog + chunk.toString()).slice(-64_000); };
  server.stdout?.on("data", capture);
  server.stderr?.on("data", capture);
  server.once("error", (error) => { serverLog += `\n${error.message}`; });
  await waitForNext();

  const event = {
    id: "evt_synthetic_connect_http_complete", object: "event", api_version: "2024-06-20",
    type: "account.updated", account: accountRef, livemode: false, created: Math.floor(Date.now() / 1000),
    data: { object: { id: accountRef, object: "account", details_submitted: true, charges_enabled: true, payouts_enabled: true,
      requirements: { currently_due: [], eventually_due: [], past_due: [], disabled_reason: null } } },
  };
  const valid = await deliver(event);
  assert.equal(valid.status, 200, JSON.stringify(valid.body));
  assert.equal(valid.body.processed, true);
  assert.equal(valid.body.workspaceId, workspace.id);
  assert(valid.headers.get("content-security-policy"), "Real middleware security headers must be present");
  const completed = await readState();
  assert.equal(completed.onboarding_status, "complete");
  assert.equal(completed.details_submitted, 1);
  assert.equal(completed.charges_enabled, 1);
  assert.equal(completed.payouts_enabled, 1);
  assert.equal(completed.requirements_status, "clear");

  const duplicate = await deliver(event);
  assert.equal(duplicate.status, 200, JSON.stringify(duplicate.body));
  const afterDuplicate = await readState();
  assert.deepEqual(businessState(afterDuplicate), businessState(completed), "Repeated account.updated must preserve business state");
  assert.equal((await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`))?.count, 1);
  for (const object of ["payment", "refund"]) {
    assert.equal((await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${businessTable(object)}`))?.count, 0);
  }

  const rejectedEvent = { ...event, id: "evt_synthetic_connect_http_rejected", data: { object: {
    ...event.data.object, charges_enabled: false, payouts_enabled: false,
    requirements: { currently_due: ["individual.id_number"], eventually_due: [], past_due: ["individual.id_number"], disabled_reason: "requirements.past_due" },
  } } };
  const invalid = await deliver(rejectedEvent, false);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "Invalid Stripe signature.");
  assert.deepEqual(await readState(), afterDuplicate, "Bad signature must not change even synchronization timestamps");
  assert(!serverLog.includes("[connect-http-egress-blocked]"), "Application attempted an external connection");

  const result = {
    status: "passed", boundary: "real-local-next-http", synthetic: true, externalNetwork: "loopback-only",
    optionalNextVersionLookupBlockedLocally: serverLog.includes("[connect-http-blocked-next-version-check]"),
    cases: { signedWithoutBrowserHeaders: valid.status, duplicateBusinessState: duplicate.status, badSignatureUnchangedDatabase: invalid.status },
    duplicateSemantics: "account.updated is a state-idempotent setter; sync timestamps may change; event-once deduplication is not asserted",
    remainingBoundary: "Real Stripe delivery, deployed routing and connected-account readiness remain G4 provider acceptance",
  };
  if (reportPath) {
    const target = resolve(reportPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(result, null, 2) + "\n");
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  failure = error;
  console.error(error instanceof Error ? error.stack : String(error));
  if (serverLog) console.error("[connect-http] Next output (last 8000 characters):\n" + serverLog.slice(-8000));
} finally {
  if (server?.pid && server.exitCode === null) {
    try {
      if (process.platform === "win32") server.kill("SIGTERM"); else process.kill(-server.pid, "SIGTERM");
    } catch { /* already exited */ }
    await Promise.race([new Promise<void>((accept) => server!.once("exit", () => accept())), delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) {
      try {
        if (process.platform === "win32") server.kill("SIGKILL"); else process.kill(-server.pid, "SIGKILL");
      } catch { /* already exited */ }
    }
  }
  closeDb?.();
  await rm(tempDir, { recursive: true, force: true });
}
if (failure) process.exitCode = 1;
