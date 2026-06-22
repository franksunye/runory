# Runory Catalog & Release Control Plane

Status: Approved v1.0
Date: 2026-06-22
Scope: Official and internal Module / Pack / Template manufacturing lifecycle
Related: [architecture/module-architecture.md](architecture/module-architecture.md), [sdk/module-sdk.md](sdk/module-sdk.md), [06-next-steps-roadmap.md](06-next-steps-roadmap.md)

## 1. Purpose

本文档定义 Runory Cloud 中平台级 Module、Pack 和 Template 的研发制品管理、验证、发布、升级和运营控制面，并提供可直接执行的 POC 与分阶段编码计划。

当前静态 Catalog POC 已证明 Manifest 可以被读取并安装，但尚未证明：

> Runory 能持续、安全地制造、验证、发布、灰度、升级和治理平台级业务能力。

Catalog & Release Control Plane 是 Runory 平台能力的一部分，不等同于未来的第三方 Marketplace。

## 2. Scope

当前必须支持：

1. Official / Internal Module、Pack、Template 的 Cloud Catalog。
2. Git/CI 产生的不可变 artifact 导入 Cloud Registry。
3. Draft candidate validation 与 Sandbox Workspace 验证。
4. `internal → beta → stable` release channel promotion。
5. Pack dependency resolution 与 immutable lock。
6. Workspace installation、upgrade preflight 与 Extension compatibility。
7. 分批 rollout、暂停、失败隔离与 release observability。
8. 手工 UI 与 Agent governed API 使用相同 command/service。
9. 发布、废弃、撤回和升级操作的完整审计。

当前不支持：

1. Cloud 在线代码 IDE 或任意 SQL 编辑器。
2. 第三方开发者账户、审核、结算和 Marketplace 商业分成。
3. 用户上传任意可执行代码。
4. 自动跨 breaking major version 升级。
5. Team/customer RBAC 复用为平台发布权限。
6. 完整软件供应链签名基础设施或 SBOM 合规平台。

## 3. Control Plane Separation

```text
Platform Catalog Control Plane
  Official/Internal artifact, validation, release, rollout, withdrawal
                         |
                         v
Workspace Capability Control Plane
  Discover allowed releases, install, preflight, upgrade, observe
                         |
                         v
Workspace Runtime / Data Plane
  Effective module model, records, extensions, workflows, audit
```

边界：

- Platform Catalog 权限不授予客户业务数据访问权。
- Organization Owner 不能创建或发布平台 artifact。
- Workspace Admin 只能安装 Entitlement 与 release policy 允许的版本。
- Agent 在哪个控制面执行，就继承该控制面的 Principal、权限和审计要求。
- Catalog metadata 可以跨租户共享；Workspace installation、compatibility report 和 rollout target 属于租户数据。

## 4. Personas and Platform Roles

平台角色与 Organization/Workspace RBAC 分离：

| Platform Role | Capability |
| --- | --- |
| `catalog_viewer` | 查看内部 Catalog、版本、验证和 rollout 状态 |
| `catalog_editor` | 导入 candidate、修改未冻结 metadata、触发验证 |
| `release_manager` | 发布 internal/beta/stable、暂停 rollout、deprecate |
| `security_manager` | withdraw compromised release、阻止安装与升级 |

规则：

- Stable 发布至少需要 `release_manager` 的显式确认。
- Agent 不能成为最终批准者。
- Withdraw 可以由 `security_manager` 紧急执行，但必须填写原因并产生高风险 Audit Event。
- 正式上线前，平台高权限账号需要比普通 Workspace Email OTP 更强的内部访问保护；POC 可使用受限 allowlist + 审计，但不能用客户端 header 冒充平台角色。

## 5. Catalog Concepts

### 5.1 Catalog Item

代表稳定身份，例如：

```text
module:   runory.customer
pack:     crm-lite-pack
template: small-business-crm
```

Item ID 一旦发布不得重命名。名称、描述和分类可以更新，但不能改变 artifact identity。

### 5.2 Catalog Version

