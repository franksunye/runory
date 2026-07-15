# Runory Vision

Status: Draft v0.3  
Date: 2026-07-15  
Change: Clarify Runory's external-super-agent-first strategy and FSM-first commercial focus.

## Vision

> **Every small business should have capable business software without carrying the cost and complexity of enterprise software.**

Runory believes the primary interface to business software is shifting from application-centric interaction to Agent-assisted operation.

In the emerging model, people and businesses increasingly use powerful external Agents—such as ChatGPT, Codex, Claude, Cursor, Trae, WorkBuddy, and future enterprise Agents—to understand intent, plan work, coordinate tools, and automate repetitive activity.

Runory does not attempt to rebuild those Agents inside each business application. Instead, Runory provides the reliable business execution layer they need.

```text
Human / Business
        ↓
External Super Agent
        ↓
MCP / Skill / SDK
        ↓
Runory Runtime
        ↓
Governed Business Execution
```

Runory turns business intent into:

* authoritative business data;
* running FSM capabilities;
* reliable processes and commands;
* governed automation;
* interfaces that appear when needed;
* systems that remain extensible and upgrade-safe.

> **Agents understand and orchestrate. Runory executes and maintains business truth.**

---

## Product Positioning

> **Runory is a Cloud-first, external-Agent-ready FSM platform: a lightweight business system and governed runtime designed to work with the world's best Agents through MCP, Skills, and SDKs.**

Runory's first commercial focus is Field Service Management. The long-term platform model remains composable, but product scope through v1.0 stays focused on real FSM customers and workflows.

Runory provides:

1. **FSM Business Modules and Packs** — installable, upgradable business capabilities;
2. **Workspace Templates** — practical industry and role experiences;
3. **Managed Workspace Extensions** — governed customer-specific adaptation;
4. **Runory Runtime** — metadata, commands, workflows, permissions, audit, installation, and extension execution;
5. **MCP / Skill / SDK interfaces** — the primary Agent integration boundary;
6. **Cloud-first, Portable Runtime architecture** — managed Cloud by default, supported Local / Private deployment later.

Runory does not plan to build a proprietary Built-in Agent as the primary product interface in the foreseeable roadmap. Its strategy is to be a strong partner to the external Agent ecosystem.

---

## Why This Matters

Traditional enterprise software keeps adding internal copilots, assistants, and proprietary Agents on top of already complex applications. That can improve existing products, but it also causes every vendor to duplicate intelligence, orchestration, conversation, and automation layers.

Runory takes a structurally different approach:

```text
Traditional enterprise software
Application + proprietary internal Agent + growing platform complexity

Runory
External Super Agent + lightweight Agent-ready system + governed runtime
```

This allows Runory to keep the SME system thinner while preserving strong intelligence and automation through external Agents.

The result should be:

* lower software and implementation cost;
* less duplicated AI infrastructure;
* freedom to use different current and future Agents;
* faster configuration and industry adaptation;
* a smaller, more stable business-system core;
* automation that is not locked to one software vendor's proprietary Agent.

Runory is therefore not merely an FSM product with AI features.

> **Runory is business software redesigned for a world in which every person or company may already have a capable Agent.**

---

## Core Product Promises

### 1. Thin software, strong capability

Runory concentrates on the capabilities that business systems must own:

* business objects and records;
* command contracts and invariants;
* workflows and permissions;
* audit, idempotency, and outbox;
* modules, packs, and extensions;
* data integrity and operational interfaces.

The external Agent provides language understanding, planning, explanation, and cross-system orchestration.

### 2. External Agents are first-class operators

Approved Agents can use MCP, Skills, and SDKs to:

* inspect supported capabilities and schemas;
* query business data;
* execute governed business commands;
* configure Workspace metadata;
* install and adapt FSM Packs;
* create reports, forms, workflows, and templates;
* assist implementation and supported deployment.

Agents never receive an unrestricted database mutation path.

### 3. Agent executes; user controls

Agent operations follow an explicit lifecycle:

```text
Discover → Plan → Preview → Confirm → Apply → Verify → Audit → Rollback
```

High-risk, low-confidence, and irreversible actions require stronger confirmation or human review.

