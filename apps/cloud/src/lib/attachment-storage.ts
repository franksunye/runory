import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { BusinessError, ERROR_CODES } from "@runory/platform-core";

const LOCAL_PREFIX = "local:v1:";
const BLOB_PREFIX = "vercel-blob-private:v1:";
const SAFE_COMPONENT = /^[a-zA-Z0-9_-]+$/;

type Environment = Record<string, string | undefined>;
type StorageReference =
  | { provider: "local"; pathname: string }
  | { provider: "vercel-blob"; storeId: string; pathname: string };

export interface StoredAttachment {
  /** Opaque, versioned provider reference. Persist it, never expose a Blob URL. */
  reference: string;
}

export interface AttachmentBody {
  stream: ReadableStream<Uint8Array>;
  size: number;
}

function unavailable(message: string): BusinessError {
  return new BusinessError(ERROR_CODES.INTERNAL_ERROR, message, 503);
}

function assertComponent(value: string): void {
  if (!SAFE_COMPONENT.test(value)) {
    throw new BusinessError(ERROR_CODES.INVALID_INPUT, "Invalid attachment storage identifier", 400);
  }
}

function normalizeStoreId(value: string): string {
  const id = value.replace(/^store_/, "");
  if (!/^[a-zA-Z0-9]+$/.test(id)) {
    throw unavailable("A valid private Blob store is required for attachment storage");
  }
  return id;
}

function assertBlobCredentials(env: Environment): void {
  if (!env.VERCEL_OIDC_TOKEN && !env.BLOB_READ_WRITE_TOKEN) {
    throw unavailable("Private attachment storage credentials are not configured");
  }
}

function blobAuthOptions(env: Environment, storeId: string) {
  assertBlobCredentials(env);
  // A token-connected store may not have an OIDC project grant. Honor an
  // explicitly configured static credential instead of letting an unrelated
  // ambient Vercel OIDC token override it. With no static token, the SDK owns
  // OIDC resolution and refresh; never capture or forward a fixed oidcToken.
  return { storeId, ...(env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : {}) };
}

function assertLocalAllowed(env: Environment): void {
  if (env.VERCEL === "1") {
    throw unavailable("Local attachment storage is not supported on Vercel");
  }
}

function privateBlobUrl(ref: { storeId: string; pathname: string }): string {
  return `https://${ref.storeId}.private.blob.vercel-storage.com/${ref.pathname}`;
}

function matchesPrivateBlobUrl(url: string, ref: { storeId: string; pathname: string }): boolean {
  try {
    // Providers may normalize DNS host casing. All other URL components must
    // still identify exactly the expected private object.
    return new URL(url).href === new URL(privateBlobUrl(ref)).href;
  } catch {
    return false;
  }
}

function parseReference(reference: string, workspaceId: string): StorageReference {
  assertComponent(workspaceId);
  if (reference.startsWith(BLOB_PREFIX)) {
    const parts = reference.slice(BLOB_PREFIX.length).split("/");
    if (parts.length !== 3 || parts[1] !== workspaceId) {
      throw new BusinessError(ERROR_CODES.NOT_FOUND, "Attachment not found", 404);
    }
    const [storeId, , attachmentId] = parts;
    assertComponent(attachmentId);
    return {
      provider: "vercel-blob",
      storeId: normalizeStoreId(storeId),
      pathname: `attachments/${workspaceId}/${attachmentId}`,
    };
  }
  // Pre-F08 rows used bare workspace/id paths. Keeping their local identity
  // explicit prevents changing deployment settings from silently reinterpreting
  // old paths as keys in a different store. Migrating their bytes is separate.
  const pathname = reference.startsWith(LOCAL_PREFIX)
    ? reference.slice(LOCAL_PREFIX.length)
    : reference;
  const parts = pathname.split("/");
  if (parts.length !== 2 || parts[0] !== workspaceId || !SAFE_COMPONENT.test(parts[1])) {
    throw new BusinessError(ERROR_CODES.NOT_FOUND, "Attachment not found", 404);
  }
  return { provider: "local", pathname };
}

/**
 * A fresh adapter has no attachment state. Reads resolve only the persisted
 * provider reference, so a new Function instance can read a previous upload.
 * The caller must authorize the Workspace before invoking any operation.
 */
