# Runory Cloud — Backup and Restore Runbook

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `operations` |
| Applies to | Current Cloud and supported Local deployments |
| Owner | Operations / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Related: [Operations Runbooks](runbooks.md) · [Attachment Storage](attachment-storage.md) · [Database Namespaces](../architecture/database-namespaces.md)

## 1. Recovery boundaries

A database backup preserves business records, tenant/role state, installation provenance, Catalog metadata, immutable upgrade snapshots, Command contracts, outbox state and attachment **references**. It does not contain external attachment bytes or restore Stripe/Retell state.

`createDatabaseBackup` reads the source in one consistent read transaction. It never runs migrations, seeds records or changes the source. The restore command accepts a **new local file** only and refuses an existing target. It verifies the archive checksum, schema/data checksums, SQLite integrity and foreign keys before committing, then closes and reopens the restored file for verification.

The old `backup-restore-drill.mjs` entry point delegates to this safe implementation. Its former source-migration, source-seeding and raw file-copy behavior has been removed.

Backups contain sensitive application data. The CLI creates archives with mode `0600`; use encrypted, access-controlled durable storage with a documented retention and deletion policy. Do not commit database archives, tokens, environment files or customer data to git or CI artifacts. Local files alone are not a production backup policy.

## 2. Before a production release

Record and verify the following for the actual production account:

1. Intended Vercel team/project, current served commit and rollback candidate.
2. Actual managed-database backup/PITR capabilities, retention and last successful restore. Do not assume a provider's daily snapshot schedule or seven-day retention from old documentation.
3. Verified database backup and independent recovery target; include current business rows and Catalog/installation records, not only empty tables.
4. Private attachment store, immutable object references, required retention and recoverability of every referenced file.
5. Mail, Stripe, Retell, push and cron credentials/dispatch configuration. A database restore must not automatically replay external side effects.

Current local evidence is engineering recovery evidence. Production RPO/RTO require a measured restore using the selected managed provider and attachment store; they are not certified by a local drill.

### Production build backup gate

The Cloud `build` command explicitly runs `scripts/release-backup.mts` before `next build`. It does not rely on a package manager running a `prebuild` lifecycle hook. The backup is required only when **both** `RUNORY_RELEASE_BACKUP_REQUIRED=1` and `VERCEL_ENV=production` are present. Other builds report `SKIPPED` and do not connect to a source database or Blob; that status is not backup evidence.

Configure these values in the intended Vercel project's production environment:

| Configuration | Requirement |
| --- | --- |
| `LIBSQL_URL`, `LIBSQL_AUTH_TOKEN` | Existing production source, supplied by the secret manager. The gate accepts a remote `libsql:` or `https:` URL, rejects disabled TLS and URL-embedded credentials, and never falls back to a local database. Prefer a read-only database credential where the provider supports it. |
| `BLOB_STORE_ID` | The project's intended **private** Blob store. Backup objects use a separate `database-backups/` prefix. |
| `BLOB_READ_WRITE_TOKEN` or SDK-managed OIDC | An explicitly configured static token is passed to the SDK and takes priority. Without it the SDK resolves and refreshes OIDC using the connected store; the gate never captures an `oidcToken` or retries a permission failure with different credentials. Keep static credentials sensitive and production-only. |
| `VERCEL_GIT_COMMIT_SHA` | The full 40-character commit ID supplied by the Git deployment. Missing or malformed commit identity blocks a required backup. |
| `RUNORY_RELEASE_BACKUP_REQUIRED` | Set to `1` for the production release gate. |

For an enabled production build, the gate performs the following before Next.js can build:

1. Read one transaction-consistent logical snapshot. It imports the standalone backup implementation directly and never initializes the application database, applies migrations or runs seeds against the source.
2. Restore into a newly and exclusively created local temporary database, then close and reopen it to check complete schema/data hashes, integrity and foreign keys.
3. Gzip the verified archive and upload it with `access: private`, a unique `database-backups/<commit>/<UUID>.json.gz` key, and overwrites disabled.
4. Read that exact private object from origin with `useCache: false`. Verify its store/path, byte count, compressed-byte SHA-256, archive checksum and internal schema/data checksums.
5. Remove the temporary recovery database. Any required configuration, snapshot, restore, upload, readback or cleanup failure exits nonzero and stops the build.

Successful logs contain counts, checksums, commit identity and an opaque object reference. They never contain database rows, source URLs, tokens or raw provider exceptions. Record the `objectReference`, `archiveChecksum` and `gzipChecksum` in release evidence. Retrieve an archive through an authenticated private Blob read into a restricted local file, verify its compressed-byte checksum, then use the independent-target restore procedure below. Do not expose backup objects through the application's attachment routes or publish them as build artifacts.

An uploaded object whose verification failed is **not** a certified recovery point. The gate does not automatically delete backups; inspect failed objects through the private store and apply the documented retention policy. Do not delete an archive or attachment bytes needed by a retained recovery point.

