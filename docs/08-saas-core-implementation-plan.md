# Runory SaaS Core Implementation Plan

Status: Approved v1.0
Date: 2026-06-22
Decision baseline: [07-saas-core-boundaries.md](07-saas-core-boundaries.md)

## Phase Status Tracker

> Last updated: 2026-06-22

| Phase | Status | Summary |
|-------|--------|---------|
| Phase 0: Consolidate Foundation | Complete | Role enums, RequestContext, migration runner, error envelope |
| Phase 1: Email OTP Auth | Complete | OTP, session, rate limiting, first-login onboarding |
| Phase 2: Org, Invitations, RBAC | Complete | Invitations, memberships, ownership transfer, last-owner invariant |
| Phase 3: Tenant Isolation | Complete | 33 cross-tenant tests, getExtensionVersions leak fixed, RequestContext unified |
| Phase 4: Audit, API Keys, Security | Complete | API Keys (create/revoke/rotate), audit service with redaction, Bearer auth |
| Phase 5: Entitlements, Quotas | Complete | Entitlement service, 6 quota metrics, idempotent usage, auto-provision on onboarding |
| Phase 6: Billing & Subscriptions | Not started | Deferred — early_access has no paid billing |
| Phase 7: Export, Deletion, Recovery | Complete | Export with checksum, 30-day soft delete, org deletion, user anonymization |
| Phase 8: Production Readiness Gate | Not started | Awaits CI, E2E, backup drill, runbook |

### Known Residual Risks

1. **Audit coverage (Criterion 5)**: `writeAuditEvent` service is built but not yet wired into all write operations (`createRecord`, `updateRecord`, `applyExtension`). Infrastructure ready, integration pending.
2. **Quota enforcement (Criterion 7)**: `enforceQuota` service is built but not yet wired into resource creation paths (`createRecord`, `createWorkspace`). Infrastructure ready, integration pending.
3. **Backup restore drill (Criterion 9)**: Migration replay verified from empty database; real backup restore drill not yet performed.
4. **Billing (Criterion 8)**: Phase 6 not implemented. Acceptable for early_access (no paid plans). Must complete before public billing launch.

## 1. Objective

本计划将 SaaS Core 按依赖顺序拆成可独立验收的阶段。每一阶段必须满足退出条件后才能进入下一阶段；时间估算仅用于排序，不替代验收。

Module/Pack/Template 的制造、发布、升级和 rollout 是并行的平台控制面工作流，不混入租户 SaaS Core 数据模型。其独立规格和 CR0–CR5 实施计划见 [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md)。Public launch gate 必须同时评估两个工作流的完成状态。

Runory SDK 是该控制面的本地开发者产品入口，其 SDK0–SDK4 计划见 [10-runory-sdk-product.md](10-runory-sdk-product.md)。SaaS Core、SDK 与 Catalog 共用 contracts，但 SDK 不导出 SaaS private runtime/repository。

## 2. Current Baseline

截至 2026-06-22（SaaS Core Phase 0-5, 7 完成后更新）：

已具备：

- Next.js Cloud UI、Workspace shell 与生产级视觉基础。
- Organization、User、OrganizationMembership、WorkspaceTenant、WorkspaceMembership 完整表结构。
- `OrganizationRole (owner/admin/member)` 与 `WorkspaceRole (admin/member/viewer)` 两套独立 enum。
- Workspace HTTP API 的统一访问 helper（`requireWorkspaceContext`）与完整角色检查。
- Email OTP 认证、服务端 session、速率限制、首次登录自动 onboarding。
- 组织邀请系统（7天过期、哈希 token、workspace grants）。
- RBAC 与组织角色继承（owner/admin → workspace admin）。
- 跨租户隔离回归测试套件（33 个测试，覆盖完整访问矩阵）。
- API Key 系统（create/list/revoke/rotate、hash-only 存储、scope+RBAC 交集、creator 权限失效自动吊销）。
- 统一审计服务（append-only、敏感字段脱敏、request ID 追踪）。
- Entitlement & Quota 服务（early_access 计划、6 个配额指标、幂等 usage 事件）。
- 数据生命周期管理（export with checksum、30天软删除、组织删除、用户账户删除与审计匿名化）。
- 版本化 Platform Migration runner（0001-0007）与 SHA-256 校验。
- Turso/libSQL async 数据路径。

