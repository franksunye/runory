# Runory Cloud v0.1.0 — Backup & Restore Runbook

Status: Active
Last updated: 2026-06-22
Applies to: Runory Cloud `v0.1.0` Early Access
Related: [Release Definition](../releases/v0.1.0-cloud-early-access.md) · [Operations Runbooks](./runbooks.md) · [Database Namespaces](../architecture/database-namespaces.md)

---

## 1. Overview

### 1.1 Purpose

本 runbook 定义 Runory Cloud `v0.1.0` Early Access 的数据库 backup、restore 与 drill 流程。它用于满足：

- Release Blocker #10：未完成一次真实 backup restore drill 不得签发。
- Acceptance OPS-04：完成一次真实 backup restore drill。
- Acceptance OPS-05：恢复后 tenant/core/catalog tests 继续通过。
- Scenario E — Recovery：restore managed database backup → run migrations → tenant isolation suite → CRM journey → Catalog/installation integrity verified。

### 1.2 Scope

| In scope | Out of scope |
| --- | --- |
| Managed libSQL/Turso database backup 与 restore | 跨区域灾备（DR） |
| Catalog artifact 与 migration 文件的版本控制 | 第三方 Marketplace artifact 存储 |
| Workspace export/archive/restore（平台层） | 客户自管加密密钥 |
| Backup restore drill 执行与报告 | 正式 SLA 与多区域 active-active |

### 1.3 RPO/RTO Targets (v0.1.0 Early Access)

v0.1.0 不承诺正式 SLA，但内部目标如下：

| Metric | Target | Notes |
| --- | --- | --- |
| RPO (Recovery Point Objective) | ≤ 24 hours | Turso automated daily snapshot |
| RTO (Recovery Time Objective) | ≤ 4 hours | 含 restore + post-restore verification |
| Backup retention | 7 days | Turso default retention |
| Drill frequency | Monthly + before each release | OPS-04 |

---

## 2. Backup Strategy

### 2.1 Managed Database (Turso)

- **Automated snapshots**: Turso 每日自动创建 snapshot，保留 7 天。
- **Manual dump**: 使用 `turso db shell <db> .dump > backup.sql` 或 Turso Platform API 触发 on-demand snapshot。
- **存储位置**: Turso managed storage；dump 文件应上传到受控 object storage（如 Vercel Blob / S3）并加密。

### 2.2 Self-hosted libSQL

- **手动 backup**: 使用 `sqlite3 <db> .backup backup.sqlite` 或直接 copy `.sqlite` 文件（需确保没有活跃写入）。
- **一致性**: 推荐使用 `sqlite3 .backup`（在线 backup API），避免文件 copy 期间的 write race。
- **存储位置**: 本地磁盘或受控 object storage。

### 2.3 Catalog Artifacts

- Catalog version 一旦 frozen 即 **immutable**（Release Blocker #5）。
- Artifact 元数据存储在 `runory_catalog_versions` 表（含 `artifact_uri`、`artifact_checksum`、`source_commit`）。
- Artifact 二进制存储在 git/CI 或 object storage；git 本身提供完整版本历史。
- **不需要单独 backup artifact 二进制**——它们由 git history 与 CI provenance 保证可重现。

### 2.4 Migration Files

- 版本控制于 `/schema/migrations/`（`0001`–`0011` 及后续）。
- 每个 migration 文件有 SHA-256 checksum，存储于 `sys_schema_migrations` 表。
- Migration 文件 **immutable**——checksum mismatch 会阻止部署（OPS-03）。
- Git 本身是 migration 文件的 source of truth。

### 2.5 Configuration & Secrets

- 环境配置（`.env.local`、Vercel env vars）由部署平台管理，不在数据库 backup 范围内。
- Secrets（`LIBSQL_AUTH_TOKEN`、`PLATFORM_MAIL_PROVIDER_URL` 等）由 secret manager 管理，**不应**出现在数据库 backup 中。

---

## 3. Backup Procedure

### 3.1 Turso Managed Database

#### 3.1.1 Using Turso CLI

```bash
# 列出数据库
turso db list

# 创建 on-demand snapshot
turso db shell <db-name> ".dump" > backup-$(date +%Y%m%d).sql

# 或使用 Turso API（需要 platform token）
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
# 在线 backup（推荐）
sqlite3 ./data/platform.db .backup ./backups/platform-$(date +%Y%m%d).sqlite

# 或使用 file copy（需先 freeze writes）
cp ./data/platform.db ./backups/platform-$(date +%Y%m%d).sqlite
```

### 3.3 Verify Backup Integrity

