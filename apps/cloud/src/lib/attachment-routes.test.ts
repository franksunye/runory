import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as blob from "@vercel/blob";
import {
  db, createWorkspace, createApiKey, queryOne, execute, genId, TABLES, _clearAccessCache,
} from "@runory/platform-core";
import { POST as upload, GET as uploadPolicy } from "@/app/api/workspaces/[id]/uploads/route";
import { GET as download } from "@/app/api/workspaces/[id]/uploads/[attachmentId]/route";

// Authentication, Workspace resolution, migrations, metadata writes and reads
// are real. Only the external Blob SDK/network boundary is simulated.
const remote = vi.hoisted(() => ({
  objects: new Map<string, Uint8Array>(), put: vi.fn(), get: vi.fn(), del: vi.fn(),
}));
// Vitest 3's manual factory mocks share an import callstack: concurrent dynamic
// imports can bypass that mock and execute the real SDK. Automocking caches the
// module before resolving imports, so both requests keep the network boundary.
vi.mock("@vercel/blob");
vi.mock("server-only", () => ({}));

const testDir = mkdtempSync(join(tmpdir(), "runory-attachment-routes-"));
const envKeys = ["LIBSQL_URL", "LIBSQL_AUTH_TOKEN", "PLATFORM_DEV_BOOTSTRAP", "PLATFORM_TRUST_IDENTITY_HEADERS", "RUNORY_TRUST_IDENTITY_HEADERS", "PLATFORM_TRUST_PROXY_VERIFIED"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
process.env.LIBSQL_URL = `file:${join(testDir, "attachments.db")}`;
process.env.LIBSQL_AUTH_TOKEN = "";
process.env.PLATFORM_DEV_BOOTSTRAP = "false";
process.env.PLATFORM_TRUST_IDENTITY_HEADERS = "false";
process.env.RUNORY_TRUST_IDENTITY_HEADERS = "false";
process.env.PLATFORM_TRUST_PROXY_VERIFIED = "false";

let workspaceId: string;
let outsiderWorkspaceId: string;
let ownerToken: string;
let outsiderToken: string;
let readToken: string;

function params(id = workspaceId) { return { params: Promise.resolve({ id }) }; }
function urlFor(pathname: string, storeId = "teststore") {
  return `https://${storeId}.private.blob.vercel-storage.com/${pathname}`;
}
function uploadRequest(content = "synthetic attachment", fileName = "evidence.pdf", token = ownerToken, id = workspaceId) {
  const form = new FormData();
  form.append("file", new File([content], fileName, { type: "application/pdf" }));
  return new NextRequest(`http://localhost:3000/api/workspaces/${id}/uploads`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "x-requested-with": "XMLHttpRequest" }, body: form,
  });
}
function downloadRequest(attachmentId: string, id = workspaceId, token = ownerToken) {
  return new NextRequest(`http://localhost:3000/api/workspaces/${id}/uploads/${attachmentId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}
async function rowCount() {
  return (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${TABLES.attachments}`))!.count;
}
function storeBytes(pathname: string, bytes: Uint8Array) {
  const url = urlFor(pathname);
  remote.objects.set(url, new Uint8Array(bytes));
  return { url, pathname };
}

beforeAll(async () => {
  const owner = { externalId: genId("owner"), email: "attachments-owner@test.invalid", displayName: "Attachment owner" };
  const outsider = { externalId: genId("outsider"), email: "attachments-outsider@test.invalid", displayName: "Other tenant" };
  workspaceId = (await createWorkspace("Attachment tenant", undefined, owner)).id;
  outsiderWorkspaceId = (await createWorkspace("Other attachment tenant", undefined, outsider)).id;
  const ownerId = (await queryOne<{ id: string }>(`SELECT id FROM ${TABLES.users} WHERE external_id=?`, [owner.externalId]))!.id;
  const outsiderId = (await queryOne<{ id: string }>(`SELECT id FROM ${TABLES.users} WHERE external_id=?`, [outsider.externalId]))!.id;
  ownerToken = (await createApiKey(workspaceId, ownerId, { name: "Attachments", scopes: ["workspace:read", "records:write"] })).token;
  outsiderToken = (await createApiKey(outsiderWorkspaceId, outsiderId, { name: "Other tenant", scopes: ["workspace:read", "records:write"] })).token;
  readToken = (await createApiKey(workspaceId, ownerId, { name: "Read attachments", scopes: ["workspace:read"] })).token;
}, 30000);

