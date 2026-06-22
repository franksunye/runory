---
name: runory-module
description: Use when developing Runory Module/Pack/Template with the SDK toolchain. Coding Agent reads this skill to scaffold, author, validate, test, build and publish Module artifacts using @runory/sdk, @runory/sdk-testing and @runory/cli. The skill does NOT grant release approval authority or bypass Catalog governance.
---

# Runory Module Skill

## 1. 概述

本 Skill 指导 Coding Agent 如何使用 Runory SDK toolchain 开发、验证、测试、构建和发布 Module。

SDK 是 **Business Capability Platform SDK**，其产物是 Module / Pack / Template artifact，以及 validation 和 test evidence。Agent 读取本 Skill 后可以：

- scaffold Module 项目结构；
- 修改 typed definitions（`defineModule` / `definePack` / `defineTemplate` / `defineConfig`）；
- 生成 migration proposal；
- 运行 `runory validate / test / build / publish`；
- 解释 compatibility failure 并生成 release notes；
- 提交 Internal candidate 到 Cloud Catalog。

本 Skill **不提供**：越权凭证、发布旁路、Stable release 批准能力，或绕过 Business Engine 的写入路径。本地 validate/test/build 无需 Cloud 连接；Cloud 连接仅用于 publish、Remote Sandbox validation 和 Release/rollout 操作。

参考来源：
- [docs/10-runory-sdk-product.md](../../docs/10-runory-sdk-product.md) §5.4、§13
- [docs/sdk/module-sdk.md](../../docs/sdk/module-sdk.md)
- [docs/09-catalog-release-control-plane.md](../../docs/09-catalog-release-control-plane.md)

## 2. Module / Pack / Template 边界

| 概念 | 定义 | 范围 |
| --- | --- | --- |
| **Module** | 最小可安装单元，包含 objects / fields / views / permissions / migrations / extensionPoints / agentSkills | 单一业务能力，如 `runory.customer` |
| **Pack** | 多个 Module 的组合，面向特定业务场景，带 frozen dependency lock | 业务场景集合，如 `crm-lite-pack` |
| **Template** | 工作区初始化模板，定义 terminology / navigation / homepage / roleEntry / mobile | 工作区体验入口，如 `small-business-crm` |

关键约束：

- Module 是 **technical install unit**；Pack 是业务组合；Template 是体验入口。
- Module manifest 在 Cloud 和 Portable Runtime 间 **完全一致**，存储/Auth/Queue 差异由 Platform Core adapter 处理。
- 相同 source、SDK version 和 build inputs 必须产生等价 canonical output。
- Build 结果生成 canonical Manifest；Runtime 和 Catalog 以 canonical artifact 为真相源，**不直接执行 TypeScript authoring code**。

## 3. Typed Authoring API

### 3.1 项目配置 `defineConfig`

```ts
// runory.config.ts
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

原则：项目配置可提交 Git；Token / API key / private registry URL **不进入**配置文件；CI 凭证通过 `RUNORY_TOKEN` 提供。

### 3.2 完整 Customer Module 示例 `defineModule`

```ts
// src/module.ts
import { defineModule } from "@runory/sdk";

