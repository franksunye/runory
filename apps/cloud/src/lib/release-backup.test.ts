import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, Config, TransactionMode } from "@libsql/client";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import * as recovery from "../../../../packages/platform-core/src/database-backup";
import { ReleaseBackupError, runReleaseBackup } from "../../scripts/release-backup-gate";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), put: vi.fn(), get: vi.fn() }));
vi.mock("@libsql/client", async (original) => ({
  ...await original<typeof import("@libsql/client")>(),
  createClient: mocks.createClient,
}));
vi.mock("@vercel/blob", () => ({ put: mocks.put, get: mocks.get }));

const config = {
  RUNORY_RELEASE_BACKUP_REQUIRED: "1",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  LIBSQL_URL: "libsql://synthetic.invalid",
  LIBSQL_AUTH_TOKEN: "synthetic-database-secret",
  BLOB_STORE_ID: "store_MixedCase",
  BLOB_READ_WRITE_TOKEN: "synthetic-blob-secret",
  VERCEL_OIDC_TOKEN: "synthetic-oidc-secret",
};
let directory: string;
let sourcePath: string;
let archive: Buffer;
let sourceStatements: string[];
const opened: Array<{ config: Config; client: Client; close: ReturnType<typeof vi.spyOn>; transaction: ReturnType<typeof vi.spyOn> }> = [];
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@libsql/client")>("@libsql/client");
  directory = await mkdtemp(join(tmpdir(), "runory-release-backup-test-"));
  sourcePath = join(directory, "source.db");
  sourceStatements = [];
  const source = actual.createClient({ url: `file:${sourcePath}`, intMode: "bigint" });
  try {
    await source.executeMultiple(`
      CREATE TABLE sys_schema_migrations (id TEXT PRIMARY KEY);
      INSERT INTO sys_schema_migrations VALUES ('synthetic-migration');
      CREATE TABLE cat_catalog_items (id TEXT PRIMARY KEY);
      INSERT INTO cat_catalog_items VALUES ('synthetic-module');
      CREATE TABLE cat_catalog_versions (id TEXT PRIMARY KEY);
      INSERT INTO cat_catalog_versions VALUES ('synthetic-version');
      CREATE TABLE sys_runtime_installations (id TEXT PRIMARY KEY);
      INSERT INTO sys_runtime_installations VALUES ('synthetic-installation');
      CREATE TABLE business_records (id TEXT PRIMARY KEY, note TEXT, amount INTEGER, bytes BLOB);
    `);
    await source.execute({
      sql: "INSERT INTO business_records VALUES (?, ?, ?, ?)",
      args: ["synthetic-record", "never-log-this-business-data", 9007199254740993n, new Uint8Array([0, 255, 42])],
    });
  } finally {
    source.close();
  }
  mocks.createClient.mockImplementation((options: Config) => {
    if (options.url !== config.LIBSQL_URL && !options.url.startsWith("file:")) {
      throw new Error("Tests must not connect to a real remote database");
    }
    const client = actual.createClient({
      ...options,
      ...(options.url === config.LIBSQL_URL ? { url: `file:${sourcePath}`, authToken: undefined } : {}),
    });
    const begin = client.transaction.bind(client);
    const transaction = vi.spyOn(client, "transaction");
    if (options.url === config.LIBSQL_URL) {
      transaction.mockImplementation(async (mode?: TransactionMode) => {
        const tx = await begin(mode);
        const execute = tx.execute.bind(tx);
        vi.spyOn(tx, "execute").mockImplementation((statement) => {
          sourceStatements.push(typeof statement === "string" ? statement : statement.sql);
          return execute(statement);
        });
        return tx;
      });
    }
    opened.push({ config: options, client, close: vi.spyOn(client, "close"), transaction });
    return client;
  });
  mocks.put.mockImplementation(async (pathname: string, bytes: Buffer) => {
    archive = Buffer.from(bytes);
    return { pathname, url: `https://mixedcase.private.blob.vercel-storage.com/${pathname}` };
  });
  mocks.get.mockImplementation(async (url: string) => ({
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(archive); controller.close(); } }),
    blob: { url, pathname: new URL(url).pathname.slice(1), size: archive.byteLength },
  }));
});

afterEach(async () => {
  opened.splice(0).forEach(({ client }) => client.close());
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await rm(directory, { recursive: true, force: true });
});