每次 backup 后必须验证：

```bash
# 1. 验证文件可打开
sqlite3 ./backups/platform-YYYYMMDD.sqlite "PRAGMA integrity_check;"

# 2. 行数核对
sqlite3 ./backups/platform-YYYYMMDD.sqlite \
  "SELECT 'users', COUNT(*) FROM saas_users UNION ALL \
   SELECT 'organizations', COUNT(*) FROM saas_organizations UNION ALL \
   SELECT 'workspaces', COUNT(*) FROM saas_workspaces UNION ALL \
   SELECT 'catalog_versions', COUNT(*) FROM runory_catalog_versions;"

# 3. Checksum（用于对比 source 与 backup 一致性）
shasum -a 256 ./data/platform.db
shasum -a 256 ./backups/platform-YYYYMMDD.sqlite
```

**Pass criteria**:
- `PRAGMA integrity_check` 返回 `ok`。
- 关键表行数与 source 一致。
- Checksum 匹配（file copy 模式）。

---

## 4. Restore Procedure

### 4.1 Pre-restore Checklist

- [ ] 通知所有受影响用户（Early Access 阶段可通过 email/Slack）。
- [ ] Freeze writes（暂停应用或切换到 maintenance mode）。
- [ ] 确认 backup 文件完整（运行 §3.3 验证）。
- [ ] 记录当前 production DB URL 与 backup 来源。
- [ ] 确认 restore 目标（新 DB instance，不要覆盖 source）。

### 4.2 Restore Steps

#### 4.2.1 Turso — Create new DB from backup

```bash
# 从 SQL dump 创建新 DB
turso db create runory-restore-$(date +%Y%m%d)
turso db shell runory-restore-$(date +%Y%m%d) < backup-YYYYMMDD.sql

# 或从 Turso snapshot restore
turso db restore <db-name> <snapshot-id>
```

#### 4.2.2 Self-hosted — Restore from file

```bash
# 创建 restore 目标（新文件，不覆盖 source）
cp ./backups/platform-YYYYMMDD.sqlite ./data/platform-restored.sqlite

# 验证文件
sqlite3 ./data/platform-restored.sqlite "PRAGMA integrity_check;"
```

#### 4.2.3 Update Connection

将 `LIBSQL_URL` 指向 restored DB：

```bash
# Vercel
vercel env rm LIBSQL_URL production
vercel env add LIBSQL_URL production  # 输入新 DB URL

# 或 .env.local
LIBSQL_URL=file:./data/platform-restored.sqlite
```

**重要**: 不要删除原 DB——保留作为 rollback 点，直到 post-restore verification 通过。

### 4.3 Post-restore Verification

按顺序执行：

1. **Run migrations (idempotent)** — 应为 no-op，确认 schema 完整：
   ```bash
   node apps/cloud/scripts/backup-restore-drill.mjs
   ```

2. **Tenant isolation suite** — 跨 Workspace 读取必须返回 0 行：
   ```bash
   pnpm --filter @runory/platform-core test tenant-isolation
   ```

3. **CRM journey** — 完整执行 Canonical v0.1 User Journey：
   ```bash
   # 确保 dev server 运行
   pnpm dev:cloud
   node apps/cloud/scripts/e2e-turso-migration.mjs
   ```

4. **Catalog integrity** — 验证 `runory_catalog_versions` 中所有 frozen version 的 `artifact_checksum` 非空且匹配。

5. **Smoke test** — Production smoke test 通过（PROD-05）。

**Pass criteria**: 所有步骤通过，无数据丢失。

---

## 5. Restore Drill (OPS-04)

### 5.1 Schedule

- **Monthly**: 每月第一周执行一次。
- **Pre-release**: 每次 release candidate freeze 前执行一次。
- **Ad-hoc**: 重大 schema migration 或 infrastructure change 前执行。

### 5.2 Drill Steps

1. **Backup prod-like DB**
   - Source: production DB 或 prod-like staging DB。
   - 方法：§3.1 或 §3.2。

2. **Restore to isolated DB**
   - Target: 全新 DB instance（不触碰 production）。
   - 方法：§4.2。

3. **Run post-restore suite**
   - §4.3 所有步骤。
   - 额外运行 `backup-restore-drill.mjs` 自动化验证。

4. **Document result**
   - 填写 §7 Drill Report Template。
   - 存档于 `/docs/releases/backup-restore-drill-report.md`。

### 5.3 Pass Criteria

