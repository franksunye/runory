# Runory SaaS Core Boundaries and Decisions

Status: Approved v1.0
Date: 2026-06-22
Scope: Runory Cloud SaaS foundation
Related: [03-architecture.md](03-architecture.md), [08-saas-core-implementation-plan.md](08-saas-core-implementation-plan.md)

## 1. Purpose

本文档是 Runory SaaS Core 的边界与架构决策基准。它回答：当前必须具备哪些完整能力、哪些复杂能力暂缓、以及哪些模型必须为未来保留扩展路径。

当前目标不是建设一套大型企业管理套件，而是完成：

> 一个可安全上线、支持多组织与多人协作、可审计、可计量、可订阅，并能持续升级的 SaaS Core。

## 2. Scope Summary

当前 SaaS Core 必须覆盖：

1. Passwordless Email OTP 身份认证与服务端 Session。
2. Organization 与 Workspace 的明确边界。
3. 固定角色 RBAC、成员邀请与即时权限撤销。
4. 所有入口统一的多租户数据隔离。
5. 审计、安全基线与 Workspace API Key。
6. Entitlement、Quota 与 Usage Metering。
7. Stripe Subscription Billing 基础。
8. 版本化 Migration、Backup、Export 与删除生命周期。

当前只做架构预留，不进入产品实现：

1. Team。
2. 自定义角色、字段级或记录级 ACL。
3. OIDC、SAML、SCIM。
4. 每租户独立数据库、数据地域与客户自管密钥。
5. Seat Billing、用量超额收费与复杂 Add-on。
6. SOC 2 / ISO 27001 认证流程和高级合规产品。

## 3. Canonical Domain Model

```text
User
  └─ AuthIdentity (email_otp now; oidc/saml later)

Organization (tenant, ownership, membership, billing, security)
  ├─ OrganizationMembership
  ├─ OrganizationInvitation
  ├─ BillingCustomer / Subscription / Entitlement / Usage
  └─ Workspace (business data and configuration boundary)
       ├─ WorkspaceMembership
       ├─ Modules / Packs / Extensions
       ├─ Business Records / Files / Events
       ├─ Audit Events
       └─ API Keys
```

约束：

- 一个 User 可以加入多个 Organization。
- 一个 Organization 可以拥有多个 Workspace。
- 一个 Workspace 只能属于一个 Organization。
- 单人用户同样使用 Organization，不建立特殊 Personal Workspace 模型。
- Organization 拥有业务资产；User 离开后不带走 Organization 数据。

## 4. Decision 01: Passwordless Email OTP

### 4.1 Definition

“合法邮箱”严格定义为：用户能够接收并正确提交一次性验证码的邮箱。

默认流程：

```text
输入邮箱
→ 发送一次性验证码
→ 验证邮箱控制权
→ 创建或匹配 User
→ 创建服务端 Session
→ 首次使用时创建 Organization + Workspace
```

不区分注册与登录。首次验证自动注册，后续验证直接登录。

### 4.2 Required Controls

- 邮箱规范化并建立唯一身份约束。
- OTP 只保存哈希，5–10 分钟过期，使用后立即失效。
- 限制发送频率、验证尝试次数、IP 与邮箱维度请求量。
- 接口响应不得泄露邮箱是否已经注册。
- Session 使用随机 opaque token，数据库只保存 token hash。
- Cookie 使用 `HttpOnly + Secure + SameSite`。
- 支持 Session 过期、撤销、退出与退出所有设备。
- 登录、失败、退出与身份变更写入安全审计。
- 邮件交付使用外部服务，Runory 不维护邮件服务器。

### 4.3 Deferred

- 密码及密码找回。
- OAuth 社交登录。
- MFA、Passkey。
- OIDC、SAML 企业 SSO。
- 自研 JWT refresh-token 体系。

## 5. Decision 02: Organization and Workspace

### 5.1 Responsibilities

Organization 是：

- 租户与所有权边界。
- 成员、邀请与安全策略边界。
- Billing、Entitlement 与 Usage 边界。

Workspace 是：

- 业务数据隔离边界。
- Module、Pack、Template 与 Extension 配置边界。
- 业务审计、文件、事件与 Agent 操作边界。

首次使用只要求用户填写 Workspace 名称；系统可用同一名称创建 Organization，避免增加 onboarding 复杂度。

### 5.2 Roles

Organization Roles：

| Role | Capability |
| --- | --- |
| `owner` | 所有权限、Billing、组织删除与所有权转让 |
| `admin` | 成员与 Workspace 管理，不可转让或删除组织 |
| `member` | 只能访问明确分配的 Workspace |

Workspace Roles：

| Role | Capability |
| --- | --- |
| `admin` | Workspace 设置、模块、Agent 变更与业务数据 |
| `member` | 业务数据读写 |
| `viewer` | 业务数据只读 |

