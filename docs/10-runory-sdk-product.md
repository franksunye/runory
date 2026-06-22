# Runory SDK Product Definition and Developer Experience

Status: Approved v1.0
Date: 2026-06-22
Scope: Official/Internal Module SDK for v0.1; public ecosystem foundation for later releases
Related: [sdk/module-sdk.md](sdk/module-sdk.md), [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md)

## 1. Purpose

本文档将 Runory SDK 从“Manifest 与 Module 规范文档”提升为一个明确的开发者产品，定义其定位、包边界、本地开发循环、Cloud Catalog 接口、测试工具、Agent Skill 和分阶段实施范围。

核心目标：

> 开发者和研发 Agent 可以在本地用 typed contracts 制造、验证和测试 Module/Pack/Template，再将 immutable artifact 交付 Runory Cloud Catalog 进行发布治理。

## 2. Positioning

Runory SDK 是 **Business Capability Platform SDK**，不是普通 REST API client，也不是 SaaS Core SDK。

```text
Runory SaaS Core
  Identity / Tenant / Billing / Audit / Quota

Runory Platform Runtime
  Object / View / Workflow / Extension / Module Lifecycle

Runory SDK
  Define / Validate / Test / Build / Publish platform capabilities

Runory Business Capability
  Module / Pack / Template / Workflow / Agent Skill
```

SDK 的开发产物是 Module、Pack、Template artifact，以及 Workflow/Agent Skill declarations、validation 和 test evidence。

SDK 不负责：

- 用户登录、Organization 或 Billing。
- 直接访问客户数据库。
- 绕过 Business Engine 执行业务写入。
- 在 Workspace 中执行任意开发者代码。
- 取代 Catalog Release approval。

## 3. Reference Pattern and Independent Direction

WaniWani 的公开 SDK 展示了一种有效的平台模式：开源 typed runtime 在无 Cloud key 时可独立运行，设置配置后可接入可选 Hosted Platform；CLI 将本地项目连接到 Cloud Playground；Agent Skill 让 Coding Agent 理解开发框架。

Runory 吸收以下模式：

1. SDK 本身是可安装、可测试的产品，不只是文档。
2. 本地开发不依赖 Cloud，Cloud 提供 Registry、validation、release 和 observability。
3. CLI 缩短 local → sandbox → publish 循环。
4. Typed deterministic runtime 管理状态、验证、分支、暂停和恢复。
5. Testing harness、starter/template 和 Agent Skill 属于 SDK 的正式组成。
6. SDK runtime 与 hosted control plane 解耦。

Runory 不照搬：

1. “一个 Flow 编译成一个 MCP Tool”作为 Module 模型。
2. MCP Funnel 作为默认业务能力抽象。
3. Chat Widget 作为 Runory 默认入口。
4. 任意 JavaScript sandbox execute 作为业务操作路径。
5. 通过环境变量隐式改变生产 Module 行为。

参考来源：