代表某个 Item 的 SemVer 版本。Version 在 `ready` 后冻结，Manifest、migration 和 artifact checksum 不可修改。

Version lifecycle：

```text
draft → validating → ready
  |          |
  v          v
rejected   rejected

ready → deprecated
ready/deprecated → withdrawn
```

`ready` 表示制品可发布，不代表 Workspace 已可见。

### 5.3 Release

Release 将 immutable Version 暴露到 channel：

```text
internal → beta → stable
```

- `internal`：仅平台内部 Sandbox 与 allowlisted Workspace。
- `beta`：明确 opt-in 或指定 cohort。
- `stable`：满足 Entitlement 和兼容性条件的普通 Workspace 可见。

同一 Version 可以逐级 promotion；promotion 生成独立 Release 记录，不修改 Version artifact。

### 5.4 Rollout

Rollout 是 Release 对 Workspace cohort 的升级执行计划：

```text
draft → running → paused → resumed → completed
                   |
                   v
                canceled
```

Rollout pause 只停止新目标，不撤销已经成功升级的 Workspace。

### 5.5 Installation

Installation 记录 Workspace 实际运行状态，不只记录 Module ID：

```text
requested_version
resolved_version
artifact_checksum
source_release_id
status
installed_at / upgraded_at
last_compatibility_report_id
```

Workspace 实际版本是 Runtime truth；Catalog latest version 不能替代 Installation state。

## 6. Artifact Contract

Official/Internal source code 继续在 Git 中研发。CI 生成版本化 artifact，Cloud 不直接读取开发工作树作为生产 Registry。

建议 artifact：

```text
<item-id>-<version>.tar.gz
├─ manifest.yaml
├─ migrations/
├─ schemas/
├─ assets/
├─ README.md
└─ provenance.json
```

`provenance.json` 至少包含：

```json
{
  "sourceRepository": "...",
  "sourceCommit": "...",
  "buildId": "...",
  "builtAt": "...",
  "manifestSchemaVersion": "...",
  "payloadSha256": "..."
}
```

`payloadSha256` 对不包含 provenance 文件本身的 canonical payload 计算；最终压缩 artifact 的 SHA-256 由 Registry 在 artifact 外部记录，避免循环定义。POC 要求这两类 checksum、source commit 和 build identity；第三方签名、SBOM 与 provenance attestation 延后。

Official artifact 必须由 [Runory SDK toolchain](10-runory-sdk-product.md) 的 canonical compiler/build 产生。Catalog importer 不应长期承担修复或猜测非规范 artifact 的职责。

## 7. Canonical Data Model

### 7.1 Catalog Tables

```text
catalog_items
- id
- item_type: module / pack / template
- name
- description
- publisher_id
- visibility: internal / public
- status: active / archived
- created_at / updated_at

catalog_versions
- id
- catalog_item_id
- version
- lifecycle_status: draft / validating / rejected / ready / deprecated / withdrawn
- manifest_json
- manifest_schema_version
- artifact_uri
- artifact_checksum
- source_repository
- source_commit
- created_by
- frozen_at
- created_at
- UNIQUE(catalog_item_id, version)

catalog_validation_runs
- id
- catalog_version_id
- status: queued / running / passed / failed
- validator_version
- result_json
- started_at / completed_at

catalog_releases
- id
- catalog_version_id
- channel: internal / beta / stable
- status: active / superseded / paused / withdrawn
- release_notes
- approved_by
- released_at
- UNIQUE(catalog_version_id, channel)
```

### 7.2 Pack Lock

```text
pack_version_locks
- pack_catalog_version_id
- module_item_id
- requested_range
- resolved_module_version_id
- artifact_checksum
- resolution_order
- UNIQUE(pack_catalog_version_id, module_item_id)
```

Pack 发布时解析并冻结依赖。Workspace 安装 Pack 时使用 lock，不重新解析“当前最新”版本。

### 7.3 Rollout and Compatibility