Organization `owner/admin` 自动获得组织下所有 Workspace 的 `admin` 权限。Workspace 不定义所有权；所有权属于 Organization。

### 5.3 Deferred Operations

- Workspace 跨 Organization 转移。
- Organization 合并。
- 多 Organization 共同拥有 Workspace。
- 部门树与层级组织模型。

## 6. Decision 03: Team-ready, Not Team-enabled

Team 是 Organization 内的人员分组，不是租户、数据或计费边界。

当前授权路径：

```text
Organization → User → WorkspaceMembership
```

未来可扩展为：

```text
Organization → Team → TeamMembership → WorkspaceTeamGrant
```

当前要求：

- 授权统一通过 Policy/Authorization Service 计算。
- 权限主体概念可扩展为 `user` 或 `team`。
- 不在业务记录中加入 `team_id`。
- 不允许 Team 嵌套。

Team 的实现触发条件：客户通常超过 10–20 名成员、同一批成员反复被分配到多个 Workspace，或出现明确部门访问边界。

## 7. Decision 04: Invitation and Fixed RBAC

### 7.1 Invitation Flow

```text
Organization owner/admin 输入邮箱
→ 选择 Workspace 与角色
→ 创建一次性邀请
→ 用户完成同邮箱 OTP 验证
→ 事务内创建 OrganizationMembership + WorkspaceMembership
→ 邀请标记 accepted
```

规则：

- 邀请 7 天过期，可重发或撤销。
- 邀请 token 只保存哈希且只能使用一次。
- 只有 Organization `owner/admin` 可以邀请外部用户。
- Workspace `admin` 当前不管理组织成员。
- Organization 始终至少保留一个 Owner。
- 最后一名 Owner 不能退出、降级或被删除，必须先转让所有权。
- 成员移除后，下一个请求立即失去权限。

### 7.2 Deferred Authorization Features

- 自定义角色与权限编辑器。
- Deny 规则与复杂权限覆盖。
- 字段级、记录级权限。
- 临时权限时间窗。
- Team 授权。

## 8. Decision 05: Tenant Isolation and Authorization Execution

当前使用共享数据库、共享表和强制 `workspace_id` 隔离；不为每个租户创建数据库或表。

每个请求建立服务端上下文：

```text
RequestContext
- userId
- organizationId
- workspaceId
- organizationRole
- workspaceRole
- requestId
```

执行链路：

```text
Route / MCP / Background Job
→ Resolve Identity
→ Resolve Organization and Workspace
→ Authorization Policy
→ Authorized Service
→ Repository / Database
```

强制规则：

- 不信任客户端传入的 `userId`、Actor 或 Workspace ownership。
- 所有记录读取使用 `WHERE workspace_id = ? AND id = ?`。
- 唯一约束和关联约束默认包含 `workspace_id`。
- Route、MCP、Agent、Webhook 与后台任务遵守同一授权策略。
- Cache key、事件 channel、文件路径和异步任务 payload 包含 Workspace scope。
- 用户专属响应不得进入跨用户共享缓存。
- Platform Core 低层数据函数不得被当作公开授权 API。

最低角色策略：

| Operation | Required Role |
| --- | --- |
| 读取业务记录 | Workspace `viewer` |
| 创建或修改业务记录 | Workspace `member` |
| 安装 Pack / 应用 Extension | Workspace `admin` |
| 邀请成员 | Organization `admin` |
| Billing / 删除组织 | Organization `owner` |

## 9. Decision 06: Audit, Security, and API Keys

### 9.1 Audit

审计日志与应用调试日志、用户活动摘要分离。

审计事件必须包含 Organization、Workspace、Actor type/id、action、resource、request ID、before/after 与时间。审计记录只追加，不允许普通业务路径修改或删除。

认证秘密、OTP、Session、API Key、敏感请求头不得进入日志；敏感业务字段在 before/after 中按策略脱敏。默认保留 365 天。

### 9.2 API Keys

当前 API Key 面向 MCP、Personal Agent 与自动化：

- 绑定 User 和 Workspace。
- 权限不能超过创建者当前权限。
- 创建者失去 Workspace 权限后立即失效。
- 数据库只保存 hash，创建时只展示一次。
- 支持名称、前缀、撤销、轮换、过期与 `last_used_at`。
- 只允许 `Authorization: Bearer`，禁止 URL Query 传递。
- 默认有效期 90 天。

最小 Scope：

- `workspace:read`
- `records:write`
- `extensions:manage`

Scope 和 RBAC 同时检查，取两者交集。当前不实现独立 Service Account；出现非个人自动化生命周期需求后再增加 Organization-owned Service Account。

### 9.3 Security Baseline

