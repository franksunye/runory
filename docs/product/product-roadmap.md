# Runory Product Roadmap

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product` |
| Applies to | `v0.5–v4.0` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-20 |
| Supersedes | Earlier post-v0.5 milestone roadmaps |
| Superseded by | — |

Demand source of truth: [Commercial FSM Customer Demand Benchmark](../research/commercial-fsm-customer-demand-benchmark.md)  
GA release contract: [Runory 1.0 — 90% Product Coverage, 10% Governed Extension](./v1.0-ga-release-goal.md)

## 1. Roadmap Thesis

Runory remains focused on Field Service Management through v1.0. The goal is not to become a general SMB operating system before product-market validation. The near-term product must solve real FSM work reliably, be commercially implementable for small and medium service businesses, and be validated through real customer projects, including Upwork-sourced demand.

Agent-native customization and deployment remain a core differentiator, but they support the FSM product rather than expand the business scope beyond FSM.

Through v1.0, Runory supports one commercial operating model:
Reactive Repair / Callout. The complete reference journey is request/Voice,
triage, Quote/authorization, Work Order, dispatch, Visit, field evidence,
completion, Invoice/payment, and aftercare. Recurring Service and
Project/Installation are separate product shapes and are excluded from the 1.0
scope.

```text
v0.5  Freeze the implemented end-to-end FSM transaction baseline, including Voice Intake and Payment
v0.6  Stabilize the shared foundation, then operate an FSM business continuously
v0.7  Add the high-value advanced FSM capabilities repeatedly needed by SME customers
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
| v0.7 | Does Runory cover the advanced capabilities that repeatedly block SME FSM adoption? |
| v0.8 | Can users implement and deploy Runory FSM through approved Agents? |
| v0.9 | Can the same product be delivered repeatedly without customer-specific Core forks? |
| v1.0 | Can Runory be sold, implemented, supported, upgraded, and operated as a complete FSM product? |

Scope enters v1.0 only when it is required by repeated customer evidence
inside the canonical Reactive Repair / Callout journey, prevents a destructive
future rearchitecture, or is necessary for commercial delivery and product
reliability.

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

v0.5 freezes after the Voice Intake and Payment foundations. It remains the
behavioral compatibility baseline for v0.6.0; it does not wait for a separate
v0.5.6 commercial release gate.

The following evidence moved into v0.6.0 compatibility acceptance:

```text
XLink-derived waterproof-repair pilot
neutral HVAC, plumbing, waterproofing, and equipment-repair scenarios
role-separated browser, mobile, voice, and payment acceptance
concurrency, recovery, isolation, webhook, and performance evidence
```

These scenarios protect behavior compatibility; they do not establish multiple
commercial operating models for 1.0. Landscaping, pool/route service, and
project/installation evidence remains market research until a post-1.0 product
decision admits those shapes.

## 4. v0.6 Family — Continuous FSM Operations

v0.6 first consolidates the foundation expanded during v0.5, then turns the
single-transaction baseline into a system that an FSM business can use every
day.

### v0.6.0 — Foundation Architecture Stabilization

Primary sources:

- [v0.6 Foundation Architecture Stabilization Plan](../architecture/v0.6-foundation-architecture-stabilization-plan.md)
- [v0.6 Command Architecture Stabilization TODO](../architecture/v0.6-command-architecture-stabilization-todo.md)

```text
generated inventory and v0.5 compatibility fixtures
Core, Platform Service, Module, Provider Adapter, and projection boundaries
Command, Contract, Provider, authorization, and transaction enforcement
shared webhook, Outbox, replay, reconciliation, and integration primitives
Principal, tenant, row-visibility, provisioning, upgrade, and repair consistency
architecture tests, migration evidence, observability, and performance gates
```

Release gate: the v0.5 business baseline remains behavior-compatible while the
shared runtime becomes machine-auditable, safely extensible, upgradeable, and
operable.

### v0.6 Family Closure

v0.6 is frozen and released at `v0.6.0`. The previously proposed
`v0.6.1–v0.6.6` increments were not started or released. They are preserved as
decision history and transferred as follows:

| Earlier proposal | Disposition |
| --- | --- |
| Lead and Customer Operations | `V06-P01`, v0.7 candidate discussion |
| Recurring Service Baseline | `V06-P02`, post-1.0 product discovery |
| Contract, Invoice, and Receivables | `V06-P03`, v0.7 candidate discussion |
| Operational Inbox and Reporting | `V06-P04`, cross-cutting v0.7 candidate |
| Customer Access Baseline | `V06-P05`, reconcile with v0.7.3 |
| Real-customer and Commercial Validation Gate | `V06-P06`, v0.9 repeatability evidence |

