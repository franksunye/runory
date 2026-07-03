# Runory Product Milestone Roadmap After v0.5

Status: Proposed  
Date: 2026-07-03  
Input: v0.5 FSM plan, XLink case, mature FSM benchmarks, and HVAC/plumbing/landscaping/pool/solar customer requirement samples

Demand source of truth: [Commercial FSM Customer Demand Benchmark](../research/commercial-fsm-customer-demand-benchmark.md)
GA release contract: [Runory 1.0 — 90% Product Coverage, 10% Governed Extension](./v1.0-ga-release-goal.md)

## 1. Roadmap Thesis

Customer requirement samples frequently call an entire vertical SaaS suite “MVP”: CRM, scheduling, mobile offline, billing, payments, inventory, portal, messaging, AI, and integrations. Runory must sequence these needs by dependency rather than by the label used in a project brief.

```text
v0.5  Execute and plan one service job reliably
v0.6  Operate recurring service and customer/commercial follow-through
v0.7  Connect, mobilize offline, optimize, and assist with AI
v0.8  Productize vertical and third-party extension delivery
v0.9  Prove the 90/10 model and freeze the GA contract
v1.0  General Availability with measured coverage and compatibility promise
```

## 2. Evidence-Based Requirement Placement

| Requirement cluster | Placement | Reason |
|---|---|---|
| customer/contact/opportunity, multiple sites, assets/equipment | v0.5 | common FSM identity and work context |
| quote pricing, review, revision, acceptance, formal output | v0.5 | required before commercial work can be authorized |
| manual dispatch, assignment, calendar, resource timeline, basic map | v0.5 | execution core; no optimization required |
| mobile web/PWA, checklist, photo, acknowledgment, service report | v0.5.1 | field users need a daily execution entry |
| customer/site/asset service history | v0.5.1 | repeatedly required and essential at the job site |
| authentication, tenant isolation, business permissions, audit, API-first commands | v0.4 foundation + v0.5 enforcement | platform trust spans releases |
| operational queues and basic metrics | v0.5 | necessary to run today’s work; not a BI suite |
| separate Lead intake and qualification | v0.6 | repeated demand, but not required when v0.5 starts at qualified opportunity |
| recurring service plans and automatic job generation | v0.6 | central to pool/landscape/maintenance businesses; builds on reliable single-job execution |
| manual route sequencing and recurring calendar | v0.6 | follows schedule truth; avoids premature optimization |
| customer portal, support tickets, booking, surveys | v0.6 | customer-operations layer after internal execution is trustworthy |
| outbound notification templates and provider-neutral delivery | v0.6 | useful follow-through; external channel adapters remain separable |
| contracts, invoices, recurring billing schedule, payment-status ledger | v0.6 | commercial operations on top of the v0.5 document kernel |
| native/offline-first field app and conflict synchronization | v0.7 | high-complexity distributed data problem, not a PWA checkbox |
| live GPS and algorithmic route/skill/capacity optimization | v0.7 | requires mature schedules, resources, telemetry, and policy |
| inventory, purchasing, truck stock | v0.7 | separate operational aggregate and reconciliation domain |
| Stripe/payment processing and accounting/bank integrations | v0.7 | external financial correctness and reconciliation |
| two-way SMS, telephony, AI phone/email agent | v0.7 | integration, consent, delivery, and human-handoff concerns |
| technician AI assistant, anomaly detection, predictive insights | v0.7 | needs trusted events, history, forms, and knowledge grounding |
| commissions and advanced sales performance | v0.7 | adjacent sales domain, not FSM execution core |
| chemical billing, SEAI grants, solar design, pest/HVAC/aquarium rules | v0.8+ vertical packs | industry policy should consume shared runtimes, not enter core |
| on-prem/VPC, per-region residency, advanced enterprise identity | v0.8+ / enterprise track | deployment/compliance product line, not the SMB FSM core |

## 3. v0.5 Family — Commercial FSM Execution Core

### v0.5.0 — Governed Business Action Foundation

```text
commands and governed fields
Workflow V2 definitions/instances/events
work items and generic approval decisions
idempotency, optimistic concurrency, durable audit/outbox
business permission enforcement
```

