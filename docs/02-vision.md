# Runory 愿景

Status: Draft v0.2  
Date: 2026-06-18  
Change: Cloud-first pivot — see [04-architecture-pivot-cloud-first.md](04-architecture-pivot-cloud-first.md)

## 愿景

> **让每一家小企业，都拥有能够理解需求、持续运行并随业务生长的软件。**

Runory 相信，未来的商业软件不再要求用户学习复杂系统，也不再由固定菜单和预设流程定义。

企业主只需要向 Agent 表达需求、提供资料、发起任务。

Runory 会把这些意图转化为：

* 真实的业务数据；
* 可运行的业务能力；
* 可靠的流程与规则；
* 按需出现的界面；
* 持续演化的业务系统。

> **用户表达业务意图，Runory 让业务真正运行起来。**

---

## 产品定位

> **Runory 是 Cloud-first 的 Agent-native SMB 业务运行平台——接近 SMB 时代的 WordPress，但由 Agent 在受治理的平台结构中完成安装、配置、扩展、验证和持续运行。**

Runory 运行在 Personal Agent OS 之上，但 **Runory Cloud 是普通 SMB 用户的默认入口**，而不是本地 Runtime。

它通过以下方式向 Agent 和用户提供能力：

1. **Business Packs / Workspace Templates**：快速启动完整业务体验；
2. **Official Modules**：可安装、可升级的标准业务能力单元；
3. **Managed Workspace Extensions**：受控的个性化与扩展；
4. **Built-in Agent**：Cloud Workspace 内的配置、操作与分析助手；
5. **MCP / SDK**（高级通道）：供开发者、集成商和私有部署场景使用。

Runory 内部由一个确定性的 **Platform Core** 管理：

```text
Object / Field / View / Form / Workflow
State / Permissions / Audit / Module Lifecycle
```

Agent 负责理解用户意图并将其转换为受控配置变更。

Runory 负责让意图在业务上正确地发生，并保证官方能力可升级、用户差异可隔离。

---

## 核心产品承诺

### 从意图到运行

用户说：

> 我需要费用管理。

Runory 安装相应 Pack，数据开始进入，Dashboard 开始变化。

用户说：

> 给客户增加一个「客户等级」字段。

Agent 创建 Workspace Extension，列表和表单更新，官方 CRM Module 仍可升级。

### 软件适应业务

传统软件要求用户适应系统。

Runory 让软件随着用户的业务需求生长——通过 Pack、Template 和受控 Extension，而不是修改官方模块源码。

### Agent 执行，用户掌控

Agent 完成导入、配置、新增、整理、查询和流程调整。

用户通过 UI 查看、修改、审核和控制关键操作。

### 动态，但不失控

界面和能力可以动态变化，但所有业务操作都经过确定性的规则、权限、事务和审计。Agent 不直接修改数据库或官方模块源码。

### Cloud 优先，运行时可迁移

默认体验在 Cloud；架构从第一天保留 Private / Local 部署路径。Workspace 配置、Extension 和 Module 安装状态应可导出。

---

# 产品原则

## 1. Cloud-first, Portable-runtime

Runory Cloud 是默认产品入口。Core Runtime 必须可独立运行，以支持未来 Private Cloud、VPC、On-premise 和 Local Dev。

## 2. Agent-first

对话是主要入口，UI 是观察和控制界面。Built-in Agent 是 SMB 默认操作层；Codex / MCP 是高级扩展通道。

## 3. Business-first

Runory 交付的不是代码，而是可运行的业务能力。Core 不负责「某类企业怎么经营」，而负责「业务能力如何被定义、安装、组合、扩展、升级和运行」。

## 4. Composable platform

财务、CRM、现场服务、员工等能力通过 Module 和 Pack 按需组合，并共享统一的元数据驱动业务对象模型。

## 5. Deterministic core

LLM 负责理解、建议和编排；Platform Core 和 Business Engine 负责校验、Diff、Apply 和 Audit。

## 6. No direct module customization

用户个性化不得污染官方 Module。所有客户自定义优先落在 **Managed Workspace Extension** 层。

## 7. Human-in-the-loop

低置信、高风险和不可逆操作必须由用户确认或审核。Agent 配置变更必须支持 Diff Preview 和 Rollback Point。

## 8. Visible progress

Agent 完成工作后，用户必须能看到软件真实发生变化：列表增加、指标更新、菜单出现、新页面打开、业务状态改变。

## 9. Marketplace-ready from day one

即使 MVP 没有完整 Marketplace，Module Manifest、版本、依赖、权限和迁移模型必须从架构第一天预留。

Marketplace 之前先完成 Official/Internal Catalog & Release Control Plane：不可变制品、结构化验证、Sandbox、发布通道、Pack dependency lock、Workspace upgrade 和 rollout。详见 [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md)。

Module SDK 必须成为实际开发者产品：typed authoring、local validation、testing harness、artifact build、Internal candidate publish 和 Agent Skill；公共第三方生态延后。详见 [10-runory-sdk-product.md](10-runory-sdk-product.md)。

---

# 产品路标

## Phase 0 — Cloud POC

### 证明 Cloud Workspace 可被 Agent 配置和扩展

目标：

> 验证用户在 Runory Cloud 创建 Workspace、安装 Business Pack，并由 Agent 进行受控 Extension 配置。

核心场景：

