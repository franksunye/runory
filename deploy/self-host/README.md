# Runory Self-hosted — B1 engineering candidate

**Runory — Field Service Operating System for the Agent Era.**

Engineering candidate only. Not a supported production release, Cloud GA, or complete installer. The first supported profile under evaluation is single-instance Linux amd64, Docker and Compose, the existing production Next.js application, SQLite/libSQL and local attachments. No second runtime or proprietary Cloud dependency is required for the included core fixture. Normal multi-user email authentication requires a private owner-controlled mail endpoint; the owner-only local operator mode does not require one. No public deployment or real customer data before the applicable gates pass.

## Candidate bundle

If the exact commit's Self-hosted Candidate workflow succeeds, its Actions artifact contains the tested image archive, image reference and ID, Compose configuration, operator helper, release metadata, license, Catalog/Pack lock inventory and SHA-256 checksums. It is a short-lived engineering artifact, not a signed public distribution. Obtain it only from the official repository and verify the workflow commit and artifact integrity; checksums do not replace a trusted download source.

From an extracted candidate bundle on a prepared Linux amd64 host with Docker Compose, Bash, openssl and sha256sum:

```sh
sha256sum --check SHA256SUMS
bash runory.sh load
bash runory.sh init owner@example.invalid
bash runory.sh start
bash runory.sh status
bash runory.sh doctor
```

Replace the example email with the instance owner’s chosen identity. Without a mail endpoint, this candidate uses a private operator-delivered OTP for the configured owner only. Open the local login page at `http://localhost:3000/en/login`, request a code, and run `bash runory.sh code` in an authorized, interactive host terminal. Enter the code yourself; never place it in Agent prompts or logs. The code is delivered through a private ephemeral mount and consumed once on retrieval; the existing DB-backed challenge and session rules still apply. The owner email is an operator-configured identity label, not a claim of email-address ownership verification in this mode. For ordinary multi-user email login, supply a verified owner-controlled private mail endpoint as the optional third init argument. Operator-only mode is intentionally not multi-user mail or public exposure. The helper generates distinct secrets in a new restricted .env; it refuses to overwrite existing configuration and checks that the loaded image matches the bundle. Keep .env outside shared files. Do not use the CI mail fixture, public OTP inbox or developer authentication shortcut. Only loopback is exposed by default. HTTPS/reverse-proxy and real browser/mobile access remain separate acceptance work.

The independent candidate image now prepares the exact FSM and Sales Quote Catalog during its isolated image build, using the existing schema validation, Catalog validation, freeze, channel and Pack-lock services. The engineering candidate channels inside this local template are not Cloud promotions or a human production approval. The template contains no provisioned users, credentials, workspaces or business records. On first startup the initializer validates the image/source identity and template checksum, publishes the database only into a new empty data volume, and records the release marker. Subsequent starts preserve the business database. Unrecognized, partial and different-release volumes fail closed; no automatic upgrade or overwrite. Normal owner OTP authorization and Pack installation are still required; the candidate does not call the development seed endpoint. Exact Pack and Module versions and checksums are checked against the bundled lock before installing. Browser/TLS and multi-user mail acceptance, compatible upgrades, and final release-manager approval remain separate work.

## Background work

The same scheduler checks workflow timers and the independent Outbox worker. `doctor` reports the scheduler receipt, email worker mode, outstanding queue counts and reconciliation-required/dead-letter counts. A healthy scheduler is not evidence that all provider messages have been delivered.

The default instance has no outbound provider. Existing confirmation email tasks remain durable. To explicitly enable automatic email delivery, the owner may edit the private `.env` with `RUNORY_SELF_HOST_EMAIL_OUTBOX_ENABLED=1`, `RESEND_API_KEY` and `RUNORY_EMAIL_FROM` (a provider-approved sender), then start the app with the verified release. Never share credentials or dump Compose config. This is optional and not required for sign-in or core FSM use. Automated retries process only the persisted work-order confirmation email intent with the existing adapter and idempotency key; they stop at a bounded attempt count or a conservative 23-hour automatic replay horizon from enqueue time. Older/unknown outcomes require reconciliation before manual retry. Provider acknowledgement is not proof of inbox delivery.

Payment, refund, Connect onboarding, push and other types retain their existing governed execution paths; the scheduler does not automatically invoke them. Missing/unhandled work is reported, not marked delivered. Real provider acceptance is separate; CI mocks the provider and sends no actual messages.

## Complete offline instance snapshot (same image only)

The snapshot utility preserves the entire local data volume, including the SQLite database, journal sidecars if present, catalog/configuration records and attachment bytes. It rejects symlinks, a nonempty target, incomplete/tampered backups and a different source commit. It verifies all copied files by SHA-256 and does not overwrite an existing instance. The caller **must stop the application, scheduler and every other writer first**. The tool is a cold snapshot, not an online DB backup, an encrypted archive or an upgrade tool.

For a controlled maintenance window, first stop the Compose services and confirm no process mounts the source volume writable. Keep a secure, owner-controlled backup volume, preserve the original, and restore into a new empty volume. Example with explicitly selected local named volumes and the verified candidate image (substitute actual names; never choose a Cloud database):