```text
release_rollouts
- id
- catalog_release_id
- target_type: allowlist / percentage / all_eligible
- target_config_json
- status
- success_threshold
- failure_threshold
- started_by / started_at / completed_at

rollout_targets
- rollout_id
- workspace_id
- from_version_id
- to_version_id
- status: pending / running / succeeded / failed / skipped
- reason_code
- started_at / completed_at

compatibility_reports
- id
- workspace_id
- catalog_item_id
- from_version_id
- to_version_id
- status: compatible / warning / blocked
- core_compatibility_json
- dependency_diff_json
- permission_diff_json
- schema_diff_json
- extension_conflicts_json
- migration_risk_json
- created_at
```

### 7.4 Installation Changes

扩展现有 `installations`：

- 使用 `catalog_item_id` / `catalog_version_id` 或稳定等价引用。
- 区分 `installing / installed / upgrading / failed / disabled`。
- 记录 artifact checksum 和 source release。
- 保留最后成功版本，不能只覆盖 version 字符串。
- Pack installation 与 module installations 需要可追踪的 parent operation。

## 8. Manifest and Version Rules

所有 Module、Pack、Template 使用 SemVer。

- Patch：兼容修复，不删除 contract。
- Minor：向后兼容能力增加，允许声明 deprecated contract。
- Major：允许 breaking change，必须 manual review，不自动升级。

Manifest 必须增加或明确：

- `manifestSchemaVersion`
- `publisher`
- `releaseCompatibility`
- dependency ranges
- migrations by `from → to`
- permissions and permission change policy
- data ownership
- extension points and removed/deprecated slots
- uninstall/data retention policy

Pack Manifest 使用 ranges 表达开发意图，但发布后必须生成 resolved lock。

Template 版本必须声明其兼容的 Pack/Module range；Template 不隐式升级 Module。

## 9. Validation Pipeline

Candidate 进入 `ready` 前按顺序验证：

1. Artifact checksum 与结构完整性。
2. Manifest schema validation。
3. Item ID、Version、SemVer 与 immutable identity。
4. Core compatibility。
5. Dependency graph、missing dependency 与 cycle detection。
6. Pack dependency resolution 与 lock generation。
7. Permission declaration与上一版本 permission diff。
8. Migration 文件存在、顺序、checksum 和禁止模式检查。
9. Object/field/view key collision。
10. Extension point compatibility 与 removed slot 检查。
11. 从空 Workspace 安装测试。
12. 从上一 Stable 版本升级测试。
13. 有 active Extension 的 fixture Workspace compatibility test。
14. UI schema/render smoke test。

结果必须结构化，不只保存 CI 文本日志。Validation failure 不允许 promotion。

## 10. Sandbox Workspace

Sandbox 是普通 Workspace runtime 的隔离实例，不是特殊旁路环境。

- 只能安装 internal release。
- 使用与生产相同 Installer、Migration、Authorization 和 Audit。
- 使用合成 fixture 数据，不复制真实客户数据。
- 支持一键重建。
- Validation Run 关联 Sandbox test result。

禁止平台人员通过 Sandbox 功能隐式访问客户 Workspace 数据。

## 11. Release and Promotion

### Internal Release

Guard：Version `ready`、基础验证全部通过、artifact 已冻结。

### Beta Release

Guard：

- Internal Sandbox install/upgrade passed。
- compatibility report 无 blocker。
- permission diff 已确认。
- release notes 完整。

### Stable Release

Guard：

- Beta cohort 达到最小成功样本或显式 POC waiver。
- failure rate 低于阈值。
- 无未处理 migration blocker。
- Release Manager 显式批准。

所有 promotion 是高风险 command，必须有 preview、confirmation 和 Audit Event。

## 12. Install and Upgrade Execution

### 12.1 Install Pack

```text
Check Workspace admin + Entitlement
→ Load active Release
→ Load frozen Pack Lock
→ Validate Core and existing installations
→ Create operation + compatibility report
→ Install modules in topological order
→ Apply template overlay
→ Persist installations and audit
→ Recompute Effective Runtime Model
```

### 12.2 Upgrade Module/Pack

