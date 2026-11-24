// CI-only synthetic fixture. Never shipped in the candidate image.
// Runs in a Docker internal network with no published ports, external providers,
// real customer records, or development authentication shortcuts.
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { createHash, randomUUID } from "node:crypto";

const base = "http://runory:3000";
const email = "owner@runory.invalid";
const companyName = "B1 isolated synthetic repair customer";
const phase = process.argv[2];
if (!["initialize", "readback"].includes(phase)) throw new Error("Invalid phase");
const commit = process.env.RUNORY_EXPECTED_COMMIT;
if (!/^[a-f0-9]{40}$/.test(commit ?? "")) throw new Error("Expected immutable source SHA");
let otp;
let currentStage = "mail-fixture";
let cookie;
class CheckFailure extends Error {}
const check = (condition, label) => {
  if (!condition) throw new CheckFailure(label);
};
const evidenceBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fZkAAAAASUVORK5CYII=", "base64");
const evidenceHash = createHash("sha256").update(evidenceBytes).digest("hex");
const expectedState = phase === "readback" ? JSON.parse(process.env.RUNORY_EXPECTED_STATE ?? "null") : null;
if (phase === "readback") {
  check(expectedState && ["workspaceId", "companyId", "quoteId", "attachmentId"].every(
    key => typeof expectedState[key] === "string" && /^[A-Za-z0-9_-]+$/.test(expectedState[key])
  ), "missing synthetic checkpoint");
}
const passed = label => console.log(JSON.stringify({ phase, check: label, status: "PASS" }));
const mail = createServer(async (req, res) => {
  try {
    if (req.method !== "POST" || req.url !== "/send") {
      res.writeHead(404).end();
      return;
    }
    let length = 0;
    const chunks = [];
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 64 * 1024) throw new Error("oversize");
      chunks.push(chunk);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const match = typeof payload.text === "string" && payload.text.match(/verification code is: (\d{6})/);
    if (payload.to !== email || !match) {
      res.writeHead(400).end();
      return;
    }
    otp = match[1];
    res.writeHead(204).end();
  } catch {
    res.writeHead(400).end();
  }
});

async function request(path, { method = "GET", body, session = false, token, expected = 200, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method, redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(session ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(300_000),
  });
  check((Array.isArray(expected) ? expected : [expected]).includes(response.status),
    "Unexpected HTTP status at " + currentStage + ": " + response.status);
  const envelope = await response.json();
  if (response.ok) check(envelope.success === true, "Unsuccessful envelope at " + currentStage);
  else check(envelope.success === false || envelope.error, "Expected denial at " + currentStage);
  return { data: envelope.data, response };
}