### v0.5.1 — Mobile Field Work, Forms And My Work

Source: [v0.5.1 specification](./v0.5.1-mobile-field-work-spec.md)

```text
installable lightweight `/m` PWA in the existing Cloud app
Today/My Work and personal schedule
Forms 2.0 mobile execution, checklists, evidence, acknowledgment
customer/site/asset service timeline
formal Quote preview/print/PDF contract
weak-network, security, update, and performance gates
```

### v0.5.2 — Quote Commercial Integrity

```text
price-book items and server-side calculations
composite Quote editor
immutable revision/snapshot lineage
approval/rejection/return/withdrawal/acceptance
authoritative printable/exportable Quote output
idempotent accepted-Quote to Work Order conversion
```

### v0.5.3 — Planning And Field Execution

```text
resource/technician linkage
assignment lifecycle and manual dispatch
schedule entries, conflict policy and backlog
calendar, resource timeline and basic map over one source
Visit/Work Order completion, return, cancellation and reopen
```

### v0.5.4 — Commercial Benchmark And Pilot Gate

```text
cross-vendor invariant review
XLink-derived waterproof-repair pilot
neutral HVAC/pool/solar-shaped configuration tests
role-separated browser/mobile scenarios
concurrency, recovery, isolation and performance evidence
```

Release outcome: one real team can quote, approve, plan, perform, review, rework, and complete service through desktop and mobile web without database repair or direct status editing.

## 4. v0.6 Family — Recurring Service And Customer Operations

### v0.6.0 — Recurring Service Core

```text
maintenance/service-plan definitions and versions
recurrence rules, exceptions, pause/resume and termination
idempotent future Work Order/Visit generation
crew/resource availability calendars
manual route/day sequencing
asset maintenance history and next-service projection
```

Release gate: a pool, landscaping, pest-control, or preventive-maintenance business can generate and adjust recurring work without duplicate jobs.

### v0.6.1 — Customer Operations

```text
Lead intake, qualification and conversion
customer portal identity and scoped access
document/service-history access
support Ticket and engineer-callout booking
customer surveys and review requests
provider-neutral notification templates, reminders and delivery log
email/SMS adapters optional by deployment
```

Release gate: customers can safely view their own work/documents and request follow-up without gaining internal workspace access.

### v0.6.2 — Commercial Follow-Through

```text
typed Contract and Invoice on the commercial-document kernel
deposit/final/recurring invoice schedules
payment-status ledger and manual reconciliation
remote signature provider boundary
document generation and customer delivery tracking
tax/currency policy hardening
```

Payment processing, bank feeds, and accounting synchronization remain v0.7. A status ledger is not presented as a complete accounting system.

### v0.6.3 — Operations Intelligence

```text
saved operational views
cycle-time, overdue, rejection, rework and first-pass-completion metrics
resource utilization and schedule adherence
quote conversion and recurring-service retention metrics
report export and scheduled internal reports
human-confirmed AI summaries over authorized operational data
```

Release outcome: Runory supports both one-off and recurring service, customer follow-through, and basic commercial operations without claiming ERP breadth.

## 5. v0.7 Family — Connected, Offline And Intelligent Operations

### v0.7.0 — Offline Field Runtime

```text
explicit offline dataset scope
encrypted local store and device/session binding
offline form/evidence/command queue
resumable media upload
server/client version vectors or equivalent conflict contract
conflict resolution and operator diagnostics
native wrapper or native app only if PWA limits are proven
```

Release gate: a technician can complete an authorized offline route and synchronize without silent loss, duplication, or cross-user leakage.

### v0.7.1 — Routing, Location And Optimization

```text
live/periodic technician location with consent and retention
route geometry, travel-time providers and navigation handoff
skills, territory, capacity and availability constraints
route and assignment recommendations
human override with reason and audit
optimization quality/cost telemetry
```

### v0.7.2 — Inventory And Procurement

```text
parts/chemical catalog and units
warehouse/truck stock locations
reservation, issue, return, adjustment and count
purchase request/order/receipt workflow
job consumption and replenishment signals
```

Industry-specific chemical rules remain vertical configuration/packs.

### v0.7.3 — Financial And Communication Integrations