This gate establishes a verified database snapshot at backup time. It does not freeze ongoing application writes, prove provider PITR/RPO/RTO, or back up attachment bytes. Before a destructive migration or a recovery cutover, coordinate the write freeze and reconcile changes and external effects after the snapshot. Logical export materializes data in memory and is subject to build memory and remote transaction limits; if those limits prevent verification, the build remains blocked until a suitable provider-native recovery process is established. Synthetic SQLite and mocked Blob tests establish implementation behavior; the first real build must separately prove this account's source and storage permissions.

## 3. Read-only database backup

Run commands from the repository root with the declared pnpm version. The following source is an explicitly local example:

```bash
corepack pnpm --filter @runory/cloud db:backup -- \
  --source file:/absolute/path/source.db \
  --output /private/backups/runory-snapshot.json.gz
```

For a remote libSQL source, configure `LIBSQL_URL` and a read-only `LIBSQL_AUTH_TOKEN` through the existing secret manager, then omit `--source`. Do not paste credentials into a command, report or terminal output.

The archive includes a format version, creation time and SHA-256 checksums. It preserves SQLite value types, BLOBs, generated-column definitions, indices, triggers and AUTOINCREMENT counters. The logical backup currently materializes its contents in memory; use a provider-native consistent backup for databases that exceed the worker's available memory. Run integrity verification and an independent restore before relying on any backup method.

## 4. Restore to an independent target

```bash
corepack pnpm --filter @runory/cloud db:restore -- \
  --input /private/backups/runory-snapshot.json.gz \
  --target /private/recovery/new-runory.db \
  --report /private/recovery/restore-result.json
```

The target must not exist. Restoration does not delete, truncate or replace an existing database. A failed restore remains isolated; inspect it before removing the failed target and choosing a new target path. Never point the application at a partially restored database.

The result must show `reopenedAndVerified=true` and matching schema/data checksums. `attachmentBytesIncluded=false` and `providerDisasterRecoveryVerified=false` explicitly identify what this operation does not establish.

## 5. Current-version local drill

Start with a fresh development Workspace containing the current schema, published Catalog entries, installed CRM/FSM/Sales Packs and synthetic business records. Do not use production as a writeable fixture.

```bash
corepack pnpm --filter @runory/cloud db:recovery:drill -- \
  --source file:/absolute/path/current-version-fixture.db \
  --output /private/recovery/drill-snapshot.json.gz \
  --target /private/recovery/drill-restored.db \
  --report /private/recovery/drill-result.json
```

Acceptance requires nonzero application tables/data, the current applied migration count, Catalog/installation records, a complete checksum match, a successful close/reopen verification and tenant-scoped readback. Preserve only the non-sensitive summary in release evidence.

`corepack pnpm verify:release:local` also runs this drill after the G1 API walkthrough and before the G2 browser journeys against its new local database. It does not use external provider credentials.

## 6. Attachment recovery

Follow [Attachment Storage](attachment-storage.md). Private Blob keys are immutable per upload. A database recovery must resolve each stored provider/store/key reference and verify the expected SHA-256 and byte count; the existence of metadata alone is insufficient.

Retain object bytes for the database recovery window. Do not physically purge an attachment that a retained backup can still reference. Historical local files require copying the original bytes and updating their stored references through the documented migration procedure; changing an environment variable does not migrate them.

A rollback to the old local-only reader cannot read new Blob references. Use a compatible application rollback candidate or complete a controlled byte/reference migration before changing the storage backend.

## 7. Managed-provider recovery and cutover

1. Preserve the failed deployment, database and logs; freeze writes and external dispatch using the operational controls for that deployment.
2. Restore the provider backup into a new database, keeping the original untouched. Follow the current provider procedure verified for the account.
3. Restore/verify attachment bytes and reconcile migration checksums, installations, Catalog provenance, grants and permission groups.
4. Validate tenant isolation and the Quote → Work Order → Visit → Invoice journey in an isolated environment.
5. Compare Stripe/provider truth with restored payment and outbox state. Resume dispatch only after confirming idempotency and avoiding duplicate external effects.
6. Change the application connection through the deployment platform, stage and verify the intended code version, then promote. Keep the previous connection and deployment available for a controlled rollback.
7. Record actual recovery point, elapsed recovery time, exceptions and the operator who completed the cutover.

Do not invent provider API endpoints, treat a local copy as a managed restore, or mark a drill passed when required records/attachments are missing.

## 8. Upgrade rollback

See [Operations Runbooks](runbooks.md) for the immutable pre-upgrade snapshot and `requires_database_restore` boundary. A metadata-only upgrade can restore its exact snapshot while retaining later business records. An upgrade that executed schema/data SQL requires a separately verified database recovery path; the application must not report a partial metadata reversal as complete rollback.