```text
Resolve target Release
→ Generate compatibility and permission diff
→ Classify risk
→ Require approval when needed
→ Create backup/rollback point
→ Mark installation upgrading
→ Run forward migration
→ Register new metadata/runtime contract
→ Revalidate Workspace Extensions
→ Smoke test
→ Mark installed or failed
→ Audit + rollout target result
```

数据库 migration 不承诺通用自动 down migration。失败处理优先：停止 rollout、保留 last-known-good metadata/runtime、恢复备份或发布 forward fix。UI 中“Rollback”必须明确实际恢复能力，不能暗示任意 schema 可安全逆转。

## 13. Deprecation and Withdrawal

### Deprecate

- 已安装 Workspace 继续运行。
- 默认停止新安装。
- 显示 replacement 和 support end date。
- 提供 migration guidance。

### Withdraw

- 阻止新安装和新升级到该版本。
- 暂停相关 rollout。
- 已安装 Workspace 进入 security review queue。
- 不直接删除 artifact 或客户数据。
- 按风险决定紧急升级、功能 disable 或运营沟通。

Artifact 和 Release history 不物理删除，以保持审计和恢复证据。

## 14. Manual UI Surfaces

### Platform Catalog Console

建议路由：`/platform/catalog`，与客户 Workspace UI 分离。

最小页面：

1. Catalog overview：Module/Pack/Template、channel、latest Stable、安装量、失败率。
2. Item detail：versions、dependencies、permissions、publisher、install distribution。
3. Version detail：manifest、artifact、validation、diff、release notes。
4. Validation run：checks、errors、Sandbox evidence。
5. Release action：promotion preview、approval、deprecate、withdraw。
6. Rollout detail：cohort、success/failure、pause/resume。

### Workspace Module Center

建议路由：`/w/[workspaceId]/settings/modules`。

- 可见 Catalog。
- 当前安装版本和 channel。
- 新版本与 compatibility summary。
- install/upgrade preview。
- permission/schema/extension diff。
- upgrade policy：manual / stable auto-update（后续启用）。
- operation history and failure state。

当前不提供 Manifest 表单编辑器或 Cloud code editor。

## 15. Agent Operations

Agent 与 UI 调用相同 service commands，不建立 Agent-only bypass。

平台 Agent tools：

```text
catalog.item.list
catalog.version.inspect
catalog.version.validate
catalog.version.diff
catalog.release.plan
catalog.release.promote
catalog.rollout.inspect
catalog.rollout.pause
catalog.compatibility.explain
```

Workspace Agent tools：

```text
workspace.catalog.list
workspace.module.install.plan
workspace.module.install
workspace.module.upgrade.plan
workspace.module.upgrade
workspace.module.compatibility.explain
```

风险：

- list/inspect/explain：low。
- validate/plan：low or medium。
- install/upgrade beta：medium。
- stable promotion、rollout all、withdraw：high，必须人工确认。

Agent 可以生成 Draft proposal、diff、release notes 和 rollout 建议；不能成为 Stable approver。

## 16. APIs and Commands

推荐 Command layer：

```text
ImportCatalogCandidate
RunCatalogValidation
FreezeCatalogVersion
PromoteCatalogRelease
DeprecateCatalogVersion
WithdrawCatalogVersion
CreateReleaseRollout
PauseReleaseRollout
PlanWorkspaceInstall
ApplyWorkspaceInstall
PlanWorkspaceUpgrade
ApplyWorkspaceUpgrade
```

HTTP/API 只是 command adapter。每个 mutation command 接收 server-derived Principal、idempotency key、request ID 和 approval context。

Read APIs：

```text
GET /api/platform/catalog
GET /api/platform/catalog/:itemId
GET /api/platform/catalog/:itemId/versions/:version
GET /api/platform/releases/:releaseId/rollout
GET /api/workspaces/:workspaceId/catalog
GET /api/workspaces/:workspaceId/installations
GET /api/workspaces/:workspaceId/upgrades/:operationId
```

Mutation route names可以按 Next.js 实现调整，但 domain command 不应随 transport 改变。

## 17. Audit and Observability

必须审计：

