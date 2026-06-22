# Runory Cloud v0.1.0 — Operations Runbooks

Status: Active
Last updated: 2026-06-22
Applies to: Runory Cloud `v0.1.0` Early Access
Related: [Backup & Restore Runbook](./backup-restore-runbook.md) · [Release Definition](../releases/v0.1.0-cloud-early-access.md)

---

## Overview

本文档覆盖 Runory Cloud `v0.1.0` Early Access 的关键故障场景 runbook（PROD-04）。每个 runbook 包含：Symptom、Diagnosis、Mitigation、Recovery。

**通用原则**:
- 不要删除已创建的用户数据。
- 不要覆盖已发布的 Catalog artifact（Release Blocker #5）。
- 优先使用 last-known-good rollback，而非在 production 中调试。
- 所有故障与恢复操作记录于 Audit log。

---

## 1. Authentication / OTP Failure

### Symptom

- 用户无法收到 OTP 邮件。
- OTP 验证失败（`verify-otp` 返回错误）。
- 用户无法登录。

### Diagnosis

1. **检查 mail provider**:
   ```bash
   # 确认 mail provider URL 已配置
   echo $PLATFORM_MAIL_PROVIDER_URL

   # 测试 mail provider 连通性
   curl -s -o /dev/null -w "%{http_code}" $PLATFORM_MAIL_PROVIDER_URL/health
   ```

2. **检查 OTP 表**:
   ```bash
   # 查询最近的 OTP challenges（不暴露 secret）
   sqlite3 $LIBSQL_URL_FILE "
     SELECT id, email, purpose, status, expires_at, attempt_count, created_at
     FROM saas_auth_challenges
     ORDER BY created_at DESC
     LIMIT 20;
   "
   ```
   - 确认 OTP 记录存在且 `status` 为 `pending`。
   - 确认 `expires_at` 未过期。
   - 确认 `attempt_count` 未超过 limit。

3. **检查 rate limiter**:
   ```bash
   sqlite3 $LIBSQL_URL_FILE "
     SELECT bucket_key, count, window_start, window_end
     FROM saas_rate_limit_buckets
     WHERE bucket_key LIKE '%otp%' OR bucket_key LIKE '%login%'
     ORDER BY window_start DESC LIMIT 20;
   "
   ```
   - 确认用户未被 rate limit 阻止。

4. **检查应用日志**:
   - 查找 `/api/auth/request-otp` 与 `/api/auth/verify-otp` 的 error log。
   - 确认无 `MAIL_PROVIDER_ERROR` 或 `RATE_LIMIT_EXCEEDED`。

### Mitigation

- **Fallback mail provider**: 如果 primary mail provider 不可用，切换 `PLATFORM_MAIL_PROVIDER_URL` 到 backup provider。
- **临时禁用 rate limit**: 仅在确认是误触发时，临时提高 rate limit 阈值（不推荐长期禁用）。
- **Manual session grant (admin only)**: 平台管理员可通过 `PLATFORM_ADMIN_EMAILS` 配置的用户，使用 admin 面板手动为受影响用户创建 session。此操作必须记录于 Audit log 并事后审查。

### Recovery

1. 修复 mail provider 或 rate limiter 后，发送测试 OTP：
   ```bash
   curl -X POST http://localhost:3000/api/auth/request-otp \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}'
   ```

2. 验证 OTP 流程 end-to-end（收到邮件 → 验证 → 登录成功）。

3. 确认 `saas_auth_challenges` 表中 `status` 正确流转（`pending` → `verified`）。

4. 通知受影响用户可重新尝试登录。

---

## 2. Email Delivery Failure

### Symptom

- OTP 邮件未送达用户邮箱。
- Organization invitation 邮件未送达。
- 用户报告收到邮件在 spam folder。

### Diagnosis

1. **检查 MAIL_PROVIDER_URL**:
   ```bash
   echo $PLATFORM_MAIL_PROVIDER_URL
   # 确认非空且可访问
   curl -s -o /dev/null -w "%{http_code}" $PLATFORM_MAIL_PROVIDER_URL
   ```

2. **检查 provider logs**:
   - 登录 mail provider 控制台（如 Resend、SendGrid、Postmark）。
   - 查看最近的 delivery events。
   - 确认是否有 bounce、deferred、blocked 状态。

3. **检查 bounce rate**:
   - 如果 bounce rate > 5%，mail provider 可能暂停发送。
   - 检查是否有无效邮箱地址累积。

4. **检查 DNS 配置**:
   - 确认 SPF、DKIM、DMARC 记录正确配置。
   - 确认 sending domain 未被 blacklist。