```sh
docker run --rm --network none --read-only --cap-drop ALL \
  -v SOURCE_VOLUME:/data:ro -v EMPTY_BACKUP_VOLUME:/backup \
  VERIFIED_IMAGE node /app/deploy/self-host/snapshot.mjs backup
docker run --rm --network none --read-only --cap-drop ALL \
  -v NEW_EMPTY_VOLUME:/data -v BACKUP_VOLUME:/backup:ro \
  VERIFIED_IMAGE node /app/deploy/self-host/snapshot.mjs restore
```

Mount a writable backup/target directory owned by the container's node user (UID 1000 on the selected image). Retain matching runtime configuration and secrets separately under owner control. Do not upload backups to public artifacts; database and files can contain confidential information. Verify the restored instance in isolation before any cutover. Failed partial snapshots/targets must be inspected and replaced with fresh empty volumes, never reused blindly. No in-place upgrade. Cross-release preparation is a distinct, explicitly bounded operation described below.

## Explicit compatible runtime upgrade

The first upgrade class is deliberately narrow: both images must have byte-identical packaged schema and Catalog resources, the same Module/Pack versions and locks, and different runtime commits. This does **not** support adding or changing schema migrations, Module versions, or arbitrary customer forks. Those need separate migration and compatibility evidence. Frozen Catalog rows retain their original provenance. There is no implicit cross-release startup.

On a maintenance host, keep both verified bundles and loaded images. Stop the existing app and scheduler, confirm all other writers are stopped, keep the original private configuration, and select three distinct local named volumes (source existing, backup and target new). From the **new** extracted candidate bundle:

```sh
bash runory.sh load
bash runory.sh prepare-upgrade /path/to/prior-bundle SOURCE_VOLUME NEW_BACKUP_VOLUME NEW_TARGET_VOLUME
```

This compares actual image resources, checks the existing instance release identity, creates a complete offline backup, restores into the new volume, validates database integrity, existing migrations, installed Modules/Packs and Catalog locks, and writes the prepared release marker only after success. It does not change the running services, source volume, source bundle or secrets. After success the new bundle records the prepared target volume in a private local `data-volume.txt`; no cutover occurs. If preparation fails, retain the source and backup; never start a partially prepared target or reuse its volume. There is no automatic cleanup of customer data.

For a controlled acceptance/cutover, copy the original restricted `.env` into the new bundle directory with permissions 0600, review identity/provider configuration, keep the prepared `data-volume.txt` selection unchanged, and disable external sending during validation (remove provider credentials, set `RUNORY_SELF_HOST_EMAIL_OUTBOX_ENABLED=0`). The default original volume created by the prior helper is `runory-self-host_runory-data`. The new helper checks that the selected prepared volume exists and has the expected release marker before starting; a missing or mistyped selection must not create a new instance. The bundle-local selection takes precedence over ambient variables and copied dotenv. Start the new bundle only with the original stopped; run `doctor` and verify authorized business/role tasks. Do not accept live writes or external side effects until the operator explicitly accepts the upgrade.

Before live cutover, rollback is stopping the candidate and starting the prior verified image with its original configuration and original data volume. Do not downgrade the upgraded volume. After live writes have occurred on the new instance, restoring the old volume would lose those changes: freeze writes and reconcile or recover forward instead. Do not run both instances as authorities.

The candidate workflow rehearses a genuine prior-image-to-new-image upgrade and pre-cutover rollback with synthetic business records, attachments, workflow events and identity; its artifact is still an engineering candidate. See the exact run for which prior artifact or reconstructed source was used, and the packaged `upgrade-scope.json` for the result. A later target with changed schema or Catalog resources records `NOT_RUN` for this bounded upgrade path; a fresh-install candidate is not automatically an upgrade-certified release.

## Developer candidate build

Use a clean tracked source snapshot without credentials, databases or customer files. Build from repository root:

```sh
docker build --platform linux/amd64 \
  --build-arg RUNORY_SOURCE_SHA="$(git rev-parse HEAD)" \
  -f deploy/self-host/Dockerfile -t runory-candidate:local .
```

CI tests the actual Compose file with a test-only internal-network override (no host port or external providers). It checks provider-based and owner-only operator OTP, scoped authorization, the prebundled Catalog without development seed, rejection of out-of-scope Packs, locked Pack installation, customer and named Quote command/retry, attachments, a real overdue workflow event and duplicate-free repeat, scheduler health, container replacement, cold backup/restore into a new volume and a second fresh install. CI checks the protected Outbox invocation with outbound delivery disabled; provider retry and acceptance tests use a mocked transport. Neither scheduler health nor workflow timer success means an external provider has delivered a message. The fixtures are not real Agent, provider, or production acceptance.

See the repository's [engineering plan](../../docs/product/agent-first-engineering-execution-plan.md) and [candidate workflow](../../.github/workflows/self-hosted-candidate.yml) for scope and results (links resolve in the source repository). Check the exact commit before relying on any candidate claim.