beforeEach(async () => {
  await execute(`DELETE FROM ${TABLES.attachments}`);
  remote.objects.clear();
  remote.put.mockReset().mockImplementation(async (pathname: string, bytes: Uint8Array) => storeBytes(pathname, bytes));
  remote.get.mockReset().mockImplementation(async (url: string) => {
    const bytes = remote.objects.get(url);
    if (!bytes) return null;
    return { statusCode: 200, stream: new Response(new Uint8Array(bytes)).body, blob: { size: bytes.byteLength } };
  });
  remote.del.mockReset().mockImplementation(async (url: string) => { remote.objects.delete(url); });
  vi.mocked(blob.put).mockImplementation(remote.put);
  vi.mocked(blob.get).mockImplementation(remote.get);
  vi.mocked(blob.del).mockImplementation(remote.del);
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("RUNORY_ATTACHMENT_STORAGE", "vercel-blob");
  vi.stubEnv("BLOB_STORE_ID", "store_teststore");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "synthetic_test_oidc");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("MALWARE_SCAN_ENDPOINT", "");
  vi.stubEnv("RUNORY_MALWARE_SCAN_REQUIRED", "false");
  vi.stubEnv("RUNORY_LOCAL_UPLOADS_DIR", join(testDir, "unused-local-files"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Any accidentally unmocked scanner/network request fails in the test.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("External network disabled in attachment tests")));
});

