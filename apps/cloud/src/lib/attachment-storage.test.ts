import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAttachmentStorage, compensateAttachmentWrite } from "./attachment-storage";
import { scanAttachment } from "./attachment-scan";

const blob = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
vi.mock("server-only", () => ({}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("attachment storage provider boundaries", () => {
  it("reads persisted local and legacy references from a fresh adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "runory-attachment-local-"));
    try {
      const config = { NODE_ENV: "test", RUNORY_LOCAL_UPLOADS_DIR: root };
      const writer = createAttachmentStorage(config);
      const stored = writer.prepare("ws_local", "att_new");
      await writer.put("ws_local", stored, new TextEncoder().encode("durable bytes"), "application/pdf");
      const reader = createAttachmentStorage(config);
      expect(await new Response((await reader.get("ws_local", stored.reference))!.stream).text()).toBe("durable bytes");
      await mkdir(join(root, "ws_legacy"));
      await writeFile(join(root, "ws_legacy", "att_old"), "legacy bytes");
      expect(await new Response((await reader.get("ws_legacy", "ws_legacy/att_old"))!.stream).text()).toBe("legacy bytes");
      await reader.remove("ws_local", stored.reference);
      expect(await reader.get("ws_local", stored.reference)).toBeNull();
      expect(blob.put).not.toHaveBeenCalled();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each([
    { VERCEL: "1" },
    { VERCEL: "1", RUNORY_ATTACHMENT_STORAGE: "local" },
    { NODE_ENV: "production" },
    { RUNORY_ATTACHMENT_STORAGE: "unknown" },
    { RUNORY_ATTACHMENT_STORAGE: "vercel-blob", VERCEL_OIDC_TOKEN: "synthetic" },
    { RUNORY_ATTACHMENT_STORAGE: "vercel-blob", BLOB_STORE_ID: "store_example" },
  ])("fails closed for missing/invalid deployment configuration: %j", (config) => {
    expect(() => createAttachmentStorage(config).prepare("ws_a", "att_a")).toThrow();
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("does not reinterpret legacy local references as cloud objects or accept traversal", async () => {
    const storage = createAttachmentStorage({ VERCEL: "1", RUNORY_ATTACHMENT_STORAGE: "vercel-blob", BLOB_STORE_ID: "store_example", VERCEL_OIDC_TOKEN: "synthetic" });
    await expect(storage.get("ws_a", "ws_a/att_a")).rejects.toMatchObject({ httpStatus: 503 });
    for (const ref of ["../secret", "local:v1:ws_b/att_a", "vercel-blob-private:v1:example/ws_b/att_a", "local:v1:ws_a/../secret"]) {
      await expect(storage.get("ws_a", ref)).rejects.toMatchObject({ httpStatus: 404 });
    }
    expect(blob.get).not.toHaveBeenCalled();
  });

  it("pins private reads to the store in the persisted reference", async () => {
    const storage = createAttachmentStorage({ RUNORY_ATTACHMENT_STORAGE: "vercel-blob", BLOB_STORE_ID: "store_newstore", BLOB_READ_WRITE_TOKEN: "synthetic" });
    blob.get.mockResolvedValueOnce(null);
    expect(await storage.get("ws_a", "vercel-blob-private:v1:oldstore/ws_a/att_a")).toBeNull();
    expect(blob.get).toHaveBeenCalledWith("https://oldstore.private.blob.vercel-storage.com/attachments/ws_a/att_a", { access: "private", storeId: "oldstore", token: "synthetic", useCache: false });
  });

  it("rejects a token/store mismatch and compensates the actual uploaded object", async () => {
    const storage = createAttachmentStorage({ RUNORY_ATTACHMENT_STORAGE: "vercel-blob", BLOB_STORE_ID: "store_expected", BLOB_READ_WRITE_TOKEN: "synthetic" });
    const url = "https://different.private.blob.vercel-storage.com/attachments/ws_a/att_a";
    blob.put.mockResolvedValueOnce({ url });
    blob.del.mockResolvedValueOnce(undefined);
    await expect(storage.put("ws_a", storage.prepare("ws_a", "att_a"), new Uint8Array([1]), "image/png")).rejects.toMatchObject({ httpStatus: 503 });
    expect(blob.del).toHaveBeenCalledWith(url, { storeId: "expected", token: "synthetic" });
  });

  it("uses the configured store token when Vercel also supplies an ambient OIDC token", async () => {
    const storage = createAttachmentStorage({
      VERCEL: "1", RUNORY_ATTACHMENT_STORAGE: "vercel-blob", BLOB_STORE_ID: "store_example",
      BLOB_READ_WRITE_TOKEN: "synthetic_store_token", VERCEL_OIDC_TOKEN: "synthetic_ungranted_oidc",
    });
    const stored = storage.prepare("ws_a", "att_a");
    const url = "https://example.private.blob.vercel-storage.com/attachments/ws_a/att_a";
    blob.put.mockResolvedValueOnce({ url });
    blob.get.mockResolvedValueOnce(null);
    blob.del.mockResolvedValueOnce(undefined);
    await storage.put("ws_a", stored, new Uint8Array([1]), "image/png");
    await storage.get("ws_a", stored.reference);
    await storage.remove("ws_a", stored.reference);
    const auth = { storeId: "example", token: "synthetic_store_token" };
    expect(blob.put).toHaveBeenCalledWith("attachments/ws_a/att_a", expect.any(Buffer), expect.objectContaining(auth));
    expect(blob.get).toHaveBeenCalledWith(url, { access: "private", ...auth, useCache: false });
    expect(blob.del).toHaveBeenCalledWith(url, auth);
    expect(blob.put.mock.calls[0][2]).not.toHaveProperty("oidcToken");
  });

  it("accepts DNS host normalization while preserving the exact private object path", async () => {
    const storage = createAttachmentStorage({
      RUNORY_ATTACHMENT_STORAGE: "vercel-blob", BLOB_STORE_ID: "store_MixedCase",
      BLOB_READ_WRITE_TOKEN: "synthetic_store_token",
    });
    const stored = storage.prepare("ws_a", "att_a");
    blob.put.mockResolvedValueOnce({ url: "https://mixedcase.private.blob.vercel-storage.com/attachments/ws_a/att_a" });
    await expect(storage.put("ws_a", stored, new Uint8Array([1]), "image/png")).resolves.toBeUndefined();
    expect(blob.del).not.toHaveBeenCalled();
    blob.put.mockResolvedValueOnce({ url: "https://mixedcase.private.blob.vercel-storage.com/attachments/ws_a/att_other" });
    blob.del.mockResolvedValueOnce(undefined);
    await expect(storage.put("ws_a", stored, new Uint8Array([1]), "image/png")).rejects.toMatchObject({ httpStatus: 503 });
  });

  it("retries idempotent cleanup and emits an actionable reference if both attempts fail", async () => {
    const storage = createAttachmentStorage({ RUNORY_ATTACHMENT_STORAGE: "vercel-blob", BLOB_STORE_ID: "store_example", VERCEL_OIDC_TOKEN: "synthetic" });
    const ref = storage.prepare("ws_a", "att_a").reference;
    blob.del.mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce(undefined);
    expect(await compensateAttachmentWrite(storage, "ws_a", ref, "request_test")).toBe(true);
    expect(blob.del).toHaveBeenCalledTimes(2);
    blob.del.mockRejectedValue(new Error("synthetic provider failure"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await compensateAttachmentWrite(storage, "ws_a", ref, "request_test")).toBe(false);
    expect(log).toHaveBeenCalledWith("[attachments:cleanup-required]", { workspaceId: "ws_a", reference: ref, requestId: "request_test" });
  });
});

describe("attachment malware scanning", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const digest = "synthetic_sha256";
  function configuredScanner() {
    vi.stubEnv("MALWARE_SCAN_ENDPOINT", "https://scanner.test/scan");
    vi.stubEnv("MALWARE_SCAN_TOKEN", "synthetic_scanner_token");
    vi.stubEnv("VERCEL", "1");
  }

  it("distinguishes an unconfigured optional scanner from a clean attestation", async () => {
    vi.stubEnv("MALWARE_SCAN_ENDPOINT", "");
    vi.stubEnv("RUNORY_MALWARE_SCAN_REQUIRED", "false");
    expect(await scanAttachment(bytes, "application/pdf", digest)).toBe("not_configured");
    vi.stubEnv("RUNORY_MALWARE_SCAN_REQUIRED", "true");
    await expect(scanAttachment(bytes, "application/pdf", digest)).rejects.toMatchObject({ httpStatus: 503 });
  });

  it("accepts only a clean attestation for the submitted digest", async () => {
    configuredScanner();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ clean: true, sha256: digest }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await scanAttachment(bytes, "application/pdf", digest)).toBe("clean");
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://scanner.test/scan"), expect.objectContaining({
      method: "POST", body: bytes, redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/pdf", "X-Content-SHA256": digest, Authorization: "Bearer synthetic_scanner_token" },
    }));
  });

  it.each([
    [{ clean: false, sha256: digest }, 422],
    [{ clean: true, sha256: "another_file" }, 503],
    [{ clean: true }, 503],
    [null, 503],
  ])("rejects an unsafe or unverifiable scan result: %j", async (result, status) => {
    configuredScanner();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    await expect(scanAttachment(bytes, "application/pdf", digest)).rejects.toMatchObject({ httpStatus: status });
  });

  it("fails closed on provider errors and insecure production endpoints", async () => {
    configuredScanner();
    const fetchMock = vi.fn().mockRejectedValue(new Error("synthetic network timeout"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(scanAttachment(bytes, "application/pdf", digest)).rejects.toMatchObject({ httpStatus: 503 });
    vi.stubEnv("MALWARE_SCAN_ENDPOINT", "http://localhost/scan");
    await expect(scanAttachment(bytes, "application/pdf", digest)).rejects.toMatchObject({ httpStatus: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
