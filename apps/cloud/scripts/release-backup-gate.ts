import { createClient } from "@libsql/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  validateDatabaseBackup,
  verifyDatabaseBackup,
  type DatabaseBackup,
} from "../../../packages/platform-core/src/database-backup";

type Environment = Record<string, string | undefined>;
type Stage = "configuration" | "snapshot" | "recovery" | "upload" | "readback" | "cleanup";

/** Only these safe fields may reach a build log; provider errors can contain secrets. */
export class ReleaseBackupError extends Error {
  constructor(readonly stage: Stage, readonly objectReference?: string) {
    super(`Release database backup failed at ${stage}`);
    this.name = "ReleaseBackupError";
  }
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function readExact(stream: ReadableStream<Uint8Array>, expectedBytes: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > expectedBytes) {
        await reader.cancel();
        throw new Error("Archive length mismatch");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== expectedBytes) throw new Error("Archive length mismatch");
  return Buffer.concat(chunks, size);
}

/**
 * An explicitly enabled production-build gate. This imports no runtime DB,
 * migration or seed module, and all source reads use one consistent read tx.
 */
export async function runReleaseBackup(env: Environment = process.env) {
  if (env.RUNORY_RELEASE_BACKUP_REQUIRED !== "1" || env.VERCEL_ENV !== "production") {
    return { status: "SKIPPED" as const };
  }

  let stage: Stage = "configuration";
  let temporaryDirectory: string | undefined;
  let objectReference: string | undefined;
  try {
    const sourceUrl = env.LIBSQL_URL?.trim();
    const authToken = env.LIBSQL_AUTH_TOKEN?.trim();
    const storeId = env.BLOB_STORE_ID?.trim().replace(/^store_/, "");
    const commit = env.VERCEL_GIT_COMMIT_SHA?.trim();
    if (!sourceUrl || !authToken || !storeId || !/^[a-zA-Z0-9]+$/.test(storeId)
      || !commit || !/^[a-f0-9]{40}$/.test(commit)
      || (!env.BLOB_READ_WRITE_TOKEN?.trim() && !env.VERCEL_OIDC_TOKEN?.trim())) {
      throw new Error("Required release backup configuration is missing or invalid");
    }
    // A production release must not silently back up a new local fallback DB.
    const sourceAddress = new URL(sourceUrl);
    if (!["libsql:", "https:"].includes(sourceAddress.protocol)
      || sourceAddress.username || sourceAddress.password
      || sourceAddress.searchParams.has("authToken")
      || sourceAddress.searchParams.getAll("tls").some(value => value !== "1")) {
      throw new Error("A secure remote database source is required");
    }
    const blobOptions = {
      storeId,
      // An explicitly configured static credential owns this connection.
      // Without it the SDK obtains/refreshes OIDC; never capture oidcToken.
      ...(env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : {}),
    };
    const pathname = `database-backups/${commit}/${randomUUID()}.json.gz`;
    const expectedUrl = new URL(`https://${storeId}.private.blob.vercel-storage.com/${pathname}`).href;
    objectReference = `vercel-blob-private:v1:${storeId}/${pathname}`;

    stage = "snapshot";
    const source = createClient({ url: sourceUrl, authToken, intMode: "bigint" });
    let backup: DatabaseBackup;
    try {
      backup = await createDatabaseBackup(source);
    } finally {
      source.close();
    }

    stage = "recovery";
    temporaryDirectory = await mkdtemp(join(tmpdir(), "runory-release-backup-"));
    const targetPath = join(temporaryDirectory, "restored.db");
    const file = await open(targetPath, "wx", 0o600);
    await file.close();
    const targetUrl = pathToFileURL(targetPath).href;
    const target = createClient({ url: targetUrl, intMode: "bigint" });
    try {
      await restoreDatabaseBackup(target, backup);
    } finally {
      target.close();
    }
    const reopened = createClient({ url: targetUrl, intMode: "bigint" });
    let verified;
    try {
      verified = await verifyDatabaseBackup(reopened, backup);
    } finally {
      reopened.close();
    }
    const archive = gzipSync(JSON.stringify(backup));
    const gzipChecksum = sha256(archive);

    stage = "upload";
    const { put, get } = await import("@vercel/blob");
    const uploaded = await put(pathname, archive, {
      ...blobOptions,
      access: "private",
      contentType: "application/gzip",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    if (uploaded.pathname !== pathname || new URL(uploaded.url).href !== expectedUrl) {
      throw new Error("Uploaded archive is not in the configured private store");
    }

    stage = "readback";
    const downloaded = await get(expectedUrl, { ...blobOptions, access: "private", useCache: false });
    if (!downloaded || downloaded.statusCode !== 200
      || downloaded.blob.size !== archive.byteLength
      || downloaded.blob.pathname !== pathname
      || new URL(downloaded.blob.url).href !== expectedUrl) {
      throw new Error("Archive readback did not return the expected object");
    }
    const bytes = await readExact(downloaded.stream, archive.byteLength);
    if (sha256(bytes) !== gzipChecksum) throw new Error("Stored archive checksum mismatch");
    const storedBackup = JSON.parse(gunzipSync(bytes).toString("utf8")) as DatabaseBackup;
    validateDatabaseBackup(storedBackup);
    if (storedBackup.checksum !== backup.checksum) throw new Error("Stored backup checksum mismatch");

    const countRows = (suffix: string) => backup.tables
      .filter(table => table.name.endsWith(suffix))
      .reduce((sum, table) => sum + table.rows.length, 0);
    return {
      status: "PASS" as const,
      commit,
      objectReference,
      ...verified,
      appliedMigrations: countRows("schema_migrations"),
      catalogItems: countRows("catalog_items"),
      catalogVersions: countRows("catalog_versions"),
      installations: countRows("runtime_installations"),
      bytes: archive.byteLength,
      archiveChecksum: backup.checksum,
      gzipChecksum,
      sourceWrites: false,
      reopenedAndVerified: true,
      remoteReadbackVerified: true,
      attachmentBytesIncluded: false,
      providerDisasterRecoveryVerified: false,
    };
  } catch {
    // Do not retain/log a provider exception: URLs, SQL or tokens may be embedded.
    throw new ReleaseBackupError(stage, objectReference);
  } finally {
    if (temporaryDirectory) {
      try {
        await rm(temporaryDirectory, { recursive: true, force: true });
      } catch {
        throw new ReleaseBackupError("cleanup", objectReference);
      }
    }
  }
}
