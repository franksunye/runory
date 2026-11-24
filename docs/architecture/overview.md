# Runory Architecture Overview

| Metadata | Value |
| --- | --- |
| Status | `canonical` |
| Topic | `architecture` |
| Applies to | Current architecture; Agent-first, Self-hosted and Cloud |
| Owner | Architecture / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | Earlier Cloud-first-only and Built-in-Agent-default interpretation |
| Superseded by | — |

This document is the current architecture entry point. It defines system boundaries that should stay consistent across Cloud implementation, modules, extensions, and POC work.

Product definition: [../product/product-definition.md](../product/product-definition.md)  
0.1 key experience scenarios: [../product/v0.1-key-experience-scenarios.md](../product/v0.1-key-experience-scenarios.md)  
0.2 productization plan: [../product/v0.2-productization-plan.md](../product/v0.2-productization-plan.md)  
Architecture decisions: [architecture-decision-record.md](architecture-decision-record.md)  
Contract-driven Commands: [contract-driven-command-architecture.md](contract-driven-command-architecture.md)
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

Runory is an **Agent-first, self-hostable, composable business software platform**. Its stable Runtime, business Modules, Packs, Templates and Managed Workspace Extensions serve external Agents and human role applications through shared governed business contracts. FSM is the first domain; managed Cloud and Self-hosted are first-class target product forms. The [Agent-first product strategy](../product/agent-first-product-strategy.md) specifies the primary adoption journey and acceptance; the [deployment contract](cloud-to-local-workspace.md) defines the independent installation boundary.

Runory is not an AI Coding tool, a traditional low-code platform, a general ERP, or a system that requires a customer to fork official Module source.

## System Formula

```text
External Agent (discover / deploy / configure / operate / maintain)
    + Human role applications
    ↓ CLI / API / MCP / Skills / SDK
Shared Runory Runtime + identity / Workspace / authorization
    ↓
Official Modules + Packs / Templates + Managed Extensions
    ↓
Authoritative business data and adapter-backed infrastructure

Deployment: Self-hosted OR managed Runory Cloud
```

The same business contracts and assets run in both forms. Cloud adds hosted control-plane, operations and billing services; the supported Self-hosted distribution must be able to operate its included core independently.

## Layer Responsibilities

### External Agent (primary product user)

An approved external Agent discovers Runory, evaluates capability and deployment fit, obtains an official release or provisions a Cloud workspace, configures and adapts it, operates named business Commands and verifies results. CLI, MCP, Skills, SDK and documented APIs are first-class interfaces. The Agent requests required authorization and must not bypass business permissions, directly mutate production tables, or edit official Module source as a customer-specific customization path.

### Human role applications

Desktop, mobile and scoped customer surfaces provide complete work for business owners, sales, dispatchers, technicians, supervisors, finance and customers. They share the same identity, permissions, business state and Commands with external Agents. A proprietary Built-in Agent is not required.

### Self-hosted and Runory Cloud

The independent distribution targets secure initialization, persistent data and files, supported job scheduling and provider adapters, health checks, backup/restore, upgrades, and ordinary business use without a mandatory Cloud account. Runory Cloud provides managed Workspace hosting, identity and membership, Catalog and configuration, usage metering/billing and operational services. Cloud-specific mechanisms must not become mandatory dependencies for the supported self-hosted business path.

The identity and tenancy chain is:

```text
Authenticated Principal → Organization → Workspace
→ RequestContext/Authorization → Business Data
```

Organization is the tenant, ownership and membership boundary; Workspace is the business data and configuration boundary. Cloud billing is an additional service concern. Team remains reserved for future Organization-scoped permission grouping.

### Platform Core

Platform Core is a **small, stable kernel**. It provides metadata object runtime, workflow runtime, event system, audit, module lifecycle, extension boundary, agent permission boundary, and API/MCP interfaces.

Core does **not** own industry-specific business logic (CRM flows, FSM dispatch rules, etc.). That belongs to Modules and Packs.

### Official Modules

Official Modules are complete business capability units: schema, objects, fields, views, forms, permissions, workflows, agent skills, migrations, and UI slot declarations.

Production capabilities are distributed through immutable, validated Catalog versions or the corresponding verified Self-hosted release artifacts, not mutable working-tree files. Validation, Sandbox evidence, release channels, Pack locks, compatibility reports, and rollout state are first-class control-plane records.

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
Agents do not directly operate the database
Agents do not modify official module source
Modules / Extensions do not bypass Platform Core
Extensions do not overwrite official module files
All writes go through the Business Engine / governed APIs
Human interfaces, external Agents and MCP share the same permission model
```

## Core Runtime Chains

Capability activation chain:

```text
Discover / choose verified Self-hosted release or Runory Cloud
→ Initialize authorized owner and Workspace
→ Select Template
→ Install Business Pack
→ Module Manifest + Migration
→ Register Objects / Views / Navigation / Workflows
→ UI becomes available
```

Agent configuration chain:

```text
User submits a configuration request
→ Agent queries Schema and Extension Points
→ Generate Extension / Workflow Plan
→ Diff Preview
→ User confirms (if required)
→ Agent Operation API Apply
→ Audit Log + Rollback Point
→ Effective Runtime Model is recomposed
→ UI updates
```

Data-change chain:

```text
User provides information
→ Agent understands and extracts it
→ governed API / MCP Tool
→ named Command
→ machine-readable Command Contract
→ Command Runtime (validation + atomic capability effects)
→ authoritative state + Domain Event + Audit + Outbox
→ SSE / Query Refresh
→ Dynamic UI updates
```

Governed business change follows the platform-wide **Command + Contract +
Runtime** architecture. Workflow and Automation orchestrate named Commands; they
do not replace domain invariants or mutate governed fields directly. See
[Contract-Driven Command Architecture](contract-driven-command-architecture.md).

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

## Deployment Portability Principle

```text
Self-hosted = independent, installable product
Cloud = managed product
One maintained Runtime, business model and release lineage
Controlled export/import = individually verified portability paths
```

Use existing adapters for identity, persistence, storage, jobs, optional model and provider integrations. Defer multi-master synchronization and unsupported deployment profiles. See [Self-hosted and Cloud Deployment Contract](cloud-to-local-workspace.md).

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
