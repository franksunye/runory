import { describe, expect, it } from "vitest";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getOperatorOtpOwner, takeOperatorCode, writeOperatorCode } from "./operator-otp";

const owner = "owner@example.invalid";
const enabled = {
  RUNORY_SELF_HOST_CANDIDATE: "1", RUNORY_SELF_HOST_MAIL_MODE: "operator",
  NODE_ENV: "production", PLATFORM_DEPLOYMENT_MODE: "local",
  PLATFORM_DEV_BOOTSTRAP: "false", PLATFORM_TRUST_IDENTITY_HEADERS: "false",
  PLATFORM_OTP_RETURN_DEV_CODE: "false", LIBSQL_URL: "file:/data/platform.db",
  RUNORY_RELEASE_COMMIT: "a".repeat(40), PLATFORM_ADMIN_EMAILS: owner,
};
describe("Private self-host operator delivery", () => {
  it("requires the exact bounded independent production profile", () => {
    expect(getOperatorOtpOwner(enabled)).toBe(owner);
    for (const override of [
      { VERCEL: "1" }, { VERCEL_ENV: "production" }, { NODE_ENV: "development" },
      { PLATFORM_DEPLOYMENT_MODE: "cloud" }, { RUNORY_SELF_HOST_CANDIDATE: "0" },
      { RUNORY_SELF_HOST_MAIL_MODE: "provider" }, { PLATFORM_DEV_BOOTSTRAP: "true" },
      { PLATFORM_TRUST_IDENTITY_HEADERS: "true" }, { PLATFORM_OTP_RETURN_DEV_CODE: "true" },
      { LIBSQL_URL: "libsql://external.invalid" }, { PLATFORM_ADMIN_EMAILS: owner + ",other@example.invalid" },
    ]) expect(getOperatorOtpOwner({ ...enabled, ...override })).toBeNull();
  });
  it("replaces older codes, stores privately, and permits only one claim", async () => {
    const root = await mkdtemp(join(tmpdir(), "runory-owner-code-"));
    try {
      const expiry = new Date(Date.now() + 60_000).toISOString();
      await writeOperatorCode(root, owner, "123456", expiry);
      await writeOperatorCode(root, owner, "654321", expiry);
      expect((await stat(join(root, "owner.json"))).mode & 0o777).toBe(0o600);
      const results = await Promise.allSettled([takeOperatorCode(root, owner), takeOperatorCode(root, owner)]);
      expect(results.filter(r => r.status === "fulfilled")).toEqual([{ status: "fulfilled", value: "654321" }]);
      await expect(readFile(join(root, "owner.json"))).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("rejects expired, wrong-recipient and nonprivate delivery", async () => {
    const root = await mkdtemp(join(tmpdir(), "runory-owner-code-"));
    try {
      const path = join(root, "owner.json");
      await writeFile(path, JSON.stringify({ email: owner, code: "123456", expiresAt: new Date(0).toISOString() }), { mode: 0o600 });
      await expect(takeOperatorCode(root, owner)).rejects.toThrow("No current owner code");
      await writeOperatorCode(root, owner, "123456", new Date(Date.now() + 60_000).toISOString());
      await expect(takeOperatorCode(root, "other@example.invalid")).rejects.toThrow("No current owner code");
      await chmod(root, 0o755);
      await expect(writeOperatorCode(root, owner, "123456", new Date(Date.now() + 60_000).toISOString())).rejects.toThrow("not private");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
