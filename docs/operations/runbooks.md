# Runory Cloud v0.1.0 — Operations Runbooks

Status: Active
Last updated: 2026-06-22
Applies to: Runory Cloud `v0.1.0` Early Access
Related: [Backup & Restore Runbook](./backup-restore-runbook.md) · [Release Definition](../releases/v0.1.0-cloud-early-access.md)

---

## Overview

This document covers the key failure-scenario runbooks (PROD-04) for Runory Cloud `v0.1.0` Early Access. Each runbook contains: Symptom, Diagnosis, Mitigation, Recovery.

**General principles**:
- Do not delete already-created user data.
- Do not overwrite published Catalog artifacts (Release Blocker #5).
- Prefer last-known-good rollback over debugging in production.
- All failure and recovery operations are recorded in the Audit log.

---

## 1. Authentication / OTP Failure

### Symptom

- Users cannot receive OTP emails.
- OTP verification fails (`verify-otp` returns an error).
- Users cannot sign in.

### Diagnosis

1. **Check mail provider**:
   ```bash
   # Confirm the mail provider URL is configured
   echo $PLATFORM_MAIL_PROVIDER_URL

   # Test mail provider connectivity
   curl -s -o /dev/null -w "%{http_code}" $PLATFORM_MAIL_PROVIDER_URL/health
   ```

2. **Check the OTP table**:
   ```bash
   # Query recent OTP challenges (do not expose secrets)
   sqlite3 $LIBSQL_URL_FILE "
     SELECT id, email, purpose, status, expires_at, attempt_count, created_at
     FROM saas_auth_challenges
     ORDER BY created_at DESC
     LIMIT 20;
   "
   ```
   - Confirm OTP records exist and `status` is `pending`.
   - Confirm `expires_at` has not expired.
   - Confirm `attempt_count` has not exceeded the limit.

3. **Check the rate limiter**:
   ```bash
   sqlite3 $LIBSQL_URL_FILE "
     SELECT bucket_key, count, window_start, window_end
     FROM saas_rate_limit_buckets
     WHERE bucket_key LIKE '%otp%' OR bucket_key LIKE '%login%'
     ORDER BY window_start DESC LIMIT 20;
   "
   ```
   - Confirm the user is not blocked by rate limiting.

4. **Check application logs**:
   - Look for error logs from `/api/auth/request-otp` and `/api/auth/verify-otp`.
   - Confirm there are no `MAIL_PROVIDER_ERROR` or `RATE_LIMIT_EXCEEDED` errors.

### Mitigation

- **Fallback mail provider**: If the primary mail provider is unavailable, switch `PLATFORM_MAIL_PROVIDER_URL` to the backup provider.
- **Temporarily disable rate limiting**: Only when a false trigger is confirmed, temporarily raise the rate-limit threshold (disabling long-term is not recommended).
- **Manual session grant (admin only)**: Platform administrators configured via `PLATFORM_ADMIN_EMAILS` can use the admin panel to manually create sessions for affected users. This operation must be recorded in the Audit log and reviewed afterwards.

### Recovery

1. After fixing the mail provider or rate limiter, send a test OTP:
   ```bash
   curl -X POST http://localhost:3000/api/auth/request-otp \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}'
   ```

2. Verify the OTP flow end-to-end (receive email → verify → successful sign-in).

3. Confirm that `status` in the `saas_auth_challenges` table transitions correctly (`pending` → `verified`).

4. Notify affected users that they can retry signing in.

---

## 2. Email Delivery Failure

### Symptom

- OTP emails are not delivered to user inboxes.
- Organization invitation emails are not delivered.
- Users report receiving emails in the spam folder.

### Diagnosis

1. **Check MAIL_PROVIDER_URL**:
   ```bash
   echo $PLATFORM_MAIL_PROVIDER_URL
   # Confirm it is non-empty and accessible
   curl -s -o /dev/null -w "%{http_code}" $PLATFORM_MAIL_PROVIDER_URL
   ```

2. **Check provider logs**:
   - Sign in to the mail provider console (e.g., Resend, SendGrid, Postmark).
   - Review recent delivery events.
   - Confirm there are no bounce, deferred, or blocked statuses.

3. **Check bounce rate**:
   - If the bounce rate > 5%, the mail provider may pause sending.
   - Check whether invalid email addresses have accumulated.

4. **Check DNS configuration**:
   - Confirm SPF, DKIM, and DMARC records are correctly configured.
   - Confirm the sending domain is not blacklisted.

### Mitigation

- **Switch provider**: Update `PLATFORM_MAIL_PROVIDER_URL` to a backup provider.
- **Retry queue**: If the provider supports retries, confirm the retry policy is in effect.
- **Notify affected users**: Notify users through other channels (e.g., Slack, phone) and provide manual login assistance.
- **Manually send invitations**: Administrators can directly copy the invitation link and send it to users (the link is stored in the `saas_organization_invitations` table).

### Recovery

1. Send a test email to verify delivery:
   ```bash
   curl -X POST http://localhost:3000/api/auth/request-otp \
     -H "Content-Type: application/json" \
     -d '{"email":"ops-test@runory.dev"}'
   ```

2. Confirm in the mail provider console that the email status is `delivered`.

3. Check the spam rate and adjust DKIM/SPF if necessary.

4. After recovery, continue monitoring the delivery rate for 24 hours.

---

## 3. Database Failure

### Symptom

- API returns `503 Service Unavailable` or a database connection error.
- Query timeout (`SQLITE_BUSY`, `libsql: connection error`).
- Data inconsistency or corruption warnings.

### Diagnosis

1. **Check Turso status**:
   - Visit https://status.turso.tech to check for incidents.
   - Use the Turso CLI to check DB health:
     ```bash
     turso db shell <db-name> "PRAGMA integrity_check;"
     turso db shell <db-name> "SELECT 1;"
     ```

2. **Check the connection pool**:
   - Confirm `LIBSQL_URL` and `LIBSQL_AUTH_TOKEN` are correctly configured.
   - Confirm the application has not exceeded the connection limit.
   - Check the frequency of connection errors in the application logs.

3. **Check slow queries**:
   ```bash
   # Query recently active long-running queries (if Turso provides them)
   turso db shell <db-name> "SELECT * FROM sqlite_master WHERE type='table';"
   ```

4. **Check disk space**:
   - Confirm the Turso DB has not exceeded the storage limit.
   - Confirm the disk hosting the local SQLite file has enough space.

### Mitigation

- **Failover to replica**: If the Turso primary is unavailable, point `LIBSQL_URL` to a read replica (note: the replica may lag).
- **Restore from backup**: If there is data corruption, perform a restore following [Backup & Restore Runbook](./backup-restore-runbook.md) §4.
- **Maintenance mode**: Pause the application and display a maintenance page to prevent further writes from corrupting data.

### Recovery

1. Restore from backup (if needed) → see [Backup & Restore Runbook](./backup-restore-runbook.md).

2. Run migrations (idempotent, confirm schema integrity):
   ```bash
   node apps/cloud/scripts/backup-restore-drill.mjs
   ```

3. Verify tenant isolation:
   ```bash
   pnpm --filter @runory/platform-core test tenant-isolation
   ```

4. Verify the CRM journey:
   ```bash
   pnpm dev:cloud
   node apps/cloud/scripts/e2e-turso-migration.mjs
   ```

5. After recovery, monitor the error rate and query latency for 24 hours.

---

## 4. Catalog Artifact Failure

### Symptom

- Module install fails (`/api/workspaces/:id/packs/:packId/install` returns an error).
- Version not found (the requested version cannot be found in `runory_catalog_versions`).
- Checksum mismatch (`artifact_checksum` does not match the actual artifact).

### Diagnosis

1. **Check the catalog_versions table**:
   ```bash
   sqlite3 $LIBSQL_URL_FILE "
     SELECT id, catalog_item_id, version, lifecycle_status,
            artifact_uri, artifact_checksum, source_commit, frozen_at
     FROM runory_catalog_versions
     WHERE version = '<requested-version>';
   "
   ```
   - Confirm the version exists and `lifecycle_status` is `ready` or higher.
   - Confirm `artifact_uri` and `artifact_checksum` are non-empty.

2. **Check artifact storage**:
   - If `artifact_uri` points to git/CI, confirm the commit exists.
   - If it points to object storage, confirm the file is accessible.
   - Recompute the artifact checksum and compare:
     ```bash
     shasum -a 256 <artifact-file>
     ```

3. **Check migration files**:
   - Confirm the module's migration files exist in `/catalog/modules/<module>/migrations/`.
   - Confirm the migration checksum is consistent with `sys_schema_migrations`.

4. **Check catalog_releases**:
   ```bash
   sqlite3 $LIBSQL_URL_FILE "
     SELECT r.id, r.channel, r.status, v.version
     FROM runory_catalog_releases r
     JOIN runory_catalog_versions v ON r.catalog_version_id = v.id
     WHERE r.status = 'active';
   "
   ```
   - Confirm the requested version has an active release in the `stable` channel.

### Mitigation

- **Rollback to last-known-good version**:
   - Point the Workspace installation to the previous known-good version.
   - Do not delete or modify the failed version (mark it as `deprecated` or `withdrawn`).

- **Freeze rollouts**:
   - Pause all `release_rollouts` (`status` → `paused`).
   - Notify all affected Workspace admins.

- **Do not overwrite artifacts**:
   - Release Blocker #5: Published Catalog Versions are immutable.
   - If a fix is needed, publish a new version; do not overwrite the old one.

### Recovery

1. **Re-import artifact** (if the artifact is lost but can be rebuilt from source):
   - Rebuild using the same `source_commit`.
   - Verify the checksum matches (if the checksum differs, create a new version).

2. **Verify checksum**:
   ```bash
   # Recompute and compare
   shasum -a 256 <rebuilt-artifact>
   # Compare against runory_catalog_versions.artifact_checksum
   ```

3. **Run compatibility check**:
   - Generate a compatibility report for all affected Workspaces.
   - Confirm the upgrade path is feasible.

4. **Resume rollouts**:
   - After confirming the fix, change `release_rollouts.status` from `paused` to `resumed`.
   - Monitor the rollout success rate.

---

## 5. Production Deployment Rollback

### Symptom

- Production smoke test fails (PROD-05).
- Canonical v0.1 User Journey fails.
- Error rate or latency rises abnormally after deployment.

### Steps

**Important principle** (from Release Definition §12):
> If Production smoke fails after tagging: stop new user invitations and Catalog rollout, restore the last-known-good deployment following the runbook; do not delete already-created data or overwrite published artifacts.

### 5.1 Immediate Actions

1. **Stop new user invitations and Catalog rollout**:
   - Pause all `release_rollouts`.
   - Pause invitation sending.

2. **Preserve previous deployment**:
   - Vercel: Confirm the previous deployment is still available (Vercel automatically retains historical deployments).
   - Do not delete the previous deployment.

3. **Do not delete already-created data**:
   - User data, Organizations, and Workspaces must be preserved.
   - Published Catalog artifacts must be preserved (immutable).

### 5.2 Rollback Steps

1. **Swap routing back to previous deployment**:
   ```bash
   # Vercel: promote previous deployment to production
   vercel promote <previous-deployment-url> --prod
   ```

2. **Verify the previous deployment is working**:
   - Run smoke tests.
   - Confirm the Canonical v0.1 User Journey passes.

3. **Preserve data**:
   - Do not roll back the database (database schemas are usually backward compatible).
   - If the new deployment performed an irreversible migration, **do not** roll back the DB — assess whether a forward fix is needed.

4. **Do not overwrite published artifacts**:
   - Even if the new deployment published a problematic artifact, do not overwrite it.
   - Mark the problematic artifact as `deprecated` or `withdrawn`.

### 5.3 Investigation

1. Collect logs and metrics from the failed deployment.
2. Confirm the cause of failure (the specific step where the smoke test failed).
3. Assess whether a hotfix or redeployment is needed.
4. Record the incident in the release evidence.

### 5.4 Recovery

1. After fixing the issue, create a new deployment (do not force push to the same deployment).
2. Run the full smoke test + Canonical journey.
3. After confirming it passes, promote to production.
4. Resume Catalog rollout (if it was paused).
5. Notify users that the service has recovered.

### 5.5 Do NOT

- ❌ Delete already-created user data.
- ❌ Overwrite published Catalog artifacts.
- ❌ Force rollback of the database schema (unless there is a reversible migration).
- ❌ Debug in production (use staging).
- ❌ Skip smoke tests and directly re-deploy.

---

## 6. Escalation

| Severity | Response time | Escalate to |
| --- | --- | --- |
| P0 (data loss / security) | Immediate | Operations Owner + Release Manager + Security Owner |
| P1 (service down) | < 30 min | Operations Owner |
| P2 (degraded) | < 2 hours | On-call engineer |
| P3 (minor) | Next business day | On-call engineer |

---

## 7. References

- [Release Definition v0.1.0](../releases/v0.1.0-cloud-early-access.md) — §7 Release Blockers, §8.10 PROD-04/05, §12 Go/No-go
- [Backup & Restore Runbook](./backup-restore-runbook.md) — detailed backup/restore procedure
- [Database Namespaces](../architecture/database-namespaces.md) — table prefix design
- [SaaS Core Boundaries](../07-saas-core-boundaries.md) — platform boundaries
- Drill script: `apps/cloud/scripts/backup-restore-drill.mjs`
- E2E script: `apps/cloud/scripts/e2e-turso-migration.mjs`