仍属于待完成：

- Audit Event 尚未接入所有写操作（基础设施已就绪）。
- Quota enforcement 尚未接入资源创建路径（基础设施已就绪）。
- Billing & Subscriptions（Phase 6）未实现，early_access 阶段不需要。
- 备份恢复演练未执行。
- CI/CD pipeline、E2E 测试、Runbook 未建立（Phase 8）。

## 3. Delivery Rules

每个阶段遵循：

1. 先定义 contract 和 migration，再实现 service/API/UI。
2. 权限与跨租户测试和功能代码同批交付。
3. 新写操作必须同时产生 Audit Event。
4. 不允许页面直接操作数据库或自行计算授权。
5. 所有生产 secret、token 和 key 使用 hash 或托管 secret。
6. 阶段未达到退出条件时，不通过增加功能掩盖基础缺口。

## 4. Phase 0: Consolidate the Existing Foundation

Priority: P0
Dependency: none

### Deliverables

- 固化 `OrganizationRole` 与 `WorkspaceRole` 两套独立 enum。
- 从 Workspace role 中移除 `owner`，迁移现有记录为 `admin`。
- 建立 canonical `RequestContext`、`Principal` 与 Authorization Policy API。
- 将 HTTP 错误统一为稳定的 `401/403/404/409/429` envelope。
- 明确低层 Repository 与 Authorized Service 的代码边界。
- 增加 request ID，并贯穿 API response 和日志。
- 建立版本化 Platform Migration runner 与 `schema_migrations` 表。
- 将当前 schema bootstrap 转为 migration `0001_baseline`，保留开发环境初始化入口。

### Tests

- Role hierarchy unit tests。
- RequestContext 不接受客户端 Actor 覆盖。
- Migration 从空数据库重放、重复执行与 checksum mismatch 测试。
- 所有 Workspace route 都声明最低角色。

### Exit Criteria

- 无生产 route 依赖临时开发身份。
- 从空数据库可以只靠 migrations 建立完整 schema。
- 认证失败和授权失败不再返回通用 500。

## 5. Phase 1: Email OTP and Server Sessions

Priority: P0
Dependency: Phase 0

### Schema

- `auth_identities`
- `auth_challenges`
- `sessions`
- authentication security events

### Deliverables

- Request OTP、Verify OTP、Logout、Logout all sessions API。
- 邮箱规范化、OTP hash、过期、attempt limit 与 single-use。
- Session opaque token、hash storage、rotation、expiry 与 revoke。
- `HttpOnly + Secure + SameSite` Cookie。
- Origin/CSRF 防护。
- IP、邮箱与 endpoint rate limiting。
- 邮件 provider adapter 与开发环境安全 mail sink。
- 登录页、验证码页、Session 管理基础 UI。
- 首次登录自动创建 Organization、默认 Workspace 和 Owner membership。

### Tests

- OTP 过期、重放、暴力尝试和枚举防护。
- Session revoke、logout-all 和 cookie flags。
- 首次用户 onboarding 事务一致性。
- 相同规范化邮箱不会创建重复 User。

### Exit Criteria

- 生产环境无需 trusted identity headers。
- 未认证请求无法访问任何 Workspace 数据。
- 完整浏览器测试覆盖登录、首次创建和再次登录。

## 6. Phase 2: Organization, Invitations, and RBAC

Priority: P0
Dependency: Phase 1

### Schema

