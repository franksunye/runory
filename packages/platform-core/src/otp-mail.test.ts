import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requestOtp, verifyOtp, resolveSession, _clearSessionCache } from "./auth";
import { db, ensureSchema, execute, queryOne } from "./db";
import { TABLES } from "./contracts";

const testDir = mkdtempSync(join(tmpdir(), "runory-otp-mail-"));
const originalDatabaseEnv = { url: process.env.LIBSQL_URL, token: process.env.LIBSQL_AUTH_TOKEN };
process.env.LIBSQL_URL = `file:${join(testDir, "test.db")}`;
process.env.LIBSQL_AUTH_TOKEN = "";

const EMAIL = "recipient@otp-mail.invalid";
const IP = "192.0.2.200";
const RESEND_KEY = "re_synthetic_otp_key";
const FROM = "Runory <no-reply@example.invalid>";
const PROVIDER_SECRET = "synthetic-provider-secret";
const debugOptions = { devMode: true, skipRateLimit: true };
const fetchMock = vi.fn<typeof fetch>();

type MailBody = { from?: string; to: string | string[]; subject: string; text: string; html: string };

function sentMail() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url, init: init!, body: JSON.parse(String(init!.body)) as MailBody };
}

function sentCode() {
  const code = sentMail().body.text.match(/verification code is: (\d{6})/)?.[1];
  expect(code).toMatch(/^\d{6}$/);
  return code!;
}

async function expectExpiredChallenge() {
  const challenge = await queryOne<{ status: string }>(
    `SELECT status FROM ${TABLES.authChallenges} WHERE email_normalized = ?`, [EMAIL]
  );
  expect(challenge?.status).toBe("expired");
}

function expectSafeLogs(code?: string) {
  const output = JSON.stringify([
    ...vi.mocked(console.log).mock.calls,
    ...vi.mocked(console.error).mock.calls,
  ]);
  for (const secret of [RESEND_KEY, PROVIDER_SECRET, EMAIL, code].filter(Boolean)) {
    expect(output).not.toContain(secret);
  }
}