### Mitigation

- **切换 provider**: 更新 `PLATFORM_MAIL_PROVIDER_URL` 到备用 provider。
- **Retry queue**: 如果 provider 支持 retry，确认 retry policy 生效。
- **通知 affected users**: 通过其他渠道（如 Slack、电话）通知用户，并提供 manual login 协助。
- **手动发送 invitation**: 管理员可直接复制 invitation link 发送给用户（link 存储于 `saas_organization_invitations` 表）。

### Recovery

1. 发送测试邮件验证 delivery：
   ```bash
   curl -X POST http://localhost:3000/api/auth/request-otp \
     -H "Content-Type: application/json" \
     -d '{"email":"ops-test@runory.dev"}'
   ```

2. 在 mail provider 控制台确认邮件状态为 `delivered`。

3. 检查 spam rate，必要时调整 DKIM/SPF。

4. 恢复后持续监控 24 小时的 delivery rate。

---

## 3. Database Failure

### Symptom

- API 返回 `503 Service Unavailable` 或 database connection error。
- Query timeout（`SQLITE_BUSY`、`libsql: connection error`）。
- 数据不一致或 corruption 警告。

### Diagnosis

1. **检查 Turso status**:
   - 访问 https://status.turso.tech 查看是否有 incident。
   - 使用 Turso CLI 检查 DB health：
     ```bash
     turso db shell <db-name> "PRAGMA integrity_check;"
     turso db shell <db-name> "SELECT 1;"
     ```

2. **检查 connection pool**:
   - 确认 `LIBSQL_URL` 与 `LIBSQL_AUTH_TOKEN` 正确配置。
   - 确认应用未超出 connection limit。
   - 检查应用日志中的 connection error 频率。

3. **检查 slow queries**:
   ```bash
   # 查询最近活跃的 long-running queries（如果 Turso 提供）
   turso db shell <db-name> "SELECT * FROM sqlite_master WHERE type='table';"
   ```

4. **检查磁盘空间**:
   - 确认 Turso DB 未超出 storage limit。
   - 确认本地 SQLite 文件所在磁盘有足够空间。

### Mitigation

- **Failover to replica**: 如果 Turso primary 不可用，将 `LIBSQL_URL` 指向 read replica（注意：replica 可能 lag）。
- **Restore from backup**: 如果数据 corruption，按 [Backup & Restore Runbook](./backup-restore-runbook.md) §4 执行 restore。
- **Maintenance mode**: 暂停应用，显示 maintenance page，防止进一步写入损坏数据。

### Recovery

1. Restore from backup（如果需要）→ 见 [Backup & Restore Runbook](./backup-restore-runbook.md)。

2. Run migrations（idempotent，确认 schema 完整）：
   ```bash
   node apps/cloud/scripts/backup-restore-drill.mjs
   ```

3. 验证 tenant isolation：
   ```bash
   pnpm --filter @runory/platform-core test tenant-isolation
   ```

4. 验证 CRM journey：
   ```bash
   pnpm dev:cloud
   node apps/cloud/scripts/e2e-turso-migration.mjs
   ```

5. 恢复后监控 24 小时的 error rate 与 query latency。

---

## 4. Catalog Artifact Failure

### Symptom

- Module install 失败（`/api/workspaces/:id/packs/:packId/install` 返回错误）。
- Version not found（`runory_catalog_versions` 中找不到请求的 version）。
- Checksum mismatch（`artifact_checksum` 与实际 artifact 不匹配）。

### Diagnosis

1. **检查 catalog_versions 表**:
   ```bash
   sqlite3 $LIBSQL_URL_FILE "
     SELECT id, catalog_item_id, version, lifecycle_status,
            artifact_uri, artifact_checksum, source_commit, frozen_at
     FROM runory_catalog_versions
     WHERE version = '<requested-version>';
   "
   ```
   - 确认 version 存在且 `lifecycle_status` 为 `ready` 或更高。
   - 确认 `artifact_uri` 与 `artifact_checksum` 非空。

2. **检查 artifact storage**:
   - 如果 `artifact_uri` 指向 git/CI，确认 commit 存在。
   - 如果指向 object storage，确认文件可访问。
   - 重新计算 artifact checksum 并对比：
     ```bash
     shasum -a 256 <artifact-file>
     ```

3. **检查 migration files**:
   - 确认 module 的 migration 文件存在于 `/catalog/modules/<module>/migrations/`。
   - 确认 migration checksum 与 `sys_schema_migrations` 一致。