- candidate import/freeze/reject
- validation request/result
- release promotion/deprecation/withdrawal
- rollout create/pause/resume/cancel
- Workspace install/upgrade/failed/retry
- compatibility override and approver

最低指标：

- Workspace installation count by item/version/channel。
- install/upgrade success rate and duration。
- failure reason distribution。
- version adoption distribution。
- Extension compatibility warning/block count。
- rollout cohort progress。
- withdrawn/deprecated exposure count。

Metric 不包含客户业务记录内容。

## 18. Security Boundaries

- Artifact storage write 只允许 CI/import service，Runtime 只读。
- Artifact URI 不由客户端提交后直接执行，必须经过 checksum 和 allowlisted storage validation。
- Migration 运行在受控 runner，不接受平台 UI 中的任意 SQL。
- Manifest permission expansion 必须生成显式 diff。
- Platform role 与 SaaS Organization role 分离。
- Catalog Agent 不获得客户数据访问权。
- Stable release 和 security withdrawal 需要强审计与明确 Principal。
- Published artifact、validation result 和 release history 不可静默覆盖。

## 19. POC Scope

POC 只覆盖 Official/Internal Catalog，使用 `runory.customer` v1.0.0 → v1.1.0 演示完整闭环。

### POC Scenario

```text
1. SDK/CLI 从 typed source 验证、测试并构建 runory.customer 1.1.0 artifact
2. 导入为 Draft candidate
3. 校验 Manifest、checksum、Core range、migration 和 dependencies
4. 生成与 1.0.0 的 schema/permission/extension-point diff
5. 发布 Internal
6. 安装到合成数据 Sandbox Workspace
7. 在含 custom customer field 的 fixture Workspace 验证 compatibility
8. 发布 Beta
9. 对 allowlisted Workspace rollout
10. 查看成功/失败和版本分布
11. Pause rollout
12. 修复后发布新的 immutable patch version
13. 发布 Stable
14. 普通 Workspace Module Center 看见并手工升级
```

### Required Negative Cases

- 修改 frozen version 的 artifact 被拒绝。
- dependency cycle 被拒绝。
- Pack lock 中存在不可解析 range 被拒绝。
- 删除 active Extension slot 导致 upgrade blocked。
- 未声明 permission expansion 导致 promotion blocked。
- migration failure 标记目标失败并暂停阈值 rollout。
- Workspace Admin 不能调用 platform promotion。
- Agent 不能无人工确认发布 Stable。

### POC Success Criteria

1. Catalog 不再以部署目录中的 mutable Manifest 作为运行时唯一真相源。
2. Version artifact immutable 且可由 checksum 验证。
3. Pack install 使用 frozen resolved lock。
4. Internal/Beta/Stable promotion 可通过 UI 和 Agent-assisted plan 完成。
5. Workspace upgrade 前产生 compatibility report。
6. Rollout 可观察、暂停，失败不影响其他 Workspace。
7. 所有平台与 Workspace 操作有正确 Principal 和 Audit Event。
8. Customer 1.1 artifact 由 SDK toolchain 可复现生成，不通过手工拼包进入 Registry。

## 20. Implementation Plan

### CR0 — Contracts and Persistence

Priority: P0

- 扩展 Module/Pack/Template schemas：manifest version、publisher、migration graph、compatibility metadata。
- 增加 Catalog、Version、Validation、Release、Pack Lock、Compatibility、Rollout migrations。
- 定义 Platform roles、commands、errors 和 audit actions。
- 保留 repo Catalog loader 作为 development import adapter，不再作为 production install source。
- 与 SDK0 对齐 canonical public contracts；Catalog 不依赖 private SDK authoring source。

Exit：从当前 `catalog/` 可以构建 artifact 并导入 Registry；旧 POC 测试保持通过。

### CR1 — Validation and Immutable Registry

Priority: P0

- Artifact builder/importer、SHA-256、object storage adapter。
- Manifest/dependency/migration/permission/extension validation pipeline。
- Validation result persistence。
- Freeze `ready` version，不允许覆盖。
- Sandbox fixture install and upgrade runner。
- 接受 SDK build provenance/checksum/validation summary，并独立复验而非盲目信任本地结果。