export function createAttachmentStorage(env: Environment = process.env) {
  const localRoot = resolve(env.RUNORY_LOCAL_UPLOADS_DIR || resolve(process.cwd(), "data", "uploads"));

  function writeReference(workspaceId: string, attachmentId: string): StoredAttachment {
    assertComponent(workspaceId);
    assertComponent(attachmentId);
    const provider = env.RUNORY_ATTACHMENT_STORAGE?.trim();
    if (provider === "vercel-blob") {
      const storeId = normalizeStoreId(env.BLOB_STORE_ID || "");
      assertBlobCredentials(env);
      return { reference: `${BLOB_PREFIX}${storeId}/${workspaceId}/${attachmentId}` };
    }
    if (provider && provider !== "local") {
      throw unavailable("Attachment storage provider is not supported");
    }
    assertLocalAllowed(env);
    if (!provider && env.NODE_ENV === "production") {
      throw unavailable("Attachment storage must be explicitly configured in production");
    }
    return { reference: `${LOCAL_PREFIX}${workspaceId}/${attachmentId}` };
  }

  return {
    /** Validate cloud configuration before reading the request body or scanning. */
    prepare: writeReference,

    async put(
      workspaceId: string,
      stored: StoredAttachment,
      bytes: Uint8Array,
      contentType: string,
    ): Promise<void> {
      const ref = parseReference(stored.reference, workspaceId);
      if (ref.provider === "local") {
        assertLocalAllowed(env);
        const path = resolve(localRoot, ref.pathname);
        await mkdir(dirname(path), { recursive: true });
        // A unique server-generated attachment id owns this path. Do not ever
        // overwrite another upload, even if a caller accidentally reuses an id.
        await writeFile(path, bytes, { flag: "wx" });
        return;
      }
      const auth = blobAuthOptions(env, ref.storeId);
      const { put, del } = await import("@vercel/blob");
      const uploaded = await put(ref.pathname, Buffer.from(bytes), {
        access: "private",
        ...auth,
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType,
      });
      // A static read/write token determines its own store in the SDK. Detect
      // a mismatched BLOB_STORE_ID before committing a misleading reference.
      if (!matchesPrivateBlobUrl(uploaded.url, ref)) {
        try {
          await del(uploaded.url, auth);
        } catch {
          console.error("[attachments:store-mismatch-cleanup-required]", {
            workspaceId, expectedReference: stored.reference,
          });
        }
        throw unavailable("Attachment credentials do not match the configured private store");
      }
    },

    async get(workspaceId: string, reference: string): Promise<AttachmentBody | null> {
      const ref = parseReference(reference, workspaceId);
      if (ref.provider === "local") {
        assertLocalAllowed(env);
        let handle;
        try {
          handle = await open(resolve(localRoot, ref.pathname), "r");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
        try {
          const stat = await handle.stat();
          if (!stat.isFile()) {
            await handle.close();
            return null;
          }
          return {
            stream: Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>,
            size: stat.size,
          };
        } catch (error) {
          await handle.close();
          throw error;
        }
      }
      const auth = blobAuthOptions(env, ref.storeId);
      const { get } = await import("@vercel/blob");
      // An explicit private URL pins the persisted store even when a static
      // token is rotated to another store. The URL stays on the server.
      const result = await get(privateBlobUrl(ref), { access: "private", ...auth, useCache: false });
      if (!result) return null;
      if (result.statusCode !== 200 || !result.stream) {
        throw unavailable("Attachment storage returned an unexpected response");
      }
      return { stream: result.stream, size: result.blob.size };
    },

    async remove(workspaceId: string, reference: string): Promise<void> {
      const ref = parseReference(reference, workspaceId);
      if (ref.provider === "local") {
        assertLocalAllowed(env);
        await rm(resolve(localRoot, ref.pathname), { force: true });
        return;
      }
      const auth = blobAuthOptions(env, ref.storeId);
      const { del } = await import("@vercel/blob");
      await del(privateBlobUrl(ref), auth);
    },
  };
}

export type AttachmentStorage = ReturnType<typeof createAttachmentStorage>;

/** Best-effort compensation; a failure remains visible for operator cleanup. */
export async function compensateAttachmentWrite(
  storage: AttachmentStorage,
  workspaceId: string,
  reference: string,
  requestId: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await storage.remove(workspaceId, reference);
      return true;
    } catch {
      // A second idempotent delete covers a transient provider failure without
      // hiding the original failed upload or logging a credential-bearing SDK error.
    }
  }
  console.error("[attachments:cleanup-required]", { workspaceId, reference, requestId });
  return false;
}