| Check | Expected |
| --- | --- |
| Backup integrity | `PRAGMA integrity_check` = ok |
| Migration replay | Idempotent，无新 migration applied（除非测试空 DB 场景） |
| Row counts | Users / Organizations / Workspaces / Catalog versions 与 source 一致 |
| Tenant isolation | 跨 Workspace 查询返回 0 行 |
| Catalog integrity | 所有 frozen version 有 checksum |
| CRM journey | E2E 全通过 |
| Empty-DB replay (Release Blocker #9) | 从空 DB 可重放所有 Platform Migrations |

### 5.4 Failure Handling

如果 drill 失败：
1. 不要 release。
2. 记录失败原因于 drill report。
3. 修复后重新执行 drill。
4. Release Blocker #10 在 drill pass 前保持 open。

---

## 6. Failure Scenarios

### 6.1 Partial Backup Corruption

**Symptom**: `PRAGMA integrity_check` 返回错误，或部分表无法查询。

**Diagnosis**:
- 检查 backup 文件大小是否异常。
- 检查 backup 过程是否有 write race（file copy 模式）。
- 检查存储介质是否有坏块。

**Mitigation**:
- 使用上一个已知良好的 backup。
- 如果没有可用 backup，从 Turso automated snapshot 恢复。
- 通知用户可能的数据丢失（RPO 内）。

**Recovery**:
- Restore from known-good backup。
- 运行 §4.3 post-restore verification。
- 对比 source 与 restored DB 的行数，识别丢失的数据。

### 6.2 Migration Replay Failure

**Symptom**: `runMigrations()` 抛出 checksum mismatch 或 SQL 语法错误。

**Diagnosis**:
- 检查 `sys_schema_migrations` 表中的 checksum 与 migration 文件实际 checksum。
- 检查 migration 文件是否被意外修改（git diff）。
- 检查是否有手动修改 schema（绕过 migration）。

**Mitigation**:
- **不要**强制修改 `sys_schema_migrations` 表。
- 如果是 checksum mismatch，恢复 migration 文件到 git 中的原始版本。
- 如果是 SQL 错误，检查 DB 是否有手动 schema 修改冲突。

**Recovery**:
- 修复 migration 文件或 DB schema 后重新运行。
- 验证 Release Blocker #9（空 DB 重放）是否仍通过。

### 6.3 Catalog Artifact Missing

**Symptom**: `runory_catalog_versions.artifact_uri` 指向不存在的资源，或 `artifact_checksum` 为空。

**Diagnosis**:
- 检查 `runory_catalog_versions` 表中 frozen version 的 `artifact_uri` 与 `artifact_checksum`。
- 检查 object storage / git 中 artifact 是否存在。
- 检查 CI build 是否成功（`build_id`）。

**Mitigation**:
- 如果 artifact 在 git/CI 中可重现，重新 build 并 import。
- 如果 artifact 不可重现，将该 version 标记为 `deprecated`，并通知 affected Workspace。
- **不要**覆盖或修改 frozen version（Release Blocker #5）。

**Recovery**:
- 重新 build artifact（使用相同 `source_commit`）。
- 验证 checksum 匹配。
- 如果 checksum 不同，创建新 version（不要覆盖旧的）。

### 6.4 Empty Database Migration Failure (Release Blocker #9)

**Symptom**: 从空数据库运行 `runMigrations()` 失败。

**Diagnosis**:
- 检查 migration 文件是否有顺序依赖问题。
- 检查 migration 0011 的 ALTER TABLE 是否在 0001-0010 的表存在时才执行。
- 检查 `resolveMigrationsTable()` 是否正确处理空 DB。

**Mitigation**:
- 修复 migration 文件确保可从空 DB 重放。
- 运行 `backup-restore-drill.mjs` 验证空 DB 场景。

**Recovery**:
- 确认所有 migration 可从空 DB 顺序执行。
- 记录于 drill report。

---

## 7. Evidence — Drill Report Template

每次 drill 完成后填写本模板并存档于 `/docs/releases/backup-restore-drill-report.md`。

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

---

## 8. References

- [Release Definition v0.1.0](../releases/v0.1.0-cloud-early-access.md) — §7 Release Blockers, §8.8 OPS-04/05, §9 Scenario E
- [Operations Runbooks](./runbooks.md) — failure runbooks (PROD-04)
- [Database Namespaces](../architecture/database-namespaces.md) — table prefix 设计
- [SaaS Core Boundaries](../07-saas-core-boundaries.md) — backup/restore 边界
- Drill script: `apps/cloud/scripts/backup-restore-drill.mjs`
- E2E script: `apps/cloud/scripts/e2e-turso-migration.mjs`