Exit：Customer 1.1 candidate 完成 positive/negative validation suite。

### CR2 — Release and Pack Lock

Priority: P0

- Release channel and promotion guards。
- Pack dependency resolver、cycle detection 和 frozen lock。
- Release notes/diff/approval commands。
- Platform Catalog Console read pages and promotion action。

Exit：CRM Lite Pack 可以从 Internal promotion 到 Beta，且安装严格使用 lock。

### CR3 — Workspace Install/Upgrade

Priority: P0

- Registry-backed Installer。
- Install/upgrade operation state machine。
- Compatibility report：Core、dependency、permission、schema、Extension、migration。
- Workspace Module Center。
- failure isolation、last-known-good metadata 和 retry path。

Exit：现有 Workspace 可从 Customer 1.0 升级到 Beta 1.1，blocked Extension case 正确停止。

### CR4 — Rollout and Agent Operations

Priority: P1

- allowlist/percentage/all-eligible rollout。
- threshold pause、resume、cancel。
- Platform and Workspace Agent tools mapping to commands。
- rollout metrics and version distribution。

Exit：Beta allowlist rollout 可暂停，Agent 能解释失败但不能绕过批准。

### CR5 — Stable Release Gate

Priority: P1

- Stable promotion guard and manual approval UI。
- Deprecate/withdraw and exposure report。
- Production runbooks：failed migration、bad release、security withdrawal。
- Browser E2E、security regression、migration replay 和 observability checks。

Exit：完整 POC scenario 和 negative cases 在 CI/验收环境通过。

## 21. Current Implementation Gap Map

| Current State | Required Upgrade |
| --- | --- |
| Installer reads `catalog/` files directly | Registry-backed immutable artifact loader |
| One manifest per item in working tree | Multiple immutable Catalog Versions |
| Pack ranges parsed with simple string/sort logic | SemVer resolver、dependency graph、cycle check、frozen lock |
| Installation stores module version string | Catalog version/checksum/release/operation history |
| Only install migration | Versioned upgrade graph and compatibility preflight |
| No platform catalog RBAC | Separate Platform Principal and roles |
| No validation persistence | Structured Validation Runs and evidence |
| No release channels | Internal/Beta/Stable Release records |
| No rollout | Cohort targets, pause, threshold and metrics |
| Workspace settings installs static Pack | Module Center with catalog visibility and upgrade plan |

## 22. Definition of Complete

Catalog & Release Control Plane 第一版完成必须同时满足：

1. ✅ Official/Internal artifacts 从 Git/CI 进入 immutable Cloud Registry。 — `importFromDevCatalog` + `importCatalogCandidate` 实现 artifact 导入，SHA-256 checksum 计算
2. ✅ Module、Pack、Template 有多版本、validation 和 release channel。 — `catalog_items` + `catalog_versions` + `catalog_releases` 表，10 步 validation pipeline，internal/beta/stable 三通道
3. ✅ Pack 发布生成可复现的 dependency lock。 — `resolvePackLock` 使用 SemVer resolver + `pack_version_locks` 表存储 frozen lock
4. ✅ Workspace installation 绑定确切 artifact checksum。 — `installations` 表扩展 `catalog_version_id` + `artifact_checksum` + `source_release_id`
5. ✅ Install/upgrade 使用同一 compatibility、authorization 和 audit path。 — `generateCompatibilityReport` 6 项检查，所有 mutation 写 audit event
6. ✅ Stable promotion 需要人工 Release Manager 批准。 — `promoteCatalogRelease` 要求 `release_manager` 角色，stable 通道需要先有 active beta release
7. ✅ Agent 与 UI 共享 commands，Agent 无发布旁路。 — 所有操作通过 service 层，API routes 是 thin adapter，Agent 无独立 bypass
8. ✅ Rollout 支持观察和暂停，单 Workspace 失败不扩散。 — `createReleaseRollout` + `pauseReleaseRollout` + `checkThresholdAndAutoPause` 实现 failure threshold 自动暂停
9. ✅ Deprecated/withdrawn artifact 不被删除且行为符合政策。 — `deprecateCatalogVersion` + `withdrawCatalogVersion` 只改状态，不删数据，withdrawn release 阻止新安装
10. ✅ POC scenario 和全部 negative cases 自动化通过。 — 30 个测试覆盖 POC scenario + 8 个 negative cases

