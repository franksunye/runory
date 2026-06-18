# Runory 架构说明

Status: Draft v0.2  
Date: 2026-06-18  
Change: Cloud-first pivot — see [04-architecture-pivot-cloud-first.md](04-architecture-pivot-cloud-first.md)

## 1. 产品定义

Runory 是一个 **Cloud-first** 的 Agent-native SMB 业务运行平台。

普通用户通过 Runory Cloud 注册、创建 Workspace、选择 Business Pack / Template，并使用 Built-in Agent 完成配置、操作和分析。

Runory 的核心形态是：

```text
Runory Cloud
+ Platform Core
+ Official Modules
+ Business Packs / Workspace Templates
+ Managed Workspace Extensions
+ Built-in Agent Configuration Layer
+ Optional Private / Local Deployment
```

Runory 不是某个垂直行业软件，而是 **可组合的业务运行平台**——接近 SMB 时代的 WordPress，但由 Agent 在受治理的结构中运营。

## 2. 总体架构

```text
Personal Agent OS
Codex / Claude / TRAE / Cursor（高级通道）
        |
        | Built-in Agent / Skills / MCP
        v
Runory Cloud
  Auth / Billing / Workspace / Hosting
        |
        v
Runory Core（Platform Kernel）
  Object / Field / View / Form / Workflow / ACL
  Event / Audit / Module Lifecycle / Extension Boundary
        |
        v
Runory Module System
  Schema / UI / Forms / Actions / Skills / Migrations
        |
        v
Business Packs / Workspace Templates
  CRM / Finance / Field Service / etc.
        |
        v
Managed Workspace Extensions
  Custom Field / View / Workflow / Rule / Dashboard / Agent Skill
        |
        v
Effective Business App
  Cloud UI Shell + Schema-driven Views + User Data
        |
        v
Optional Private Cloud / Local Runtime
  Enterprise / Compliance / Offline
```

## 3. 各层职责

### Personal Agent OS（高级通道）

Codex、Cursor 等 Agent 通过 MCP / SDK 连接 Runory，适用于：

* 开发者与集成商；
* 私有部署环境；
* 高级自动化与批量操作。

**Codex / MCP 不是普通 SMB 的默认入口。** 普通用户使用 Runory Cloud UI + Built-in Agent。

Agent 负责理解意图、推荐 Pack、生成配置计划、调用受控 API，但不直接修改数据库或官方 Module 源码。

### Runory Cloud

Runory Cloud 是默认产品入口，负责：

* Multi-tenant Workspace 托管；
* Auth / Organization / User / Role；
* Billing-ready Account Model；
* Module Registry 与 Install Runtime；
* Workspace Configuration Store；
* Built-in Agent 运行环境；
* Cloud UI Shell；
* Usage Metering；
* 数据导入与基础 Marketplace Readiness。

### Runory Core

Runory Core 是稳定、通用、少变化的平台内核。

Core **不负责具体行业业务**，而负责：

```text
Workspace / Organization
User / Role / Permission
Object Model / Field Model / Relation Model
View Model / Form Model
Workflow Runtime / Action Runtime
Event Bus / Audit Log
Module Lifecycle / Extension Boundary
Agent Permission Boundary
API / Webhook / MCP Interface
```

一句话：

> Core 不负责「某类企业怎么经营」，Core 负责「业务能力如何被定义、安装、组合、扩展、升级和运行」。

这与 WordPress Core 的逻辑类似：WordPress Core 不决定用户建什么网站；Runory Core 不决定用户经营什么业务。

### Official Business Modules

官方 Module 是完整的业务能力单元，而不是简单页面或功能包。每个 Module 至少包含：

```text
Schema / Objects / Fields / Relations
Views / Forms / Permissions
Workflows / Actions / Rules / Events
Agent Skills / Dashboards
Migrations / Seed Data / Upgrade Policy / Documentation
```

Module 通过 Runory Core 安装、运行和升级。Module 源码对用户只读。

### Business Packs 与 Workspace Templates

需要明确三层交付单元：

```text
Module     = 技术安装单元（Expense、Approval、Budget…）
Pack       = 商业交付单元（Finance Operations Pack、CRM Lite Pack…）
Template   = Workspace 体验入口（导航、首页、术语、默认视图、角色入口）
```

标准分层：

```text
Runory Core → Modules → Business Packs → Workspace Templates → Workspace Extensions
```

### Managed Workspace Extensions

Workspace Extension 是绑定到具体 Workspace 的声明式扩展层。用户个性化 **不得** 直接 fork 或改写官方 Module。

允许的受控扩展：

```text
Custom Field / Object / Relation
Custom View / Form / Workflow / Rule
Custom Dashboard / Agent Skill / UI Slot / Report / Notification
```

不允许普通用户或默认 Agent 直接修改：

```text
Runory Core / Official Module Source
System Migration Logic / Cross-tenant Runtime
Security Boundary / Billing Logic / Module Dependency Resolver
```

详细规范参见 [architecture/workspace-extension-architecture.md](architecture/workspace-extension-architecture.md)。

### Agent Configuration Layer