async function main() {
  await new Promise((resolve, reject) => {
    mail.once("error", reject);
    mail.listen(8787, "0.0.0.0", resolve);
  });
  currentStage = "production health";
  let healthy = false;
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(base + "/api/health", {
        redirect: "error", signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) {
        const body = await response.json();
        check(body.data?.release?.commit === commit, "Serving unexpected source SHA");
        healthy = true;
        break;
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Serving unexpected source SHA") throw error;
    }
    await delay(1_000);
  }
  check(healthy, "Production HTTP readiness timed out");
  passed("production-http-and-source-sha");

  currentStage = "anonymous denial";
  await request("/api/workspaces", { expected: [401, 403] });
  await request("/api/platform/catalog/seed", { method: "POST", expected: 403 });
  await request("/api/platform/cron/workflow-timers", { expected: 401 });
  passed("anonymous-workspace-catalog-cron-denied");

  currentStage = "production OTP request";
  const challenge = await request("/api/auth/request-otp", { method: "POST", body: { email } });
  check(!("devCode" in challenge.data), "Production OTP leaked debug code");
  check(/^\d{6}$/.test(otp ?? ""), "No synthetic mail delivered");
  currentStage = "production OTP verification";
  const login = await request("/api/auth/verify-otp", { method: "POST", body: { email, code: otp } });
  otp = undefined;
  const session = login.response.headers.getSetCookie().find(value => value.startsWith("platform_session="));
  currentStage = "production secure cookie";
  check(session && /;\s*secure(?:;|$)/i.test(session) && /;\s*httponly(?:;|$)/i.test(session), "No secure session cookie");
  cookie = session.split(";")[0];
  currentStage = "production owner workspace readback";
  const me = await request("/api/auth/me", { session: true });
  check(me.data.authenticated && me.data.principal.email === email, "Incorrect authenticated principal");
  // listUserWorkspaces returns a UserWorkspaceEntry, not a Workspace record.
  check(Array.isArray(me.data.workspaces) && me.data.workspaces.length === 1, "Expected exactly one owner workspace");
  const ownerWorkspace = me.data.workspaces[0];
  check(typeof ownerWorkspace.workspaceId === "string" && ownerWorkspace.organizationRole === "owner"
    && ownerWorkspace.effectiveRole === "admin", "Invalid owner workspace contract");
  const workspaceId = ownerWorkspace.workspaceId;
  check(login.data.isNewUser === (phase === "initialize"), "Unexpected new-user status after initialization/recreation");
  if (expectedState) check(workspaceId === expectedState.workspaceId, "Workspace identity changed after recreation");
  const ws = "/api/workspaces/" + encodeURIComponent(workspaceId);
  passed("real-otp-session-and-owner-workspace");

  let checkpoint = expectedState;
  if (phase === "initialize") {
    // Deliberately use the existing authenticated release-manager seed route
    // in the isolated candidate test ONLY. This does not establish a shipped
    // release-import flow or authorize promotion of artifacts in Cloud.
    currentStage = "candidate catalog initialization";
    const seed = await request("/api/platform/catalog/seed", { method: "POST", session: true });
    check(Array.isArray(seed.data.errors) && seed.data.errors.length === 0, "Candidate catalog seed has errors");
    for (const pack of ["fsm-pack", "sales-quote-pack"]) {
      currentStage = "pack installation: " + pack;
      await request(ws + "/packs/" + pack + "/install", {
        method: "POST", body: { includeDemoData: false }, session: true, expected: 201,
      });
    }
    passed("authenticated-local-catalog-and-two-packs");

    currentStage = "create customer and scoped key";
    const record = await request(ws + "/objects/company/records", {
      method: "POST", body: { name: companyName, lifecycle_stage: "customer" }, session: true, expected: 201,
    });
    check(record.data?.id && record.data.name === companyName, "Customer not created");
    const key = await request(ws + "/api-keys", {
      method: "POST", body: { name: "B1 read-only", scopes: ["workspace:read"] }, session: true, expected: 201,
    });
    check(key.data?.token && key.data.id, "Read-only API key not created");
    const result = await request(ws + "/objects/company/records/" + encodeURIComponent(record.data.id), { token: key.data.token });
    check(result.data.name === companyName, "Key cannot read created customer");
    await request(ws + "/objects/company/records", {
      method: "POST", body: { name: "Denied", lifecycle_stage: "customer" }, token: key.data.token, expected: 403,
    });
    await request(ws + "/api-keys/" + encodeURIComponent(key.data.id), { method: "DELETE", session: true });
    await request(ws + "/objects/company/records/" + encodeURIComponent(record.data.id), { token: key.data.token, expected: [401, 403] });
    passed("customer-read-write-and-scoped-key-denial-revocation");

    currentStage = "named Quote command";
    const writer = await request(ws + "/api-keys", {
      method: "POST", session: true, expected: 201,
      body: { name: "B1 scoped business command", scopes: ["workspace:read", "records:write"] },
    });
    check(writer.data?.id && writer.data.token, "Scoped business key not created");
    const command = { title: "B1 synthetic repair quote", companyId: record.data.id, currency: "USD" };
    const commandKey = randomUUID();
    const invoke = () => request(ws + "/commands/quote.create_draft", {
      method: "POST", token: writer.data.token, body: command,
      headers: { "Idempotency-Key": commandKey },
    });
    const quote = await invoke();
    check(quote.data?.status === "succeeded" && quote.data.aggregate?.status === "draft"
      && typeof quote.data.aggregate.id === "string", "Quote draft Command not successful");
    const repeat = await invoke();
    check(repeat.data?.commandId === quote.data.commandId &&
      repeat.data?.aggregate?.id === quote.data.aggregate.id, "Identical Command retry created a different result");
    const quoteRecord = await request(ws + "/objects/quote/records/" + encodeURIComponent(quote.data.aggregate.id), { session: true });
    check(quoteRecord.data.status === "draft" && quoteRecord.data.company_id === record.data.id,
      "Quote not persisted with expected customer relationship");
    await request(ws + "/api-keys/" + encodeURIComponent(writer.data.id), { method: "DELETE", session: true });
    passed("named-quote-command-scoped-key-retry-and-readback");

    currentStage = "local attachment upload";
    const form = new FormData();
    form.append("file", new File([evidenceBytes], "synthetic-evidence.png", { type: "image/png" }));
    const uploaded = await fetch(base + ws + "/uploads", {
      method: "POST", redirect: "error",
      headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" },
      body: form, signal: AbortSignal.timeout(30_000),
    });
    check(uploaded.status === 201, "Unexpected synthetic attachment upload status: " + uploaded.status);
    const attachment = await uploaded.json();
    check(attachment.success === true && typeof attachment.data?.attachmentId === "string"
      && attachment.data.size === evidenceBytes.length, "Invalid attachment response");
    checkpoint = { workspaceId, companyId: record.data.id, quoteId: quote.data.aggregate.id,
      attachmentId: attachment.data.attachmentId };
    passed("local-attachment-upload");
  }

  currentStage = "installed pack and customer readback";
  const packs = await request(ws + "/packs", { session: true });
  check(["fsm-pack", "sales-quote-pack"].every(id => packs.data.some(p => p.packId === id && p.installed)), "Expected both installed Packs");
  const records = await request(ws + "/objects/company/records?search=" + encodeURIComponent(companyName), { session: true });
  // The records GET route returns the array directly in the ToolEnvelope.
  check(Array.isArray(records.data), "Unexpected customer-list response contract");
  check(records.data.some(r => r.id === checkpoint.companyId && r.name === companyName), "Missing persisted customer");
  const persistedQuote = await request(ws + "/objects/quote/records/" + encodeURIComponent(checkpoint.quoteId), { session: true });
  check(persistedQuote.data.status === "draft" && persistedQuote.data.company_id === checkpoint.companyId,
    "Missing persisted quote relationship");
  currentStage = "local attachment readback";
  const downloadPath = base + ws + "/uploads/" + encodeURIComponent(checkpoint.attachmentId);
  const forbidden = await fetch(downloadPath, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  check([401, 403].includes(forbidden.status), "Anonymous attachment download was not denied");
  await forbidden.body?.cancel();
  const downloaded = await fetch(downloadPath, {
    redirect: "error", headers: { Cookie: cookie }, signal: AbortSignal.timeout(30_000),
  });
  check(downloaded.status === 200, "Synthetic attachment unavailable: " + downloaded.status);
  check(createHash("sha256").update(Buffer.from(await downloaded.arrayBuffer())).digest("hex") === evidenceHash,
    "Attachment bytes changed or missing");
  passed("packs-customer-quote-and-attachment-persisted");
  // Synthetic IDs only, no credential material. Readback consumes the exact
  // same identities after a new application container mounts the volume.
  if (phase === "initialize") console.log(JSON.stringify({ phase, checkpoint }));
  console.log(JSON.stringify({ phase, sourceCommit: commit, status: "PASS" }));
}

try {
  await main();
} catch (error) {
  // Only our fixed assertions (or an HTTP status number) are safe to record.
  // Never print transport exceptions, response bodies, tokens or raw headers.
  console.error(JSON.stringify({ phase, check: currentStage, status: "FAIL",
    reason: error instanceof CheckFailure ? error.message : "unexpected_fixture_or_transport_error" }));
  process.exitCode = 1;
} finally {
  mail.closeAllConnections();
  mail.close();
}