Canonical disposition:
[v0.6 Deferred Work Handoff](../architecture/v0.6-deferred-work-handoff.md).
The next planning document is
[v0.7 Planning Brief](./v0.7-planning-brief.md).

Release outcome: v0.6 provides the accepted, machine-auditable Foundation on
which the next customer-selected FSM capability can be built. It does not claim
that every earlier continuous-operations proposal shipped.

## 5. v0.7 Family — High-value Advanced FSM

v0.7 is not a general enterprise or advanced-technology release. It adds only advanced capabilities that repeatedly appear in SME FSM customer demand and materially affect sales, implementation, or daily operation.

Architecture handoff from v0.6:
[v0.6 Deferred Work Handoff](../architecture/v0.6-deferred-work-handoff.md).
Only safe Module-upgrade integration (`V06-D01`) and conditional inventory
expansion (`V06-D02`) enter v0.7 planning. Neither authorizes a new generic
framework or expands v0.7 product scope by itself.

Discussion source:
[v0.7 Planning Brief](./v0.7-planning-brief.md).

### Candidate closure themes

Every theme below is admitted only to close the canonical Reactive Repair /
Callout journey. It must not grow into a second commercial operating model.

#### v0.7.0 — Advanced Scheduling and Resource Management

```text
technician skills, territory, availability, capacity, and working-time constraints
service duration, SLA, priority, and travel-time inputs
assignment and time-slot recommendations
batch rescheduling and conflict detection
manual route/day sequencing
human override with reason and audit
```

#### v0.7.1 — Repair Parts and Materials Baseline

```text
product, part, material, unit, and specification catalog
warehouse and vehicle stock locations
reservation, issue, consumption, return, loss, adjustment, and count
job-level material cost
low-stock and replenishment signals
basic replenishment signal where reactive-repair evidence requires it
```

#### v0.7.2 — Multi-site, Asset, and Service-history Depth

```text
multiple customer locations and asset hierarchies
asset-specific forms, service history, warranty, and maintenance context
site access, contact, instruction, and compliance records
asset and site visibility across Quote, Work Order, Visit, Contract, and Invoice
```

#### v0.7.3 — Customer Portal and Communication Depth

```text
customer request and booking management
status, appointment, document, payment, and service-history visibility
customer uploads, approvals, surveys, and review requests
provider-neutral SMS and email notifications
communication preference and delivery history
```

#### v0.7.4 — Data Migration, Roles, and Implementation Readiness

```text
repeatable customer/contact/site/asset/work-history import
mapping, validation, dry run, error handling, and rollback
flexible user and role configuration
implementation templates and acceptance scenarios
operational diagnostics and support tooling
productized Module upgrade preflight, impact analysis, rollback, and repair evidence
```

The Module-upgrade item is the destination for `V06-D01`. Candidate analysis
must execute against the same real upgrade mutation path; a standalone
compatibility analyzer is not a v0.7 deliverable.

### Candidate scope, admitted only by repeated customer evidence

```text
basic accounting connectors
additional payment or telephony providers
limited offline capture for specific field scenarios
basic route assistance
industry-specific Pack capabilities
```

### Deferred beyond v1.0

```text
recurring Service Plans, generated route work, pause/skip/renewal, and recurring billing
project/installation stage, milestone, commissioning, and progress-billing management
full native offline-first runtime
real-time GPS tracking
algorithmic route optimization
predictive maintenance
complex AI dispatch
bank feeds and full accounting
enterprise SAML/SCIM
large-enterprise segregation and global compliance
complete procurement and supply-chain management
```

Release outcome: Runory covers the high-value advanced capabilities repeatedly required by SME FSM customers without expanding into premature enterprise complexity.

## 6. v0.8 Family — Agent-native FSM Implementation

v0.8 proves Runory's central differentiation through three bounded scenarios. It does not require a full marketplace, universal SDK ecosystem, or fully autonomous implementation platform.

### v0.8.0 — Agent Configures a Cloud Workspace

An approved Agent such as Codex or Claude can safely:

```text
inspect the current Workspace schema and configuration
add or change governed fields
modify forms, workflows, statuses, notifications, roles, and permissions
create views, reports, and document templates
produce a change plan and Diff
preview, confirm, apply, verify, audit, and rollback changes
```