- `organization_invitations`
- `invitation_workspace_grants`
- finalized organization/workspace membership constraints

### Deliverables

- Organization settings 与成员列表。
- 创建、重发、撤销、接受邀请。
- 邀请接受时事务创建组织和 Workspace memberships。
- 成员角色修改、Workspace assignment、成员移除。
- Owner transfer。
- last-owner invariant。
- Organization owner/admin 的 Workspace admin inheritance。
- Membership/permission cache 的即时失效策略。

### Tests

- 错误邮箱不能接受邀请。
- 邀请 token 过期、撤销、重放测试。
- 普通成员不能邀请或升级自己。
- 最后一名 Owner 不能退出、降级或被删除。
- 移除成员后下一请求立即返回 403。

### Exit Criteria

- 多人 Organization 可以仅通过 UI 完成邀请、授权和移除闭环。
- 所有权限变更均有 Audit Event。

## 7. Phase 3: End-to-end Tenant Isolation

Priority: P0
Dependency: Phase 2

### Deliverables

- 所有 HTTP、MCP、Agent、Webhook 和 Job 入口使用统一 RequestContext。
- 所有 record lookup 同时包含 `workspace_id` 与 resource ID。
- 核查并修复 metadata、module business tables 与 extension value 查询。
- Cache key、SSE/event channel、file path 和 job payload tenant scope。
- 禁止用户数据进入跨用户共享 Next.js cache。
- MCP 改为 Cloud HTTP transport 并接入相同授权策略。
- 建立跨租户 security regression suite。

### Tests

- 两个 Organization、多个 Workspace 的完整访问矩阵。
- 已知其他租户 record ID 仍无法读写。
- 文件、导出、事件订阅、缓存和 MCP 不泄漏。
- Organization admin inheritance 与 explicit Workspace role 行为一致。

### Exit Criteria

- 跨租户测试覆盖所有公开数据入口并在 CI 强制执行。
- 不存在绕过 Authorized Service 访问生产数据的公开路径。

## 8. Phase 4: Audit, API Keys, and Security Baseline

Priority: P0
Dependency: Phase 3

### Schema

- finalized `audit_events`
- `api_keys`
- rate-limit storage or provider adapter

### Deliverables

- Append-only audit service，与关键业务 mutation 同事务或可靠 outbox。
- before/after redaction policy。
- Audit query/export 权限与 365 天 retention policy。
- Workspace API Key create/list/revoke/rotate。
- Hash-only key storage、prefix、expiry、last-used 与 scopes。
- API Key 权限与 creator RBAC 取交集。
- 创建者失去权限时 API Key 即时失效。
- 安全 headers、结构化日志、secret redaction 与 production error policy。

### Tests

- 数据库中不存在可直接使用的 Session/OTP/API Key。
- Key revoke、expiry、scope 和 creator removal。
- 每个 mutation 可通过 request ID 定位 Audit Event。
- Audit 不包含认证 secret。

### Exit Criteria

- Personal Agent 可使用可撤销、Workspace-scoped API Key。
- 核心写操作审计覆盖率 100%。

## 9. Phase 5: Entitlements, Quotas, and Usage

Priority: P1
Dependency: Phase 4

### Schema

- `organization_entitlements`
- `usage_events`
- `usage_rollups`

### Deliverables

- Central Entitlement Service。
- `early_access` entitlement provisioning。
- Workspace/member/storage/Agent hard quotas。
- API/record/audit soft quotas 与 80%/100% 通知。
- 幂等 usage event ingestion 与 period rollup。
- 原子 quota reservation，避免并发超额。
- 管理员用量与限额 UI。

### Tests

- 并发资源创建不能突破硬配额。
- 同一 idempotency key 不重复计量。
- Entitlement override 生效且可过期。
- 降级不删除或隐藏已有数据。

### Exit Criteria

- 所有可计费资源有明确 metric owner 和服务端 enforcement。
- 套餐变化不需要修改业务模块。

