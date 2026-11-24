import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  db, createWorkspace, createApiKey, revokeApiKey, queryOne, execute, now, genId,
  TABLES, SESSION_COOKIE_NAME, createCustomView, installPack, _clearAccessCache,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "./auth";
import { PATCH as patchWorkspace, GET as getWorkspaceRoute } from "@/app/api/workspaces/[id]/route";
import { POST as createRecordRoute } from "@/app/api/workspaces/[id]/objects/[objectKey]/records/route";
import { POST as createViewRoute } from "@/app/api/workspaces/[id]/views/route";
import { POST as readWidgetBatch } from "@/app/api/workspaces/[id]/widgets/batch/route";
import { POST as createKeyRoute } from "@/app/api/workspaces/[id]/api-keys/route";
import { PATCH as updateMemberRoute } from "@/app/api/workspaces/[id]/access/members/[userId]/route";
import { GET as healthRoute } from "@/app/api/workspaces/[id]/health/route";
import { GET as provisioningRoute } from "@/app/api/workspaces/[id]/provisioning-summary/route";
import { GET as configDiffRoute } from "@/app/api/workspaces/[id]/config-diff/route";
import { GET as diagnosticsRoute } from "@/app/api/workspaces/[id]/diagnostics/route";
import { GET as listWorkspacesRoute } from "@/app/api/workspaces/route";
import { POST as stripeConnectWebhook } from "@/app/api/integrations/stripe/connect-webhook/route";
import { middleware } from "@/middleware";

// Next.js replaces this build-time server/client boundary marker. Node tests
// need only omit the marker; route authentication and database logic stay real.
vi.mock("server-only", () => ({}));

