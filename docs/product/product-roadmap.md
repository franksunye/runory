# Runory Product Roadmap

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product` |
| Applies to | `v0.5–v4.0` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-27 |
| Supersedes | Earlier post-v0.5 milestone roadmaps |
| Superseded by | — |

Demand source of truth: [Commercial FSM Customer Demand Benchmark](../research/commercial-fsm-customer-demand-benchmark.md)  
GA release contract: [Runory 1.0 — 90% Product Coverage, 10% Governed Extension](./v1.0-ga-release-goal.md)  
Companion engineering roadmap: [Engineering Benchmark Adoption Roadmap](./engineering-benchmark-adoption-roadmap.md)  
External benchmark guardrails: [External Benchmark Adoption Guardrails](./external-benchmark-adoption-guardrails.md)

## 1. Roadmap Thesis

Runory remains focused on Field Service Management through v1.0. The goal is not to become a general SMB operating system before product-market validation. The near-term product must solve real FSM work reliably, be commercially implementable for small and medium service businesses, and be validated through real customer projects, including Upwork-sourced demand.

Agent-native customization and deployment remain a core differentiator, but they support the FSM product rather than expand the business scope beyond FSM.

Through v1.0, Runory supports one commercial operating model: **Reactive Repair / Callout**.

The canonical journey is:

```text
request / Voice
→ triage
→ Quote / authorization
→ Work Order
→ dispatch
→ Visit and field evidence
→ completion
→ Invoice / payment
→ aftercare
```

Recurring Service and Project / Installation are separate product shapes and are excluded from v1.0 scope.

```text
v0.5  Freeze the implemented end-to-end FSM transaction baseline, including Voice Intake and Payment
v0.6  Stabilize the shared foundation, then operate an FSM business continuously
v0.7  Commercially close one completed Reactive Repair job through Invoice and payment
v0.8  Configure, customize, and deploy Runory FSM through Agents
v0.9  Validate repeatability across real FSM customers and converge the product
v1.0  Release a complete, stable, commercially supported Agent-native FSM product
v2.0  Add advanced FSM depth
v3.0  Add broader Agentic Operations
v4.0  Expand toward a general SMB platform and ecosystem
```

## 2. Scope Discipline

Each pre-1.0 milestone has one primary product question. Items not required to answer that question remain candidate or deferred scope.

| Version | Primary question |
|---|---|
| v0.5 | Has Runory implemented one governed end-to-end FSM transaction baseline? |
| v0.6 | Is the expanded foundation stable enough for a real FSM business to use Runory continuously? |
| v0.7 | Can one completed Reactive Repair job become an issued, paid, and refundable Invoice without leaving Runory? |
| v0.8 | Can users implement and deploy Runory FSM through approved Agents? |
| v0.9 | Can the same product be delivered repeatedly without customer-specific Core forks? |
| v1.0 | Can Runory be sold, implemented, supported, upgraded, and operated as a complete FSM product? |

Scope enters v1.0 only when it is required by repeated customer evidence inside the canonical Reactive Repair / Callout journey, prevents a destructive future rearchitecture, or is necessary for commercial delivery and product reliability.

### 2.1 Dual-track Release Contract

From v0.6 through v1.0, each version has two binding completion tracks:

```text
Product Track
What FSM business capability becomes commercially usable?