- [WaniWani SDK](https://github.com/WaniWani-AI/sdk)
- [WaniWani CLI](https://github.com/WaniWani-AI/cli)
- [MCP Distribution Template](https://github.com/WaniWani-AI/mcp-distribution-template)

## 4. Target Personas

### v0.1

- Runory 官方 Module 工程师。
- Runory 平台研发 Agent。
- Release/CI pipeline。

### Later

- 认证合作伙伴和集成商。
- 第三方 Module 开发者。
- Private/Local Runtime 客户研发团队。

公共 SDK 生态、第三方发布和 Marketplace onboarding 不阻塞 v0.1；Official/Internal toolchain 必须进入 v0.1。

## 5. Product Components

### 5.1 `@runory/sdk`

公共 contracts 和 authoring API：

```text
defineModule
definePack
defineTemplate
defineObject / defineView / defineWorkflow
defineAgentSkill
manifest schemas and inferred types
artifact metadata contracts
```

### 5.2 `@runory/sdk-testing`

确定性测试工具：

```text
createModuleTestHarness
createFixtureWorkspace
installArtifact
upgradeArtifact
assertObjectSchema
assertPermissionBoundary
assertExtensionCompatibility
replayWorkflow
```

### 5.3 `@runory/cli`

v0.1 本地和 CI command adapter：

```text
runory validate
runory test
runory build
runory publish --channel internal
```

后续扩展：

```text
runory init
runory login
runory connect
runory dev
runory diff
runory release plan
```

### 5.4 Runory Module Skill

Agent Skill 教会 Coding Agent：

- Module/Pack/Template 边界。
- Manifest 和 typed authoring API。
- Object/View/Workflow/Extension Point 设计。
- validation/test/build/publish 流程。
- 安全、数据 ownership 和 migration 规则。
- Catalog release 与人工审批边界。

Skill 提供知识和流程，不提供越权凭证或发布旁路。

### 5.5 Starter

```text
module/
├─ runory.config.ts
├─ src/module.ts
├─ migrations/
├─ fixtures/
├─ tests/
├─ docs/
└─ package.json
```

Starter 面向 Official/Internal Module，第三方发布模板延后。

## 6. Authoring Model

### 6.1 Typed Definition

目标 API 形态：

```ts
import { defineModule } from "@runory/sdk";

export default defineModule({
  id: "runory.customer",
  version: "1.1.0",
  coreCompatibility: ">=0.1.0 <0.2.0",
  objects: [
    {
      key: "customer",
      label: "Customer",
      fields: [
        { key: "name", type: "text", required: true },
      ],
    },
  ],
  permissions: ["customer.read", "customer.write"],
  migrations: {
    install: "migrations/install.sql",
    upgrades: [
      { from: "1.0.0", to: "1.1.0", path: "migrations/1.0.0_to_1.1.0.sql" },
    ],
  },
});
```

该 API 是 Manifest 的 typed authoring facade。Build 结果必须生成 canonical Manifest；Runory Runtime 和 Catalog 以 canonical artifact 为真相源，不直接执行 TypeScript authoring code。

### 6.2 Declarative First

优先使用数据声明：Object、Field、Relation、View、Form、Dashboard slot、Permission、Event、Action、Workflow、Agent Skill metadata 和 Migration reference。

SDK 不允许 Module 携带任意 React/Node 代码并在多租户 Runtime 动态执行。受控 custom component/runtime extension 必须形成独立安全规范后才能引入。

### 6.3 Canonical Output

```text
Typed source
→ compile/normalize
→ canonical manifest
→ validation
→ tests
→ immutable artifact
```

相同 source、SDK version 和 build inputs 必须产生等价 canonical output。

## 7. Local Development Contract

SDK 的本地能力不依赖 Runory Cloud：

- validate schemas and references。
- resolve local dependency fixtures。
- create temporary SQLite fixture Workspace。
- run install/upgrade migrations。
- render schema/view snapshots。
- run compatibility and permission tests。
- build artifact and checksums。

Cloud 连接只用于发布 artifact、Remote Sandbox validation、Release/rollout 操作和运营指标。本地测试成功不代表可以发布 Stable；Cloud Catalog validation 和 Release Manager approval 仍然生效。

## 8. Configuration

建议项目配置：

```ts
import { defineConfig } from "@runory/sdk";

export default defineConfig({
  itemType: "module",
  entry: "src/module.ts",
  migrations: "migrations",
  fixtures: "fixtures",
  tests: "tests",
  targetCore: ">=0.1.0 <0.2.0",
});
```

原则：

- 项目配置可提交 Git。
- Token、API key、private registry URL 不进入配置文件。
- CI 凭证通过 `RUNORY_TOKEN` 或后续 CI identity 提供。
- SDK/CLI 不把本地 secret 打包进 artifact。

## 9. CLI Contract for v0.1

### `runory validate`

执行 authoring compile、canonical Manifest、SemVer/Core range/dependency、permission/data ownership、migration path/checksum 和 Extension Point validation。支持 `--json`，CI 不解析人类日志。

### `runory test`

执行 empty Workspace install、previous Stable → candidate upgrade、fixture data preservation、Extension compatibility 和 permission/UI schema snapshots。

### `runory build`

生成：

```text
dist/<item-id>-<version>.tar.gz
dist/manifest.json
dist/provenance.json
dist/checksums.json
dist/validation-summary.json
```

Build 不发布、不创建 Release，也不隐式连接 Cloud。

### `runory publish --channel internal`

POC 只允许上传为 Catalog candidate/internal release request：

- 验证 artifact checksum。
- 使用 idempotency key。
- 输出 Catalog item/version/validation IDs。
- 不允许 CLI 直接发布 Stable。
- Stable promotion 仍在 Platform Catalog Console/governed command 完成。

## 10. Testing Harness

最低 API：

```ts
const harness = await createModuleTestHarness({
  coreVersion: "0.1.0",
  module: candidate,
  previous: stable,
});

await harness.install();
await harness.seed("fixtures/customer.json");
await harness.applyExtension("fixtures/customer-tier-extension.json");
const report = await harness.planUpgrade();
expect(report.status).toBe("compatible");
await harness.upgrade();
await harness.assertDataPreserved();
```

Harness 使用 Platform Runtime 的真实 Installer/Migration/Compatibility code，不重新实现一套测试专用语义。

必须支持 deterministic fixture IDs/time、isolated temporary database、success/failure migration fixtures、structured report/snapshots、cleanup，并默认无网络。

## 11. Deterministic Workflow Direction

Typed state graph 对 Runory 的主要启发是：LLM 负责理解和呈现，服务端状态机负责顺序、验证、权限、分支、暂停和恢复。

未来 Workflow SDK 可采用：

```ts
defineWorkflow({
  id: "high-value-quote-approval",
  state: quoteApprovalSchema,
  steps: [...],
  transitions: [...],
  interrupts: [...],
  permissions: [...],
});
```

适用于报价审批、客户 onboarding、派工和费用审核。Workflow state 必须在 Workspace scope 持久化，每一步经过 Business Engine 和 permission check；LLM 不能跳步或绕过 typed validation。

完整 Workflow authoring/runtime 不阻塞 v0.1；v0.1 只需保留 Manifest contract 和最小测试接口。

## 12. Cloud Catalog Integration

```text
Developer / Agent
→ @runory/sdk authoring
→ @runory/sdk-testing
→ runory build
→ runory publish --channel internal
→ Catalog candidate
→ Cloud validation + Sandbox
→ human promotion
→ Workspace compatibility/install/upgrade
```

SDK、CLI、Catalog UI 和 Catalog Agent 最终调用相同 domain commands。不存在 SDK-only 发布旁路。

## 13. Agent Development Experience

Agent 读取 Runory Module Skill 后可以 scaffold Module、修改 typed definitions、生成 migration proposal、运行 validation/test/build、解释 compatibility failures、生成 release notes 并提交 Internal candidate。

以下操作必须停止并请求人工处理：

- permission expansion approval。
- breaking schema/data migration。
- Stable promotion。
- rollout all eligible Workspaces。
- security withdrawal。

Agent 输出必须引用真实 validation/test IDs，不得仅用自然语言声称“测试通过”。

## 14. Package and Dependency Boundaries

建议 workspace packages：

```text
packages/contracts       canonical schemas and transport-neutral types
packages/sdk             public authoring facade and artifact compiler
packages/sdk-testing     fixture harness and assertions
packages/platform-core   private runtime/services/repositories
apps/cli                 command adapter
skills/runory-module     agent development instructions
```

依赖方向：

```text
contracts ← sdk ← module source
contracts ← sdk-testing → public runtime test adapters
contracts ← platform-core
sdk/cli must not import private repositories or database clients
```

避免将 `platform-core` 直接发布为 SDK。公开 contracts 与私有 runtime 实现必须分开。

## 15. Versioning and Compatibility

- SDK 使用 SemVer。
- Canonical Manifest 有独立 `manifestSchemaVersion`。
- Artifact 记录 SDK/compiler version。
- Module 声明 Core compatibility。
- SDK minor version 不应无迁移说明地产生 breaking manifest output。
- CLI 必须报告使用的 compiler version。
- 1.0 前允许快速演进，但 pinned version 和 lockfile 必须支持可复现构建。

## 16. Security

- Build/validate 默认无网络。
- Artifact builder 使用 allowlisted source paths，拒绝路径逃逸。
- Secret scanner 阻止 `.env`、token、private key 进入 artifact。
- 测试使用隔离数据库，Cloud migration 使用受控 runner。
- Publish credential 不暴露给 Module code、fixture 或 Agent output。
- Artifact checksum、provenance 与 Catalog validation result 一致。
- SDK telemetry 默认关闭；未来启用必须显式 opt-in 且不上传业务 fixture/data。

## 17. v0.1 Required Scope

阻塞 Cloud `v0.1.0`：

1. `@runory/sdk` canonical typed Manifest contracts。
2. `runory validate`，含 structured JSON result。
3. `runory test` 的 install/upgrade/Extension fixture harness。
4. `runory build` immutable artifact/provenance/checksum。
5. `runory publish --channel internal` 或等价 CI adapter。
6. Official Customer 1.1 artifact 由该 toolchain 生成，而非手工拼包。
7. SDK/CLI 产物可以进入 Catalog CR0–CR2 流程。
8. Runory Module Skill 能指导 Agent 执行同一流程。

不阻塞 v0.1：

- public npm release。
- `runory init/login/connect/dev` 完整交互体验。
- 第三方 starter/onboarding。
- Hosted Playground。
- 完整 Workflow builder。
- public Marketplace publish。

## 18. Implementation Plan

### SDK0 — Contract Separation

- 从 `packages/contracts` 明确 canonical public schemas。
- 增加 `manifestSchemaVersion`、compiler metadata 与 upgrade graph。
- 建立 `packages/sdk`，不得导出 private DB/runtime。
- `defineModule/definePack/defineTemplate/defineConfig` 最小 facade。

Exit：现有 YAML Catalog 可编译为与 typed source 相同的 canonical Manifest；旧 Catalog contract tests 通过。

### SDK1 — Validate and Build

- Artifact compiler、canonical serializer、checksum、provenance。
- Secret/path safety。
- CLI `validate/build --json`。
- Deterministic/reproducible build tests。

Exit：相同输入产生等价 checksum；Customer 1.1 artifact 通过本地 validation。

### SDK2 — Testing Harness

- Temporary Workspace fixture。
- Real Installer/Migration/Compatibility adapters。
- install/upgrade/data preservation/Extension conflict assertions。
- CLI `test --json`。

Exit：Catalog POC positive/negative cases 可在本地 CI 重放。

### SDK3 — Internal Publish Adapter

- Authenticated CI upload。
- idempotent candidate import。
- validation result polling/output。
- CLI `publish --channel internal --json`。
- 禁止 Stable direct publish。

Exit：Customer 1.1 从 build artifact 进入 Cloud Catalog candidate，无手工文件复制。

### SDK4 — Developer Experience after v0.1

- init/login/connect/dev/diff。
- hot-reload local fixture Workspace。
- public docs/starter/npm packages。
- partner/third-party onboarding。
- richer Workflow authoring and replay tools。

## 19. Acceptance Matrix

| ID | Acceptance | v0.1 |
| --- | --- | --- |
| SDK-01 | SDK public surface 不暴露 Platform DB/repository | Required |
| SDK-02 | Typed source 编译为 canonical Manifest | Required |
| SDK-03 | validate/test/build 提供 machine-readable output | Required |
| SDK-04 | Build 可复现且 artifact checksum 可验证 | Required |
| SDK-05 | Secret/path escape negative tests 通过 | Required |
| SDK-06 | Harness 使用真实 runtime adapters | Required |
| SDK-07 | Customer 1.0 → 1.1 fixture 验证数据与 Extension | Required |
| SDK-08 | Internal publish 幂等且不能直接 Stable | Required |
| SDK-09 | Agent Skill 引用真实 command/evidence | Required |
| SDK-10 | 无 Cloud 时 validate/test/build 可运行 | Required |
| SDK-11 | Public npm/third-party onboarding | Deferred |
| SDK-12 | Full deterministic Workflow builder | Deferred |

## 20. Definition of Complete

Runory SDK v0.1 内部工具链完成必须同时满足：

1. SDK 是实际 package/API/CLI/test harness，不只是 Markdown 规范。
2. Official Module 使用同一 typed contract 和 build pipeline。
3. 本地 validate/test/build 无 Cloud 依赖。
4. Cloud publish 只创建 candidate/internal request，不绕过 release governance。
5. Artifact 可复现、checksummed、无 secret 且关联 source/build identity。
6. Testing harness 覆盖 install、upgrade、data preservation 和 Extension compatibility。
7. Agent 可以通过 Skill 使用工具链，但无法批准 Stable release。
8. Catalog POC 的 Customer 1.1 artifact 由 SDK toolchain 端到端产生。