beforeAll(async () => {
  globalThis.__platformDb?.close();
  globalThis.__platformDb = undefined;
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await ensureSchema();
});

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("PLATFORM_DEV_BOOTSTRAP", "true");
  vi.stubEnv("PLATFORM_OTP_RETURN_DEV_CODE", "true");
  vi.stubEnv("PLATFORM_MAIL_PROVIDER_URL", "");
  vi.stubEnv("RUNORY_MAIL_PROVIDER_URL", "");
  vi.stubEnv("RESEND_API_KEY", RESEND_KEY);
  vi.stubEnv("RUNORY_EMAIL_FROM", FROM);
  vi.stubGlobal("fetch", fetchMock);
  // Never fall through to a real network request, even in an unexpected path.
  fetchMock.mockReset().mockRejectedValue(new Error("Unexpected mocked mail request"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await execute(`DELETE FROM ${TABLES.authChallenges}`);
  await execute(`DELETE FROM ${TABLES.rateLimitBuckets}`);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(() => {
  db.close();
  globalThis.__platformDb = undefined;
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  _clearSessionCache();
  if (originalDatabaseEnv.url === undefined) delete process.env.LIBSQL_URL; else process.env.LIBSQL_URL = originalDatabaseEnv.url;
  if (originalDatabaseEnv.token === undefined) delete process.env.LIBSQL_AUTH_TOKEN; else process.env.LIBSQL_AUTH_TOKEN = originalDatabaseEnv.token;
  rmSync(testDir, { recursive: true, force: true });
});

describe("OTP mail delivery through the real authentication flow", () => {
  it("uses Resend and issues a usable emailed code without exposing production debug codes", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-message-id" }), { status: 200 }));
    const issued = await requestOtp(`  ${EMAIL.toUpperCase()}  `, IP, debugOptions);
    expect(issued.emailNormalized).toBe(EMAIL);
    expect(issued.devCode).toBeUndefined();
    expect(JSON.parse(JSON.stringify(issued))).not.toHaveProperty("devCode");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const mail = sentMail();
    expect(mail.url).toBe("https://api.resend.com/emails");
    expect(mail.init).toMatchObject({ method: "POST", redirect: "error" });
    expect(mail.init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(mail.init.headers).get("Authorization")).toBe(`Bearer ${RESEND_KEY}`);
    expect(new Headers(mail.init.headers).get("Content-Type")).toBe("application/json");
    expect(mail.body).toMatchObject({ from: FROM, to: [EMAIL], subject: "Runory — your verification code" });
    const code = sentCode();
    expect(mail.body.html).toContain(code);
    const verified = await verifyOtp(EMAIL, code, IP, "synthetic-mail-test", debugOptions);
    expect((await resolveSession(verified.sessionToken))?.email).toBe(EMAIL);
    expectSafeLogs(code);
  });

  it.each(["primary", "legacy"])("preserves the %s custom provider contract and gives it precedence over Resend", async (setting) => {
    const url = "https://custom-mail.synthetic.invalid/send";
    vi.stubEnv("PLATFORM_MAIL_PROVIDER_URL", setting === "primary" ? ` ${url} ` : "  ");
    vi.stubEnv("RUNORY_MAIL_PROVIDER_URL", setting === "legacy" ? url : "https://unused.synthetic.invalid");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect((await requestOtp(EMAIL, IP, debugOptions)).devCode).toBeUndefined();
    const mail = sentMail();
    expect(mail.url).toBe(url);
    expect(mail.body.to).toBe(EMAIL);
    expect(mail.body).not.toHaveProperty("from");
    expect(new Headers(mail.init.headers).has("Authorization")).toBe(false);
    expect(mail.init.redirect).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectSafeLogs(sentCode());
  });

  it.each(["RESEND_API_KEY", "RUNORY_EMAIL_FROM"])("fails closed when %s is missing, despite production debug flags", async (setting) => {
    vi.stubEnv(setting, "  ");
    await expect(requestOtp(EMAIL, IP, debugOptions)).rejects.toThrow("Mail provider not configured");
    expect(fetchMock).not.toHaveBeenCalled();
    await expectExpiredChallenge();
    expectSafeLogs();
  });

  it.each([401, 429, 500, 302])("rejects provider HTTP %s without logging its sensitive body or retaining a usable challenge", async (status) => {
    fetchMock.mockImplementation(async (_url, init) => new Response(JSON.stringify({
      message: `${RESEND_KEY} ${PROVIDER_SECRET} ${String(init?.body)}`,
    }), { status }));
    await expect(requestOtp(EMAIL, IP, debugOptions)).rejects.toThrow("OTP email delivery failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const code = sentCode();
    await expectExpiredChallenge();
    await expect(verifyOtp(EMAIL, code, IP, "synthetic-mail-test", debugOptions)).rejects.toThrow("No active verification code");
    expect(console.error).toHaveBeenCalledWith("[MAIL] OTP email delivery failed", { provider: "resend", reason: "rejected", status });
    expectSafeLogs(code);
  });

  it("does not switch a failing custom provider to Resend", async () => {
    const url = "https://custom-mail.synthetic.invalid/send";
    vi.stubEnv("PLATFORM_MAIL_PROVIDER_URL", url);
    fetchMock.mockResolvedValue(new Response(PROVIDER_SECRET, { status: 503 }));
    await expect(requestOtp(EMAIL, IP, debugOptions)).rejects.toThrow("OTP email delivery failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentMail().url).toBe(url);
    await expectExpiredChallenge();
    expectSafeLogs(sentCode());
  });

  it.each(["{}", '{"id":""}', '{"error":"synthetic-provider-secret"}', "not JSON synthetic-provider-secret"])("requires a valid Resend acknowledgement (%s)", async (body) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }));
    await expect(requestOtp(EMAIL, IP, debugOptions)).rejects.toThrow("OTP email delivery failed");
    await expectExpiredChallenge();
    expectSafeLogs(sentCode());
  });

  it("redacts transport exceptions, including echoed credentials and message content", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      throw new Error(`${RESEND_KEY} ${PROVIDER_SECRET} ${String(init?.body)}`);
    });
    await expect(requestOtp(EMAIL, IP, debugOptions)).rejects.toThrow(/^OTP email delivery failed$/);
    await expectExpiredChallenge();
    expectSafeLogs(sentCode());
  });

  it("aborts delivery after ten seconds and reports failure without leaving an active code", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error(PROVIDER_SECRET)), { once: true });
      markStarted();
    }));
    const rejected = expect(requestOtp(EMAIL, IP, debugOptions)).rejects.toThrow("OTP email delivery failed");
    await started;
    await vi.advanceTimersByTimeAsync(9_999);
    expect(sentMail().init.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(sentMail().init.signal!.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expectExpiredChallenge();
    expect(console.error).toHaveBeenCalledWith("[MAIL] OTP email delivery failed", { provider: "resend", reason: "timeout" });
    expectSafeLogs(sentCode());
  });

  it("keeps explicit local development OTPs usable without contacting either mail provider", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
    expect((await requestOtp(EMAIL, IP, debugOptions)).devCode).toMatch(/^\d{6}$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