export default defineModule({
  id: "runory.customer",
  name: "Customer",
  version: "1.1.0",
  coreCompatibility: ">=0.1.0 <0.2.0",

  dependencies: ["runory.organization"],

  objects: [
    {
      key: "customer",
      label: "Customer",
      fields: [
        { key: "name", label: "Name", type: "text", required: true, ownership: "module_owned" },
        { key: "email", label: "Email", type: "email", ownership: "module_owned" },
        { key: "phone", label: "Phone", type: "phone", ownership: "module_owned" },
        { key: "tier", label: "Tier", type: "select", ownership: "module_owned",
          validation: { options: ["A", "B", "C"] } },
      ],
    },
  ],

  permissions: ["customer.read", "customer.write", "customer.admin"],

  views: [
    {
      object: "customer",
      key: "customer_list",
      type: "list",
      label: "Customers",
      config: {
        columns: [
          { field: "name", label: "Name" },
          { field: "email", label: "Email" },
          { field: "tier", label: "Tier" },
        ],
        pageSize: 50,
      },
    },
    {
      object: "customer",
      key: "customer_form",
      type: "form",
      label: "Customer",
      config: {
        sections: [
          {
            title: "Basic",
            fields: [
              { field: "name", required: true },
              { field: "email" },
              { field: "phone" },
            ],
          },
        ],
      },
    },
  ],

  extensionPoints: {
    entities: [
      {
        entity: "customer",
        customFields: {
          enabled: true,
          allowedTypes: ["text", "number", "date", "select", "boolean"],
          maxFields: 50,
          reservedKeys: ["id", "name", "email", "phone"],
        },
        customRelations: {
          enabled: true,
        },
      },
    ],
    views: [
      {
        view: "customer.list",
        slots: [
          { id: "customer.list.columns", type: "column_group",
            allowedExtensions: ["customField"], risk: "low" },
        ],
      },
      {
        view: "customer.form",
        slots: [
          { id: "customer.form.basic_fields.after", type: "field_group",
            allowedExtensions: ["customField"], risk: "low" },
          { id: "customer.detail.actions", type: "action_group",
            allowedExtensions: ["customAction"], risk: "medium" },
        ],
      },
    ],
  },

  migrations: {
    install: "migrations/install.sql",
    upgrade: [
      { from: "1.0.0", to: "1.1.0", script: "migrations/1.0.0_to_1.1.0.sql" },
    ],
    uninstallPolicy: "retain_data",
  },

  upgradePolicy: {
    supportsWorkspaceExtensions: true,
    breakingChangePolicy: "manual_review",
  },
});
```

### 3.3 `definePack`

```ts
import { definePack } from "@runory/sdk";

export default definePack({
  id: "crm-lite-pack",
  name: "CRM Lite Pack",
  version: "1.0.0",
  coreCompatibility: ">=0.1.0 <0.2.0",
  modules: ["runory.organization", "runory.customer", "runory.contact"],
  defaultTemplate: "small-business-crm",
  marketplace: {
    category: "crm",
    license: "runory_official",
    publisher: "runory",
  },
});
```

Pack release 时会一次性 resolve dependency ranges 并冻结 lock；Workspace install 使用 frozen lock，不重新 resolve latest。`marketplace` 字段只在 Pack manifest 中声明，Module manifest 不包含 `marketplace`。

### 3.4 `defineTemplate`

```ts
import { defineTemplate } from "@runory/sdk";