4. **检查 catalog_releases**:
   ```bash
   sqlite3 $LIBSQL_URL_FILE "
     SELECT r.id, r.channel, r.status, v.version
     FROM runory_catalog_releases r
     JOIN runory_catalog_versions v ON r.catalog_version_id = v.id
     WHERE r.status = 'active';
   "
   ```
   - 确认请求的 version 在 `stable` channel 有 active release。

### Mitigation

- **Rollback to last-known-good version**:
   - 将 Workspace 的 installation 指向上一个已知良好的 version。
   - 不要删除或修改失败的 version（标记为 `deprecated` 或 `withdrawn`）。

- **Freeze rollouts**:
   - 暂停所有 `release_rollouts`（`status` → `paused`）。
   - 通知所有 affected Workspace admin。

- **不要覆盖 artifact**:
   - Release Blocker #5：Published Catalog Version 不可变。
   - 如果需要修复，发布新 version，不要覆盖旧的。

### Recovery

1. **Re-import artifact**（如果 artifact 丢失但可从 source 重建）:
   - 使用相同 `source_commit` 重新 build。
   - 验证 checksum 匹配（如果 checksum 不同，创建新 version）。

2. **Verify checksum**:
   ```bash
   # 重新计算并对比
   shasum -a 256 <rebuilt-artifact>
   # 对比 runory_catalog_versions.artifact_checksum
   ```

3. **Run compatibility check**:
   - 对所有 affected Workspace 生成 compatibility report。
   - 确认 upgrade path 可行。

4. **Resume rollouts**:
   - 确认修复后，将 `release_rollouts.status` 从 `paused` 改为 `resumed`。
   - 监控 rollout success rate。

---

## 5. Production Deployment Rollback

### Symptom

- Production smoke test 失败（PROD-05）。
- Canonical v0.1 User Journey 失败。
- 部署后 error rate 或 latency 异常升高。

### Steps

**重要原则**（来自 Release Definition §12）:
> 如果 Tag 后 Production smoke 失败：停止新用户邀请与 Catalog rollout，按 runbook 恢复 last-known-good deployment；不要删除已创建数据或覆盖发布 artifact。

### 5.1 Immediate Actions

1. **停止新用户邀请与 Catalog rollout**:
   - 暂停所有 `release_rollouts`。
   - 暂停 invitation 发送。

2. **保留 previous deployment**:
   - Vercel: 确认 previous deployment 仍可用（Vercel 自动保留历史 deployment）。
   - 不要删除 previous deployment。

3. **不要删除已创建数据**:
   - 用户数据、Organization、Workspace 必须保留。
   - 已发布的 Catalog artifact 必须保留（不可变）。

### 5.2 Rollback Steps

1. **Swap routing back to previous deployment**:
   ```bash
   # Vercel: promote previous deployment to production
   vercel promote <previous-deployment-url> --prod
   ```

2. **验证 previous deployment 正常**:
   - 运行 smoke test。
   - 确认 Canonical v0.1 User Journey 通过。

3. **保留数据**:
   - 不要 rollback database（数据库 schema 通常向后兼容）。
   - 如果新 deployment 执行了不可逆 migration，**不要** rollback DB——评估是否需要 forward fix。

4. **不要覆盖 published artifacts**:
   - 即使新 deployment 发布了有问题的 artifact，不要覆盖它。
   - 将有问题的 artifact 标记为 `deprecated` 或 `withdrawn`。

### 5.3 Investigation

1. 收集失败 deployment 的日志与 metrics。
2. 确认失败原因（smoke test 失败的具体步骤）。
3. 评估是否需要 hotfix 或重新部署。
4. 记录 incident 于 release evidence。

### 5.4 Recovery

1. 修复问题后，创建新的 deployment（不要 force push 到同一 deployment）。
2. 运行完整 smoke test + Canonical journey。
3. 确认通过后 promote 到 production。
4. 恢复 Catalog rollout（如果之前暂停）。
5. 通知用户服务已恢复。

### 5.5 Do NOT

- ❌ 删除已创建的用户数据。
- ❌ 覆盖已发布的 Catalog artifact。
- ❌ 强制 rollback database schema（除非有可逆 migration）。
- ❌ 在 production 中调试（使用 staging）。
- ❌ 跳过 smoke test 直接 re-deploy。

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
- [Backup & Restore Runbook](./backup-restore-runbook.md) — backup/restore 详细流程
- [Database Namespaces](../architecture/database-namespaces.md) — table prefix 设计
- [SaaS Core Boundaries](../07-saas-core-boundaries.md) — 平台边界
- Drill script: `apps/cloud/scripts/backup-restore-drill.mjs`
- E2E script: `apps/cloud/scripts/e2e-turso-migration.mjs`
