# Runory Product Definition

Status: Draft v0.4  
Date: 2026-07-15  
Change: Clarify external-super-agent-first strategy and FSM-first product scope.

## 1. Canonical Definition

Runory is a **Cloud-first, external-Agent-ready FSM platform**: a lightweight, composable business system and governed runtime designed to work with capable external Agents through MCP, Skills, and SDKs.

Runory's first commercial product is Field Service Management. Through v1.0, product scope remains focused on FSM businesses and workflows rather than a broad general-purpose SMB suite.

Runory does not attempt to make a proprietary Built-in Agent the center of the product. It partners with external Super Agents—such as ChatGPT, Codex, Claude, Cursor, Trae, WorkBuddy, and future enterprise Agents—and provides the deterministic business execution environment those Agents need.

```text
Human / Business
        ↓
External Super Agent
        ↓
MCP / Skill / SDK
        ↓
Runory Runtime
        ↓
Governed FSM Execution
```

## 2. What Runory Is

Runory is:

* a **Cloud-first FSM product** with Portable Runtime architecture;
* a composable system of Official Modules, FSM Packs, and Workspace Templates;
* a **Managed Workspace Extension** layer for customer-specific customization;
* a metadata-driven **Runory Runtime** for installation, commands, workflows, permissions, audit, and extensions;
* a schema-driven Dynamic UI shell for desktop and mobile experiences;
* an **MCP / Skill / SDK integration layer** for external Agents;
* a governed business execution layer that preserves authoritative state and upgrade safety;
* a platform with a supported future path to Private or Local deployment.

Core product shape:

```text
External Super Agents
+ MCP / Skill / SDK
+ Runory Cloud
+ SaaS Layer
+ Runory Runtime
+ FSM Modules / Packs / Templates
+ Managed Workspace Extensions
+ Schema-driven UI
+ Authoritative Business Data
```

## 3. What Runory Is Not

Runory is not:

* an FSM application with a proprietary AI assistant added on top;
* an attempt to compete with general-purpose Super Agents;
* an AI Coding tool;
* a traditional low-code visual app builder;
* a general ERP;
* a Local-first developer tool where users modify official module source;
* a temporary application generated from prompts;
* a product in which Agents directly mutate production databases;
* a product that requires Git or local installation for ordinary Cloud users.

## 4. Product Paradigm

Runory follows an **external-Agent-first, configuration-first, extension-first, Cloud-first** model.

External Agents are responsible for:

* understanding user intent;
* planning and explaining work;
* discovering Runory capabilities;
* coordinating Runory with other systems;
* invoking supported tools and workflows.

Runory is responsible for:

* business objects and authoritative data;
* command contracts and domain invariants;
* permissions, validation, transactions, and audit;
* workflow and automation execution;
* Module, Pack, and Extension lifecycle;
* operational UI, diagnostics, and reliable failure handling.

Default user journey:

```text
Verify identity
→ Create Organization + Workspace
→ Select Template / Install FSM Pack
→ Import or create business data
→ Connect an approved external Agent
→ Agent operates through MCP / Skill / SDK
→ Runory validates and executes
→ Business runs
```

## 5. Structural Difference From Traditional Enterprise Software

Traditional enterprise software generally follows this model:

```text
Existing Application
+ Proprietary Built-in Agent
+ Additional AI and automation layers
```

Runory follows a different model:

```text
External Super Agent
+ Lightweight Agent-ready Business System
+ Governed Runtime
```

The goal is to avoid rebuilding language understanding, conversation, planning, and general automation inside every business application.

This enables Runory to keep the SME system thinner while still offering strong intelligence and automation through external Agents.

## 6. Difference From Existing Categories

Compared with traditional SaaS, Runory supports Agent-operated configuration and execution through open, governed interfaces rather than relying only on menus or a vendor-owned internal assistant.

Compared with AI Coding tools, Runory does not ask an Agent to generate a custom application from scratch. It exposes trusted FSM Modules, Packs, metadata, Commands, and Extension APIs.

