import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkspace, db, execute, genId, now, queryOne, TABLES, SESSION_COOKIE_NAME,
  isDevBootstrapEnabled, isLocalDevelopmentRuntime, requirePlatformRole,
  requestOtp, verifyOtp, _clearAccessCache, type Principal,
} from "@runory/platform-core";
import { getCurrentPrincipal, getRequestActor, requirePlatformAdmin, requirePrincipal } from "./auth";
import { GET as getWorkspace } from "@/app/api/workspaces/[id]/route";
import { GET as listPacks } from "@/app/api/workspaces/[id]/packs/route";
import { GET as listPersonas, POST as selectPersona } from "@/app/api/dev/persona/route";
import { POST as seedCatalog } from "@/app/api/platform/catalog/seed/route";
import { GET as runCron } from "@/app/api/platform/cron/workflow-timers/route";
import { POST as requestOtpRoute } from "@/app/api/auth/request-otp/route";
import { POST as verifyOtpRoute } from "@/app/api/auth/verify-otp/route";
import nextConfig from "../../next.config";

vi.mock("server-only", () => ({}));

const testDir = mkdtempSync(join(tmpdir(), "runory-development-boundaries-"));
const originalDatabaseEnv = { url: process.env.LIBSQL_URL, token: process.env.LIBSQL_AUTH_TOKEN };
process.env.LIBSQL_URL = `file:${join(testDir, "test.db")}`;
process.env.LIBSQL_AUTH_TOKEN = "";
const ownerEmail = "owner@production-boundaries.invalid";
let workspaceId: string;
let ownerId: string;
let ownerCookie: string;
const devPrincipal: Principal = { userId: "dev-local-owner", email: null, displayName: "Local owner", authMethod: "dev_bootstrap" };
const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