- Session、OTP、API Key 只保存 hash。
- 修改操作校验 Origin/CSRF 防护。
- 认证、邀请和 API 有分层 rate limit。
- 标准安全响应头。
- 生产环境不暴露 stack trace 与数据库错误。
- `401/403` 与业务错误使用稳定错误码。
- 所有请求生成 `request_id`。
- 敏感配置只来自 Secret/Environment 管理。

## 10. Decision 07: Entitlement, Quota, and Usage

Plan、Entitlement 与 Usage 必须分离。业务代码判断 feature/limit，不直接判断套餐名称。

当前只提供内部 `early_access` 套餐，不要求付款，但设置防滥用上限：

| Metric | Initial Limit |
| --- | ---: |
| Workspace | 3 |
| Active members | 10 |
| Business records | 50,000 |
| File storage | 5 GB |
| API requests | 100,000/month |
| Agent operations | 1,000/month |
| Audit retention | 365 days |

计量采用幂等 usage event 加 period rollup。Workspace、成员、存储与高风险 Agent 操作为硬限制；API、普通记录和审计存储初期采用软限制与告警。

降级不得删除数据或突然阻断读取/导出；只阻止继续创建超额资源，并提供宽限与恢复路径。

## 11. Decision 08: Subscription Billing

Stripe 负责支付方式、周期扣款、发票、重试与订阅生命周期；Runory 负责 Organization、Subscription snapshot、Entitlement 与访问行为。

约束：

- 一个 Organization 对应一个 Stripe Customer。
- 当前一个 Organization 最多一个有效 Subscription。
- Workspace 不单独订阅。
- 只有 Organization Owner 可以管理 Billing。
- `early_access` 用户不提前创建 Stripe Customer。
- 使用 Stripe Billing + Checkout Session + Customer Portal。
- Webhook 是订阅状态可信来源，成功跳转页面不能开通权益。
- Webhook 必须验证 raw-body signature、按 event ID 幂等，并容忍重复和乱序。

支付失败进入宽限期；宽限期内保留读取与导出，期满后限制创建和 Agent 变更，不自动删除数据。

当前不实现 Seat Billing、用量超额收费、多币种、优惠券后台、复杂 Add-on 或 Stripe Connect。

## 12. Decision 09: Migration, Backup, Export, and Deletion

### 12.1 Migration

建立不可修改、带 checksum 的版本迁移：Platform Migration、Module Migration 与 Workspace Extension Migration 分开管理。

- 生产 Migration 通过部署任务执行，不由普通请求触发。
- 结构变更采用 expand → migrate → contract。
- 失败优先前向修复，不承诺自动结构回滚。

### 12.2 Backup and Export

托管数据库备份用于平台灾难恢复；Workspace Export 用于客户数据可携带性，两者分离。

导出包使用版本化 manifest，包含 metadata、records、extensions、audit、files 与 checksums，不包含任何认证或 Billing secret。大型导出异步生成，下载链接短期有效。

### 12.3 Deletion

```text
active → archived → pending_deletion → purged
```

- 删除进入 30 天恢复期。
- Organization 删除需要 Owner 重新完成 Email OTP。
- Purge 使用幂等后台任务清除数据库、文件、缓存和衍生数据。
- User 离开只移除 Membership，不删除 Organization 业务资产。
- User 删除账号时撤销 Session/API Key，并对保留审计中的个人展示信息进行匿名化。

## 13. Decision 10: Enterprise-ready, Not Enterprise-complete

内部 User ID 稳定，认证方式独立存储为 AuthIdentity，为 `email_otp / oidc / saml` 预留扩展。不得仅凭相同邮箱自动合并 SSO 身份。

未来顺序：OIDC → SAML → SSO enforcement → SCIM。SSO 属于 Organization 策略，并保留受严格保护的 Owner 恢复入口。

当前建设安全控制与证据，但不宣称获得 SOC 2、ISO 27001 等认证。内部支持人员默认无权访问客户 Workspace；未来支持访问必须经客户授权、限时、最小权限并完整审计。

## 14. Definition of SaaS Core Complete

SaaS Core 完成必须同时满足：

1. 邮箱 OTP、Session、退出与撤销形成完整认证闭环。
2. Organization/Workspace/Invitation/RBAC 行为通过自动化测试。
3. 所有 HTTP、MCP、Agent、Job 数据访问通过统一授权上下文。
4. 跨租户记录、文件、缓存、事件与导出测试全部通过。
5. 所有写操作可关联 Actor、Request 与不可变 Audit Event。
6. API Key 可以创建、使用、轮换与即时撤销。
7. Entitlement 和 Quota 在服务端执行，并发不能突破硬限制。
8. Billing webhook 幂等，不能通过客户端伪造权益。
9. Migration 可从空数据库重放，备份完成真实恢复演练。
10. Workspace 删除可恢复，Purge 无跨 Workspace 影响或认证秘密残留。
