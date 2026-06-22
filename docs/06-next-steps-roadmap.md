# Runory Next Steps Roadmap

Status: Approved v1.0
Date: 2026-06-22
Prerequisite: Cloud-first POC completed
Detailed SaaS plan: [08-saas-core-implementation-plan.md](08-saas-core-implementation-plan.md)

## 1. Current Position

Cloud-first POC 已证明核心产品假设：Metadata-driven objects + Agent-governed Workspace Extensions 可以在不生成运行时代码的情况下形成可运行的业务应用。

当前工作从“证明平台假设”进入两个并行方向：

```text
Track A — SaaS Core：让 Cloud 产品可安全上线、协作和商业化
Track B — Product Runtime：让 CRM Lite 与 Agent 配置形成持续业务价值
```

SaaS Core 边界以 [07-saas-core-boundaries.md](07-saas-core-boundaries.md) 为准。本文件只维护跨领域优先级，不重复具体安全与数据模型清单。

当前正式发布目标是 `Runory Cloud v0.1.0 — Early Access`。范围、阻塞项、验收证据和签发流程以 [releases/v0.1.0-cloud-early-access.md](releases/v0.1.0-cloud-early-access.md) 为准。

## 2. Priority Order

### P0 — Cloud Safety and Identity

- Consolidate RequestContext、Principal、Role Policy 与版本化 Migration。
- Email OTP + server-side Session。
- Organization、Invitation、固定 RBAC 与 Owner invariants。
- HTTP/MCP/Agent/Job 统一 tenant isolation。
- Append-only Audit 与 Workspace-scoped API Key。
- Cross-tenant security regression suite。

完成标准：未认证用户和跨租户用户无法通过任何入口读取或修改数据；多人 Organization 可以完成邀请、授权和移除闭环。

### P0 — Production Operations

- Vercel + Turso production deployment。
- Secret、rate limit、security headers 与 structured errors。
- Platform migration deployment job。
- Database backup、真实 restore drill 与 incident runbooks。
- Workspace export、archive、restore 与 purge 基础。
- Browser E2E、observability 与 production readiness gate。

完成标准：可以从备份恢复服务，并重新通过 tenant isolation 和核心业务测试。

### P0 — Catalog & Release Control Plane POC

- Git/CI → immutable Cloud Catalog artifact。
- Module/Pack/Template versions 与 structured validation。
- Pack dependency resolver 与 frozen lock。
- Internal/Beta/Stable release promotion。
- Sandbox Workspace compatibility validation。
- Workspace Module Center 与 upgrade preflight。
- Rollout observability、pause 与 failure isolation。
- Internal SDK toolchain：typed authoring、validate、test harness、build、publish candidate。

完成标准：`runory.customer` 1.0 → 1.1 从 candidate、Sandbox、Beta rollout 到 Stable 升级形成完整可审计闭环。详细规格见 [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md)。

### P1 — SaaS Commercialization

- `early_access` Entitlement。
- Quota 与幂等 Usage Metering。
- Stripe Checkout、Subscription Webhook 与 Customer Portal。
- Billing failure grace period 和安全降级。

完成标准：套餐变化不修改业务模块；重复或伪造 Billing 事件不能错误授予权益。

### P1 — Product Runtime

- Contact full CRUD 与 Customer relation。
- Template-driven navigation/dashboard/terminology。
- Extension beyond custom field：view order、filter、section。
- Built-in Agent 的最小受控配置入口。
- SSE 或 SWR revalidation，变更后 UI 在 2 秒内更新。

完成标准：真实 SMB 可通过 Cloud UI 持续使用 CRM Lite，并通过 Agent 安全完成常见配置。

### P2 — Platform Expansion

- Workflow Runtime 与 approval queue。
- Third-party publisher 与 Marketplace read path。
- Async jobs for export、retention 与 usage rollup。
- Module SDK 与发布工具。

### Deferred — Requires New ADR

- Team。
- Custom roles、field/record ACL。
- OIDC、SAML、SCIM。
- Service Account。
- Seat/usage-overage Billing 与复杂 Add-on。
- Private/VPC/On-premise production delivery。
- Data residency、per-tenant database 与 advanced compliance controls。

## 3. Milestone Gates

| Milestone | Required Outcome |
| --- | --- |
| M1 Identity | Email OTP、Session、首次 Organization/Workspace onboarding 通过 E2E |
| M2 Collaboration | Invitation、RBAC、Owner transfer 与 immediate revoke 完整 |
| M3 Isolation | HTTP/MCP/Agent/Job 跨租户测试在 CI 强制通过 |
| M4 Trust | Audit、API Key、rate limit、structured security errors 完成 |
| M5 Catalog | Immutable artifact、validation、release、upgrade 与 rollout POC 完成 |
| M6 Operations | Migration、backup restore、export/deletion runbook 完成 |
| M7 Commercial | Entitlement、Usage、Stripe sandbox subscription loop 完成 |
| M8 Public Launch | Production readiness gate 全部通过 |

## 4. Active Technical Debt

| Item | Priority | Resolution Phase |
| --- | --- | --- |
| Trusted identity headers are temporary | P0 | SaaS Phase 1 |
| Workspace role still contains POC `owner` semantics | P0 | SaaS Phase 0 |
| Generic API errors can hide auth semantics | P0 | SaaS Phase 0 |
| Schema bootstrap is not a versioned migration system | P0 | SaaS Phase 0 |
| MCP does not yet use Cloud RequestContext | P0 | SaaS Phase 3 |
| Cross-tenant test matrix is incomplete | P0 | SaaS Phase 3 |
| Audit model is POC-level | P0 | SaaS Phase 4 |
| Request body validation is incomplete | P0 | Phase 0–4 per route |
| UI polish is uneven outside landing/shell/dashboard | P1 | Product Runtime |
| Type safety still contains POC `any` values | P1 | Continuous |

## 5. Tracking Source of Truth

- Product and platform direction: [02-vision.md](02-vision.md)
- Architecture: [03-architecture.md](03-architecture.md)
- SaaS decisions: [07-saas-core-boundaries.md](07-saas-core-boundaries.md)
- SaaS execution and acceptance: [08-saas-core-implementation-plan.md](08-saas-core-implementation-plan.md)
- Catalog/release specification: [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md)
- SDK product and developer experience: [10-runory-sdk-product.md](10-runory-sdk-product.md)
- v0.1.0 release definition: [releases/v0.1.0-cloud-early-access.md](releases/v0.1.0-cloud-early-access.md)
- Historical POC result: [05-cloud-first-poc-progress.md](05-cloud-first-poc-progress.md)

不要在本文件重新定义 SaaS 数据模型或权限边界；决策变化必须先更新 SaaS Core decision baseline，并记录迁移影响。
