# Runory Product Definition

| Metadata | Value |
| --- | --- |
| Status | `canonical` |
| Topic | `product` |
| Applies to | `v0.5+ / FSM-first through v1.0` |
| Owner | Product / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

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

## 5. Architecture Choice and Competitive Value

Runory's architecture choice is:

```text
External Super Agent
+ Lightweight Agent-ready Business System
+ Governed Runtime
```

The goal is to avoid rebuilding language understanding, conversation, planning, and general automation inside every business application. This choice does not establish exclusive differentiation: the [2026-11-24 market review](../research/fsm-ai-market-review-2026-11-24.md) records external-Agent interfaces and configurable execution capabilities in competing products.

Competitive value must be demonstrated through a concrete business result, reliable governed execution, repeatable implementation, and safe adaptation and upgrade. MCP availability or a broad feature inventory alone does not demonstrate that value.

## 6. Commercial Product Shape

Runory builds one reusable product foundation with two commercial delivery paths:

| Path | Customer receives | Commercial structure |
| --- | --- | --- |
| Standard Cloud service | A supported Pack/Template operated as a Runory Cloud service | Subscription, bounded implementation, applicable provider usage, and agreed support |
| Scoped customer solution | A solution assembled from the same business Modules, role surfaces, Packs, and governed Extensions | Scoped development/implementation fees, with hosting, maintenance, support, licensing, subscription, and provider usage agreed only where applicable |

Free exploration and bounded pilots can precede either path. A customer solution does not require Runory to have already established a complete SaaS business or completed whole-product GA. It must meet the functional, security, data, recovery, deployment, and acceptance requirements of its own promised scope. Do not promise an unverified deployment mode or label a custom project as whole-product GA.

The Free Workspace should demonstrate the product's end-to-end operating model without silently enabling cost-bearing or regulated production services.

A production delivery may require configuration, provider onboarding, migration, validation, customer approval, and cutover. Payment or a custom-delivery label alone does not establish production readiness. Both paths use the same maintained product lineage; customer-specific differences must not create forks of Runory Core or official business Modules.

Commercial packaging, proposed list prices, implementation bands, provider usage, partner economics, and discount controls are defined in [Commercial Pricing and Packaging](commercial-pricing-and-packaging.md). The operating sequence and implementation controls are defined in [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md).

## 7. Current Product and R&D Focus

The selected near-term working priority is **repair quote review and execution-handoff consistency** within Reactive Repair / Callout: use existing survey evidence and a quote, identify supported omissions or conflicts, obtain human approval, and produce a version-consistent brief and governed Work Order. The scope, non-goals, backlog, and separate engineering/commercial acceptance criteria are defined in [Repair Quote Review and Handoff](repair-quote-review-and-handoff-plan.md).

This is a focused product and commercial hypothesis, not a claim of a released Pack or proven market fit. The long-term product remains a composable FSM system and governed runtime. The selected slice gives that direction an immediate user-visible result without replacing the full v0.9 or GA contracts.

Commercial validation and engineering accumulation proceed in parallel. Each iteration should deliver a usable capability, a reusable rule/component/configuration, and verifiable cases. Customer evidence governs the direction and scale of expansion; its absence does not suspend bounded work on the supported Reactive Repair / Callout product. The quote-review slice is the immediate commercial-validation focus, not the entire boundary of long-term R&D. Synthetic cases prove engineering behavior, not customer demand or business lift.

## 8. Durable Business Assets and Rapid Custom Delivery

The R&D objective is a growing set of **reusable business objects, processing logic, and role-specific application capabilities** that can be combined into both a standard service and a customer solution. Runtime infrastructure supports these assets; customers must be able to complete real business tasks with them.

| Asset layer | Accumulation target within the existing FSM scope |
| --- | --- |
| Business objects and relationships | Customer/contact, service site, asset, service/price book, Quote, Work Order, assignment, Visit, service report, Invoice, and Payment; clear ownership, relations, lifecycle, and version semantics |
| Business processing | Calculation and revision, approval, Quote conversion, assignment/scheduling, field forms and evidence, completion/rework, invoicing/payment, and exception recovery through shared Commands |
| Role and user-facing applications | Reusable sales/estimating, dispatch, technician, supervisor, administration, finance, and scoped customer experiences on supported desktop/mobile/Agent surfaces |
| Delivery compositions | Packs, Templates, roles, terminology, forms, workflow defaults, import mappings, adapters, reference configurations, and bounded customer extensions |
| Quality and upgrade assets | Role-task acceptance, business regression cases, permission checks, migration/upgrade/recovery evidence, and delivery diagnostics |

This table states the investment direction, not a claim that every capability is implemented or production-accepted. Maintain the distinction between design, implementation, verified behavior, and actual customer acceptance. Role applications must support a complete task, including permission, handoff, and failure recovery; a generic list/detail screen or an API alone is not sufficient evidence.

Shared technical mechanisms belong in Core/platform services; stable domain objects and invariants belong in official business Modules; supported combinations and defaults belong in Packs/Templates; customer differences belong in configuration, Managed Workspace Extensions, and provider adapters. A dedicated customer UI or code extension is allowed through supported, versioned interfaces with tests and maintenance ownership. New common business capabilities may improve the official product through normal architecture review; do not force every difference into a universal configuration engine.

Measure accumulation by how a **second, comparable customer** can reuse the product: coverage of agreed business acceptance cases, actual implementation and support hours, elapsed time to demo/UAT, customer-specific change volume, and upgrade repair effort. Separate coding time from discovery, data preparation, integration, training, and rework. Customer data and proprietary rules do not become shared assets without appropriate rights.

Custom project revenue and reuse evidence can justify continued investment while SaaS commercialization develops. They do not by themselves prove subscription acquisition, retention, or SaaS unit economics, and they do not replace the existing v0.9/GA gates. The [implementation economics model](implementation-economics-and-productization.md) governs measurement for both paths.

