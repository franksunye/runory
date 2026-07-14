# Runory Product Roadmap

Status: Proposed  
Date: 2026-07-14  
Scope: v0.5–v1.0  

Demand source of truth: [Commercial FSM Customer Demand Benchmark](../research/commercial-fsm-customer-demand-benchmark.md)  
GA release contract: [Runory 1.0 — 90% Product Coverage, 10% Governed Extension](./v1.0-ga-release-goal.md)

## 1. Roadmap Thesis

Runory sequences capabilities by business dependency and release readiness. Voice Intake and Payment are part of the v0.5 commercial FSM closure, not deferred integration experiments.

```text
v0.5  Close the commercial FSM loop, including Voice Intake and Payment
v0.6  Operate recurring service and customer/commercial follow-through
v0.7  Add offline operation, optimization, inventory, and advanced integrations
v0.8  Productize vertical and third-party extension delivery
v0.9  Prove the 90/10 model and freeze the GA contract
v1.0  General Availability with measured coverage and compatibility promise
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
| recurring service plans and automatic work generation | v0.6 | builds on reliable single-job execution |
| customer portal, support tickets, booking, surveys | v0.6 | customer-operations layer |
| contracts, invoices, recurring billing schedules | v0.6 | broader commercial follow-through |
| native/offline-first field runtime and conflict synchronization | v0.7 | distributed data and device problem |
| live GPS and route/skill/capacity optimization | v0.7 | requires mature schedules and telemetry |
| inventory, purchasing, truck stock | v0.7 | separate operational aggregate |
| accounting/bank integrations and multi-provider payment expansion | v0.7 | advanced financial ecosystem integration |
| two-way messaging and broader communication-channel integration | v0.7 | expansion beyond the v0.5 Voice Intake baseline |
| technician AI assistant, anomaly detection, predictive insights | v0.7 | requires trusted operational history |
| industry-specific rules | v0.8+ | belong in vertical packs rather than core |

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

## 4. v0.6 Family — Recurring Service and Customer Operations

### v0.6.0 — Recurring Service Core

```text
maintenance/service-plan definitions and versions
recurrence rules, exceptions, pause/resume, and termination
idempotent future Work Order and Visit generation
crew/resource availability calendars
manual route/day sequencing
asset maintenance history and next-service projection
```

### v0.6.1 — Customer Operations

```text
Lead intake, qualification, and conversion
customer portal identity and scoped access
document and service-history access
support Ticket and engineer-callout booking
customer surveys and review requests
notification templates, reminders, and delivery log
```

### v0.6.2 — Commercial Follow-Through

```text
typed Contract and Invoice on the commercial-document kernel
deposit, final, and recurring invoice schedules
remote signature provider boundary
document generation and customer delivery tracking
tax and currency policy hardening
```

Payment collection already exists in v0.5. v0.6 extends it into recurring and document-driven commercial operations.

### v0.6.3 — Operations Intelligence

```text
saved operational views
cycle-time, overdue, rejection, rework, and first-pass-completion metrics
resource utilization and schedule adherence
quote conversion and recurring-service retention metrics
report export and scheduled internal reports
human-confirmed AI summaries over authorized operational data
```

## 5. v0.7 Family — Offline, Optimization, and Advanced Integrations

### v0.7.0 — Offline Field Runtime

```text
encrypted local store and device/session binding
offline form, evidence, and command queue
resumable media upload
conflict contract, resolution, and diagnostics
native wrapper or native app only if PWA limits are proven
```

### v0.7.1 — Routing, Location, and Optimization

```text
technician location with consent and retention
route geometry, travel-time providers, and navigation handoff
skills, territory, capacity, and availability constraints
route and assignment recommendations
human override with reason and audit
```

### v0.7.2 — Inventory and Procurement

```text
parts and material catalog
warehouse and truck stock
reservation, issue, return, adjustment, and count
purchase request, order, and receipt workflow
job consumption and replenishment signals
```

### v0.7.3 — Advanced Financial and Communication Integrations

```text
multi-provider payment support and advanced reconciliation
QuickBooks, Zoho Books, and Xero-style accounting connectors
bank-feed boundary where justified
two-way SMS and email delivery with consent state
additional telephony and messaging providers
external e-signature connectors
integration health, replay, dead-letter, and credential governance
```

This milestone expands the v0.5 Payment and Voice Intake foundations; it does not introduce them for the first time.

### v0.7.4 — Operational AI

```text
technician troubleshooting assistant
support-response suggestions
anomaly detection and predictive insights
route and dispatch recommendations
workflow agents constrained by command permissions and audit
evaluation, feedback, cost, and safety controls
```

## 6. v0.8 — Vertical and Extension Productization

```text
versioned Module, Pack, and Connector SDKs
public MCP contracts and reusable Skills guidance
staged data import, migration, and maintenance jobs
extension scaffolding, test harness, and sandbox installation
compatibility ranges, upgrade preflight, and deprecation policy
publishing, signing, and distribution path
initial maintained vertical packs
```

## 7. v0.9 — 90/10 Validation and Release Candidate

```text
validate at least 15 customer/prospect profiles
measure weighted product and solution coverage
complete three production-like reference solutions
prove third-party/non-core extensions
upgrade earlier solutions without data or behavior loss
close security, isolation, offline, connector, AI, and operations gaps
freeze supported public contracts and deprecation policy
run release-candidate pilots and publish known boundaries
```

## 8. v1.0 — General Availability

```text
publish the validated 90% product-coverage claim
publish the 10% governed extension contract
ship maintained reference solutions
commit to compatibility, upgrade, support, and security policies
operate release, backup/restore, incident, and extension-support procedures
```

## 9. Cross-Version Architecture Commitments

```text
AI and automation call the command catalog
portal, mobile, voice, payment, and desktop share object and permission contracts
recurring work produces the same Work Order and Visit aggregates
routes optimize the same schedule entries used by Planning
offline sync submits the same versioned commands and forms
commercial documents retain typed invariants
industry packs configure shared runtimes rather than fork them
external delivery uses outbox, idempotency, replay, and visible failure
```

## 10. Scope Admission Rule

A requirement enters an earlier milestone only when at least one is true:

1. it is required to complete that milestone’s promised user journey;
2. deferring it would force a destructive rearchitecture;
3. it appears across multiple credible market sources and cannot be represented by an existing shared runtime.
