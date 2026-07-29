# Runory Product Definition

Status: Draft v0.4  
Date: 2026-07-29  
Change: Clarify external-super-agent-first strategy, FSM-first product scope, and commercial delivery structure.

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

## 6. Commercial Product Shape

Runory distinguishes product exploration from paid production delivery:

```text
Free product exploration
→ Paid production subscription
→ Bounded implementation
→ Metered provider usage
→ Optional partner-delivered services
```

The Free Workspace should demonstrate the product's end-to-end operating model without silently enabling cost-bearing or regulated production services.

A paid production Workspace may require configuration, provider onboarding, migration, validation, customer approval, and production cutover. Subscription payment alone does not establish production readiness.

Commercial packaging, proposed list prices, implementation bands, provider usage, partner economics, and discount controls are defined in [Commercial Pricing and Packaging](commercial-pricing-and-packaging.md). The operating sequence and implementation controls are defined in [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md).