export default defineTemplate({
  id: "small-business-crm",
  name: "Small Business CRM",
  version: "1.0.0",
  terminology: { customer: "客户", contact: "联系人" },
  navigation: ["dashboard", "customers", "contacts"],
  homepage: { layout: "crm_overview", widgets: ["customer_count", "recent_activity"] },
  roleEntry: { owner: "/dashboard", sales: "/customers" },
});
```

## 4. Object / View / Extension Point 设计

### 4.1 Object 与 Field

- Object 通过 `objects[]` 声明，包含 `key` / `label` / `fields`。
- Field 必须声明 `label` 和 `ownership`：`module_owned` 或 `workspace_extension`。Module 升级引入的 field 若与 Extension field 冲突，Core 产出 compatibility report，**绝不静默覆盖**。
- Field `type` 必须是合法枚举值之一：`text` / `email` / `phone` / `number` / `date` / `select` / `boolean`，且必须在 Extension Point 的 `allowedTypes` 范围内（对 extension field 而言）。

### 4.2 View（list / form）

- View 通过 `views[]` 声明，每项包含 `object`（所属 object key）、`key`（view 唯一标识，如 `customer_list` / `customer_form`）、`type`（`list` 或 `form`）、`label` 和 `config`。
- `config` 对 list view 可声明 `columns: [{ field, label }]`、`pageSize`；对 form view 可声明 `sections: [{ title, fields: [{ field, required }] }]`、`actions`。
- Slot 是 Extension 的挂载点，声明在 `extensionPoints.views[]` 中（不是顶层 `views[]`），必须声明 `view`（对应 view key）/ `slots[]`，每个 slot 含 `id` / `type`（`field_group` / `column_group` / `action_group` / `widget_group`）/ `allowedExtensions` / `risk`。
- `risk` 分级：`low`（字段展示）/ `medium`（action）/ `high`（需人工评审）。

### 4.3 Extension Point

Extension Point 在 `extensionPoints.entities[]` 中声明，告诉 Workspace 哪些 entity 允许扩展：

```ts
extensionPoints: {
  entities: [
    {
      entity: "customer",
      customFields: {
        enabled: true,
        allowedTypes: ["text", "number", "date", "select", "boolean"],
        maxFields: 50,
        reservedKeys: ["id", "name", "email", "phone"], // Module 保留，Extension 不可占用
      },
      customRelations: {
        enabled: true,
      },
    },
  ],
  views: [
    {
      view: "customer.list",
      slots: [
        { id: "customer.list.columns", type: "column_group",
          allowedExtensions: ["customField"], risk: "low" },
      ],
    },
  ],
}
```

- `reservedKeys` 是 Module 自留字段，Workspace Extension 不可创建同名 field。
- `customRelations` 只声明 `enabled` 开关；可指向的 object 由 Module 设计时通过 object 定义隐式约束。
- Module 还应声明 `releaseCompatibility.breakingChanges`，用于升级时冲突检测。

## 5. CLI 命令流程

CLI 是 v0.1 本地和 CI command adapter。所有命令支持 `--json`，CI 不解析人类日志。

### 5.1 `runory validate`

```bash
runory validate --entry src/module.ts --type module --json
```

执行：authoring compile → canonical Manifest → SemVer / Core range / dependency 检查 → permission / data ownership 校验 → migration path / checksum → Extension Point validation。

`--json` 输出格式：

```json
{
  "status": "passed",
  "validationId": "val_20260622_customer_1.1.0_a1b2c3",
  "compilerVersion": "0.1.4",
  "manifestSchemaVersion": "1.0",
  "checks": [
    { "name": "semver", "status": "passed" },
    { "name": "core_compatibility", "status": "passed" },
    { "name": "permission_ownership", "status": "passed" },
    { "name": "migration_path", "status": "passed" },
    { "name": "extension_point", "status": "passed" }
  ],
  "errors": []
}
```

`status` 为 `failed` 时 `errors[]` 列出具体失败项；Agent 必须修复后重试，不得跳过。

### 5.2 `runory test`

```bash
runory test --entry src/module.ts --json
```

使用 `@runory/sdk-testing` harness 执行：empty Workspace install → previous Stable → candidate upgrade → fixture data preservation → Extension compatibility → permission / UI schema snapshot。

Harness API：

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

Harness 使用 Platform Runtime 的真实 Installer / Migration / Compatibility code，不重新实现测试专用语义。默认无网络、deterministic fixture IDs / time、isolated temporary database。

### 5.3 `runory build`

```bash
runory build --entry src/module.ts --out dist --json
```

生成产物：

```text
dist/<item-id>-<version>.tar.gz
dist/manifest.json
dist/provenance.json
dist/checksums.json
dist/validation-summary.json
```

`--json` 输出包含 `artifactId` / `version` / `checksum` (SHA-256) / `compilerVersion` / `provenance`。Build **不发布、不创建 Release、不隐式连接 Cloud**。相同输入必须产生等价 checksum。

### 5.4 `runory publish`

```bash
runory publish --channel internal --token $RUNORY_TOKEN --json
```

POC 只允许上传为 Catalog candidate / internal release request：

- 验证 artifact checksum；
- 使用 idempotency key（相同 artifact 重复 publish 不会创建新 version）；
- 输出 Catalog item / version / validation IDs；
- **不允许 CLI 直接发布 Beta 或 Stable**。

`--json` 输出格式：

```json
{
  "status": "uploaded",
  "channel": "internal",
  "catalogItemId": "runory.customer",
  "catalogVersionId": "cv_1.1.0_d4e5f6",
  "validationRunId": "vr_20260622_g7h8i9",
  "idempotencyKey": "sha256:...",
  "artifactChecksum": "sha256:..."
}
```

## 6. 安全规则

1. **无任意代码**：Module 不允许携带任意 React / Node 代码在多租户 Runtime 动态执行。受控 custom component / runtime extension 必须形成独立安全规范后才能引入。优先使用数据声明（Object / Field / View / Permission / Migration reference）。
2. **Migration SQL 占位符**：Migration SQL 必须使用 `{{BUSINESS_TABLE_PREFIX}}` 占位符引用业务表，不得硬编码 `runory_business_*` 物理表名。默认前缀为 `runory_business_`，但 embedded deployment 可通过 `BUSINESS_TABLE_PREFIX` 环境变量覆盖。示例：
   ```sql
   CREATE TABLE {{BUSINESS_TABLE_PREFIX}}customer (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT
   );
   ```
3. **Secret scanner**：Build 时 secret scanner 检测 `.env` / token / private key，命中即拒绝打包进 artifact。
4. **Path escape 防护**：Artifact builder 使用 allowlisted source paths，拒绝路径逃逸（如 `../` 引用项目外文件）。
5. **Build/validate 默认无网络**；Publish credential 不暴露给 Module code、fixture 或 Agent output。
6. **Artifact checksum / provenance / Catalog validation result 三者必须一致**。
7. **SDK telemetry 默认关闭**；未来启用必须显式 opt-in 且不上传业务 fixture / data。

## 7. Catalog Release 治理

```text
Developer / Agent
→ @runory/sdk authoring
→ @runory/sdk-testing
→ runory build
→ runory publish --channel internal
→ Catalog candidate
→ Cloud validation + Sandbox
→ human promotion (Release Manager)
→ Workspace compatibility / install / upgrade
```

- **CLI 只能 publish 到 `internal` channel**。
- **Beta / Stable promotion** 必须由 `release_manager` 在 Platform Catalog Console 或 governed command 操作，Agent 不能成为最终批准者。
- **Stable Release Guard**：Beta cohort 达到最小成功样本、failure rate 低于阈值、无未处理 migration blocker、Release Manager 显式批准。所有 promotion 是高风险 command，必须有 preview、confirmation 和 Audit Event。
- **Security withdrawal**：`security_manager` 可紧急 withdraw compromised release，必须填写原因并产生高风险 Audit Event。
- Catalog Version 达到 `ready` 后，artifact 和 Manifest **不可替换**；任何 fix 必须发新 SemVer version。
- 本地测试成功 **不代表**可以发布 Stable；Cloud Catalog validation 和 Release Manager approval 仍然生效。

## 8. Agent 操作边界

以下操作 Agent **必须停止并请求人工处理**，不得自动执行：

| 操作 | 需要的人工角色 | 原因 |
| --- | --- | --- |
| **Permission expansion approval** | Release Manager / Workspace admin | 权限扩大影响租户安全边界 |
| **Breaking schema / data migration** | Release Manager + 人工评审 | `breakingChangePolicy: manual_review` |
| **Stable promotion** | Release Manager 显式批准 | 高风险 command，需 preview + confirmation + Audit |
| **Rollout all eligible Workspaces** | Release Manager | 影响面广，需可观察、可暂停 |
| **Security withdrawal** | security_manager | 紧急操作，必须填写原因并产生高风险 Audit |

Agent 可以生成 plan、diff、validation 解释、release notes、compatibility report，但 **不能批准**上述操作。Agent 也不得通过环境变量隐式改变生产 Module 行为。

## 9. 证据要求

Agent 输出必须引用真实的 validation / test / build IDs，**不得仅用自然语言声称"测试通过"**。

合规示例：

```text
✅ validate passed
   validationId: val_20260622_customer_1.1.0_a1b2c3
   compilerVersion: 0.1.4
   checks: semver=passed, core_compatibility=passed, permission_ownership=passed,
           migration_path=passed, extension_point=passed

✅ test passed
   testRunId: tr_20260622_customer_1.1.0_j0k1l2
   install=passed, upgrade=passed, data_preservation=passed,
   extension_compatibility=passed

✅ build succeeded
   artifactId: runory.customer@1.1.0
   checksum: sha256:abc123...
   provenance: dist/provenance.json

✅ publish uploaded (internal)
   catalogVersionId: cv_1.1.0_d4e5f6
   validationRunId: vr_20260622_g7h8i9
```

不合规示例（禁止）：

```text
"测试通过了，可以发布。"
```

若某步骤失败，Agent 必须引用对应的 failure ID 和 `errors[]` 内容，并提出修复方案后重试，不得跳过或伪造证据。