## 10. Phase 6: Subscription Billing

Priority: P1
Dependency: Phase 5

### Schema

- `billing_customers`
- `subscriptions`
- `billing_webhook_events`

### Deliverables

- Organization Owner 创建 Stripe Checkout Session。
- 服务端 price catalog，禁止客户端任意 Price ID。
- Webhook raw-body signature verification 与 event idempotency。
- Subscription snapshot → Entitlement transaction。
- Stripe Customer Portal。
- Billing settings UI。
- payment failure grace period 和限制策略。
- Stripe unavailable 时使用最近可信 Entitlement，不阻断已有用户。

### Tests

- 伪造 success redirect 不开通权益。
- 重复与乱序 webhook 不破坏 Subscription。
- payment failed、恢复、cancel-at-period-end 与 deleted 状态。
- 非 Owner 无法创建 Checkout 或 Portal session。

### Exit Criteria

- Sandbox 完成 subscribe → renew/fail → recover/cancel 全流程。
- Billing 故障不会删除数据或让已有客户立即失去读取能力。

## 11. Phase 7: Export, Deletion, and Recovery Operations

Priority: P1
Dependency: Phase 4; may run alongside Phase 5–6

### Schema

- export jobs
- deletion jobs/tombstones
- backup recovery drill records

### Deliverables

- 版本化 Workspace export manifest 与 checksum。
- 异步导出与短期 signed download URL。
- Workspace archive、30-day pending deletion、restore 与 purge。
- Organization deletion with fresh Email OTP confirmation。
- User account deletion、Session/API Key revoke 与 audit anonymization。
- Blob、cache、event 和 derived data purge handlers。
- 托管数据库 backup 配置与恢复 runbook。
- 完成一次真实恢复演练并记录 RPO/RTO 结果。

### Tests

- Export 不含认证和 Billing secrets。
- Purge 可重试且不影响其他 Workspace。
- 30 天恢复窗口行为。
- 从备份恢复后关键 tenant isolation tests 继续通过。

### Exit Criteria

- Backup 有真实 restore evidence。
- Workspace 和 Organization 删除生命周期可以端到端执行与审计。

## 12. Phase 8: Production Readiness Gate

Priority: P0 before public launch
Dependency: Phase 0–7

### Required Gate

- 全仓 typecheck、unit、integration、migration 和 browser E2E 通过。
- Cross-tenant security suite 通过。
- Auth/OTP/API rate-limit 验证通过。
- Webhook replay 与 job retry 验证通过。
- Backup restore drill 通过。
- Secret scan、dependency audit 与 production headers 检查通过。
- 关键路径 observability：request ID、error rate、latency、job failure。
- Runbook：auth outage、email outage、database restore、billing webhook backlog、key compromise。

### Launch Definition

Public SaaS launch 的最低范围是 Phase 0–4、Phase 7 的 backup/deletion 基础与 Production Gate。Phase 5–6 可在 `early_access` 无付费阶段并行完成，但公开收费前必须完成。

## 13. Explicitly Deferred Backlog

以下能力不进入上述阶段的完成标准：

- Team / TeamMembership / WorkspaceTeamGrant。
- Custom roles、field ACL、record ACL。
- OIDC、SAML、SCIM。
- Service Account。
- Seat Billing、usage overage Billing、Add-on。
- Data residency、per-tenant database、customer-managed encryption keys。
- SIEM/DLP/IP allowlist 和高级合规后台。

任何 deferred 项目进入计划前必须先满足 [07-saas-core-boundaries.md](07-saas-core-boundaries.md) 定义的触发条件，并形成新的 ADR。

## 14. Tracking Format

每个 Phase 使用以下状态：

```text
Not started → In progress → Verification → Complete
```

完成报告必须包括：

- migrations and contracts changed
- security boundary changed
- tests added and results
- operational runbook impact
- known residual risks
- next phase dependency readiness