afterEach(async () => {
  await execute("DROP TRIGGER IF EXISTS attachment_test_insert_failure");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

describe("private attachment upload and download lifecycle", () => {
  it("persists the provider identity and streams bytes after reopening the database with a fresh adapter", async () => {
    const content = "%PDF-1.7\nprivate evidence";
    const response = await upload(uploadRequest(content, "现场证据.pdf"), params());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(Object.keys(body.data).sort()).toEqual(["attachmentId", "contentType", "fileName", "size", "uploadedAt"]);
    const attachmentId = body.data.attachmentId;
    const row = await queryOne<{ storage_path: string; storage_key: string; sha256: string }>(
      `SELECT storage_path,storage_key,sha256 FROM ${TABLES.attachments} WHERE id=?`, [attachmentId],
    );
    const reference = `vercel-blob-private:v1:teststore/${workspaceId}/${attachmentId}`;
    expect(row).toMatchObject({ storage_path: reference, storage_key: reference, sha256: createHash("sha256").update(content).digest("hex") });
    expect(remote.put).toHaveBeenCalledWith(`attachments/${workspaceId}/${attachmentId}`, expect.any(Buffer), {
      access: "private", storeId: "teststore", addRandomSuffix: false, allowOverwrite: false, contentType: "application/pdf",
    });
    // Discard the database connection and local files. Every download constructs
    // a new stateless adapter from the persisted reference, just as a new instance does.
    db.close();
    globalThis.__platformDb = undefined;
    _clearAccessCache();
    rmSync(join(testDir, "unused-local-files"), { recursive: true, force: true });
    const downloaded = await download(downloadRequest(attachmentId), { params: Promise.resolve({ id: workspaceId, attachmentId }) });
    expect(downloaded.status).toBe(200);
    expect(await downloaded.text()).toBe(content);
    expect(downloaded.headers.get("content-length")).toBe(String(Buffer.byteLength(content)));
    expect(downloaded.headers.get("cache-control")).toContain("private, no-store");
    expect(downloaded.headers.get("x-content-type-options")).toBe("nosniff");
    expect(downloaded.headers.get("content-disposition")).toContain("filename*=UTF-8''");
    expect(downloaded.headers.get("location")).toBeNull();
  });

  it("denies cross-tenant references before accessing Blob, including a valid key for the other tenant", async () => {
    const result = await upload(uploadRequest(), params());
    const attachmentId = (await result.json()).data.attachmentId;
    remote.get.mockClear();
    const denied = await download(downloadRequest(attachmentId, workspaceId, outsiderToken), { params: Promise.resolve({ id: workspaceId, attachmentId }) });
    expect([401, 403]).toContain(denied.status);
    const hidden = await download(downloadRequest(attachmentId, outsiderWorkspaceId, outsiderToken), { params: Promise.resolve({ id: outsiderWorkspaceId, attachmentId }) });
    expect(hidden.status).toBe(404);
    expect(remote.get).not.toHaveBeenCalled();
    expect((await upload(uploadRequest("forbidden write", "evidence.pdf", readToken), params())).status).toBe(403);
    expect(await rowCount()).toBe(1);
  });

  it("deduplicates repeated content without uploading an additional object", async () => {
    const first = await upload(uploadRequest(), params());
    const second = await upload(uploadRequest(), params());
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await first.json()).data.attachmentId).toBe((await second.json()).data.attachmentId);
    expect(remote.put).toHaveBeenCalledTimes(1);
    expect(await rowCount()).toBe(1);
  });

  it("serializes concurrent duplicate metadata and cleans the redundant object", async () => {
    let release!: () => void;
    const bothUploaded = new Promise<void>((resolve) => { release = resolve; });
    let arrivals = 0;
    const completed: { index: number; status: number }[] = [];
    remote.put.mockImplementation(async (pathname: string, bytes: Uint8Array) => {
      const result = storeBytes(pathname, bytes);
      if (++arrivals === 2) release();
      await bothUploaded;
      return result;
    });
    const attempts = [upload(uploadRequest(), params()), upload(uploadRequest(), params())]
      .map((operation, index) => operation.then((response) => {
        completed.push({ index, status: response.status });
        return response;
      }).finally(() => {
        // An early auth/storage error must not strand the other request at the
        // test barrier and hide the actual response behind Vitest's timeout.
        if (arrivals < 2) release();
      }));
    async function withinDeadline<T>(operation: Promise<T>, stage: string): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          operation,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Concurrent uploads stalled during ${stage}: ${JSON.stringify({
              arrivals, completed, puts: remote.put.mock.calls.length,
              gets: remote.get.mock.calls.length, deletes: remote.del.mock.calls.length,
              errors: vi.mocked(console.error).mock.calls,
            })}`)), 5000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    let responses: Response[];
    try {
      responses = await withinDeadline(Promise.all(attempts), "upload");
    } finally {
      release();
      await withinDeadline(Promise.allSettled(attempts), "cleanup");
    }
    expect(arrivals).toBe(2);
    expect(remote.put).toHaveBeenCalledTimes(2);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[0].data.attachmentId).toBe(bodies[1].data.attachmentId);
    expect(await rowCount()).toBe(1);
    expect(remote.objects.size).toBe(1);
    expect(remote.del).toHaveBeenCalledTimes(1);
  });

  it("does not report a retry as successful when existing bytes are missing or an old local path is unmigrated", async () => {
    const first = await upload(uploadRequest(), params());
    const attachmentId = (await first.json()).data.attachmentId;
    remote.objects.clear();
    expect((await upload(uploadRequest(), params())).status).toBe(503);
    await execute(`UPDATE ${TABLES.attachments} SET storage_path=?, storage_key=? WHERE id=?`,
      [`${workspaceId}/${attachmentId}`, `${workspaceId}/${attachmentId}`, attachmentId]);
    expect((await upload(uploadRequest(), params())).status).toBe(503);
    expect(remote.put).toHaveBeenCalledTimes(1);
    expect(await rowCount()).toBe(1);
  });

  it("removes uploaded bytes when the metadata insert fails", async () => {
    await execute(`CREATE TRIGGER attachment_test_insert_failure BEFORE INSERT ON ${TABLES.attachments}
      BEGIN SELECT RAISE(ABORT, 'synthetic metadata failure'); END`);
    const response = await upload(uploadRequest("metadata will fail"), params());
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(remote.put).toHaveBeenCalledTimes(1);
    expect(remote.del).toHaveBeenCalledTimes(1);
    expect(remote.objects.size).toBe(0);
    expect(await rowCount()).toBe(0);
  });

  it("compensates when storage accepted bytes but its upload acknowledgement was lost", async () => {
    remote.put.mockImplementation(async (pathname: string, bytes: Uint8Array) => {
      storeBytes(pathname, bytes);
      throw new Error("synthetic lost upload response");
    });
    expect((await upload(uploadRequest(), params())).status).toBeGreaterThanOrEqual(500);
    expect(remote.objects.size).toBe(0);
    expect(remote.del).toHaveBeenCalledTimes(1);
    expect(await rowCount()).toBe(0);
  });

  it("rejects missing cloud configuration before storage or metadata writes", async () => {
    vi.stubEnv("RUNORY_ATTACHMENT_STORAGE", "");
    expect((await upload(uploadRequest(), params())).status).toBe(503);
    expect(remote.put).not.toHaveBeenCalled();
    expect(await rowCount()).toBe(0);
  });

  it("enforces the same Vercel size policy returned to the upload UI", async () => {
    const request = new NextRequest(`http://localhost:3000/api/workspaces/${workspaceId}/uploads`, { headers: { authorization: `Bearer ${readToken}` } });
    const response = await uploadPolicy(request, params());
    expect(response.status).toBe(200);
    expect((await response.json()).data.maxFileSizeBytes).toBe(4 * 1024 * 1024);
    const rejected = await upload(uploadRequest("x".repeat(4 * 1024 * 1024 + 1)), params());
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error.message).toContain("4 MiB");
    expect(remote.put).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL", "");
    expect((await (await uploadPolicy(request, params())).json()).data.maxFileSizeBytes).toBe(10 * 1024 * 1024);
  });

  it("fails closed for a configured scanner instead of passing through", async () => {
    vi.stubEnv("MALWARE_SCAN_ENDPOINT", "https://scanner.test/scan");
    const rejected = await upload(uploadRequest(), params());
    expect(rejected.status).toBe(503);
    expect(remote.put).not.toHaveBeenCalled();
    expect(await rowCount()).toBe(0);
  });

  it("does not create a row for a rejected file and accepts a matching clean attestation", async () => {
    vi.stubEnv("MALWARE_SCAN_ENDPOINT", "https://scanner.test/scan");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ clean: false })));
    expect((await upload(uploadRequest(), params())).status).toBe(422);
    expect(remote.put).not.toHaveBeenCalled();
    expect(await rowCount()).toBe(0);
    const content = "verified by scanner";
    const digest = createHash("sha256").update(content).digest("hex");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ clean: true, sha256: digest })));
    expect((await upload(uploadRequest(content), params())).status).toBe(201);
    expect(await rowCount()).toBe(1);
  });
});