## 23. Implementation Status

| Phase | Status | Key Deliverables |
| --- | --- | --- |
| CR0 — Contracts and Persistence | ✅ Complete | Migrations 0009/0010, extended manifest schemas, platform roles, 15 audit actions, 5 service modules |
| CR1 — Validation and Immutable Registry | ✅ Complete | `importFromDevCatalog`, `computeManifestChecksum`, 10-step validation pipeline, `freezeCatalogVersion`, `rejectCatalogVersion` |
| CR2 — Release and Pack Lock | ✅ Complete | `promoteCatalogRelease` (internal→beta→stable guards), `resolvePackLock` (SemVer resolver), `deprecateCatalogVersion`, `withdrawCatalogVersion` |
| CR3 — Workspace Install/Upgrade | ✅ Complete | `generateCompatibilityReport` (6 checks), `comparePermissions`, `compareSchema`, extended `installations` table |
| CR4 — Rollout and Agent Operations | ✅ Complete | `createReleaseRollout` (allowlist/percentage/all_eligible), `pauseReleaseRollout`, `resumeReleaseRollout`, `cancelReleaseRollout`, `checkThresholdAndAutoPause` |
| CR5 — Stable Release Gate | ✅ Complete | Stable promotion guard (requires beta + release_manager), deprecate/withdraw with audit, 30 automated tests |

### Service Modules

| File | Responsibility |
| --- | --- |
| `catalog-registry.ts` | Catalog item/version CRUD, artifact import, freeze/reject |
| `catalog-validation.ts` | 10-step validation pipeline, cycle detection, SemVer validation |
| `catalog-release.ts` | Release channel promotion, pack lock resolution, deprecate/withdraw |
| `catalog-compatibility.ts` | 6-check compatibility report, schema/permission diff |
| `catalog-rollout.ts` | Rollout creation, pause/resume/cancel, threshold auto-pause |

### API Routes (19 endpoints)

**Platform Catalog Console** (`/api/platform/`):
- `GET/POST /api/platform/catalog` — list items, import from dev catalog
- `GET /api/platform/catalog/:itemId` — item detail
- `GET /api/platform/catalog/:itemId/versions` — list versions
- `GET /api/platform/catalog/versions/:versionId` — version detail
- `POST /api/platform/catalog/versions/:versionId/validate` — run validation
- `POST /api/platform/catalog/versions/:versionId/freeze` — freeze version
- `POST /api/platform/catalog/versions/:versionId/reject` — reject version
- `POST /api/platform/catalog/versions/:versionId/promote` — promote to channel
- `POST /api/platform/catalog/versions/:versionId/deprecate` — deprecate
- `POST /api/platform/catalog/versions/:versionId/withdraw` — withdraw
- `GET/POST /api/platform/catalog/versions/:versionId/lock` — pack lock
- `GET /api/platform/releases` — list releases
- `GET/POST /api/platform/releases/:releaseId/rollout` — rollout for release
- `GET /api/platform/rollouts/:rolloutId` — rollout detail + progress
- `POST /api/platform/rollouts/:rolloutId/pause` — pause
- `POST /api/platform/rollouts/:rolloutId/resume` — resume
- `POST /api/platform/rollouts/:rolloutId/cancel` — cancel

**Workspace Module Center** (`/api/workspaces/[id]/`):
- `GET /api/workspaces/:id/catalog` — list available catalog items
- `POST /api/workspaces/:id/compatibility` — generate compatibility report

### Test Coverage

- 30 catalog control plane tests (POC scenario + negative cases)
- 135 existing platform-core tests (no regressions)
- Total: 165 tests passing
