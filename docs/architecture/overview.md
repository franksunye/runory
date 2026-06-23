# Runory Architecture Overview

Status: Draft v0.3
Date: 2026-06-22
Change: Cloud-first pivot — see [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)

This document is the current architecture entry point. It defines system boundaries that should stay consistent across Cloud implementation, modules, extensions, and POC work.

Product definition: [../product/product-definition.md](../product/product-definition.md)  
0.1 key experience scenarios: [../product/v0.1-key-experience-scenarios.md](../product/v0.1-key-experience-scenarios.md)  
0.2 productization plan: [../product/v0.2-productization-plan.md](../product/v0.2-productization-plan.md)  
Architecture decisions: [architecture-decision-record.md](architecture-decision-record.md)  
Repository structure: [repository-structure.md](repository-structure.md)
Cloud to Local deployment: [cloud-to-local-workspace.md](cloud-to-local-workspace.md)  
Current-stage architecture narrative: [../03-architecture.md](../03-architecture.md)
SaaS Core boundaries: [../07-saas-core-boundaries.md](../07-saas-core-boundaries.md)
SaaS Core implementation: [../08-saas-core-implementation-plan.md](../08-saas-core-implementation-plan.md)
Catalog and release control plane: [../09-catalog-release-control-plane.md](../09-catalog-release-control-plane.md)
SDK product and developer experience: [../10-runory-sdk-product.md](../10-runory-sdk-product.md)
Database namespaces: [database-namespaces.md](database-namespaces.md)
Internationalization: [internationalization.md](internationalization.md)

## Canonical Definition

Runory 是 **Cloud-first** 的 Agent-native SMB 业务运行平台——可组合的 Module / Pack / Template 体系，加上 Managed Workspace Extension，由 Built-in Agent 在受治理的 API 上完成配置与运营。

Runory is not an AI Coding tool, traditional low-code platform, general ERP, or a Local-first system where users edit module source.

## System Formula

```text
Runory App
=
Runory Cloud（default）
+ Platform Core
+ Official Modules
+ Business Packs / Workspace Templates
+ Managed Workspace Extensions
+ User Data
+ Optional Private / Local Deployment
```

Runtime relationship:

```text
SMB User
        |
        v
Runory Cloud UI + Built-in Agent（default）
        |
        v
Runory Cloud API / Workspace Runtime
        |
        v
Platform Core
        |
        v
Official Modules → Business Packs → Templates
        |
        v
Managed Workspace Extensions
        |
        v
Turso/libSQL + Object Storage + Schema-driven UI

Advanced path:
Codex / MCP / SDK → same governed APIs → Private / Local Portable Runtime
```

## Layer Responsibilities

### Built-in Agent（默认）

The Built-in Agent is the primary operator for SMB users. It:

* understands business intent;
* recommends Packs and Templates;
* generates Extension and Workflow plans;
* calls Agent Operation APIs with permission checks;
* shows Diff Preview and requests confirmation;
* validates and explains results.

The Agent must not directly operate the database or modify official module source code.

### Codex / MCP / SDK（高级通道）

External Agents connect through MCP or SDK with the **same permission model** as the Built-in Agent. This path serves developers, integrators, and Private deployment—not ordinary SMB onboarding.

### Runory Cloud

Runory Cloud is the default product surface:

* multi-tenant Workspace hosting;
* Auth, Organization, User, Role;
* Module Registry and Install Runtime;
* Workspace Configuration Store;
* Agent Operation API hosting;
* Cloud UI Shell;
* Usage Metering and Billing-ready accounts.

The SaaS identity and tenancy chain is:

```text
Email OTP → User/AuthIdentity → Organization → Workspace
→ RequestContext/Authorization → Business Data
```

Organization is the tenant, ownership, membership, and billing boundary. Workspace is the business data and configuration boundary. Team is deferred and reserved only as a future Organization-scoped permission group.

### Platform Core

Platform Core is a **small, stable kernel**. It provides metadata object runtime, workflow runtime, event system, audit, module lifecycle, extension boundary, agent permission boundary, and API/MCP interfaces.

Core does **not** own industry-specific business logic (CRM flows, FSM dispatch rules, etc.). That belongs to Modules and Packs.

### Official Modules

Official Modules are complete business capability units: schema, objects, fields, views, forms, permissions, workflows, agent skills, migrations, and UI slot declarations.

Production capabilities are distributed through immutable Cloud Catalog Versions, not mutable working-tree files. Validation, Sandbox evidence, release channels, Pack locks, compatibility reports, and rollout state are first-class control-plane records.

The Runory SDK compiles typed capability source into canonical artifacts and provides local validation/testing. It remains separate from private Platform Core persistence and from Cloud release approval.

### Business Packs and Workspace Templates

