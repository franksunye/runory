# Runory Product Roadmap

Status: Proposed  
Date: 2026-07-14  
Scope: v0.5–v1.0  

Demand source of truth: [Commercial FSM Customer Demand Benchmark](../research/commercial-fsm-customer-demand-benchmark.md)  
GA release contract: [Runory 1.0 — 90% Product Coverage, 10% Governed Extension](./v1.0-ga-release-goal.md)

## 1. Roadmap Thesis

Runory sequences capabilities by business dependency and release readiness. Voice Intake and Payment are part of the v0.5 commercial FSM closure. v0.6 turns that closure into a sustainable operating system, v0.7 supports complex and scaled field operations, v0.8 fulfills the Agent-native customization and deployment promise, v0.9 validates the model, and v1.0 establishes a complete commercial milestone.

```text
v0.5  Complete one end-to-end service transaction, including Voice Intake and Payment
v0.6  Operate a service business continuously
v0.7  Scale complex field operations reliably
v0.8  Customize, extend, and deploy Runory through Agents
v0.9  Converge the product and validate the 90/10 model in real businesses
v1.0  Deliver a complete, stable, commercially supported Agent-native SMB operating system
```

## 2. Requirement Placement

| Requirement cluster | Placement | Reason |
|---|---|---|
| customer/contact/opportunity, sites, assets/equipment | v0.5 | common FSM identity and work context |
| quote pricing, review, revision, acceptance, formal output | v0.5 | required before commercial work can be authorized |
| manual dispatch, assignment, calendar, resource timeline, basic map | v0.5 | execution core |
| mobile web/PWA, checklist, photo, acknowledgment, service report | v0.5 | field execution entry |
| Voice Intake: telephony, AI phone agent, caller lookup, intake, work-order creation, scheduling, handoff | v0.5 | core inbound work acquisition channel |
| Payment: Stripe-first payment collection, payment links, webhook status, reconciliation, refund baseline | v0.5 | required commercial closure after quote/contract |
| Lead operations, customer 360, follow-up, recurring service, customer portal, contract/invoice operations | v0.6 | sustainable service-business operation |
| operational control center, actionable queues, service and revenue metrics | v0.6 | management must operate by exception, not by raw records |
| offline-first field runtime and conflict synchronization | v0.7 | distributed data and device problem |
| live GPS and route/skill/capacity optimization | v0.7 | requires mature schedules and telemetry |
| inventory, purchasing, truck stock | v0.7 | separate operational aggregate |
| accounting/bank integrations and multi-provider payment expansion | v0.7 | advanced financial ecosystem integration |
| operational AI over trusted history and governed commands | v0.7 | requires stable operational data and controls |
| Agent control plane, governed workspace customization, Module/Pack SDK, Cloud-to-Local deployment | v0.8 | core Agent-native product promise |
| reference solutions, compatibility freeze, real-customer pilots, 90/10 validation | v0.9 | convergence before GA |
| complete product, platform, commercial-delivery, quality, and support contract | v1.0 | General Availability milestone |

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
provider-safe work-order creation and scheduling
call lifecycle, transcript, linkage, and audit
idempotent webhook processing
human handoff and follow-up handling
Calls list/detail operational visibility
```

Release gate: an inbound phone call can safely become an identified customer request, Work Order, and optional scheduled visit without direct database mutation or duplicate creation.

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

Release gate: a business can request, receive, verify, reconcile, and where required refund a customer payment through governed Runory commands and provider events.

### v0.5.6 — Commercial Benchmark and Pilot Gate

```text
cross-vendor invariant review
XLink-derived waterproof-repair pilot
neutral HVAC, pool, and solar-shaped configuration tests
role-separated browser, mobile, voice, and payment scenarios
concurrency, recovery, isolation, webhook, and performance evidence
```

Release outcome: one real service business can receive work through phone or internal entry, quote it, collect payment, plan it, perform it, review it, and complete it through governed desktop/mobile workflows.

## 4. v0.6 Family — Service Business Operating System

v0.6 turns the v0.5 single-transaction closure into a system that can continuously acquire, serve, retain, bill, and manage customers.

Architecture prerequisite: complete the staged, behavior-preserving work in
[v0.6 Command Architecture Stabilization TODO](../architecture/v0.6-command-architecture-stabilization-todo.md).
This stabilization preserves the v0.5 Command model; it is not a new product
scope or a reason to delay unrelated v0.6 discovery.

### v0.6.0 — Recurring Service Core

```text
first-class Lead lifecycle, source, qualification, ownership, follow-up, and conversion
customer/contact/site/asset unified view
voice, quote, payment, work-order, visit, and communication history
duplicate Lead/customer detection and merge policy
follow-up tasks, reminders, queues, and SLA handling
Lead-to-customer and Lead-to-Opportunity conversion
```

Release gate: the business can manage inquiries that are not yet qualified work and convert them without losing history or creating duplicate customers.

### v0.6.1 — Recurring Service Core

```text
Service Plan and Maintenance Plan definitions and versions
recurrence rules, exceptions, pause/resume, skip, and termination
idempotent future Work Order and Visit generation
crew/resource availability calendars
manual route/day sequencing
asset maintenance history and next-service projection
recurring pricing and billing references
```

Release gate: a pool, landscaping, pest-control, cleaning, HVAC, or preventive-maintenance business can run recurring work without duplicate jobs or manual schedule reconstruction.

### v0.6.2 — Customer Portal and Communication

```text
customer portal identity and scoped access
Quote, Contract, Invoice, Payment, Work Order, Visit, and service-report visibility
quote acceptance, payment, service request, booking, rescheduling, and data upload
customer progress and appointment visibility
notification templates, reminders, delivery log, and preference state
survey, review request, and customer feedback capture
```

Release gate: customers can safely complete the main commercial and service interactions without gaining internal workspace access.

### v0.6.3 — Contract, Invoice, and Receivables

```text
typed Contract and Invoice on the commercial-document kernel
deposit, progress, final, and recurring invoice schedules
credit, adjustment, and payment-allocation baseline
accounts-receivable status and aging
remote-signature provider boundary
document generation, numbering, delivery, and signature tracking
tax and currency policy hardening
```

Payment collection already exists in v0.5. v0.6 turns it into a complete document-driven receivables workflow.

### v0.6.4 — Operational Control Center

```text
actionable queues for overdue work, unqualified Leads, unaccepted Quotes, unpaid documents, and schedule conflicts
saved operational views and role-specific control panels
cycle time, overdue, rejection, rework, and first-pass-completion metrics
resource utilization and schedule adherence
Lead conversion, Quote conversion, payment cycle, retention, and renewal metrics
scheduled internal reports and exports
human-confirmed AI summaries over authorized operational data
```

The priority is an executable management workspace rather than a broad BI suite.

### v0.6.5 — Multi-industry Pilot and Commercial Gate

```text
one reactive-service reference business
one recurring-service reference business
one project/installation reference business
role-separated acceptance scenarios
customer portal, recurring generation, receivables, and control-center evidence
operational usability, support effort, and implementation-cost measurement
```

Release outcome: Runory can continuously operate a real service business, not merely complete an isolated job.

## 5. v0.7 Family — Scalable Field Operations

v0.7 addresses the operational complexity that appears when teams, jobs, locations, materials, channels, and external systems scale.

### v0.7.0 — Offline Field Runtime

```text
explicit offline dataset scope
encrypted local store and device/session binding
offline forms, evidence, signatures, and command queue
resumable media upload
server/client version and conflict contract
conflict resolution and operator diagnostics
synchronization status and duplicate-submission protection
native wrapper or native app only if PWA limits are proven
```

Release gate: a technician can complete an authorized offline route and synchronize without silent loss, duplication, or cross-user leakage.

### v0.7.1 — Advanced Dispatch and Optimization

```text
technician skills, territory, availability, capacity, and working-time constraints
service duration, SLA, priority, and travel-time inputs
location collection with consent and retention
route geometry and navigation handoff
assignment, time-slot, and route recommendations
batch rescheduling and conflict detection
human override with reason and audit
optimization quality, latency, and cost telemetry
```

### v0.7.2 — Inventory and Procurement

```text
product, part, material, chemical, unit, and specification catalog
warehouse and truck stock locations
reservation, issue, consumption, return, loss, adjustment, and count
job-level material cost
purchase request, purchase order, receipt, and replenishment workflow
low-stock and demand signals
```

Industry-specific compatibility, dosage, and compliance rules remain Pack-level policy.

### v0.7.3 — Integration Platform

```text
multi-provider payment support and advanced reconciliation
refund, dispute, payout, and platform-payment boundaries where required
QuickBooks, Zoho Books, and Xero-style accounting connectors
bank-feed boundary where legally and commercially justified
two-way SMS and email with consent and preference state
additional telephony, WhatsApp, and messaging providers
external e-signature connectors
OAuth, webhook, credential, mapping, replay, dead-letter, and health governance
connector synchronization history and diagnostics
```

This milestone expands the v0.5 Voice Intake and Payment foundations; it does not introduce them for the first time.

### v0.7.4 — Operational AI

```text
technician troubleshooting assistant grounded in authorized history and knowledge
service-history and customer-context summaries
support-response and communication suggestions
quote and service-report assistance
anomaly, delay, rework, churn, and renewal-risk detection
predictive maintenance and operational insights
route and dispatch recommendations
manager daily operating summary
workflow agents constrained by command permissions, validation, and audit
evaluation, feedback, cost, and safety controls
```

All AI execution must follow the governed path: Agent → Command → Permission → Validation → Audit → Result.

### v0.7.5 — Scale, Security, and Reliability Gate

```text
large-tenant, large-schedule, and bulk-operation performance tests
webhook and connector peak-load handling
tenant-isolation and permission-boundary validation
audit completeness and export validation
backup, restore, and disaster-recovery drills
upgrade, migration, and integration-recovery exercises
performance and infrastructure-cost baselines
```

Release outcome: Runory can reliably support multi-team, multi-location, multi-channel, material-intensive, and integration-heavy field operations.

## 6. v0.8 Family — Agent-native Customization and Deployment

v0.8 returns to Runory's central product thesis: users should be able to use Codex, Claude, and other capable Agents to configure the Cloud product, create governed extensions, install Modules and Packs, and deploy a Local edition without direct database manipulation or uncontrolled code forks.

### v0.8.0 — Public Agent Control Plane

```text
public MCP Server and stable versioned MCP tools
official Skills for supported Agents
object discovery, query, and governed Command execution
Module/Pack discovery and installation
workspace configuration and report creation
plan, preview, confirm, apply, verify, and rollback lifecycle
Agent identity, permission check, audit, and run history
```

### v0.8.1 — Governed Workspace Customization

```text
custom fields and governed custom objects
form, workflow, status, automation, role, permission, and notification changes
saved views, dashboards, document templates, branding, and import mapping
Workspace Extension Manifest and versioning
compatibility range, migration plan, validation, and rollback plan
change Diff, preview, approval, and audit
```

Workspace customization must remain separate from Runory Core and survive product upgrades.

### v0.8.2 — Module, Pack, and Connector SDK

```text
versioned Module SDK, Pack SDK, and Connector SDK
CLI, scaffolding, schemas, examples, and official templates
Command, event, data, UI-extension, and permission contracts
migration and seed framework
test harness and sandbox workspace
compatibility checks and upgrade preflight
publishing, signing, distribution, installation, and deprecation path
```

### v0.8.3 — Cloud-to-Local Deployment

```text
Cloud Workspace configuration and extension export
business-data export and migration contract
Local environment and dependency preflight
containerized or packaged Local installation
Local database, object storage, identity, and MCP configuration
secret collection and provider setup
health checks, acceptance report, backup, restore, and upgrade path
Cloud/Local configuration-difference report
optional synchronization boundary where justified
```

Release gate: an authorized Agent can install a supported Runory Local environment from an existing or new Workspace and produce a verifiable deployment result.

### v0.8.4 — Agent-guided Implementation

```text
business-discovery and requirements-intake templates
industry and Pack recommendation
configuration and extension plan generation
data-migration, user, role, and permission mapping
UAT scenario and acceptance-plan generation
training and operating-guide generation
go-live checklist, verification, and handover report
human-consultant escalation boundary
```

The goal is to materially reduce the implementation cost that traditionally requires sales engineers, consultants, product managers, implementers, and custom developers.

### v0.8.5 — Agent Governance and Evaluation

```text
Agent identity and delegated authorization
Tool-level and object-level permissions
high-risk confirmation and dual-approval policy
budget, token, cost, timeout, and execution limits
sensitive-data and secret-handling rules
change Diff, rollback, and failure recovery
Agent Run logs and operator diagnostics
evaluation suites for correctness, safety, compatibility, and task completion
```

Release outcome: an SMB user can use an approved Agent to configure, extend, deploy, inspect, and maintain Runory through governed and observable contracts.

## 7. v0.9 Family — Product Convergence and Market Validation

v0.9 is primarily a convergence and evidence release, not a broad feature-expansion release.

### v0.9.0 — Maintained Reference Solutions

```text
Reactive Service reference solution
Recurring Service reference solution
Project/Installation reference solution
all solutions assembled from Core + Modules + Packs + Workspace Extensions
no reference solution may fork Runory Core
```

### v0.9.1 — 90/10 Model Validation

```text
validate at least 15 customer/prospect profiles
measure weighted product and solution coverage
prove that remaining needs can be implemented through governed extensions
prove extension upgrade, migration, rollback, and Cloud/Local compatibility
prove at least two extensions authored by non-core developers or Agents
```

### v0.9.2 — Commercial Pilots

```text
3–5 real businesses
at least two industries
at least one recurring-service business
at least one project/installation business
at least one Local or private-deployment customer
measure implementation time, support load, reliability, adoption, and business outcomes
```

### v0.9.3 — Contract and Product Freeze

```text
remove duplicate capabilities and inconsistent object models
unify lifecycle, error, permission, UI, and Agent-tool conventions
freeze supported public APIs, MCP contracts, Module manifests, and extension contracts
publish compatibility ranges, upgrade policy, deprecation policy, and known boundaries
close security, isolation, offline, connector, AI, and operations gaps
run release-candidate pilots and upgrade earlier solutions without data or behavior loss
```

Release outcome: the target product coverage is measured, the remaining 10% is demonstrably extension-safe, and Runory can be upgraded without customer-specific Core forks.

## 8. v1.0 — Complete Commercial Milestone

v1.0 marks the transition from an advanced development platform into a complete, stable, commercially deliverable Agent-native SMB operating system.

### 8.1 Product Completeness

```text
Lead and customer operations
Voice Intake
Quote, Contract, Invoice, Payment, and receivables
planning, dispatch, field work, and recurring service
customer portal and communication
inventory baseline and operational control center
supported external integrations
operational AI and Agent operations
```

### 8.2 Platform Completeness

```text
stable Core and governed Command architecture
installable Modules and Packs
governed Workspace Extensions
supported Cloud and Local deployments
data import, export, migration, backup, restore, and upgrade
stable API, MCP, SDK, manifest, and compatibility contracts
observable integration and Agent runtimes
```

### 8.3 Commercial-delivery Completeness

```text
published packaging and pricing
standard implementation and acceptance process
support and SLA policy
security, privacy, retention, and incident policy
backup/restore and business-continuity procedure
standard data-import and customer-onboarding path
extension and Local-deployment support boundaries
```

### 8.4 Agent-native Completeness

An authorized user can use an approved Agent to:

```text
query and operate the business
create views, reports, and dashboards
change governed workspace configuration
install Modules and Packs
create and maintain Workspace Extensions
run migration and verification tasks
deploy and upgrade a supported Local environment
diagnose system and integration problems
generate implementation, training, and operating documentation
```

### 8.5 Quality and GA Gates

```text
real customers operate stably on supported reference solutions
critical journeys have repeatable end-to-end coverage
tenant isolation and permission boundaries are validated
backup/restore, disaster recovery, migration, and upgrade drills pass
Agent operations meet correctness, security, and rollback requirements
performance and cost remain within published baselines
critical integrations are observable and recoverable
documentation, support procedures, and known boundaries are complete
normal operation does not require direct database repair
```

GA outcome: Runory is a supported commercial product with a measured product-coverage claim, a governed extension model, a stable Agent control plane, and a compatibility promise across supported Cloud and Local deployments.

## 9. Version Milestone Summary

| Version | Product conclusion |
|---|---|
| v0.5 | Runory can complete one end-to-end service transaction. |
| v0.6 | Runory can continuously operate a service business. |
| v0.7 | Runory can support complex and scaled field operations. |
| v0.8 | Runory can be customized, extended, and deployed through Agents. |
| v0.9 | Runory's general product model is validated in real businesses. |
| v1.0 | Runory is a complete, stable, commercially deliverable Agent-native SMB operating system. |

## 10. Cross-Version Architecture Commitments

```text
AI and automation call the governed Command catalog
portal, mobile, voice, payment, Agent, and desktop share object and permission contracts
recurring work produces the same Work Order and Visit aggregates
routes optimize the same schedule entries used by Planning
offline sync submits the same versioned Commands and forms
commercial documents retain typed invariants
Workspace Extensions, Modules, and Packs configure shared runtimes rather than fork Core
Cloud and Local implement compatible supported contracts
external delivery uses outbox, idempotency, replay, and visible failure
Agent operations use plan, preview, permission, validation, audit, verification, and rollback
```

## 11. Scope Admission Rule

A requirement enters an earlier milestone only when at least one is true:

1. it is required to complete that milestone's promised user journey;
2. deferring it would force a destructive rearchitecture;
3. it appears across multiple credible market sources and cannot be represented by an existing shared runtime.

A customer calling an entire suite an MVP is evidence of demand, not automatic evidence of release sequencing.