### 4. Software adapts without forking Core

Official Modules provide standard capabilities. Workspace-specific differences are represented through Managed Workspace Extensions, not customer-specific Core forks.

### 5. Dynamic, but deterministic

LLMs may interpret and orchestrate. Runory Runtime remains responsible for permission, validation, transaction boundaries, authoritative state, audit, events, and failure visibility.

### 6. Cloud-first, portable runtime

Cloud is the default product entry. Workspace configuration, Modules, Packs, Extensions, and supported business data remain compatible with a future Local / Private deployment path.

---

# Product Principles

## 1. External-Agent-first

Runory integrates with capable external Agents instead of making a proprietary Built-in Agent the center of the product.

## 2. FSM-first through v1.0

Runory proves the model in a focused commercial domain before expanding toward a broader SMB platform.

## 3. Business-execution-first

Runory does not deliver generated code as the product. It delivers reliable, governed, running business capabilities.

## 4. Deterministic runtime

Agent intelligence does not replace domain invariants. All writes pass through named Commands, machine-readable contracts, permissions, validation, transactions, audit, and outbox.

## 5. Metadata-driven and composable

Objects, fields, relations, views, forms, workflows, permissions, navigation, and extension points are declared and composed through Modules, Packs, Templates, and Extensions.

## 6. No direct module customization

Official Modules remain immutable from the Workspace perspective. Customer differences belong in Managed Workspace Extensions.

## 7. Human-in-the-loop by risk

The confirmation model depends on operation risk, confidence, reversibility, data sensitivity, and blast radius.

## 8. Open Agent partnership

MCP, Skills, and SDKs are product interfaces—not secondary developer conveniences. Runory should remain usable by multiple Agent ecosystems instead of depending on one model vendor.

## 9. Cloud-first, Portable Runtime

Managed Cloud is the default. Runtime contracts, adapters, exports, and upgrade semantics preserve supported Private / Local deployment options.

## 10. Visible and inspectable outcomes

Users must be able to see what changed, why it changed, who or which Agent changed it, and how to verify or reverse it.

---

# Product Direction

## Through v1.0 — Commercial Agent-ready FSM

Runory must prove that a real field service business can:

* receive and qualify demand;
* manage customers, sites, assets, Quotes, Work Orders, Visits, schedules, invoices, and payments;
* execute work through desktop and mobile experiences;
* use external Agents to query, operate, configure, and implement the system;
* extend customer-specific behavior without forking Core;
* operate reliably in supported Cloud and later Local modes.

## v2.0 — Advanced FSM

Add advanced offline, route, inventory, procurement, integration, and enterprise FSM capabilities only when supported by repeated customer demand.

## v3.0 — Agentic Operations

Expand operational automation, recommendations, exception handling, and specialized Agents while preserving external-Agent interoperability and governed execution.

## v4.0 — Broader SMB Platform

Extend the proven runtime, module, pack, and Agent integration model beyond FSM toward a broader SMB business platform and ecosystem.

---

# Long-term Shape

```text
External Super Agent Ecosystem
ChatGPT · Codex · Claude · Cursor · Trae · WorkBuddy · Enterprise Agents
                              ↓
                       MCP / Skill / SDK
                              ↓
                         Runory Cloud
                              ↓
                         Runory Runtime
Metadata · Commands · Workflow · Permission · Audit · Extension · Catalog
                              ↓
                    FSM Modules and Packs
                              ↓
                    Authoritative Business Data
                              ↓
              Optional Supported Local / Private Runtime
```

Runory's end state is not to become the enterprise software with the largest feature surface or another proprietary Agent platform.

Runory wants to become:

> **The lightweight, governed business execution layer for the Agent era.**

Runory and external Super Agents should be partners:

* Agents provide intelligence, conversation, planning, and orchestration;
* Runory provides business capability, reliable execution, governance, and truth.

---

# Brand Expression

## One-sentence definition

> **Runory turns Agent-directed business intent into governed business execution.**

## Product statement

> **Lightweight business systems, built to work with the world's best Agents.**

## Brand tagline

# **Tell it. Run it.**