* 用户注册并创建 Cloud Workspace；
* 选择 Workspace Template 并安装 CRM Lite 或 Field Service Lite Pack；
* Agent 为客户对象添加「客户等级」字段并更新 View / Form；
* Agent 创建简单审批流程（如报价超过 10 万需经理审批）；
* 所有变更有 Diff、Audit、Rollback；
* Workspace 配置可导出，证明 Cloud-first 不锁死 Local 路径。

成功标志：

> 用户第一次看到演示时，能立即理解：
> 「我在 Cloud 上选了一个业务 Pack，Agent 帮我加了字段和流程，软件真的在运行。」

---

## Phase 1 — MVP

### 建立第一个可持续使用的 Cloud 业务工作区

目标：

> 从演示系统发展为小型企业可以持续使用的 Cloud 业务应用。

核心能力：

* Multi-tenant Cloud Runtime；
* Auth / Organization / User / Role；
* Module Install / Upgrade / Disable；
* Business Pack 与 Workspace Template；
* Managed Workspace Extension；
* Built-in Agent 与 Agent Operation API；
* Diff / Audit / Rollback；
* 数据导入；
* Schema-driven UI Shell；
* 基础 Usage Metering 与 Billing-ready Account Model。

SaaS Core 的当前产品边界已明确为 Email OTP、Organization/Workspace、固定 RBAC、强租户隔离、审计/API Key、Entitlement/Usage/Billing，以及 Migration/Backup/Deletion。Team、SSO/SCIM 与高级合规能力只做架构预留。详见 [07-saas-core-boundaries.md](07-saas-core-boundaries.md)。

成功标志：

* 真实 SMB 连续使用 Cloud Workspace；
* 数据持续积累；
* 用户主要通过 Built-in Agent 完成日常操作与配置；
* UI 用于审核、查看和管理；
* 用户愿意为持续使用付费。

---

## Phase 2 — Vertical Product

### 在一个行业形成完整业务闭环

目标：

> 从通用平台验证，进入一个明确行业并建立真正的业务价值。

首选方向：

* Home Services；
* 小型维修施工企业；
* 小型门店；
* 专业服务企业。

核心能力：

* 行业 Business Pack；
* 行业 Workspace Template；
* 客户、线索、报价、项目、员工、费用、供应商、任务、报表；
* 行业工作流与 Agent Skills。

成功标志：

* 在单一行业中获得明确 PMF；
* Agent 操作替代大量重复性后台工作；
* Runory 成为企业日常经营入口之一。

---

## Phase 3 — Marketplace & Private Deployment

### 从单一产品扩展为平台与高级部署

目标：

> 开放 Module / Pack 生态，并支持企业级 Private / Local 部署。

核心能力：

* Module Marketplace 与开发者账户；
* 第三方 Pack 与 Template；
* Workspace 导出与 Private Cloud 部署；
* Adapter 层（Auth、Storage、Queue、LLM、Email 等）；
* 企业级审计与治理。

成功标志：

* 第三方可以交付行业 Pack 和 Module；
* 大型客户可选择 Private / On-premise 部署；
* Cloud 与 Private 共享同一 Core 与 Module 模型。

---

## Phase 4 — Runory Platform

### 建立 Agent-native Business App 生态

目标：

> 让开发者和行业专家能够为 Runory 构建业务模块，Agent 帮助 SMB 按需发现和安装。

平台组成：

* Module SDK / Pack SDK / Template SDK；
* Business Object SDK；
* Agent Skill SDK；
* MCP Tool SDK；
* Dynamic UI Schema；
* Component Registry；
* Domain Pack Marketplace；
* PAO Adapters。

成功标志：

* Runory 的能力不再只由内部团队建设；
* 多个行业形成独立生态；
* Runory 成为 Personal Agent OS 上的重要 SMB 应用层。

---

# 长期形态

未来的 Runory 是一个 **Headless Business Platform**：

```text
Personal Agent OS
        ↓
Runory Cloud（默认入口）
        ↓
Built-in Agent + MCP / SDK（高级通道）
        ↓
Platform Core
        ↓
Modules · Packs · Templates · Workspace Extensions
        ↓
Business Data · Rules · Workflow · Audit
        ↓
Optional Private / Local Deployment
```

用户大多数时候与 Agent 对话。

Runory 在 Cloud（或 Private Runtime）中持续维护企业的业务状态。

当用户需要查看、比较、审核或配置时，相应 UI 才会出现。

> **对话负责表达意图，Agent 负责完成受控配置，Runory 负责维护业务事实。**

---

# Runory 的终局

Runory 的终局不是成为功能最多的 SMB 软件，也不是成为另一个 AI Coding 平台。

Runory 希望成为：

> **SMB 时代的 WordPress——一个可组合、可扩展、可由 Agent 运营的业务运行平台。**

区别不在于「用户自己装插件、自己处理冲突、自己找开发者」，而在于 **Agent 在受治理的平台结构中完成安装、配置、扩展、验证和持续运行**。

当企业主提出一个新的业务需求时，不再首先寻找、购买和学习一个新的 SaaS。

而是直接告诉 Agent：

> 我现在需要这个能力。

然后由 Runory 让它开始运行。

---

# 品牌表达

## 一句话定义

> **Runory turns business intent into running software.**

中文：

> **Runory 将业务意图转化为真正运行的软件。**

## 品牌承诺

> **Tell Runory what your business needs. Runory makes it operational.**

中文：

> **告诉 Runory 你的业务需要什么，它会让需求真正进入运行。**

## 品牌标语

# **Tell it. Run it.**
