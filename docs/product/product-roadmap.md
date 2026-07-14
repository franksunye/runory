# Runory Product Roadmap

Status: Proposed  
Date: 2026-07-14  
Scope: v0.5–v4.0  

Demand source of truth: [Commercial FSM Customer Demand Benchmark](../research/commercial-fsm-customer-demand-benchmark.md)  
GA release contract: [Runory 1.0 — 90% Product Coverage, 10% Governed Extension](./v1.0-ga-release-goal.md)

## 1. Roadmap Thesis

Runory remains focused on Field Service Management through v1.0. The goal is not to become a general SMB operating system before product-market validation. The near-term product must solve real FSM work reliably, be commercially implementable for small and medium service businesses, and be validated through real customer projects, including Upwork-sourced demand.

Agent-native customization and deployment remain a core differentiator, but they support the FSM product rather than expand the business scope beyond FSM.

```text
v0.5  Complete one end-to-end FSM service transaction, including Voice Intake and Payment
v0.6  Operate an FSM business continuously
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
| v0.5 | Can Runory complete one real FSM transaction safely? |
| v0.6 | Can a real FSM business use Runory continuously? |
| v0.7 | Does Runory cover the advanced capabilities that repeatedly block SME FSM adoption? |
| v0.8 | Can users implement and deploy Runory FSM through approved Agents? |
| v0.9 | Can the same product be delivered repeatedly without customer-specific Core forks? |
| v1.0 | Can Runory be sold, implemented, supported, upgraded, and operated as a complete FSM product? |

Scope enters v1.0 only when it is required by recurring customer evidence, prevents a destructive future rearchitecture, or is necessary for commercial delivery and product reliability.

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

### v0.5.6 — Commercial Benchmark and Pilot Gate

```text
XLink-derived waterproof-repair pilot
neutral HVAC, plumbing, landscaping, pool, and installation-shaped scenarios
role-separated browser, mobile, voice, and payment acceptance
concurrency, recovery, isolation, webhook, and performance evidence
```

Release outcome: one real service business can receive work, quote it, collect payment, plan it, perform it, review it, and complete it through governed desktop and mobile workflows.

## 4. v0.6 Family — Continuous FSM Operations

v0.6 turns the v0.5 single-transaction closure into a system that an FSM business can use every day.

### v0.6.0 — Lead and Customer Operations

```text
Lead lifecycle, source, qualification, ownership, follow-up, and conversion
customer/contact/site/asset unified view
voice, quote, payment, Work Order, Visit, and communication history
duplicate Lead/customer detection and merge policy
follow-up tasks, reminders, queues, and SLA handling
```

### v0.6.1 — Recurring Service Baseline

```text
Service Plan and Maintenance Plan definitions
recurrence rules, exceptions, pause/resume, skip, and termination
idempotent future Work Order and Visit generation
asset maintenance history and next-service projection
recurring pricing and billing references
```

### v0.6.2 — Contract, Invoice, and Receivables

```text
typed Contract and Invoice
Deposit, progress, final, and recurring invoice schedules
accounts-receivable status and payment allocation baseline
document generation, numbering, delivery, and signature tracking
tax and currency baseline required by target customers
```

Payment collection already exists in v0.5. v0.6 turns it into a document-driven receivables workflow.

### v0.6.3 — Operational Inbox and Reporting

```text
actionable queues for overdue work, unqualified Leads, unaccepted Quotes, unpaid documents, and schedule conflicts
saved operational views and role-specific control panels
cycle time, overdue, rework, first-pass completion, utilization, and schedule adherence
Lead conversion, Quote conversion, payment cycle, retention, and renewal metrics
scheduled internal reports and exports
```

The priority is an executable management workspace, not a broad BI platform.

### v0.6.4 — Customer Access Baseline

```text
secure customer access to Quotes, Contracts, Invoices, Payments, Work Orders, Visits, and service reports
quote acceptance and payment
service request, booking, rescheduling, and data upload
appointment and progress visibility
notification templates, reminders, and delivery log
```

### v0.6.5 — Real-customer Validation Gate

```text
at least one reactive-service customer
at least one recurring-service customer
at least one project/installation customer
measure implementation time, support load, adoption, and operational value
prioritize Upwork and other real customer requirements over hypothetical completeness
```

Release outcome: Runory can continuously operate a real FSM business, not merely complete an isolated job.

## 5. v0.7 Family — High-value Advanced FSM

v0.7 is not a general enterprise or advanced-technology release. It adds only advanced capabilities that repeatedly appear in SME FSM customer demand and materially affect sales, implementation, or daily operation.

### Committed product themes

#### v0.7.0 — Advanced Scheduling and Resource Management

```text
technician skills, territory, availability, capacity, and working-time constraints
service duration, SLA, priority, and travel-time inputs
assignment and time-slot recommendations
batch rescheduling and conflict detection
manual route/day sequencing
human override with reason and audit
```

#### v0.7.1 — Inventory and Materials Baseline

```text
product, part, material, unit, and specification catalog
warehouse and vehicle stock locations
reservation, issue, consumption, return, loss, adjustment, and count
job-level material cost
low-stock and replenishment signals
basic purchase request and receipt flow where customer demand requires it
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
```

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
at least two FSM industries
reactive-service, recurring-service, and project/installation archetypes represented
prioritize customers acquired through Upwork and other direct market channels
measure implementation time, support load, reliability, adoption, and business outcomes
```

### v0.9.1 — Reference Solutions and 90/10 Validation

```text
maintained reactive-service reference solution
maintained recurring-service reference solution
maintained project/installation reference solution
all solutions assembled from Core + Modules/Packs + Workspace Extensions
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
Lead and customer operations
Voice Intake
Quote, Contract, Invoice, Payment, and receivables
planning, dispatch, field work, and recurring service
customer access and communication
advanced scheduling baseline
inventory/material baseline
multi-site and asset management
operational inbox and reporting
data migration and configurable roles
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

GA outcome: Runory is a focused FSM product that can be sold, implemented, customized through Agents, deployed in supported Cloud or Local modes, operated reliably, and upgraded without customer-specific Core forks.

## 9. Post-1.0 Direction

Post-1.0 versions are directional themes, not current delivery commitments.

### v2.0 — Advanced FSM

```text
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
| v0.5 | Runory can complete one end-to-end FSM transaction. |
| v0.6 | Runory can continuously operate an FSM business. |
| v0.7 | Runory covers the high-value advanced needs of SME FSM customers. |
| v0.8 | Runory FSM can be configured, adapted, and deployed through approved Agents. |
| v0.9 | Runory can be delivered repeatedly to real FSM customers without Core forks. |
| v1.0 | Runory is a complete, stable, commercially deliverable Agent-native FSM product. |
| v2.0 | Runory adds advanced FSM depth. |
| v3.0 | Runory adds broader Agentic Operations. |
| v4.0 | Runory expands toward a general SMB platform and ecosystem. |

## 11. Cross-Version Architecture Commitments

```text
AI and automation call the governed Command catalog
portal, mobile, voice, payment, Agent, and desktop share object and permission contracts
recurring work produces the same Work Order and Visit aggregates
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