# Attachment storage and scan operations

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `operations` |
| Applies to | Current Cloud and supported Local deployments |
| Owner | Operations / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

The attachment routes use a persistent provider reference in both existing columns,
`storage_path` and `storage_key`. This change requires no schema migration. The API
returns attachment IDs and metadata; it never returns a private Blob URL or token.

## Configure a deployment

| Deployment | Configuration | File limit |
| --- | --- | --- |
| Local development | Provider may be omitted; files go to `data/uploads` beneath the app working directory. Set `RUNORY_LOCAL_UPLOADS_DIR` to override. | 10 MiB |
| Self-hosted production | Set `RUNORY_ATTACHMENT_STORAGE=local` and use a durable, backed-up `RUNORY_LOCAL_UPLOADS_DIR`, or select private Blob. | 10 MiB |
| Vercel | Connect a **private** Blob store; set `RUNORY_ATTACHMENT_STORAGE=vercel-blob` and `BLOB_STORE_ID`. | 4 MiB |

Vercel never falls back to local disk. Missing provider/store/credentials rejects
uploads. Non-Vercel production also requires an explicit provider. The authenticated
`GET /api/workspaces/{id}/uploads` policy endpoint supplies the file limit and MIME
allowlist to the mobile form. Larger Vercel files require a future governed direct
upload flow; raising the server limit would exceed the Function request limit.

If `BLOB_READ_WRITE_TOKEN` is explicitly configured, the adapter passes it to the
SDK for that store. This supports existing token connections even when Vercel also
supplies an OIDC token without a corresponding store grant. Keep the production
token sensitive and scoped to Production. Without a static token, `@vercel/blob`
2.9.0 resolves and refreshes Vercel OIDC credentials for the connected store ID.
Do not copy a fixed `VERCEL_OIDC_TOKEN` into application code or pass an `oidcToken`
option: doing so disables SDK refresh. Authentication failure does not switch
credentials and retry. Store IDs accept either `store_<id>` or `<id>`. Keep all
credentials server-side. Separate Preview and Production stores when their data
must be isolated.

The application always passes `access: "private"`. Downloads first authorize the
Workspace, select the attachment within that Workspace, and then stream the object
through the authenticated route with `private, no-store` and `nosniff` headers.
Persisted references pin reads/deletes to the original store; changing the default
store does not move existing attachments.

Official references:

- [Blob SDK authentication and private operations](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [Private Blob storage](https://vercel.com/docs/vercel-blob/using-private-storage)
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)

## Configure scanning

`MALWARE_SCAN_ENDPOINT` is a deployment-owned HTTPS endpoint. The server POSTs the
original bytes, their `Content-Type`, and `X-Content-SHA256`. If
`MALWARE_SCAN_TOKEN` is configured, it sends a Bearer authorization header.

Only `{"clean":true,"sha256":"<submitted digest>"}` accepts the file.
`clean:false` rejects it with HTTP 422. Network errors, a 10-second timeout,
redirects, non-success responses, malformed responses, and missing/mismatched
digests reject it with HTTP 503 before storage or metadata insertion.

Set `RUNORY_MALWARE_SCAN_REQUIRED=true` for deployments whose upload policy requires
scanning; a missing endpoint then also rejects uploads. When scanning is optional
and no endpoint is configured, the audit event records `not_configured`, never
`clean`. Local development permits an HTTP scanner only on localhost/loopback.

## Move existing local attachments

Legacy bare `workspace/id` references and new `local:v1:workspace/id` references
continue reading the original local files on local/self-hosted deployments. They
are rejected on Vercel. A deployment setting change cannot recover files already
lost from an ephemeral filesystem.

For a migration with the source files available:

1. Back up the attachment rows and local upload directory together. Pause writes
   during the cutover, or use a migration process that checks the original row
   reference before updating it.
2. For each live attachment, verify local byte size and SHA-256 against its row.
   Upload it to the intended private store at
   `attachments/{workspaceId}/{attachmentId}`, without overwriting existing data.
   If the target already exists, verify its bytes before reusing it.
3. Read the private object back and verify the byte count and digest. Only then
   update **both** `storage_path` and `storage_key` for that row to
   `vercel-blob-private:v1:{storeIdWithoutPrefix}/{workspaceId}/{attachmentId}`.
   Leave attachment IDs and form references unchanged.
4. Exercise the authenticated download route and a cross-Workspace denial. Keep
   the source files and the previous row references until the migration is
   accepted and the backup retention policy permits removal.

This release does not run that migration automatically or access production
objects. Rolling back to code predating these provider references will not read
new references: retain this reader compatibility or restore the paired data and
file backup. Local backups must include attachment bytes as well as the database.

## Failure compensation and reconciliation

Every attempted write uses a new server-generated ID. Content retries deduplicate
within a Workspace. A single atomic conditional insert handles concurrent retries;
the losing request removes only its own unused object. Storage acknowledgement
failures and confirmed metadata failures also trigger deletion, with one retry.

Monitor these structured events:

| Event | Required action |
| --- | --- |
| `attachments:cleanup-required` | The two delete attempts failed. Using the logged Workspace/reference/request ID, confirm no live row references this object, then retry deletion with the original store's credentials. |
| `attachments:commit-reconciliation-required` | The write failed and its database outcome could not be queried. Retain the object until the database recovers; verify whether its row committed before deleting anything. |
| `attachments:store-mismatch-cleanup-required` | A static token wrote to a different store than configured and cleanup failed. Correct the token/store pairing, inspect that token's store for the attempted attachment ID, and remove only an unreferenced object. |

No distributed transaction spans Blob and libsql. A Function terminated between
the object write and metadata insert can also leave an orphan. This release makes
ordinary failure compensation explicit; it does not add a durable cleanup worker.
Reconcile storage against attachment rows periodically and retain a grace period
for in-flight writes. Never delete solely because a request returned an error.

## Verification boundary

The attachment tests use real temporary SQLite databases, real Workspace/API-key
authorization, and simulated Blob/scanner network boundaries. They cover persisted
references, database reopening/new adapter reads, cross-tenant denial, simultaneous
duplicate uploads, metadata failures, lost upload acknowledgements, configuration
errors, deployment limits, and fail-closed scanning. Local storage tests use real
temporary files, including legacy references.

Before marking a deployment's storage ready, use a dedicated test Workspace and
private store to verify an upload, download after a fresh deployment/instance,
cross-Workspace denial, a scan rejection, and the configured size limit. These live
checks require deployment access and are separate from the local automated tests.