Agent 是 **Runory Workspace Operator**，职责包括：

```text
业务需求理解 / 模块与 Pack 推荐
Workspace 配置 / 字段扩展 / 流程调整
权限配置 / Dashboard 生成 / 数据导入辅助
异常分析 / 运行验证 / 变更解释 / 升级影响分析
```

Agent 操作必须走受控 API，每一步经过：

```text
Permission Check → Diff Preview → Approval（如需要）→ Apply → Validate → Audit Log → Rollback Point
```

## 4. 两条核心运行链路

### 数据变化链路

```text
用户提供资料
→ Agent 理解和提取
→ Agent Operation API / MCP Tool
→ Business Engine
→ Cloud Database（或 Portable Runtime DB）
→ Business Event
→ SSE / Query Refresh
→ UI 列表、KPI、图表实时更新
```

### 能力变化链路

```text
用户提出新功能需求
→ Agent 推荐 Pack / Module / Extension Plan
→ Module Installer 或 Extension Apply
→ Migration + Manifest 注册
→ 注册 Tools、Views、Navigation、Workflows
→ UI 自动增加菜单和页面
```

**「动态能力」= 安装预置 Module / Pack 或应用受控 Extension**，不是运行时生成生产代码。

## 5. UI 架构

UI 走 **Schema-driven UI + Composable Layout + UI Slots + Workspace Template**。

Module 声明：

```text
Object Detail Layout / List View / Form Sections
Dashboard Widgets / Action Panels / Navigation Items / UI Slots
```

Workspace Template 决定整体体验：

```text
Navigation / Homepage / Dashboard
Role-based entry / Terminology / Default views / Mobile layout
```

Runory Theme 升级为 **Workspace Experience Template**，不只是颜色和视觉皮肤。

## 6. 数据架构

Runory 采用 **元数据驱动的业务对象模型**。

核心抽象：

```text
ObjectDefinition / FieldDefinition / RelationDefinition
ViewDefinition / FormDefinition / WorkflowDefinition / PermissionDefinition
```

字段归属必须明确：

```text
Core-owned Field      → 如 created_at
Module-owned Field    → 如 Customer.name
Workspace Extension   → 如 Customer.vip_level
Agent-generated       → 如 Customer.ai_score（Computed）
```

Cloud Runtime 默认使用：

```text
PostgreSQL + Object Storage + Queue / Async Jobs
```

Portable Runtime（Local / Private）可使用 SQLite + Local Files，通过 Adapter 抽象云服务依赖。

所有写操作必须经过 Runory Business Engine。

## 7. MCP 与 Codex 定位

```text
普通用户：Runory Cloud UI + Built-in Agent
高级用户 / 开发者：Codex / MCP / SDK
企业用户 / 私有部署：Private Runtime + MCP + Controlled Agent
```

MCP 是 Runory 的开放操作协议之一，权限模型与 Cloud 内部 Agent 一致。MCP 可以暴露 Workspace Management、Module Registry、Object Schema、Workflow、Audit 等 API，但 **不能** 暴露数据库 Root 权限、Core 源码修改权限或跨租户访问能力。

## 8. Local / Private Deployment

Local 不再是 MVP 默认体验，而是 **Enterprise / Advanced Deployment Mode**。

适用场景：数据合规、私有网络、行业监管、离线使用、客户已有 IT 团队、需要本地数据库或私有模型。

架构要求 **Cloud-first Product, Portable Runtime Architecture**：

```text
Core runtime 可独立运行
Module manifest / Migration 标准化
Workspace config / Extension 可导出
Audit 可导出 / Agent skill 可声明
Auth / Storage / Queue / LLM / Email / Payment / Search Adapter
```

详见 [architecture/cloud-to-local-workspace.md](architecture/cloud-to-local-workspace.md)。

## 9. 核心设计原则

1. **Cloud-first, Portable-runtime** — Cloud 是默认入口；Runtime 必须可迁移。
2. **Core must stay small** — 业务能力属于 Module；组合属于 Pack；差异属于 Extension。
3. **No direct module customization** — 官方 Module 可升级；Extension 承担个性化。
4. **Agent through governed APIs** — Agent 不直接改代码或数据库。
5. **Metadata-driven objects** — 业务数据基于 Object / Field 定义运行。
6. **Schema-driven UI** — Module 声明 UI Slots；Template 决定体验。
7. **Marketplace-ready** — Manifest、版本、依赖、权限、迁移从第一天预留。
8. **Event-driven UI** — 数据变化通过事件驱动 UI；以 API 数据为真相源。
9. **Upgrade-safe** — Core、Module、Extension 分别版本化；升级前兼容性检查与备份。

## 10. 最终公式

```text
Runory
=
Runory Cloud（默认）
+ Platform Core
+ Official Modules
+ Business Packs / Workspace Templates
+ Managed Workspace Extensions
+ User Data
+ Optional Private / Local Deployment
```

Runory 的本质是：

> 一个 Cloud-first、由 Agent 受控配置、由确定性 Platform Core 执行、通过 Module / Pack 扩展、并允许用户安全定制的 SMB 业务运行平台。
