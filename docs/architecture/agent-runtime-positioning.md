# Runory Agent Runtime Positioning

Status: Draft v0.1  
Date: 2026-07-17

This document records why Runory exists in an era of AI coding tools and the architecture consequences of that position. It complements the [Architecture Overview](overview.md), [Product Definition](../product/product-definition.md), and [Architecture Decision Record](architecture-decision-record.md).

## 1. Problem Statement

AI coding tools can rapidly generate applications, interfaces, data models, and simple workflows. This is valuable for prototypes, internal tools, and early product validation.

Production business software has a different requirement. It must preserve authoritative data and remain secure, auditable, upgradeable, and operable over time. That requires stable foundations for:

* identity, tenancy, roles, and permissions;
* canonical business objects and state transitions;
* validation, transactions, idempotency, and concurrency control;
* workflows, schedules, retries, escalation, and exception handling;
* events, integrations, audit, rollback, and observability;
* module lifecycle, migrations, compatibility, and long-term upgrades.

Without a shared runtime, each AI-generated CRM, CMS, FSM, or internal application must rebuild these foundations. A fast prototype then becomes a productionization project that requires experienced architects and engineers to restructure, harden, test, and maintain it.

Runory addresses this repeated engineering gap.

> **Vibe coding creates applications. Runory makes them operational.**

## 2. Runory's Position

Runory is not another AI coding tool. It is the governed business runtime between open-ended Agent intelligence and production business execution.

```text
Business Intent
      ↓
External Super Agent
      ↓
MCP / Skill / SDK
      ↓
Runory Runtime
      ↓
Governed, Operable Business System
```

External Agents provide language understanding, planning, orchestration, and broad tool use. Runory provides the deterministic execution environment those Agents need:

* trusted business objects and authoritative state;
* named Commands and machine-readable contracts;
* permissions, validation, transactions, and audit;
* workflow and automation runtime;
* Modules, Packs, Templates, and Managed Workspace Extensions;
* reliable integration, failure handling, and upgrade paths.

AI coding tools are optimized for software generation. Runory is optimized for continuous business operation.

## 3. Architecture Objective

Runory minimizes open-ended code generation by exposing stable business capabilities to external Agents.

The preferred adaptation order is:

```text
1. Business Command
2. Declarative Configuration
3. Managed Workspace Extension
4. Core Engineering
```

### 3.1 Business Command

Use an existing named Command for day-to-day business execution, such as creating a Lead, scheduling a Visit, approving a Quote, issuing an Invoice, or sending a notification.

### 3.2 Declarative Configuration

Use metadata to adapt fields, forms, views, roles, permissions, workflows, rules, notifications, reports, and dashboards without generating application code.

### 3.3 Managed Workspace Extension

When configuration is insufficient, add customer-specific behavior within a versioned, schema-validated, auditable extension boundary. Extensions must not modify official Module source or bypass the Runory Runtime.

### 3.4 Core Engineering

Change Platform Core or official Module source only when the capability is reusable, product-owned, reviewed, tested, versioned, and released through the normal lifecycle.

> External Agents should use the lowest sufficient execution level and avoid code generation when an equivalent governed capability already exists.

## 4. Core Design Principle

### Prefer Runtime Composition over Software Regeneration

Runory treats repeated code generation as an exception rather than the default customization mechanism.

Standard business requirements should be fulfilled through reusable Modules, metadata composition, governed Commands, and Managed Workspace Extensions.

In practical terms:

> **Compose before generating. Configure before coding. Extend before forking.**

This principle reduces implementation cost, Agent context size, token consumption, regression risk, and long-term maintenance burden.

## 5. Why Metadata Matters

Metadata allows an Agent to change business behavior without repeatedly reading, modifying, testing, and deploying an application repository.

A business request becomes a bounded, structured change:

```text
Open-ended AI Coding
Read repository
→ infer architecture
→ modify code and schema
→ run tests
→ repair failures
→ deploy

Runory Runtime
Discover capabilities
→ compose metadata or Commands
→ validate
→ preview and confirm
→ apply
→ audit and activate
```

The architectural benefit is larger than token savings. Runtime composition provides predictable execution, preserves system invariants, and keeps customer adaptations compatible with future upgrades.

## 6. Responsibility Boundary

External Agents are responsible for:

* understanding user intent;
* discovering available Runory capabilities;
* selecting the lowest sufficient execution level;
* proposing and explaining changes;
* coordinating Runory with other approved systems.

Runory is responsible for:

* business truth and state ownership;
* command contracts and domain invariants;
* authorization and risk classification;
* validation, transactions, idempotency, and audit;
* workflow scheduling, retries, escalation, and rollback;
* extension isolation and Module upgrade safety;
* operational diagnostics and reliable failure handling.

The boundary is explicit:

```text
Agent proposes and orchestrates.
Runory validates, governs, executes, and records.
```

## 7. Non-Negotiable Consequences

The positioning above requires the following architecture constraints:

* Agents do not directly operate production databases.
* Agents do not modify official Module source in a customer Workspace.
* All governed writes use named Commands and Command Contracts.
* Workflow and Automation orchestrate Commands; they do not bypass domain invariants.
* Dynamic UI uses validated schemas and approved components, not arbitrary generated production code.
* Workspace-specific behavior remains isolated in Managed Workspace Extensions.
* Permissions, audit, rollback, versioning, and compatibility remain Runtime-owned guarantees.
* Cloud UI, MCP, Skills, SDKs, Webhooks, and background jobs share the same authorization and execution boundaries.

## 8. Product and Market Implication

Runory does not replace vibe coding. It provides the production-grade business foundation that vibe-coded systems otherwise have to rebuild and harden repeatedly.

The resulting delivery model is:

```text
Business Requirement
→ External Agent interprets and plans
→ Runory capability is configured or extended
→ Governed Runtime executes
→ Business remains operable and upgradeable
```

The product promise is therefore not merely faster application creation.

> **Runory converts open-ended Agent intelligence into stable, secure, auditable, and upgradeable business execution.**