Engineering Maturity Track
What runtime, UX, workflow, platform, and delivery guarantee becomes production-grade?
```

The Product Track is defined in this roadmap. The Engineering Maturity Track is defined in the [Engineering Benchmark Adoption Roadmap](./engineering-benchmark-adoption-roadmap.md). A version is complete only when both tracks pass their release evidence and acceptance gates.

| Version | Binding engineering gate |
| --- | --- |
| v0.6 | Architecture boundaries, Command enforcement, compatibility, observability, and runtime baselines are machine-auditable. |
| v0.7 | Financial and provider-event execution remains correct under retry, concurrency, replay, partial failure, refund, and reconciliation. |
| v0.8 | Agent Capability Contracts, Manifests, Object View foundations, Workflow Builder foundations, and controlled change lifecycle are usable platform capabilities. |
| v0.9 | Packs, migrations, provisioning, upgrades, diagnostics, configuration Diff, and support tooling form repeatable delivery infrastructure. |
| v1.0 | Reliability, security, upgradeability, operability, UX consistency, and supportability meet the documented GA engineering contract. |

External platform research is an input to these gates, not optional background reading. However, research does not create scope directly. Every externally inspired capability must pass the [External Benchmark Adoption Guardrails](./external-benchmark-adoption-guardrails.md), including:

- the four mandatory decision questions;
- one problem, one Runory model;
- explicit Adopt / Adapt / Defer / Reject classification;
- structural-change and complexity budgets;
- a target version, owner, compatibility impact, and acceptance evidence.

## 3. v0.5 Family — Commercial FSM Closure

### v0.5.0 — Governed Business Action Foundation

```text
commands and governed fields
Workflow V2 definitions, instances, and events
work items and generic approval decisions
idempotency, optimistic concurrency, durable audit/outbox
business permission enforcement
```

### v0.5.1 — Mobile Field Work, Forms, and My Work

```text
installable lightweight /m PWA
Today/My Work and personal schedule
Forms 2.0 mobile execution, checklists, evidence, acknowledgment
customer/site/asset service timeline
formal Quote preview, print, and PDF contract
weak-network, security, update, and performance gates
```

### v0.5.2 — Quote Commercial Integrity

```text
price-book items and server-side calculations
composite Quote editor
immutable revision/snapshot lineage
approval, rejection, return, withdrawal, and acceptance
authoritative printable/exportable Quote output
idempotent accepted-Quote to Work Order conversion
```

### v0.5.3 — Planning and Field Execution

```text
resource and technician linkage
assignment lifecycle and manual dispatch
schedule entries, conflict policy, and backlog
calendar, resource timeline, and basic map
Visit and Work Order completion, return, cancellation, and reopen
```

### v0.5.4 — Voice Intake

Primary sources:

- [Voice Intake Product Definition](./voice-intake-product-definition.md)
- [Voice Intake Technical Specification](./voice-intake-technical-spec.md)
- [Voice Intake POC Execution Plan](./voice-intake-poc-execution-plan.md)
- [Voice Intake Integration Boundary](../architecture/voice-intake-integration-boundary.md)

```text
Twilio/Retell inbound-call adapter boundary
caller and customer/site resolution
structured intake and confirmation
provider-safe Work Order creation and scheduling
call lifecycle, transcript, linkage, and audit
idempotent webhook processing
human handoff and follow-up handling
Calls list/detail operational visibility
```

Release gate: an inbound phone call can safely become an identified customer request, Work Order, and optional scheduled Visit without direct database mutation or duplicate creation.

### v0.5.5 — Payment

Primary sources:

- [Payment Product Definition](./payment-product-definition.md)
- [Payment Technical Specification](./payment-technical-spec.md)
- [Payment POC Execution Plan](./payment-poc-execution-plan.md)
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md)

```text
Stripe-first provider-neutral payment boundary
payment request and hosted payment-link creation
Quote, Contract, Invoice, and Work Order linkage
idempotent webhook ingestion
payment-status ledger and reconciliation baseline
refund and failure handling
credential, audit, replay, and operational diagnostics
strict separation from Runory SaaS subscription billing
```

Release gate: a business can request, receive, verify, reconcile, and where required refund a customer payment through governed Runory Commands and provider events.

### v0.5 Feature Freeze

v0.5 freezes after the Voice Intake and Payment foundations. It remains the behavioral compatibility baseline for v0.6.0.

Compatibility evidence includes:

```text
XLink-derived waterproof-repair pilot
neutral HVAC, plumbing, waterproofing, and equipment-repair scenarios
role-separated browser, mobile, voice, and payment acceptance
concurrency, recovery, isolation, webhook, and performance evidence
```

These scenarios protect behavior compatibility; they do not establish multiple commercial operating models for v1.0.

## 4. v0.6 Family — Continuous FSM Operations

v0.6 consolidates the foundation expanded during v0.5 and turns the single-transaction baseline into a system that an FSM business can use every day.

### v0.6.0 — Foundation Architecture Stabilization

Primary sources:

- [v0.6 Foundation Architecture Stabilization Plan](../architecture/v0.6-foundation-architecture-stabilization-plan.md)
- [v0.6 Command Architecture Stabilization TODO](../architecture/v0.6-command-architecture-stabilization-todo.md)
- [Engineering Benchmark Adoption Roadmap — v0.6](./engineering-benchmark-adoption-roadmap.md#4-v06--foundation-correctness-and-engineering-baseline)

```text
generated inventory and v0.5 compatibility fixtures
Core, Platform Service, Module, Provider Adapter, and projection boundaries
Command, Contract, Provider, authorization, and transaction enforcement
shared webhook, Outbox, replay, reconciliation, and integration primitives
Principal, tenant, row-visibility, provisioning, upgrade, and repair consistency
architecture tests, migration evidence, observability, and performance gates
```

Release gate: the v0.5 business baseline remains behavior-compatible while the shared runtime becomes machine-auditable, safely extensible, upgradeable, and operable. The corresponding Engineering Maturity Gate must also pass.

### v0.6 Family Closure

v0.6 is frozen and released at `v0.6.0`. Earlier proposed v0.6 increments remain decision history and are transferred as follows:

| Earlier proposal | Disposition |
| --- | --- |
| Contact/Company Lead Lifecycle and Customer Operations | Existing unified CRM lifecycle retained; follow-up depth remains evidence-driven |
| Recurring Service Baseline | Post-1.0 product discovery |
| Contract, Invoice, and Receivables | Invoice/payment-allocation subset selected for v0.7; Contract and advanced receivables deferred |
| Operational Inbox and Reporting | Invoice outstanding/overdue visibility selected for v0.7; general inbox/reporting deferred |
| Customer Access Baseline | Deferred; remains a later v1.0 journey requirement |
| Real-customer and Commercial Validation Gate | Moved to v0.9 repeatability evidence |

Canonical disposition: [v0.6 Deferred Work Handoff](../architecture/v0.6-deferred-work-handoff.md).

Canonical CRM modeling rule: Lead is a lifecycle stage of Contact or Company, not a separate object.

## 5. v0.7.0 — Commercial Completion

Accepted execution plan: [v0.7 Commercial Completion](./v0.7-commercial-completion-execution-plan.md).  
Engineering gate: [Engineering Benchmark Adoption Roadmap — v0.7](./engineering-benchmark-adoption-roadmap.md#5-v07--transactional-integrity-and-financial-reliability).

```text
accepted Quote
→ governed Work Order and field execution
→ completed Work Order
→ issued Invoice snapshot
→ hosted payment and provider-confirmed allocation
→ paid / outstanding / refunded visibility
```

The release adds the official Invoice Module, Invoice line snapshot, payment allocation, refund reversal, governed issue/void actions, Invoice navigation, and outstanding/overdue workbench visibility.

Explicit non-goals include advanced scheduling, repair inventory, general accounting, tax, credit notes, recurring/project billing, public customer portal, general communications, additional payment providers, and Agent-generated official Module/Pack/Template productization.

Release outcome: one Reactive Repair / Callout job can reach a governed paid Invoice without adding another commercial shape or a general accounting system. The Engineering Maturity Gate must prove correctness under retry, concurrency, replay, partial failure, refund, and reconciliation.

## 6. v0.8 Family — Agent-native FSM Implementation

v0.8 proves Runory's central differentiation through bounded scenarios rather than a full marketplace, universal SDK ecosystem, or autonomous implementation platform.

Engineering gate: [Engineering Benchmark Adoption Roadmap — v0.8](./engineering-benchmark-adoption-roadmap.md#6-v08--agent-platform-product-surface-and-workflow-control).

Benchmark-driven structural changes are limited by the [External Benchmark Adoption Guardrails](./external-benchmark-adoption-guardrails.md). The approved v0.8 set is:

1. Agent Capability Contract;
2. Manifest / Pack / Extension foundation;
3. Object View Framework and Workflow Control Surface.

### v0.8.0 — Agent Configures a Cloud Workspace

An approved Agent can safely:

```text
inspect the current Workspace schema and configuration
add or change governed fields
modify forms, workflows, statuses, notifications, roles, and permissions
create views, reports, and document templates
produce a change plan and Diff
preview, confirm, apply, verify, audit, and rollback changes
```

Workspace customization must remain separate from Runory Core and survive upgrades.

### v0.8.1 — Agent Installs and Adapts an FSM Pack

```text
discover supported FSM Packs
install a Pack into a Workspace
apply Pack configuration and seed data
adapt forms, workflow, fields, reports, and templates through governed Workspace Extensions
run compatibility and acceptance checks
produce an implementation report
```

Initial Pack validation remains within FSM.

### v0.8.2 — Agent Deploys a Supported Local Edition

```text
preflight the target environment
export supported Cloud Workspace configuration and extensions
initialize Local database, storage, identity, and MCP configuration
collect required secrets and provider settings
install through a supported packaged path
run health, acceptance, backup, restore, and upgrade checks
produce deployment and configuration-difference reports
```

### v0.8.3 — Minimal Agent Control Plane and Governance

```text
stable versioned MCP tools for supported FSM operations
Agent identity and delegated authorization
Tool-level and object-level permissions
plan, preview, confirm, apply, verify, audit, and rollback lifecycle
high-risk confirmation and execution limits
Agent Run logs, diagnostics, and task-level evaluation
```

Release outcome: an authorized user can configure Runory Cloud, install and adapt an FSM Pack, and deploy a supported Local edition through governed and observable contracts. Shared Object Views and Workflow Builder acceptance evidence must also pass.

## 7. v0.9 Family — Repeatability and Product Convergence

v0.9 is a validation and convergence release, not a broad feature-expansion release.

Engineering gate: [Engineering Benchmark Adoption Roadmap — v0.9](./engineering-benchmark-adoption-roadmap.md#7-v09--repeatable-delivery-and-product-convergence).

### v0.9.0 — Real FSM Customer Cohort

```text
3–5 real FSM businesses
canonical Reactive Repair / Callout shape
multiple compatible repair/service industries where practical
measure implementation time, support load, reliability, adoption, and business outcomes
```

### v0.9.1 — Reference Solutions and 90/10 Validation

```text
maintained reactive-service reference solution
customer variations assembled from Core + Modules/Packs + Workspace Extensions
no customer solution may fork Runory Core
measure standard product and governed extension coverage
```

### v0.9.2 — Product and Contract Freeze

```text
remove duplicate capabilities and inconsistent object models
unify lifecycle, error, permission, UI, and Agent-tool conventions
freeze supported APIs, MCP contracts, Pack manifests, and extension contracts
publish compatibility, upgrade, deprecation, and known-boundary policies
upgrade earlier customer solutions without data or behavior loss
```

Release outcome: Runory can be delivered repeatedly without customer-specific Core forks. Provisioning, migration, configuration Diff, compatibility, upgrade, diagnostics, and support-tooling evidence must pass.

## 8. v1.0 — Complete Commercial FSM Milestone

v1.0 marks the transition from a development-stage product into a complete, stable, commercially deliverable Agent-native FSM system.

Engineering gate: [Engineering Benchmark Adoption Roadmap — v1.0](./engineering-benchmark-adoption-roadmap.md#8-v10--ga-engineering-and-experience-gate).

### 8.1 FSM Product Completeness

```text
request/Voice intake, customer identification, and triage
Quote/authorization and governed Work Order creation
planning, dispatch, Visit, mobile field execution, Forms, evidence, and report
completion, review/rework, cancellation, reopen, and recovery paths
minimum Invoice, payment allocation, refund, and receivables visibility
customer document/status access and communication for the same job
repair-relevant parts, site, asset, history, and scheduling depth
actionable exception/follow-up inbox and journey reporting
data migration, configurable roles, and implementation readiness
```

### 8.2 Agent-native Completeness

An authorized user can use an approved Agent to:

```text
query and operate the FSM business
change governed Workspace configuration
install and adapt a supported FSM Pack
create views, reports, forms, workflows, and templates
run supported migration and verification tasks
deploy and upgrade a supported Local environment
diagnose supported system and integration problems
```

### 8.3 Commercial-delivery Completeness

```text
published packaging and pricing
standard implementation and acceptance process
support and SLA policy
security, privacy, retention, and incident policy
backup, restore, migration, and upgrade procedures
standard customer onboarding and data-import path
clear Cloud, Local, Pack, and extension support boundaries
```

### 8.4 Quality and GA Gates

```text
real FSM customers operate stably on maintained reference solutions
critical FSM journeys have repeatable end-to-end coverage
tenant isolation and permission boundaries are validated
backup/restore, migration, and upgrade drills pass
Agent operations meet correctness, security, audit, and rollback requirements
performance and infrastructure cost remain within published baselines
normal operation does not require direct database repair
```

The GA gate also requires a current-market benchmark review. The review identifies table stakes and accepted gaps; it does not require feature parity. All recommendations remain subject to the benchmark guardrails.

GA outcome: Runory is a focused Reactive Repair / Callout FSM product that can complete one commercial journey end to end, be sold and implemented, customized through Agents, deployed in supported Cloud or Local modes, operated reliably, and upgraded without customer-specific Core forks.

## 9. Post-1.0 Direction

Post-1.0 versions are directional themes, not current delivery commitments.

### v2.0 — Advanced FSM

```text
recurring Route/Maintenance Service discovery
project/installation Service discovery
full offline-first field runtime
advanced route optimization and GPS
advanced inventory and procurement
accounting and financial integrations
advanced customer portal and communication channels
enterprise-grade FSM capabilities supported by real demand
```

### v3.0 — Agentic Operations

```text
operational follow-up Agents
technician assistant
intelligent scheduling and dispatch recommendations
anomaly, delay, rework, churn, and renewal detection
assisted quoting and service-report generation
Agent evaluation, governance, and operational automation at scale
```

### v4.0 — SMB Platform and Ecosystem

```text
business domains beyond FSM
broader Module and Pack marketplace
third-party developer ecosystem
general-purpose business modules
broader Local, VPC, and enterprise deployment options
progress toward the long-term SMB WordPress vision
```

## 10. Version Milestone Summary

| Version | Product conclusion | Binding engineering conclusion |
|---|---|---|
| v0.5 | Runory has an implemented end-to-end FSM transaction baseline. | The v0.5 behavior baseline is frozen as compatibility evidence. |
| v0.6 | Runory has a stabilized foundation and can continuously operate an FSM business. | Architecture boundaries, Command enforcement, compatibility, observability, and runtime baselines are auditable. |
| v0.7 | Runory closes the highest-value gaps in the canonical Reactive Repair / Callout journey. | Financial and external-event execution is correct under retry, concurrency, replay, partial failure, and reconciliation. |
| v0.8 | Runory FSM can be configured, adapted, and deployed through approved Agents. | Agent contracts, Manifests, Object Views, Workflow Builder, and governed change lifecycle are usable platform capabilities. |
| v0.9 | The same product can be delivered repeatedly without Core forks. | Provisioning, Packs, migrations, upgrades, diagnostics, configuration Diff, and support tooling are repeatable. |
| v1.0 | Runory is a complete, stable, commercially deliverable Agent-native FSM product. | Reliability, security, upgradeability, operability, UX consistency, and supportability meet GA standards. |
| v2.0 | Runory adds advanced FSM depth. | Engineering scope is defined when the product theme becomes active. |
| v3.0 | Runory adds broader Agentic Operations. | Engineering scope is defined when the product theme becomes active. |
| v4.0 | Runory expands toward a general SMB platform and ecosystem. | Engineering scope is defined when the product theme becomes active. |

## 11. Cross-Version Architecture Commitments

```text
AI and automation call the governed Command catalog
portal, mobile, voice, payment, Agent, and desktop share object and permission contracts
commercial documents retain typed invariants
Workspace Extensions and FSM Packs configure shared runtimes rather than fork Core
Cloud and Local implement compatible supported contracts
external delivery uses outbox, idempotency, replay, and visible failure
Agent operations use plan, preview, permission, validation, audit, verification, and rollback
```

The benchmark-adoption process must reinforce these commitments. No external pattern may introduce a second mutation path, incompatible object model, parallel workflow runtime, or page-specific infrastructure that bypasses shared platform contracts.

## 12. Scope Admission Rule

A requirement enters an earlier milestone only when at least one is true:

1. it is required to complete that milestone's promised FSM user journey;
2. deferring it would force a destructive rearchitecture;
3. it appears repeatedly across credible FSM customer demand and materially affects sales, implementation, or daily operation;
4. it is required by the binding Engineering Maturity Gate and passes the [External Benchmark Adoption Guardrails](./external-benchmark-adoption-guardrails.md).

A customer calling an entire suite an MVP is evidence of demand, not automatic evidence of release sequencing.