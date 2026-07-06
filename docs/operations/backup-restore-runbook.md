# Runory Cloud v0.1.0 — Backup & Restore Runbook

Status: Active
Last updated: 2026-06-22
Applies to: Runory Cloud `v0.1.0` Early Access
Related: [Release Definition](../releases/v0.1.0-cloud-early-access.md) · [Operations Runbooks](./runbooks.md) · [Database Namespaces](../architecture/database-namespaces.md)

---

## 1. Overview

### 1.1 Purpose

This runbook defines the database backup, restore, and drill process for Runory Cloud `v0.1.0` Early Access. It is used to satisfy:

- Release Blocker #10: release cannot be signed off until one real backup restore drill is completed.
- Acceptance OPS-04: complete one real backup restore drill.
- Acceptance OPS-05: tenant/core/catalog tests continue passing after restore.
- Scenario E — Recovery: restore managed database backup → run migrations → tenant isolation suite → CRM journey → Catalog/installation integrity verified.

### 1.2 Scope

| In scope | Out of scope |
| --- | --- |
| Managed libSQL/Turso database backup and restore | Cross-region disaster recovery (DR) |
| Version control for Catalog artifacts and migration files | Third-party Marketplace artifact storage |
| Workspace export/archive/restore (platform layer) | Customer-managed encryption keys |
| Backup restore drill execution and reporting | Formal SLA and multi-region active-active |

### 1.3 RPO/RTO Targets (v0.1.0 Early Access)

v0.1.0 does not promise a formal SLA, but internal targets are:

| Metric | Target | Notes |
| --- | --- | --- |
| RPO (Recovery Point Objective) | ≤ 24 hours | Turso automated daily snapshot |
| RTO (Recovery Time Objective) | ≤ 4 hours | Includes restore + post-restore verification |
| Backup retention | 7 days | Turso default retention |
| Drill frequency | Monthly + before each release | OPS-04 |

---

## 2. Backup Strategy

### 2.1 Managed Database (Turso)

- **Automated snapshots**: Turso automatically creates daily snapshots and retains them for 7 days.
- **Manual dump**: use `turso db shell <db> .dump > backup.sql` or trigger an on-demand snapshot through Turso Platform API.
- **Storage location**: Turso managed storage; dump files should be uploaded to controlled object storage (such as Vercel Blob / S3) and encrypted.

### 2.2 Self-hosted libSQL

- **Manual backup**: use `sqlite3 <db> .backup backup.sqlite` or directly copy the `.sqlite` file (only when no active writes exist).
- **Consistency**: prefer `sqlite3 .backup` (online backup API) to avoid write races during file copy.
- **Storage location**: local disk or controlled object storage.

### 2.3 Catalog Artifacts

