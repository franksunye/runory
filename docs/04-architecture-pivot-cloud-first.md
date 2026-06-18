# Runory 架构与技术路线变更说明

Status: Approved v1.0  
Date: 2026-06-18  
Supersedes: Local-first assumptions in docs dated 2026-06-17

## 0. 核心结论

Runory 的技术路线从此前的：

> **Local-first：用户本地运行 Runory Core，通过 Codex / Agent 修改业务模块，后续再考虑 Cloud。**

调整为：

> **Cloud-first：Runory Cloud 作为默认产品入口，提供稳定 Core、官方业务模块、Workspace 配置、Agent 配置与托管运行能力；Local / Private Deployment 作为高级部署形态保留。**

这不是放弃 Local，而是改变优先级：

```text
旧路线：
Local Runtime → Local Customization → Cloud Sync / Cloud Service

新路线：
Runory Cloud → Managed Workspace → Agent-driven Configuration → Private / Local Deployment
```

Runory 的长期形态不应再被定义为某个垂直行业软件，而应定义为：

> **面向 SMB 的可组合业务运行平台，接近 SMB 时代的 WordPress。**

```text
Runory Core
+ Official Modules
+ Workspace Templates
+ Business Packs
+ Agent Configuration Layer
+ Marketplace
+ Cloud / Private / Local Deployment
```

## 1. 新旧路线对照

| 维度 | 旧路线：Local to Cloud | 新路线：Cloud to Local |
| --- | --- | --- |
| 默认入口 | 本地运行 | Runory Cloud |
| 默认用户 | 技术用户 / 高级用户 | 普通 SMB 业务用户 |
| Agent 角色 | 本地代码修改助手 | Workspace 配置与运营助手 |
| Core 角色 | 可修改业务底座 | 稳定平台内核 |
| 模块逻辑 | 用户可改模块 | 官方模块 + Managed Workspace Extension |
| 自定义方式 | 改代码 / 改模块 | 受控扩展 |
| 商业化路径 | 慢，偏开发者 | 快，偏 SaaS |
| Local 角色 | 默认产品形态 | 高级部署形态 |
| Marketplace | 后续考虑 | 架构上从第一天预留 |
| 长期形态 | 可本地运行的软件底座 | SMB Business Platform |

## 2. 默认产品入口

新默认用户是 SMB 业务负责人、运营负责人、财务负责人、服务负责人。他们不关心本地部署、Git、MCP 配置、代码修改或数据库连接。

产品入口必须是：

```text
注册 Runory Cloud
→ 创建 Workspace
→ 选择业务 Pack / Template
→ 导入数据
→ Agent 帮助配置
→ 业务开始运行
```

## 3. 目标架构

```text
┌───────────────────────────────────────┐
│              Runory Cloud              │
│  Auth / Billing / Workspace / Hosting  │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│              Runory Core               │
│ Object / Field / View / Workflow / ACL │
│ Event / Audit / Module Lifecycle       │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│          Runory Module System          │
│ Schema / UI / Forms / Actions / Skills │
│ Migration / Dependency / Permissions   │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│        Business Packs / Templates      │
│ CRM / Finance / Field Service / etc.   │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│       Agent Configuration Layer        │
│ Configure / Extend / Analyze / Verify  │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│      Private Cloud / Local Runtime     │
│ For enterprise / compliance / offline  │
└───────────────────────────────────────┘
```

## 4. 七条架构原则

1. **Cloud-first, Portable-runtime** — Cloud 是默认入口；运行时架构必须可迁移。
2. **Core must stay small** — Core 只做平台能力；业务能力属于 Module；业务组合属于 Pack；用户差异属于 Workspace Extension。
3. **No direct customization of official modules** — 官方 Module 可升级；Workspace Extension 承担个性化。
4. **Agent must operate through governed APIs** — Agent Action → Permission Check → Diff → Approval → Apply → Validate → Audit。
5. **Marketplace readiness from day one** — 即使 MVP 没有 Marketplace，也必须有 Manifest、版本、依赖、权限和迁移模型。
6. **Templates are product experience, not just UI theme** — Template 决定业务体验，不只是颜色皮肤。
7. **Local is deployment mode, not product starting point** — Local 是高级部署路径，不是普通 SMB 的默认路径。

## 5. 对 POC / MVP 的直接影响

不要再把 MVP 做成「一个可以本地运行、由 Codex 修改的业务系统」。

应做成：

> **一个 Cloud 上可创建 Workspace、可安装业务 Pack、可由 Agent 受控配置和扩展的 SMB 业务运行平台。**

最小成功标准：

```text
1. 用户可以在 Cloud 创建 Workspace
2. 系统可以安装一个官方 Pack
3. Pack 可以声明对象、字段、视图、表单、权限、流程
4. 用户可以通过 Agent 添加字段、视图、简单流程
5. 所有变更都有 Diff、Audit、Rollback
6. 标准 Pack 不被用户直接修改
7. Workspace Extension 与官方 Module 分离
8. Workspace 配置可以导出，为未来 Local 保留路径
```

## 6. 文档索引

本变更已同步修订以下文档：

* [02-vision.md](02-vision.md)
* [03-architecture.md](03-architecture.md)
* [01-poc-execution-plan.md](01-poc-execution-plan.md)
* [product/product-definition.md](product/product-definition.md)
* [architecture/overview.md](architecture/overview.md)
* [architecture/cloud-to-local-workspace.md](architecture/cloud-to-local-workspace.md)
* [architecture/architecture-decision-record.md](architecture/architecture-decision-record.md)
* [architecture/module-architecture.md](architecture/module-architecture.md)
* [architecture/workspace-extension-architecture.md](architecture/workspace-extension-architecture.md)
* [specifications/extension-manifest-spec.md](specifications/extension-manifest-spec.md)
* [sdk/module-sdk.md](sdk/module-sdk.md)

当前仓库中的 **Local Runtime POC 代码**（`apps/runtime`、`apps/web`）保留为 Portable Runtime 原型与开发沙箱，不再代表产品默认形态。详见 [01-poc-execution-plan.md](01-poc-execution-plan.md)。