```text
payment processor integration and reconciliation
QuickBooks/Zoho Books/Xero-style accounting connectors
bank-feed boundary where legally and commercially justified
two-way SMS/email delivery and consent state
telephony/AI phone-agent adapter and human handoff
external e-signature connectors
integration health, replay, dead-letter and credential governance
```

### v0.7.4 — Operational AI

```text
technician troubleshooting assistant grounded in authorized history/knowledge
support-response suggestions
rule-based and learned anomaly detection
predictive maintenance/operational insights
route/dispatch recommendations
workflow agents constrained to the same command permissions and audit
evaluation, feedback, cost and safety controls
```

Release outcome: Runory operates through intermittent connectivity and external ecosystems, while AI recommends or executes only through governed, observable contracts.

## 6. v0.8 — Vertical And Extension Productization

v0.8 converts Runory's technical extension foundations into a product that an independent developer can use safely.

Required outcomes:

```text
versioned Module/Pack and Connector SDKs
public MCP contracts and reusable Skills guidance
staged data import/migration/maintenance jobs
OAuth, secret, webhook, reconciliation and connector diagnostics
extension scaffolding, test harness and sandbox installation
compatibility ranges, upgrade preflight and deprecation policy
publishing/signing/distribution path
initial maintained vertical packs
```

Initial candidate vertical packs:

```text
Pool Service: chemistry readings, dosage policy, chemical billing
Solar Installation: design-system input, commissioning, grant paperwork
HVAC: equipment hierarchy, diagnostic measurements, maintenance programs
Landscaping: property zones, crew routes, seasonal programs
Pest Control: treatment plans, chemical/compliance evidence
Aquarium Service: water parameters, livestock/equipment service history
```

Enterprise track candidates:

```text
OIDC/SAML/SCIM and advanced delegation
regional residency and retention policy products
VPC/on-premise deployment where commercially justified
advanced record/field policy and segregation of duties
large-scale integration administration and data warehouse feeds
```

Release outcome: a non-core developer can deliver an industry pack, provider connector, and governed data operation without modifying Runory core.

## 7. v0.9 — 90/10 Validation And Release Candidate

Source contract: [Runory 1.0 GA Release Goal](./v1.0-ga-release-goal.md)

```text
expand the evidence cohort to at least 15 customer/prospect profiles
maintain project/installation, reactive repair and recurring-route archetypes
calculate weighted product and solution coverage
complete three production-like reference solutions
prove at least two extensions by third-party/non-core authors
upgrade representative earlier solutions without data/behavior loss
close security, isolation, offline, connector, AI and operations gaps
freeze supported public contracts and publish deprecation policy
run release-candidate pilots and publish known boundaries
```

Release outcome: measured coverage meets the proposed thresholds, the remaining 10% is demonstrably extension-safe, and no reference solution forks core.

## 8. v1.0 — General Availability

```text
publish the validated 90% product-coverage claim for the target cohort
publish the 10% governed extension contract and third-party developer path
ship the three maintained reference solutions
commit to compatibility, upgrade, support and security policies
operate release, backup/restore, incident and extension-support procedures
continue the customer-demand benchmark as a living product input
```

GA outcome: Runory is a supported commercial product for the target FSM customer archetypes, not merely a flexible platform or a successful bespoke implementation.

## 9. Cross-Version Architecture Commitments

Later capability MUST extend these v0.5 foundations rather than fork them:

```text
AI and automation call the command catalog
portal/mobile/desktop share object and permission contracts
recurring work produces the same Work Order/Visit aggregates
routes optimize the same schedule entries used by Planning
offline sync submits the same versioned commands and forms
invoice/contract reuse the commercial-document kernel but retain typed invariants
industry packs configure Forms, Workflow and policies rather than copy runtimes
external delivery uses outbox/idempotency/replay and visible failure
```

## 10. Scope Admission Rule

A requirement enters an earlier milestone only when at least one is true:

1. it is required to complete that milestone’s promised user journey;
2. deferring it would force a known destructive rearchitecture;
3. it appears across multiple credible market/industry sources and cannot be represented by an existing shared runtime.

“A customer called it MVP” is evidence of demand, not automatic evidence of sequencing.
