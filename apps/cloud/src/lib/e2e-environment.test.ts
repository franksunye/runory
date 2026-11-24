import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCloudEnv, syncPackPermissionGroups } from "../../e2e/_helpers";

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
});
function dotenv() {
  const dir = mkdtempSync(join(tmpdir(), "runory-env-test-"));
  dirs.push(dir);
  const file = join(dir, ".env.local");
  writeFileSync(file, "LIBSQL_URL=libsql://example.invalid\nLIBSQL_AUTH_TOKEN=do-not-load\nRETELL_API_KEY=do-not-load\n");
  return file;
}
describe("local verification environment isolation", () => {
  it("does not allow dotenv to replace an explicitly configured local database or empty credential", () => {
    vi.stubEnv("RUNORY_ISOLATED_VERIFICATION", "false");
    vi.stubEnv("LIBSQL_URL", "file:/tmp/isolated-test.db");
    vi.stubEnv("LIBSQL_AUTH_TOKEN", "");
    const env = loadCloudEnv(dotenv());
    expect(env.LIBSQL_URL).toBe("file:/tmp/isolated-test.db");
    expect(env.LIBSQL_AUTH_TOKEN).toBe("");
  });
  it("does not import any dotenv provider credential during isolated verification", () => {
    vi.stubEnv("RUNORY_ISOLATED_VERIFICATION", "true");
    vi.stubEnv("RETELL_API_KEY", undefined);
    expect(loadCloudEnv(dotenv()).RETELL_API_KEY).toBeUndefined();
  });
  it("rejects a mismatched database before starting a write-capable helper", () => {
    vi.stubEnv("RUNORY_ISOLATED_VERIFICATION", "true");
    vi.stubEnv("RUNORY_VERIFICATION_DATABASE_URL", "file:/tmp/expected-test.db");
    vi.stubEnv("LIBSQL_URL", "file:/tmp/different-test.db");
    expect(() => syncPackPermissionGroups()).toThrow("fresh local database");
  });
});
