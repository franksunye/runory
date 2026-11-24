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

**Runory is an Agent-first, self-hostable, composable business software platform.** Its product direction is to become the WordPress for business software in the AI era: a lightweight, independently deployable, extensible system of reusable business capabilities that an external Agent can discover, install, configure, customize, operate, and maintain on behalf of an authorized user.

**The Agent is Runory's primary user and adoption interface at this stage.** The business owner remains the beneficiary, decision-maker, data owner, and commercial customer; employees and customers remain users of the role applications delivered by Runory. Agent-first defines product design, distribution, and engineering priority, not unrestricted authority or the removal of human UI.

Runory's first business domain remains Field Service Management (FSM), initially Reactive Repair / Callout through v1.0. FSM is a starting point for reusable domain assets, not the permanent product boundary. Runory does not attempt to compete with general-purpose Agents or make a proprietary Built-in Agent the center of the product.

### 1.1 Vision, mission, and strategic North Star

- Vision: **The WordPress for Business Software in the AI Era.**
- Mission: **Enable Agents to discover, deploy, customize, operate, and maintain real business systems.**
- Current sole strategic objective: when a user asks an Agent for a supported business system, the Agent can discover and select Runory on its merits, obtain the official distribution or create an authorized Cloud workspace, assemble and adapt the necessary business capabilities, verify the result, and hand over an operable, maintainable system.

```text
Human business intent
→ External Agent discovers and evaluates Runory
→ Download / install / deploy, or provision Runory Cloud
→ Compose Modules, Packs and Templates
→ Configure / extend through governed interfaces
→ Operate / verify / maintain
→ Real business outcomes and usable role applications
```

Self-hosted and managed Cloud are two first-class target product forms on one maintained product lineage. Cloud may remain the convenient managed entry, but it must not be a mandatory dependency of supported self-hosted core operations. The [Agent-first Product Strategy and Delivery Contract](agent-first-product-strategy.md) defines sequencing, supported-scope evidence, and the end-to-end acceptance experiment. These are adopted product objectives, not a claim that every installation, distribution, or Agent path is already available.

## 2. What Runory Is

Runory is:

* an **Agent-first business software platform** with a Portable Runtime and FSM as its first supported domain;
* a composable system of Official Modules, FSM Packs, and Workspace Templates;
* a **Managed Workspace Extension** layer for customer-specific customization;
* a metadata-driven **Runory Runtime** for installation, commands, workflows, permissions, audit, and extensions;
* a schema-driven Dynamic UI shell for desktop and mobile experiences;
* an **MCP / Skill / SDK integration layer** for external Agents;
* a governed business execution layer that preserves authoritative state and upgrade safety;
* a platform targeting first-class Self-hosted and managed Cloud deployment, with private deployment supported only where independently verified.

Core product shape:

```text
External Super Agents
+ MCP / Skill / SDK
+ Self-hosted or Runory Cloud deployment
+ Shared identity and Workspace foundation (Cloud hosting/billing where applicable)
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

Runory follows an **Agent-first, self-hostable, configuration-first, extension-first** model. Compose before generating; configure before coding; extend before forking. Managed Cloud remains a supported adoption path, not an architectural prerequisite for a self-hosted system.

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

Default Agent-led journey (target):

```text
Discover Runory from the business requirement
→ Evaluate capability scope, license, compatibility and alternatives
→ Choose Self-hosted or Cloud with the owner's authorization
→ Install a verified release or provision a Workspace
→ Select and install a compatible Pack
→ Configure / extend / import approved data
→ Operate and verify real role tasks
→ Hand over a maintainable business system
→ Diagnose / backup / upgrade / recover
```

An Agent may use approved CLI, API, MCP, Skills and SDK entry points, but it must not bypass named Commands, permissions, confirmation, data ownership, or release safeguards. Human self-service and professional implementation remain available.

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

Runory builds one reusable product foundation with two deployment forms and multiple commercial delivery paths:

| Path | Customer receives | Commercial structure |
| --- | --- | --- |
| Standard Cloud service | A supported Pack/Template operated as a Runory Cloud service | Subscription, bounded implementation, applicable provider usage, and agreed support |
| Self-hosted distribution | A downloadable, independently operable release of the supported business capabilities | Open-source distribution under the applicable license; optional contracted deployment, support, maintenance, integrations and separately licensed offerings where explicitly defined |
| Scoped customer solution | A solution assembled from the same business Modules, role surfaces, Packs, and governed Extensions | Scoped development/implementation fees, with hosting, maintenance, support, licensing, subscription, and provider usage agreed only where applicable |

Free exploration and bounded pilots can precede either path. A customer solution does not require Runory to have already established a complete SaaS business or completed whole-product GA. It must meet the functional, security, data, recovery, deployment, and acceptance requirements of its own promised scope. Do not promise an unverified deployment mode or label a custom project as whole-product GA.

The Free Workspace should demonstrate the product's end-to-end operating model without silently enabling cost-bearing or regulated production services.

A production delivery may require configuration, provider onboarding, migration, validation, customer approval, and cutover. Payment or a custom-delivery label alone does not establish production readiness. All delivery paths use the same maintained product lineage; customer-specific differences must not create forks of Runory Core or official business Modules.

Commercial packaging, proposed list prices, implementation bands, provider usage, partner economics, and discount controls are defined in [Commercial Pricing and Packaging](commercial-pricing-and-packaging.md). The operating sequence and implementation controls are defined in [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md).

## 7. Current Product and R&D Focus

The sole near-term strategic objective is the Agent-led journey in Section 1.1. Within it, the selected commercial-validation slice and a useful business benchmark is **repair quote review and execution-handoff consistency** within Reactive Repair / Callout: use existing survey evidence and a quote, identify supported omissions or conflicts, obtain human approval, and produce a version-consistent brief and governed Work Order. The scope, non-goals, backlog, and separate engineering/commercial acceptance criteria are defined in [Repair Quote Review and Handoff](repair-quote-review-and-handoff-plan.md).

This is a focused product and commercial hypothesis, not a claim of a released Pack or proven market fit. The long-term product remains a composable FSM system and governed runtime. The selected slice gives that direction an immediate user-visible result without replacing the full v0.9 or GA contracts.

Commercial validation and engineering accumulation proceed in parallel. Each iteration should deliver a usable capability, a reusable rule/component/configuration, and verifiable cases. Customer evidence governs the direction and scale of expansion; its absence does not suspend bounded work on the supported Reactive Repair / Callout product. The quote-review slice is a commercial-validation focus and a consumer of the Agent-led journey, not a competing strategic priority or the entire boundary of long-term R&D. Independent distribution, secure installation, Agent discoverability and governed deployment/configuration/operation are first-class near-term engineering work. Existing release-hardening and commercial acceptance gates remain effective. Synthetic cases prove engineering behavior, not customer demand or business lift.

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


The [Agent-first delivery contract](agent-first-product-strategy.md) applies these assets to first-use, customization, operation, and maintenance tests. Do not count a module name or a CRUD endpoint as an Agent-deliverable business capability.