describe("production release database backup gate", () => {
  it("does no database or Blob work unless both explicit production conditions hold", async () => {
    expect(await runReleaseBackup({ ...config, RUNORY_RELEASE_BACKUP_REQUIRED: undefined })).toEqual({ status: "SKIPPED" });
    expect(await runReleaseBackup({ ...config, VERCEL_ENV: "preview" })).toEqual({ status: "SKIPPED" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each([
    { LIBSQL_URL: undefined },
    { LIBSQL_AUTH_TOKEN: undefined },
    { LIBSQL_URL: "file:/tmp/not-production.db" },
    { LIBSQL_URL: "libsql://synthetic.invalid:8080?tls=0" },
    { LIBSQL_URL: "libsql://synthetic.invalid:8080?tls=1&tls=0" },
    { LIBSQL_URL: "libsql://synthetic.invalid?authToken=synthetic-query-secret" },
    { LIBSQL_URL: "https://user:synthetic-userinfo-secret@synthetic.invalid" },
    { BLOB_STORE_ID: undefined },
    { BLOB_READ_WRITE_TOKEN: undefined, VERCEL_OIDC_TOKEN: undefined },
    { VERCEL_GIT_COMMIT_SHA: "unknown" },
  ])("fails before any connection for missing/unsafe production configuration", async (overrides) => {
    await expect(runReleaseBackup({ ...config, ...overrides })).rejects.toMatchObject({ stage: "configuration" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("restores and reopens real SQLite data before an immutable private upload and verified readback", async () => {
    const sourceDigest = digest(await readFile(sourcePath));
    const result = await runReleaseBackup(config);
    expect(result).toMatchObject({
      status: "PASS", tables: 5, rows: 5, appliedMigrations: 1,
      catalogItems: 1, catalogVersions: 1, installations: 1,
      sourceWrites: false, reopenedAndVerified: true, remoteReadbackVerified: true,
      attachmentBytesIncluded: false, providerDisasterRecoveryVerified: false,
    });
    expect(digest(await readFile(sourcePath))).toBe(sourceDigest);
    expect(opened).toHaveLength(3);
    expect(opened[0].transaction).toHaveBeenCalledExactlyOnceWith("read");
    expect(sourceStatements.length).toBeGreaterThan(0);
    expect(sourceStatements.every(sql => /^(SELECT\b|PRAGMA (integrity_check|foreign_key_check|table_xinfo)\b)/.test(sql))).toBe(true);
    expect(opened[1].config.url).toBe(opened[2].config.url);
    expect(opened[1].close.mock.invocationCallOrder[0]).toBeLessThan(mocks.createClient.mock.invocationCallOrder[2]);
    expect(existsSync(fileURLToPath(opened[1].config.url))).toBe(false);
    expect(opened.every(({ close }) => close.mock.calls.length > 0)).toBe(true);
    const [pathname, , options] = mocks.put.mock.calls[0];
    expect(pathname).toMatch(/^database-backups\/[a-f0-9]{40}\/[a-f0-9-]+\.json\.gz$/);
    expect(options).toMatchObject({
      access: "private", storeId: "MixedCase", token: config.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: false, addRandomSuffix: false, contentType: "application/gzip",
    });
    expect(options).not.toHaveProperty("oidcToken");
    expect(mocks.get.mock.calls[0][1]).toMatchObject({ access: "private", useCache: false, token: config.BLOB_READ_WRITE_TOKEN });
    const saved = JSON.parse(gunzipSync(archive).toString("utf8"));
    recovery.validateDatabaseBackup(saved);
    const row = saved.tables.find((table: { name: string }) => table.name === "business_records").rows[0];
    expect(row[2]).toEqual({ type: "integer", value: "9007199254740993" });
    expect(row[3]).toEqual({ type: "blob", value: "AP8q" });
    expect(JSON.stringify(result)).not.toMatch(/never-log-this-business-data|synthetic-database-secret|synthetic-blob-secret|synthetic-oidc-secret|synthetic\.invalid/);
  });

  it("leaves OIDC resolution and refresh to the SDK when no static token is configured", async () => {
    await runReleaseBackup({ ...config, BLOB_READ_WRITE_TOKEN: undefined });
    for (const options of [mocks.put.mock.calls[0][2], mocks.get.mock.calls[0][1]]) {
      expect(options.storeId).toBe("MixedCase");
      expect(options).not.toHaveProperty("token");
      expect(options).not.toHaveProperty("oidcToken");
    }
  });

  it("blocks before upload when snapshot or reopened recovery verification fails", async () => {
    vi.spyOn(recovery, "createDatabaseBackup").mockRejectedValueOnce(new Error("database-secret-in-driver-error"));
    await expect(runReleaseBackup(config)).rejects.toEqual(new ReleaseBackupError("snapshot", expect.any(String)));
    expect(mocks.put).not.toHaveBeenCalled();
    vi.spyOn(recovery, "verifyDatabaseBackup").mockRejectedValueOnce(new Error("business-data-in-restore-error"));
    await expect(runReleaseBackup(config)).rejects.toMatchObject({ stage: "recovery", message: "Release database backup failed at recovery" });
    expect(mocks.put).not.toHaveBeenCalled();
    for (const entry of opened.filter(entry => entry.config.url.startsWith("file:"))) {
      expect(existsSync(fileURLToPath(entry.config.url))).toBe(false);
    }
  });

  it("does not retry with different credentials or expose provider errors after an upload denial", async () => {
    mocks.put.mockRejectedValueOnce(new Error("Bearer synthetic-blob-secret never-log-this-business-data"));
    const error = await runReleaseBackup(config).catch(value => value);
    expect(error).toBeInstanceOf(ReleaseBackupError);
    expect(error.stage).toBe("upload");
    expect(JSON.stringify(error)).not.toMatch(/synthetic-blob-secret|never-log-this-business-data/);
    expect(error.message).toBe("Release database backup failed at upload");
    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each(["different.private", "mixedcase.public"])("rejects an uploaded object outside the configured private store: %s", async (host) => {
    mocks.put.mockImplementationOnce(async (pathname: string) => ({
      pathname, url: `https://${host}.blob.vercel-storage.com/${pathname}`,
    }));
    await expect(runReleaseBackup(config)).rejects.toMatchObject({ stage: "upload" });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("blocks a corrupted remote archive even when its declared byte count matches", async () => {
    mocks.get.mockImplementationOnce(async (url: string) => {
      const corrupted = Buffer.from(archive);
      corrupted[corrupted.length - 1] ^= 1;
      return {
        statusCode: 200,
        stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(corrupted); controller.close(); } }),
        blob: { url, pathname: new URL(url).pathname.slice(1), size: corrupted.byteLength },
      };
    });
    await expect(runReleaseBackup(config)).rejects.toMatchObject({ stage: "readback" });
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });

  it.each(["missing", "wrong-path", "wrong-size", "unexpected-status", "extra-bytes", "provider-error"])("blocks invalid remote readback and removes the temporary database: %s", async (failure) => {
    mocks.get.mockImplementationOnce(async (url: string) => {
      if (failure === "missing") return null;
      if (failure === "provider-error") throw new Error("synthetic-database-secret never-log-this-business-data");
      const bytes = failure === "extra-bytes" ? Buffer.concat([archive, Buffer.from([1])]) : archive;
      return {
        statusCode: failure === "unexpected-status" ? 304 : 200,
        stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
        blob: {
          url,
          pathname: failure === "wrong-path" ? "database-backups/wrong-object" : new URL(url).pathname.slice(1),
          size: failure === "wrong-size" ? archive.byteLength + 1 : archive.byteLength,
        },
      };
    });
    const error = await runReleaseBackup(config).catch(value => value);
    expect(error).toMatchObject({ stage: "readback", message: "Release database backup failed at readback" });
    expect(JSON.stringify(error)).not.toMatch(/synthetic-database-secret|never-log-this-business-data/);
    expect(existsSync(fileURLToPath(opened[1].config.url))).toBe(false);
  });

  it("returns a failing process exit with a sanitized build-gate diagnostic", () => {
    const cloud = resolve(__dirname, "../..");
    const child = spawnSync(process.execPath, ["--import", "tsx", "scripts/release-backup.mts"], {
      cwd: cloud,
      env: { PATH: process.env.PATH, NODE_ENV: "test", VERCEL_ENV: "production", RUNORY_RELEASE_BACKUP_REQUIRED: "1" },
      encoding: "utf8",
    });
    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
    expect(JSON.parse(child.stderr.trim())).toEqual({
      operation: "release-database-backup", status: "FAIL", stage: "configuration",
    });
  });
});