* **Module** = technical install unit.
* **Pack** = commercial delivery unit (combines modules).
* **Template** = workspace experience (navigation, homepage, terminology, role entry).

### Managed Workspace Extensions

Workspace Extensions are a first-class, auditable configuration layer bound to a Workspace. They add custom fields, views, workflows, rules, dashboards, and agent skills **without modifying official module source**.

### User Data

Business records, files, events, audit logs, extension state, and workspace settings—stored according to metadata definitions with explicit field ownership.

## Non-Negotiable Boundaries

```text
Agent 不直接操作数据库
Agent 不修改官方模块源码
Module / Extension 不绕过 Platform Core
Extension 不覆盖官方模块文件
所有写操作经过 Business Engine / governed APIs
Cloud Agent 与 MCP 共享同一权限模型
```

## Core Runtime Chains

Capability activation chain:

```text
注册 Runory Cloud
→ 创建 Workspace
→ 选择 Template
→ 安装 Business Pack
→ Module Manifest + Migration
→ 注册 Objects / Views / Navigation / Workflows
→ UI 可用
```

Agent configuration chain:

```text
用户提出配置需求
→ Agent 查询 Schema 与 Extension Points
→ 生成 Extension / Workflow Plan
→ Diff Preview
→ 用户确认（如需要）
→ Agent Operation API Apply
→ Audit Log + Rollback Point
→ Effective Runtime Model 重组
→ UI 更新
```

Data-change chain:

```text
用户提供资料
→ Agent 理解和提取
→ governed API / MCP Tool
→ Business Engine
→ Database
→ Business Event
→ SSE / Query Refresh
→ Dynamic UI 更新
```

## Workspace Extension Position

Managed Workspace Extension is a first-class architecture layer.

Rules:

* Extensions must not modify official module source code.
* Extensions must not bypass the Business Engine.
* Extensions are versioned, auditable, schema-validated definitions.
* Core composes Module manifests and Extension manifests at runtime.
* Module upgrades must preserve compatible Extensions.
* Agent apply must support Diff, Audit, and Rollback.

Detailed rules: [workspace-extension-architecture.md](workspace-extension-architecture.md).

## Metadata-Driven Object Model

Business data runs on metadata definitions:

```text
ObjectDefinition / FieldDefinition / RelationDefinition
ViewDefinition / FormDefinition / WorkflowDefinition
```

Field ownership:

```text
Core-owned / Module-owned / Workspace Extension / Agent-computed
```

Ownership affects deletability, upgrade safety, Agent mutability, and API exposure.

## Dynamic UI Boundary

UI = Schema-driven rendering + Composable Layout + UI Slots + Workspace Template.

```text
Module declares UI Slots and view schemas
Template defines navigation, homepage, terminology, role entry
Extension adds fields, columns, widgets within declared slots
Agent proposes schema changes; Runory validates before render
```

Dynamic UI does **not** mean arbitrary Agent-generated React code in production.

Approved component categories (initial):

```text
Table / Form / Metric / Chart / Review Queue
Timeline / Detail Panel / Empty State / Action Bar
```

## Versioning And Upgrade Principles

Runory tracks separate versions for:

```text
Platform Core Version
Module Version
Pack Version
Template Version
Workspace Extension Version
Schema Version
```

Principles:

* modules declare compatible Core ranges;
* extensions declare compatible module ranges;
* risky changes create rollback points first;
* migration failure leaves current runnable version unchanged;
* module upgrades report Extension conflicts;
* uninstall retains data by default unless user chooses deletion.

## Cloud To Local Principle

Runory is **Cloud-first** with **Portable Runtime** architecture.

```text
Cloud = default product entry
Private / Local = advanced deployment mode
Export / Import = preferred path between Cloud and Private（not bidirectional sync first）
```

Cloud architecture must use adapters so runtime can migrate:

```text
Auth / Storage / Queue / LLM / Email / Payment / Search Adapters
```

Detailed notes: [cloud-to-local-workspace.md](cloud-to-local-workspace.md).

## Security And Governance Principles

Agent-operated actions are risk-classified. All applies record: who, through which entry, which API, what changed, before/after, confirmation status, rollback point.

Low-risk: query, non-required custom field, display settings.

Medium-risk: required field, workflow, module install, automation.

High-risk: delete, permission change, batch migration, field type change, payment.

## Current Minimum Documentation Set

* [../product/product-definition.md](../product/product-definition.md)
* [overview.md](overview.md)
* [module-architecture.md](module-architecture.md)
* [workspace-extension-architecture.md](workspace-extension-architecture.md)
* [../01-poc-execution-plan.md](../01-poc-execution-plan.md)
* [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)
* [architecture-decision-record.md](architecture-decision-record.md)

More specialized documents (Marketplace Governance, full permission model, complete canonical object spec, third-party developer guides) should split out when implementation pressure requires them.