function request(path: string, body?: unknown, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.10", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  const actor = { externalId: genId("owner"), email: ownerEmail, displayName: "Production owner" };
  workspaceId = (await createWorkspace("Production boundary", undefined, actor)).id;
  ownerId = (await queryOne<{ id: string }>(`SELECT id FROM ${TABLES.users} WHERE external_id=?`, [actor.externalId]))!.id;
  const token = randomBytes(32).toString("hex");
  await execute(`INSERT INTO ${TABLES.sessions} (id,user_id,token_hash,status,created_at,last_used_at,expires_at) VALUES (?,?,?,'active',?,?,?)`, [
    genId("session"), ownerId, createHash("sha256").update(token).digest("hex"), now(), now(), new Date(Date.now() + 3600000).toISOString(),
  ]);
  ownerCookie = `${SESSION_COOKIE_NAME}=${token}`;
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("PLATFORM_DEV_BOOTSTRAP", "true");
  vi.stubEnv("PLATFORM_OTP_RETURN_DEV_CODE", "true");
  vi.stubEnv("PLATFORM_TRUST_IDENTITY_HEADERS", "false");
  vi.stubEnv("RUNORY_TRUST_IDENTITY_HEADERS", "false");
  vi.stubEnv("PLATFORM_TRUST_PROXY_VERIFIED", "false");
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
  vi.stubEnv("PLATFORM_CRON_SECRET", "");
  vi.stubEnv("CRON_SECRET", "");
  vi.stubEnv("PLATFORM_MAIL_PROVIDER_URL", "https://mail.synthetic.invalid/send");
  vi.stubEnv("RUNORY_MAIL_PROVIDER_URL", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RUNORY_EMAIL_FROM", "");
  fetchMock.mockClear();
  // Only the mail transport is stubbed; authentication, rate limiting,
  // identities, cookies and route authorization use the real implementation.
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(() => {
  db.close();
  globalThis.__platformDb = undefined;
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  _clearAccessCache();
  if (originalDatabaseEnv.url === undefined) delete process.env.LIBSQL_URL; else process.env.LIBSQL_URL = originalDatabaseEnv.url;
  if (originalDatabaseEnv.token === undefined) delete process.env.LIBSQL_AUTH_TOKEN; else process.env.LIBSQL_AUTH_TOKEN = originalDatabaseEnv.token;
  rmSync(testDir, { recursive: true, force: true });
});

describe("Production rejects accidentally enabled development authentication", () => {
  it("rejects anonymous owner/persona credentials even when the bootstrap flag is true", async () => {
    expect(isDevBootstrapEnabled()).toBe(false);
    for (const cookie of [undefined, "dev-persona=dev-local-owner", "dev-persona=persona:sales-manager"]) {
      const req = request(`/api/workspaces/${workspaceId}`, undefined, cookie);
      await expect(getRequestActor(req)).rejects.toMatchObject({ name: "AuthenticationError" });
      await expect(requirePrincipal(req)).rejects.toMatchObject({ name: "AuthenticationError" });
      expect(await getCurrentPrincipal(req)).toBeNull();
      expect((await getWorkspace(req, { params: Promise.resolve({ id: workspaceId }) })).status).toBe(401);
    }
  });

  it("closes the persona endpoint and preserves real sessions/platform administrators", async () => {
    expect((await listPersonas(request("/api/dev/persona"))).status).toBe(403);
    expect((await selectPersona(request("/api/dev/persona", { personaId: "dev-local-owner" }))).status).toBe(403);
    const req = request(`/api/workspaces/${workspaceId}`, undefined, `${ownerCookie}; dev-persona=dev-local-owner`);
    expect(await requirePrincipal(req)).toMatchObject({ userId: ownerId, authMethod: "session" });
    expect((await getWorkspace(req, { params: Promise.resolve({ id: workspaceId }) })).status).toBe(200);
    await expect(requirePlatformAdmin(req)).rejects.toMatchObject({ name: "AuthorizationError" });
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", ownerEmail);
    expect((await requirePlatformAdmin(req)).principal.userId).toBe(ownerId);
  });

  it("rejects anonymous catalog/cron shortcuts and does not seed from a Workspace read", async () => {
    expect(() => requirePlatformRole(devPrincipal, "catalog_editor")).toThrow("platform role");
    expect((await seedCatalog(request("/api/platform/catalog/seed", {}))).status).toBe(403);
    expect((await runCron(request("/api/platform/cron/workflow-timers"))).status).toBe(500);
    const catalogCount = async () => (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${TABLES.catalogItems}`))!.count;
    expect(await catalogCount()).toBe(0);
    expect((await listPacks(request(`/api/workspaces/${workspaceId}/packs`, undefined, ownerCookie), { params: Promise.resolve({ id: workspaceId }) })).status).toBe(200);
    expect(await catalogCount()).toBe(0);
  });

  it("never returns an OTP dev code in production and requires a configured mail provider", async () => {
    const response = await requestOtpRoute(request("/api/auth/request-otp", { email: "route@production-boundaries.invalid" }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).not.toHaveProperty("devCode");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.stubEnv("PLATFORM_MAIL_PROVIDER_URL", "");
    vi.stubEnv("RESEND_API_KEY", "re_synthetic_route_key");
    vi.stubEnv("RUNORY_EMAIL_FROM", "Runory <no-reply@example.invalid>");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "synthetic-message-id" })));
    const resend = await requestOtpRoute(request("/api/auth/request-otp", { email: "resend@production-boundaries.invalid" }));
    expect(resend.status).toBe(200);
    expect((await resend.json()).data).not.toHaveProperty("devCode");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValueOnce(new Response("synthetic provider failure", { status: 503 }));
    const rejected = await requestOtpRoute(request("/api/auth/request-otp", { email: "rejected@production-boundaries.invalid" }));
    expect(rejected.status).toBe(500);
    expect(await rejected.json()).not.toHaveProperty("data.devCode");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.stubEnv("RESEND_API_KEY", "");
    const unavailable = await requestOtpRoute(request("/api/auth/request-otp", { email: "missing-provider@production-boundaries.invalid" }));
    expect(unavailable.status).toBe(500);
    expect(await unavailable.json()).not.toHaveProperty("data.devCode");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ignores core devMode/skipRateLimit options for production OTP issuance and verification", async () => {
    const options = { devMode: true, skipRateLimit: true };
    for (let i = 0; i < 5; i++) {
      expect((await requestOtp("rate-limit@production-boundaries.invalid", "192.0.2.15", options)).devCode).toBeUndefined();
    }
    await expect(requestOtp("rate-limit@production-boundaries.invalid", "192.0.2.15", options)).rejects.toMatchObject({ name: "RateLimitError" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (let i = 0; i < 10; i++) {
      await expect(verifyOtp("verify-limit@production-boundaries.invalid", "000000", "192.0.2.16", "synthetic", options)).rejects.toMatchObject({ name: "AuthenticationError" });
    }
    await expect(verifyOtp("verify-limit@production-boundaries.invalid", "000000", "192.0.2.16", "synthetic", options)).rejects.toMatchObject({ name: "RateLimitError" });
  });
});

describe("Local development remains explicit and usable", () => {
  it("allows local persona/bootstrap access and a real dev OTP login round trip", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isDevBootstrapEnabled()).toBe(true);
    expect(await getRequestActor(request("/api/workspaces"))).toMatchObject({ externalId: "dev-local-owner" });
    expect((await requirePlatformAdmin(request("/api/platform/catalog"))).principal.authMethod).toBe("dev_bootstrap");
    expect(() => requirePlatformRole(devPrincipal, "catalog_editor")).not.toThrow();
    expect((await listPersonas(request("/api/dev/persona"))).status).toBe(200);
    expect((await selectPersona(request("/api/dev/persona", { personaId: "persona:technician" }))).status).toBe(200);
    const email = "dev-login@production-boundaries.invalid";
    const issued = await requestOtpRoute(request("/api/auth/request-otp", { email }));
    expect(issued.status).toBe(200);
    const code = (await issued.json()).data.devCode;
    expect(code).toMatch(/^\d{6}$/);
    const verified = await verifyOtpRoute(request("/api/auth/verify-otp", { email, code }));
    expect(verified.status).toBe(200);
    expect(verified.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps production-build UI flags off and only exposes them for a local dev server", () => {
    for (const environment of ["production", "development", "test"]) {
      vi.stubEnv("NODE_ENV", environment);
      expect(nextConfig(PHASE_PRODUCTION_BUILD).env).toMatchObject({ NEXT_PUBLIC_OTP_DEV_CODE_ENABLED: "false", NEXT_PUBLIC_PLATFORM_DEV_BOOTSTRAP: "false" });
    }
    vi.stubEnv("NODE_ENV", "development");
    expect(nextConfig(PHASE_DEVELOPMENT_SERVER).env).toMatchObject({ NEXT_PUBLIC_OTP_DEV_CODE_ENABLED: "true", NEXT_PUBLIC_PLATFORM_DEV_BOOTSTRAP: "true" });
    vi.stubEnv("VERCEL", "1");
    expect(isDevBootstrapEnabled()).toBe(false);
    expect(nextConfig(PHASE_DEVELOPMENT_SERVER).env).toMatchObject({ NEXT_PUBLIC_OTP_DEV_CODE_ENABLED: "false", NEXT_PUBLIC_PLATFORM_DEV_BOOTSTRAP: "false" });
  });

  it("fails closed for unknown runtimes even when both debug flags are enabled", () => {
    for (const environment of ["staging", ""]) {
      vi.stubEnv("NODE_ENV", environment);
      expect(isLocalDevelopmentRuntime()).toBe(false);
      expect(isDevBootstrapEnabled()).toBe(false);
    }
  });
});