// Full route/service/database behavior with synthetic identities. No credentials
// or providers are contacted; the DB lives in a unique temporary directory.
const testDir = mkdtempSync(join(tmpdir(), "runory-security-boundaries-"));
const envKeys = ["LIBSQL_URL", "LIBSQL_AUTH_TOKEN", "PLATFORM_DEV_BOOTSTRAP", "PLATFORM_TRUST_IDENTITY_HEADERS", "RUNORY_TRUST_IDENTITY_HEADERS", "PLATFORM_TRUST_PROXY_VERIFIED", "STRIPE_CONNECT_WEBHOOK_SECRET"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
process.env.LIBSQL_URL = `file:${join(testDir, "test.db")}`;
process.env.LIBSQL_AUTH_TOKEN = "";
process.env.PLATFORM_DEV_BOOTSTRAP = "false";
process.env.PLATFORM_TRUST_IDENTITY_HEADERS = "false";
process.env.RUNORY_TRUST_IDENTITY_HEADERS = "false";
process.env.PLATFORM_TRUST_PROXY_VERIFIED = "false";

let workspaceId: string;
let secondWorkspaceId: string;
let outsiderWorkspaceId: string;
let ownerId: string;
let ownerCookie: string;
let outsiderCookie: string;
let readToken: string;
let writeToken: string;
let extensionToken: string;
let fullToken: string;

function params(id: string) { return { params: Promise.resolve({ id }) }; }
function request(path: string, headers: Record<string, string> = {}, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { host: "localhost:3000", "x-requested-with": "XMLHttpRequest", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function sessionCookie(userId: string) {
  const token = randomBytes(32).toString("hex");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.sessions} (id,user_id,token_hash,status,created_at,last_used_at,expires_at)
     VALUES (?,?,?,'active',?,?,?)`,
    [genId("session"), userId, createHash("sha256").update(token).digest("hex"), ts, ts, new Date(Date.now() + 3600000).toISOString()],
  );
  return `${SESSION_COOKIE_NAME}=${token}`;
}

beforeAll(async () => {
  mkdirSync(testDir, { recursive: true });
  const owner = { externalId: genId("owner"), email: "owner@security.test", displayName: "Owner" };
  const outsider = { externalId: genId("outsider"), email: "outsider@security.test", displayName: "Outsider" };
  workspaceId = (await createWorkspace("Private configuration", undefined, owner)).id;
  secondWorkspaceId = (await createWorkspace("Same owner second workspace", undefined, owner)).id;
  outsiderWorkspaceId = (await createWorkspace("Other tenant", undefined, outsider)).id;
  ownerId = (await queryOne<{ id: string }>(`SELECT id FROM ${TABLES.users} WHERE external_id=?`, [owner.externalId]))!.id;
  const outsiderId = (await queryOne<{ id: string }>(`SELECT id FROM ${TABLES.users} WHERE external_id=?`, [outsider.externalId]))!.id;
  ownerCookie = await sessionCookie(ownerId);
  outsiderCookie = await sessionCookie(outsiderId);
  await installPack(workspaceId, "crm-lite-pack");
  await createCustomView(workspaceId, "contact", "Private tenant view", {});
  readToken = (await createApiKey(workspaceId, ownerId, { name: "Read", scopes: ["workspace:read"] })).token;
  writeToken = (await createApiKey(workspaceId, ownerId, { name: "Write", scopes: ["records:write"] })).token;
  extensionToken = (await createApiKey(workspaceId, ownerId, { name: "Extensions", scopes: ["extensions:manage"] })).token;
  fullToken = (await createApiKey(workspaceId, ownerId, { name: "All supported scopes", scopes: ["workspace:read", "records:write", "extensions:manage"] })).token;
}, 30000);

afterAll(() => {
  db.close();
  globalThis.__platformDb = undefined;
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  _clearAccessCache();
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(testDir, { recursive: true, force: true });
});

describe("API key scope ceiling", () => {
  it("permits read but rejects record, configuration and workspace writes with a read key", async () => {
    const headers = { authorization: `Bearer ${readToken}` };
    expect((await getWorkspaceRoute(request(`/api/workspaces/${workspaceId}`, headers), params(workspaceId))).status).toBe(200);
    expect((await patchWorkspace(request(`/api/workspaces/${workspaceId}`, headers, "PATCH", { name: "Forbidden" }), params(workspaceId))).status).toBe(403);
    expect((await createRecordRoute(request(`/api/workspaces/${workspaceId}/objects/company/records`, headers, "POST", { name: "Forbidden" }), { params: Promise.resolve({ id: workspaceId, objectKey: "company" }) })).status).toBe(403);
    expect((await createViewRoute(request(`/api/workspaces/${workspaceId}/views`, headers, "POST", { objectKey: "contact", label: "Forbidden", config: {} }), params(workspaceId))).status).toBe(403);
    expect((await queryOne<{ name: string }>(`SELECT name FROM ${TABLES.workspaces} WHERE id=?`, [workspaceId]))?.name).toBe("Private configuration");
  });

  it("allows the correctly scoped business/configuration writes without making the scopes interchangeable", async () => {
    const path = `/api/workspaces/${workspaceId}/objects/company/records`;
    const recordParams = { params: Promise.resolve({ id: workspaceId, objectKey: "company" }) };
    expect((await createRecordRoute(request(path, { authorization: `Bearer ${writeToken}` }, "POST", { name: "Authorized company" }), recordParams)).status).toBe(201);
    expect((await createRecordRoute(request(path, { authorization: `Bearer ${extensionToken}` }, "POST", { name: "Forbidden" }), recordParams)).status).toBe(403);
    const viewPath = `/api/workspaces/${workspaceId}/views`;
    const view = { objectKey: "contact", label: "Authorized view", config: {} };
    expect((await createViewRoute(request(viewPath, { authorization: `Bearer ${extensionToken}` }, "POST", view), params(workspaceId))).status).toBe(201);
    expect((await createViewRoute(request(viewPath, { authorization: `Bearer ${writeToken}` }, "POST", view), params(workspaceId))).status).toBe(403);
  });

  it("never lets a key exceed its creator's current Workspace role", async () => {
    const actor = { externalId: genId("demoted"), email: "demoted@security.test", displayName: "Demoted creator" };
    const limitedWorkspaceId = (await createWorkspace("Role ceiling", undefined, actor)).id;
    const creator = (await queryOne<{ id: string }>(`SELECT id FROM ${TABLES.users} WHERE external_id=?`, [actor.externalId]))!;
    const key = await createApiKey(limitedWorkspaceId, creator.id, { name: "Before demotion", scopes: ["workspace:read", "records:write"] });
    await execute(`UPDATE ${TABLES.workspaceMemberships} SET role='viewer' WHERE workspace_id=? AND user_id=?`, [limitedWorkspaceId, creator.id]);
    await execute(`UPDATE ${TABLES.organizationMemberships} SET role='member' WHERE user_id=?`, [creator.id]);
    _clearAccessCache();
    const headers = { authorization: `Bearer ${key.token}` };
    expect((await getWorkspaceRoute(request(`/api/workspaces/${limitedWorkspaceId}`, headers), params(limitedWorkspaceId))).status).toBe(200);
    expect((await createRecordRoute(request(`/api/workspaces/${limitedWorkspaceId}/objects/company/records`, headers, "POST", { name: "Forbidden" }), { params: Promise.resolve({ id: limitedWorkspaceId, objectKey: "company" }) })).status).toBe(403);
  });

  it("allows only the exact read-only widget batch POST with workspace:read", async () => {
    const path = `/api/workspaces/${workspaceId}/widgets/batch`;
    const body = { items: [{ moduleId: "runory.contact", widgetKey: "contact_total_metric", instance: "default", zone: "metrics" }] };
    const headers = { authorization: `Bearer ${readToken}` };
    const response = await readWidgetBatch(request(path, headers, "POST", body), params(workspaceId));
    expect(response.status).toBe(200);
    expect((await response.json()).data.results).toMatchObject([{ key: "runory.contact:contact_total_metric:default", ok: true, data: { count: 0 } }]);
    expect((await readWidgetBatch(request(path, { authorization: `Bearer ${writeToken}` }, "POST", body), params(workspaceId))).status).toBe(403);
    await expect(requireWorkspaceContext(request(`${path}/other`, headers, "POST", body), workspaceId)).rejects.toMatchObject({ name: "AuthorizationError" });
    await expect(requireWorkspaceContext(request(path, headers, "PATCH", body), workspaceId)).rejects.toMatchObject({ name: "AuthorizationError" });
  });

  it("does not allow even a full-scope key to mint credentials or change membership", async () => {
    const headers = { authorization: `Bearer ${fullToken}` };
    expect((await createKeyRoute(request(`/api/workspaces/${workspaceId}/api-keys`, headers, "POST", { name: "Escalation", scopes: ["records:write"] }), params(workspaceId))).status).toBe(403);
    expect((await updateMemberRoute(request(`/api/workspaces/${workspaceId}/access/members/${ownerId}`, headers, "PATCH", { workspaceRole: "admin" }), { params: Promise.resolve({ id: workspaceId, userId: ownerId }) })).status).toBe(403);
  });

  it("preserves ordinary owner-session administration", async () => {
    const r = await patchWorkspace(request(`/api/workspaces/${workspaceId}`, { cookie: ownerCookie }, "PATCH", { name: "Session administration works" }), params(workspaceId));
    expect(r.status).toBe(200);
  });

  it("fails closed for invalid/revoked keys even if an owner session is also present", async () => {
    const key = await createApiKey(workspaceId, ownerId, { name: "Revoke", scopes: ["workspace:read"] });
    await revokeApiKey(key.id, workspaceId, ownerId);
    for (const token of [key.token, "rk_invalid"]) {
      await expect(requireWorkspaceContext(request(`/api/workspaces/${workspaceId}`, { authorization: `Bearer ${token}`, cookie: ownerCookie }), workspaceId)).rejects.toMatchObject({ name: "AuthenticationError" });
    }
  });

  it("MCP workspace discovery returns only the key's bound workspace", async () => {
    const response = await listWorkspacesRoute(request("/api/workspaces", { authorization: `Bearer ${readToken}` }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.workspaces.map((entry: { workspaceId: string }) => entry.workspaceId)).toEqual([workspaceId]);
    expect(body.data.workspaces.some((entry: { workspaceId: string }) => entry.workspaceId === secondWorkspaceId)).toBe(false);
    expect((await getWorkspaceRoute(request(`/api/workspaces/${secondWorkspaceId}`, { authorization: `Bearer ${readToken}` }), params(secondWorkspaceId))).status).toBe(401);
  });

  it("keeps key discovery consistent with inherited Organization-admin access", async () => {
    const key = await createApiKey(secondWorkspaceId, ownerId, { name: "Inherited admin", scopes: ["workspace:read"] });
    await execute(`DELETE FROM ${TABLES.workspaceMemberships} WHERE workspace_id=? AND user_id=?`, [secondWorkspaceId, ownerId]);
    _clearAccessCache();
    const headers = { authorization: `Bearer ${key.token}` };
    expect((await getWorkspaceRoute(request(`/api/workspaces/${secondWorkspaceId}`, headers), params(secondWorkspaceId))).status).toBe(200);
    const response = await listWorkspacesRoute(request("/api/workspaces", headers));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.workspaces).toMatchObject([{ workspaceId: secondWorkspaceId, workspaceRole: null, effectiveRole: "admin" }]);
  });
});

describe("Workspace diagnostic tenant authorization", () => {
  for (const [name, handler] of [["health", healthRoute], ["provisioning-summary", provisioningRoute], ["config-diff", configDiffRoute], ["diagnostics", diagnosticsRoute]] as const) {
    it(`${name} rejects a signed-in outsider and permits an administrator`, async () => {
      const path = `/api/workspaces/${workspaceId}/${name}`;
      expect((await handler(request(path), params(workspaceId))).status).toBe(401);
      expect((await handler(request(path, { cookie: outsiderCookie }), params(workspaceId))).status).toBe(403);
      const allowed = await handler(request(path, { cookie: ownerCookie }), params(workspaceId));
      expect(allowed.status).toBe(200);
      expect((await allowed.json()).success).toBe(true);
    });
  }

  it("requires separate access to a caller-supplied baseline", async () => {
    const denied = await configDiffRoute(request(`/api/workspaces/${outsiderWorkspaceId}/config-diff?baseline=${workspaceId}`, { cookie: outsiderCookie }), params(outsiderWorkspaceId));
    expect(denied.status).toBe(403);
    const allowed = await configDiffRoute(request(`/api/workspaces/${secondWorkspaceId}/config-diff?baseline=${workspaceId}`, { cookie: ownerCookie }), params(secondWorkspaceId));
    expect(allowed.status).toBe(200);
  });

  it("rejects path traversal in the reference solution name", async () => {
    const response = await configDiffRoute(request(`/api/workspaces/${workspaceId}/config-diff?reference=../../private`, { cookie: ownerCookie }), params(workspaceId));
    expect(response.status).toBe(400);
  });
});

describe("Stripe Connect transport/authentication boundary", () => {
  it("passes browser CSRF protection but still rejects an unsigned or invalidly signed callback", async () => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_synthetic_security_test";
    const cases: Record<string, string>[] = [{}, { "stripe-signature": "t=1,v1=invalid" }];
    for (const headers of cases) {
      const req = new NextRequest("http://localhost:3000/api/integrations/stripe/connect-webhook", { method: "POST", headers, body: "{}" });
      expect(middleware(req).headers.get("x-middleware-next")).toBe("1");
      expect((await stripeConnectWebhook(req)).status).toBe(400);
    }
  });
});