- Catalog versions are **immutable** once frozen (Release Blocker #5).
- Artifact metadata is stored in the `runory_catalog_versions` table, including `artifact_uri`, `artifact_checksum`, and `source_commit`.
- Artifact binaries are stored in git/CI or object storage; git itself provides complete version history.
- **No separate binary artifact backup is required** — they are reproducible through git history and CI provenance.

### 2.4 Migration Files

- Version controlled under `/schema/migrations/` (`0001`–`0011` and later).
- Each migration file has a SHA-256 checksum stored in the `sys_schema_migrations` table.
- Migration files are **immutable** — checksum mismatch blocks deployment (OPS-03).
- Git itself is the source of truth for migration files.

### 2.5 Configuration & Secrets

- Environment configuration (`.env.local`, Vercel env vars) is managed by the deployment platform and is not part of database backup scope.
- Secrets (`LIBSQL_AUTH_TOKEN`, `PLATFORM_MAIL_PROVIDER_URL`, etc.) are managed by a secret manager and **must not** appear in database backups.

---

## 3. Backup Procedure

### 3.1 Turso Managed Database

#### 3.1.1 Using Turso CLI

```bash
# List databases
turso db list

# Create on-demand snapshot
turso db shell <db-name> ".dump" > backup-$(date +%Y%m%d).sql

# Or use Turso API (requires platform token)
curl -X POST https://api.turso.tech/v1/databases/<db-name>/backups \
  -H "Authorization: Bearer $TURSO_API_TOKEN"
```

#### 3.1.2 Using libSQL Client (programmatic)

```javascript
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.LIBSQL_URL,
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

// Dump schema
const schema = await client.execute(
  "SELECT sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND sql IS NOT NULL"
);

// Dump data per table
const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
);
```

### 3.2 Self-hosted libSQL (local file)

```bash
# Online backup (recommended)
sqlite3 ./data/platform.db .backup ./backups/platform-$(date +%Y%m%d).sqlite

# Or use file copy (freeze writes first)
cp ./data/platform.db ./backups/platform-$(date +%Y%m%d).sqlite
```

### 3.3 Verify Backup Integrity

After every backup, verify:

```bash
# 1. Verify file can be opened
sqlite3 ./backups/platform-YYYYMMDD.sqlite "PRAGMA integrity_check;"

# 2. Row-count check
sqlite3 ./backups/platform-YYYYMMDD.sqlite \
  "SELECT 'users', COUNT(*) FROM saas_users UNION ALL \
   SELECT 'organizations', COUNT(*) FROM saas_organizations UNION ALL \
   SELECT 'workspaces', COUNT(*) FROM saas_workspaces UNION ALL \
   SELECT 'catalog_versions', COUNT(*) FROM runory_catalog_versions;"

# 3. Checksum (for source vs backup consistency)
shasum -a 256 ./data/platform.db
shasum -a 256 ./backups/platform-YYYYMMDD.sqlite
```

**Pass criteria**:
- `PRAGMA integrity_check` returns `ok`.
- Key table row counts match the source.
- Checksum matches (file copy mode).

---

## 4. Restore Procedure

### 4.1 Pre-restore Checklist

- [ ] Notify all affected users (email/Slack is acceptable in Early Access).
- [ ] Freeze writes (pause application or switch to maintenance mode).
- [ ] Confirm backup file integrity (run §3.3 verification).
- [ ] Record current production DB URL and backup source.
- [ ] Confirm restore target (new DB instance; do not overwrite source).

### 4.2 Restore Steps

#### 4.2.1 Turso — Create new DB from backup

```bash
# Create new DB from SQL dump
turso db create runory-restore-$(date +%Y%m%d)
turso db shell runory-restore-$(date +%Y%m%d) < backup-YYYYMMDD.sql

# Or restore from Turso snapshot
turso db restore <db-name> <snapshot-id>
```

#### 4.2.2 Self-hosted — Restore from file

```bash
# Create restore target (new file; do not overwrite source)
cp ./backups/platform-YYYYMMDD.sqlite ./data/platform-restored.sqlite

# Verify file
sqlite3 ./data/platform-restored.sqlite "PRAGMA integrity_check;"
```

#### 4.2.3 Update Connection

Point `LIBSQL_URL` to the restored DB:

```bash
# Vercel
vercel env rm LIBSQL_URL production
vercel env add LIBSQL_URL production  # enter new DB URL

# Or .env.local
LIBSQL_URL=file:./data/platform-restored.sqlite
```

**Important**: Do not delete the original DB — keep it as a rollback point until post-restore verification passes.

### 4.3 Post-restore Verification

Run in order:

1. **Run migrations (idempotent)** — should be no-op, confirming schema integrity:
   ```bash
   node apps/cloud/scripts/backup-restore-drill.mjs
   ```

2. **Tenant isolation suite** — cross-Workspace reads must return 0 rows:
   ```bash
   pnpm --filter @runory/platform-core test tenant-isolation
   ```

3. **CRM journey** — run the full Canonical v0.1 User Journey:
   ```bash
   # ensure dev server is running
   pnpm dev:cloud
   node apps/cloud/scripts/e2e-turso-migration.mjs
   ```

4. **Catalog integrity** — verify every frozen version in `runory_catalog_versions` has non-empty and matching `artifact_checksum`.

5. **Smoke test** — Production smoke test passes (PROD-05).

**Pass criteria**: all steps pass, with no data loss.

---

## 5. Restore Drill (OPS-04)

### 5.1 Schedule

- **Monthly**: run once during the first week of each month.
- **Pre-release**: run before each release candidate freeze.
- **Ad-hoc**: run before major schema migrations or infrastructure changes.

### 5.2 Drill Steps

1. **Backup prod-like DB**
   - Source: production DB or prod-like staging DB.
   - Method: §3.1 or §3.2.

2. **Restore to isolated DB**
   - Target: brand-new DB instance (do not touch production).
   - Method: §4.2.

3. **Run post-restore suite**
   - All steps in §4.3.
   - Additionally run automated verification via `backup-restore-drill.mjs`.

4. **Document result**
   - Fill out the §7 Drill Report Template.
   - Archive it at `/docs/releases/backup-restore-drill-report.md`.

### 5.3 Pass Criteria

| Check | Expected |
| --- | --- |
| Backup integrity | `PRAGMA integrity_check` = ok |
| Migration replay | Idempotent, no new migration applied (unless testing empty-DB scenario) |
| Row counts | Users / Organizations / Workspaces / Catalog versions match source |
| Tenant isolation | Cross-Workspace queries return 0 rows |
| Catalog integrity | All frozen versions have checksums |
| CRM journey | E2E fully passes |
| Empty-DB replay (Release Blocker #9) | All Platform Migrations replay from empty DB |

### 5.4 Failure Handling

If the drill fails:
1. Do not release.
2. Record the failure reason in the drill report.
3. Re-run the drill after fixing.
4. Release Blocker #10 remains open until the drill passes.

---

## 6. Failure Scenarios

### 6.1 Partial Backup Corruption

**Symptom**: `PRAGMA integrity_check` returns an error, or some tables cannot be queried.

**Diagnosis**:
- Check whether backup file size is abnormal.
- Check whether the backup process had write races (file copy mode).
- Check whether the storage medium has bad blocks.

**Mitigation**:
- Use the previous known-good backup.
- If no available backup exists, restore from Turso automated snapshot.
- Notify users of possible data loss (within RPO).

**Recovery**:
- Restore from known-good backup.
- Run §4.3 post-restore verification.
- Compare source and restored DB row counts to identify lost data.

### 6.2 Migration Replay Failure

**Symptom**: `runMigrations()` throws checksum mismatch or SQL syntax error.

**Diagnosis**:
- Check checksum in `sys_schema_migrations` against actual migration-file checksum.
- Check whether migration files were accidentally modified (`git diff`).
- Check whether schema was manually modified (bypassing migration).

**Mitigation**:
- **Do not** forcibly modify the `sys_schema_migrations` table.
- If checksum mismatch, restore the migration file to its original version in git.
- If SQL error, check whether the DB has manual schema modification conflicts.

**Recovery**:
- Re-run after fixing migration files or DB schema.
- Verify Release Blocker #9 (empty DB replay) still passes.

### 6.3 Catalog Artifact Missing

**Symptom**: `runory_catalog_versions.artifact_uri` points to a missing resource, or `artifact_checksum` is empty.

**Diagnosis**:
- Check `artifact_uri` and `artifact_checksum` for frozen versions in `runory_catalog_versions`.
- Check whether the artifact exists in object storage / git.
- Check whether CI build succeeded (`build_id`).

**Mitigation**:
- If artifact is reproducible from git/CI, rebuild and import.
- If artifact is not reproducible, mark the version as `deprecated` and notify affected Workspaces.
- **Do not** overwrite or modify frozen versions (Release Blocker #5).

**Recovery**:
- Rebuild artifact using the same `source_commit`.
- Verify checksum matches.
- If checksum differs, create a new version (do not overwrite the old one).

### 6.4 Empty Database Migration Failure (Release Blocker #9)

**Symptom**: running `runMigrations()` from an empty database fails.

**Diagnosis**:
- Check whether migration files have ordering dependencies.
- Check whether migration 0011 only runs ALTER TABLE when tables from 0001–0010 exist.
- Check whether `resolveMigrationsTable()` correctly handles empty DB.

**Mitigation**:
- Fix migration files to ensure they can replay from empty DB.
- Run `backup-restore-drill.mjs` to verify the empty-DB scenario.

**Recovery**:
- Confirm all migrations can execute from empty DB in order.
- Record the result in the drill report.

---

## 7. Evidence — Drill Report Template

After every drill, complete this template and archive it at `/docs/releases/backup-restore-drill-report.md`.

```markdown
# Backup/Restore Drill Report

## Metadata

| Field | Value |
| --- | --- |
| Date | YYYY-MM-DD |
| Operator | <name> |
| Drill type | Monthly / Pre-release / Ad-hoc |
| Source DB URL | <url> |
| Backup method | turso dump / sqlite3 .backup / file copy |
| Restore target | <url> |
| Script used | apps/cloud/scripts/backup-restore-drill.mjs |

## Backup

| Field | Value |
| --- | --- |
| Backup file | <path> |
| Backup size | <bytes> |
| Integrity check | PASS / FAIL |
| Source row counts | users=N, orgs=N, workspaces=N, catalog_versions=N |

## Restore

| Field | Value |
| --- | --- |
| Restore target | <path> |
| Restore method | file copy / SQL replay |
| Integrity check | PASS / FAIL |
| Restored row counts | users=N, orgs=N, workspaces=N, catalog_versions=N |

## Post-restore Verification

| Check | Result | Notes |
| --- | --- | --- |
| Migration replay (idempotent) | PASS / FAIL | <count> applied |
| Tenant isolation | PASS / FAIL | cross-tenant queries: <count> |
| Catalog integrity | PASS / FAIL | checksums verified: <count> |
| CRM journey (E2E) | PASS / FAIL | |
| Empty-DB replay (Blocker #9) | PASS / FAIL / N/A | |

## Issues Encountered

- <issue 1>
- <issue 2>
- (none)

## Sign-off

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Operator | <name> | PASS / FAIL | YYYY-MM-DD |
| Operations Owner | <name> | PASS / FAIL | YYYY-MM-DD |
| Release Manager | <name> | PASS / FAIL | YYYY-MM-DD |

## Conclusion

<PASS / FAIL> — Release Blocker #10 / OPS-04 <satisfied / not satisfied>.
```