Workspace customization must remain separate from Runory Core and survive upgrades.

This milestone admits the v0.6 `V06-D03`/`V06-D04` handoff only when the first
approved external Agent is the real consumer. It includes versioned,
tenant-scoped capability discovery plus the minimum public SDK template and
generated Contract fixtures required by that scenario; it does not introduce
an Agent-only Runtime or business mutation path.

### v0.8.1 — Agent Installs and Adapts an FSM Pack

```text
discover supported FSM Packs
install a Pack into a Workspace
apply a Pack configuration and seed data
adapt forms, workflow, fields, reports, and templates through governed Workspace Extensions
run compatibility and acceptance checks
produce an implementation report
```

Initial Pack validation should stay within FSM, for example HVAC, plumbing, waterproofing, landscaping, pool service, or installation work.

### v0.8.2 — Agent Deploys a Supported Local Edition

```text
preflight the target environment
export supported Cloud Workspace configuration and extensions
initialize the Local database, storage, identity, and MCP configuration
collect required secrets and provider settings
install through a supported containerized or packaged path
run health checks, acceptance checks, backup, restore, and upgrade verification
produce a deployment and configuration-difference report
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

Release outcome: an authorized user can use an approved Agent to configure Runory Cloud, install and adapt an FSM Pack, and deploy a supported Local edition through governed and observable contracts.

## 7. v0.9 Family — Repeatability and Product Convergence

v0.9 is a validation and convergence release, not a broad feature-expansion release.

### v0.9.0 — Real FSM Customer Cohort

```text
3–5 real FSM businesses
all operating the canonical reactive-repair/callout shape
multiple compatible repair/service industries represented where practical
prioritize customers acquired through Upwork and other direct market channels
measure implementation time, support load, reliability, adoption, and business outcomes
```

### v0.9.1 — Reference Solutions and 90/10 Validation

```text
maintained reactive-service reference solution
customer/industry variations assembled from Core + Modules/Packs + Workspace Extensions
no customer solution may fork Runory Core
measure standard product coverage and governed extension coverage
```

### v0.9.2 — Product and Contract Freeze

```text
remove duplicate capabilities and inconsistent object models
unify lifecycle, error, permission, UI, and Agent-tool conventions
freeze supported public APIs, MCP contracts, Pack manifests, and extension contracts
publish compatibility, upgrade, deprecation, and known-boundary policies
upgrade earlier customer solutions without data or behavior loss
```

Release outcome: Runory can be delivered repeatedly to FSM customers without customer-specific Core forks.

## 8. v1.0 — Complete Commercial FSM Milestone

v1.0 marks the transition from a development-stage product into a complete, stable, commercially deliverable Agent-native FSM system.

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

GA outcome: Runory is a focused Reactive Repair / Callout FSM product that can
complete one commercial journey end to end, be sold and implemented,
customized through Agents, deployed in supported Cloud or Local modes, operated
reliably, and upgraded without customer-specific Core forks.

## 9. Post-1.0 Direction

Post-1.0 versions are directional themes, not current delivery commitments.

### v2.0 — Advanced FSM

```text
recurring Route/Maintenance Service product discovery
project/installation Service product discovery
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

| Version | Product conclusion |
|---|---|
| v0.5 | Runory has an implemented end-to-end FSM transaction baseline. |
| v0.6 | Runory has a stabilized foundation and can continuously operate an FSM business. |
| v0.7 | Runory closes the highest-value gaps in the canonical Reactive Repair / Callout journey. |
| v0.8 | Runory FSM can be configured, adapted, and deployed through approved Agents. |
| v0.9 | The same Reactive Repair / Callout product can be delivered repeatedly without Core forks. |
| v1.0 | Runory is a complete, stable, commercially deliverable Agent-native Reactive Repair / Callout product. |
| v2.0 | Runory adds advanced FSM depth. |
| v3.0 | Runory adds broader Agentic Operations. |
| v4.0 | Runory expands toward a general SMB platform and ecosystem. |

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

## 12. Scope Admission Rule

A requirement enters an earlier milestone only when at least one is true:

1. it is required to complete that milestone's promised FSM user journey;
2. deferring it would force a destructive rearchitecture;
3. it appears repeatedly across credible FSM customer demand and materially affects sales, implementation, or daily operation.

A customer calling an entire suite an MVP is evidence of demand, not automatic evidence of release sequencing.