Compared with low-code platforms, Runory is not primarily a drag-and-drop builder. It is a business runtime with metadata-driven objects, deterministic execution, and upgrade-safe extensions.

Compared with traditional FSM products, Runory is intentionally designed as a reliable execution partner for external Agents.

Compared with WordPress, Runory targets governed business operations rather than websites and applies stronger contracts for permissions, workflow, commands, migration, audit, and rollback.

## 7. Core Product Decisions

### External Agents vs Built-in Agent

Runory does not plan to make a proprietary Built-in Agent the primary product surface in the foreseeable roadmap.

MCP, Skills, and SDKs are core product interfaces. Multiple approved Agents should be able to operate the same Workspace under the same authorization and audit model.

### Configuration Platform vs Generative Platform

Declarative configuration and Managed Workspace Extensions are the default customization mechanisms. Generated code is a last resort and must not become the normal customer customization path.

### Official Module Mutability

Official Modules are read-only from the Workspace perspective. Customer-specific needs are expressed through Managed Workspace Extensions, not by forking module source.

### Agent Access Boundary

Agents must not directly operate the database or bypass business rules.

```text
Agent
→ MCP / Skill / SDK
→ Governed API
→ Named Command
→ Command Contract
→ Permission + Validation + Transaction
→ State + Event + Audit + Outbox
```

### UI Freedom

Runory UI is dynamic but constrained. Views are composed from validated schemas, Module UI Slots, Templates, and approved components. Agents may propose schema changes; Runory validates and renders them.

## 8. Technical Layer Definition

```text
SaaS Layer
Identity, tenancy, Workspace, membership, API keys, audit, usage, billing

Runory Runtime
Metadata, installation, Command Runtime, Workflow Runtime,
Permission Runtime, Extension Runtime, Catalog and release control

Runory Business
FSM Modules, business records, transactions, documents, schedules, visits, payments
```

The database namespace follows the same ownership model:

```text
saas_*
runory_runtime_*
runory_catalog_*
runory_business_*
```

## 9. Cloud To Local Evolution

Runory is **Cloud-first**, while preserving a **Portable Runtime** for supported advanced deployments.

```text
Runory Cloud
→ Export supported Workspace configuration, Modules, Extensions, and data
→ Private / Local Runtime
```

Local / Private deployment is not the default MVP path. It is an advanced deployment mode for customers with justified privacy, control, connectivity, or infrastructure requirements.

Early Cloud does not depend on universal bidirectional Cloud–Local synchronization. Controlled export/import is the preferred initial boundary.

## 10. Product Scope Through v1.0

Runory through v1.0 is a focused Agent-ready FSM product covering:

* demand intake and Contact/Company Lead lifecycle handling;
* Customer, Contact, Site, and Asset context;
* Quote, Contract, Invoice, and Payment;
* Work Order, Visit, Scheduling, Dispatch, and field execution;
* recurring service;
* desktop, mobile, Voice Intake, and customer-facing interactions;
* Agent-operated queries, commands, configuration, Pack adaptation, and supported deployment;
* governed extensions without customer-specific Core forks.

Advanced enterprise FSM capabilities are admitted only when supported by repeated customer evidence.

## 11. Layer Summary

```text
Module     = technical business capability unit
Pack       = commercial FSM delivery unit
Template   = Workspace experience entry
Extension  = Workspace-specific customization
Runtime    = governed capability composition and execution layer
Agent SDK  = MCP / Skill / SDK access surface for external Agents
```

```text
Effective FSM System
=
SaaS Foundation
+ Runory Runtime
+ Official FSM Modules
+ Pack / Template overlays
+ Workspace Extensions
+ User Data
+ External Agent Access
```

## 12. Product Statement

> **Runory builds lightweight FSM systems that work with the world's best Agents.**

> **Agents provide intelligence and orchestration; Runory provides governed business execution and truth.**
