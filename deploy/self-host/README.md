# Runory Self-hosted — B1 engineering candidate

**Runory — Field Service Operating System for the Agent Era.**

Engineering candidate only. Not a supported production release, Cloud GA, or complete installer. The first supported profile under evaluation is single-instance Linux amd64, Docker and Compose, the existing production Next.js application, SQLite/libSQL and local attachments. No second runtime or proprietary Cloud dependency is required for the included core fixture. Normal owner/member authentication still requires a private owner-controlled mail endpoint. No public deployment or real customer data before the applicable gates pass.

## Candidate bundle

If the exact commit's Self-hosted Candidate workflow succeeds, its Actions artifact contains the tested image archive, image reference and ID, Compose configuration, operator helper, release metadata, license, Catalog/Pack lock inventory and SHA-256 checksums. It is a short-lived engineering artifact, not a signed public distribution. Obtain it only from the official repository and verify the workflow commit and artifact integrity; checksums do not replace a trusted download source.

From an extracted candidate bundle on a prepared Linux amd64 host with Docker Compose, Bash, openssl and sha256sum:

```sh
sha256sum --check SHA256SUMS
bash runory.sh load
bash runory.sh init owner@example.invalid https://mail.example.invalid/send
bash runory.sh start
bash runory.sh status
```

Replace the example owner email and mail URL with a verified, operator-owned private mail endpoint implementing the existing OTP delivery contract. The helper generates distinct secrets in a new restricted .env; it refuses to overwrite existing configuration and checks that the loaded image matches the bundle. Keep .env outside shared files. Do not use the CI mail fixture, public OTP inbox or developer authentication shortcut. Only loopback is exposed by default. HTTPS/reverse-proxy and real browser/mobile access remain separate acceptance work.

The independent candidate image now prepares the exact FSM and Sales Quote Catalog during its isolated image build, using the existing schema validation, Catalog validation, freeze, channel and Pack-lock services. The engineering candidate channels inside this local template are not Cloud promotions or a human production approval. The template contains no provisioned users, credentials, workspaces or business records. On first startup the initializer validates the image/source identity and template checksum, publishes the database only into a new empty data volume, and records the release marker. Subsequent starts preserve the business database. Unrecognized, partial and different-release volumes fail closed; no automatic upgrade or overwrite. Normal owner OTP authorization and Pack installation are still required; the candidate does not call the development seed endpoint. Exact Pack and Module versions and checksums are checked against the bundled lock before installing. Complete owner onboarding and final release-manager approval remain separate acceptance work.

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

Mount a writable backup/target directory owned by the container's node user (UID 1000 on the selected image). Retain matching runtime configuration and secrets separately under owner control. Do not upload backups to public artifacts; database and files can contain confidential information. Verify the restored instance in isolation before any cutover. Failed partial snapshots/targets must be inspected and replaced with fresh empty volumes, never reused blindly. No in-place upgrade or cross-version recovery claim.

## Developer candidate build

Use a clean tracked source snapshot without credentials, databases or customer files. Build from repository root:

```sh
docker build --platform linux/amd64 \
  --build-arg RUNORY_SOURCE_SHA="$(git rev-parse HEAD)" \
  -f deploy/self-host/Dockerfile -t runory-candidate:local .
```

CI tests the actual Compose file with a test-only internal-network override (no host port or external providers). It checks production OTP, scoped authorization, the prebundled Catalog without development seed, rejection of out-of-scope Packs, locked Pack installation, customer and named Quote command/retry, attachments, timer invocation, container replacement, cold backup/restore into a new volume and a second fresh install. The fixtures are not real Agent, provider, or production acceptance.

See the repository's [engineering plan](../../docs/product/agent-first-engineering-execution-plan.md) and [candidate workflow](../../.github/workflows/self-hosted-candidate.yml) for scope and results (links resolve in the source repository). Check the exact commit before relying on any candidate claim.
