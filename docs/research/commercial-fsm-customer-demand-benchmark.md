# Commercial FSM Customer Demand Benchmark

Status: Living internal reference  
Established: 2026-07-03  
Last synthesis: 2026-07-03  
Current sources: 3 independent customer briefs, XLink operating case, mature FSM product benchmarks  
Maintainers: Product and Architecture

GA release contract: [Runory 1.0 — 90% Product Coverage, 10% Governed Extension](../product/v1.0-ga-release-goal.md)

## 1. Purpose

This document is Runory's durable market-demand reference for commercial field service and adjacent business operations.

It exists to answer four recurring questions:

1. What work are real customers trying to accomplish?
2. Which needs repeat across industries and should become shared Runory capabilities?
3. Which needs belong in core, a typed product/module, an industry pack, a connector, or workspace configuration?
4. Where should Runory invest next, and what level of implementation is commercially credible?

This is not a collection of feature requests and not a commitment to reproduce every buyer's stated MVP. It converts raw customer language into normalized jobs, evidence, product boundaries, roadmap decisions, and measurable completion standards.

## 2. North-Star Principle

> Real customer work is the north star. Customer feature lists are evidence; product architecture and sequencing remain deliberate Runory decisions.

Runory should continuously learn from customers who need to run CRM, commercial, field-service, customer-operation, and automation workflows. These are the businesses the product intends to serve.

The product should therefore optimize for:

```text
real recurring business jobs
safe changes to business truth
clear ownership and handoffs
exceptions and reverse operations
configuration across industries
measurable operating outcomes
low dependence on one customer's vocabulary or software stack
```

It should not optimize for the number of requested features copied into a release.

## 3. Evidence Triangle

Product decisions should combine three complementary sources:

```text
Customer demand samples
  = market breadth, buyer language, desired outcomes, willingness to replace existing tools

XLink operating case
  = workflow depth, actual roles, exceptions, forms, handoffs, and production pain

Mature commercial products
  = cross-industry domain boundaries and proven execution patterns
```

Each source alone is insufficient:

- one customer brief may contain an unrealistic schedule or combine several product categories under “MVP”;
- one live case may encode company-specific history and accidental architecture;
- one mature vendor may contain enterprise complexity Runory does not need.

A strong Runory decision explains how the three forms of evidence agree or why one is sufficient for the current scope.

## 4. Evidence Levels

| Level | Meaning | Example | Permitted use |
|---|---|---|---|
| E0 | hypothesis or internal idea | “dispatchers may want a map” | discovery only |
| E1 | one stated buyer need | one brief requests offline mobile | backlog evidence, not automatic core scope |
| E2 | repeated independent demand | multiple industries request CRM + scheduling + communication | shared-capability candidate |
| E3 | observed operating requirement | XLink users must return work to an earlier step | production behavior and acceptance case |
| E4 | repeated market demand plus live/mature-domain validation | assigned work, schedule, evidence, audit | architecture/release invariant candidate |

Evidence level describes confidence in the problem, not the correctness of a proposed solution.

## 5. Source Register

Customer briefs are paraphrased and anonymized. Budgets, freelancer selection language, arbitrary preferred stacks, and delivery-date claims are excluded unless they reveal a product constraint.

### DEM-FSM-001 — AI Operations Manager For Field-Service SMBs

Source type: commercial SaaS build request  
Industries named: HVAC, plumbing, landscaping, electrical, pest control, roofing  
Evidence level: E1, with several needs promoted to E2 through other sources

Stated business outcome:

> Automate office operations for field-service businesses through one secure SaaS product.

Normalized jobs:

```text
manage customers and service demand
schedule and dispatch jobs
communicate with customers
invoice and track operations
operate through authenticated roles
automate workflows
use an AI phone/operations agent
measure performance through dashboards
run securely and reliably as a multi-tenant SaaS
```

Important signal: buyers describe AI as an operations layer over CRM, scheduling, communication, and billing—not as a substitute for those underlying systems.

### DEM-FSM-002 — Pool Service Vertical SaaS

Source type: new commercial vertical-SaaS build request  
Industries named: pool service, with planned landscaping, HVAC, aquarium expansion  
Evidence level: E1 for vertical details; E2/E4 for several shared FSM patterns

Stated business outcome:

> Run both recurring route service and broader customer, technician, inventory, commercial, and communication operations in one extensible platform.

Normalized jobs:

```text
manage customers with multiple properties and service history
schedule recurring service and routes
assign technicians and manage calendars
execute mobile checklists, photos, readings, signatures, and reports
operate with weak/no connectivity
manage equipment, chemicals, parts, purchasing, and truck stock
bill before/after service and track payment
communicate through notifications and two-way SMS
expose a customer portal
manage leads, sales teams, and commissions
use technician assistance and anomaly detection
integrate accounting and payment providers
```

Important signal: recurring service, route planning, offline work, and inventory form a second maturity layer beyond reliable one-job FSM execution.

### DEM-FSM-003 — Solar Installation CRM And Automation

Source type: owner-operated installation business replacement-system request  
Industry: solar PV installation and aftercare  
Evidence level: E1 for solar-specific rules; E2/E4 for CRM-to-service journey patterns

Stated business outcome:

> Replace disconnected CRM, accounting, automation, and field-service subscriptions with one Lead-to-Aftercare operating system.

Normalized jobs:

```text
capture and prioritize leads by service area
produce, review, send, follow up, and accept proposals
generate and store contracts, risk assessments, and signed documents
invoice deposits/final balances and track payment state
schedule installation teams
complete commissioning forms
populate compliance/grant paperwork
provide customer document and support access
manage aftercare tickets and engineer callouts
automate stage-specific email follow-up with AI assistance
export owned business data and meet privacy/residency obligations
```

Important signal: the commercial journey continues after Quote acceptance into documents, installation, payment, compliance, and aftercare. Industry paperwork is configuration/vertical policy; the underlying document, form, workflow, and record-mapping capabilities are shared.

### CASE-FSM-001 — XLink Waterproof Repair

Source type: nearby production operating system  
Industry: waterproof repair/service  
Evidence level: E3

Primary contribution:

```text
real multi-role workflow depth
forms required at process nodes
return, rollback, take-back, cancel, reopen, and additional-handler behavior
deadline/reminder patterns
commercial and field-service linkage
actual operator vocabulary and exception pressure
```

XLink is an acceptance case and requirements mine, not the architecture to copy.

### BENCH-FSM-001 — Mature Commercial FSM Products

Source type: official Salesforce, Microsoft Dynamics 365, ServiceNow, Oracle and related product/domain documentation  
Evidence level: E4 when combined with repeated demand and the operating case

Primary contribution:

```text
work request versus schedulable visit/booking separation
resource assignment and dispatch workspaces
calendar/timeline/map planning
mobile worker execution
inspection/forms/evidence patterns
work-order and service-history boundaries
role-specific product surfaces
```

## 6. Normalized Demand Map

Presence means the job is materially requested, not that the customer used identical terminology.

| Demand cluster | 001 | 002 | 003 | Cross-source signal | Current placement |
|---|:---:|:---:|:---:|---|---|
| customer/contact CRM | ✓ | ✓ | ✓ | E2; fundamental | v0.5 |
| scheduling and dispatch | ✓ | ✓ | ✓ | E4 with XLink/vendors | v0.5 |
| authentication, roles, security, audit | ✓ | ✓ | ✓ | E4 platform trust | v0.4 foundation + v0.5 enforcement |
| customer communication/automation | ✓ | ✓ | ✓ | E2 | v0.6 outbound; v0.7 two-way/telephony |
| invoicing/payment state | ✓ | ✓ | ✓ | E2 | v0.6 documents/ledger; v0.7 processing/integration |
| AI assistance/automation | ✓ | ✓ | ✓ | E2 demand, dependencies immature | v0.6 summaries; v0.7 operational AI |
| operational reporting | ✓ | ✓ | — | E2 | v0.5 queues/basic; v0.6 analytics |
| forms, checklists, evidence, signature | — | ✓ | ✓ | E4 with XLink/vendors | v0.5/v0.5.1 |
| customer/service history | — | ✓ | ✓ | E4 with XLink/vendors | v0.5.1 |
| customer portal/support access | — | ✓ | ✓ | E2 | v0.6 |
| proposal/Quote and acceptance | — | — | ✓ | E4 through XLink/vendors and journey criticality | v0.5 |
| multiple properties/sites and equipment | — | ✓ | ✓ | E4 with mature FSM | v0.5 |
| mobile web field execution | implied | ✓ | ✓ | E4 with XLink/vendors | v0.5.1 |
| recurring service | — | ✓ | — | E1 buyer, strong vertical pattern | v0.6 |
| route sequencing/optimization | — | ✓ | — | E1 buyer, mature FSM pattern | v0.6 manual; v0.7 optimized |
| offline-first field execution | — | ✓ | — | E1 buyer, mature FSM pattern | v0.7 |
| inventory/purchasing/truck stock | — | ✓ | — | E1 vertical breadth | v0.7 |
| accounting/payment integrations | — | ✓ | ✓ | E2 | v0.7 |
| sales commissions | — | ✓ | — | E1 adjacent domain | v0.7 or sales pack |
| industry compliance/calculation | — | chemical | solar/grant | vertical-specific | v0.8+ packs/extensions |

Frequency is not the only prioritization rule. Quote appears explicitly in one brief but remains v0.5 because it is journey-critical and independently validated. AI appears in all three but remains later because useful AI depends on trusted business records, commands, events, permissions, and evaluations.

## 7. Product-Boundary Classification

Every normalized requirement must receive one primary classification.

### 7.1 Core Platform Runtime

Use when the capability protects all business products or provides universal execution semantics.

Examples:

```text
tenant isolation
authentication/context
command/idempotency/audit/outbox
Workflow and work items
Forms definitions/submissions
assignment and scheduling runtime
attachment/evidence integrity
```

### 7.2 Typed Shared Product Capability

Use when users recognize a stable business job with reusable internals and meaningful invariants.

Examples:

```text
CRM customer/opportunity
Quote
Work Order and Visit
Planning
Invoice and Contract
Inventory
Ticket/customer support
```

A shared capability is not automatically a universal untyped object.

### 7.3 Industry Pack

Use when several customers in one vertical share vocabulary, calculations, policies, forms, dashboards, or default processes.

Examples:

```text
pool chemistry and dosage
solar commissioning and grant paperwork
HVAC diagnostic measurements
pest-treatment compliance
landscape property zones and seasonal programs
```

Industry packs consume shared objects and runtimes. They must not fork Workflow, Forms, Scheduling, Quote, Inventory, or permission systems.

### 7.4 Connector

Use when the primary variability is an external provider/protocol.

Examples:

```text
Stripe
QuickBooks / Zoho Books / Xero
Twilio or another SMS/telephony provider
SurgePV
e-signature providers
maps/travel-time providers
```

Connectors use provider-neutral contracts, idempotency, replay, health, and visible failure. A provider name must not leak into the core domain model.

### 7.5 Workspace Configuration/Extension

Use when variation is primarily customer policy or presentation:

```text
form names and fields
checklist items and evidence requirements
approval group and thresholds
workflow timing and allowed return paths
document terminology/branding
service categories, priorities, and regions
email copy and reminder cadence
```

Configuration may specialize behavior only inside governed extension points; it cannot bypass domain invariants.

## 8. Investment Prioritization

New demand is evaluated on six dimensions, each from 0–3:

| Dimension | Question |
|---|---|
| journey criticality | Does the promised user journey fail without it? |
| recurrence | Is it repeated across independent customers/industries? |
| portability | Can many solutions reuse the same capability? |
| commercial value | Does it affect adoption, retention, revenue, labor, or risk? |
| prerequisite leverage | Does it unlock several later capabilities? |
| evidence confidence | Is it stated, repeated, observed, and domain-validated? |

Complexity, irreversible architecture risk, compliance burden, and operational cost are recorded separately as Low/Medium/High. They do not erase demand; they affect sequencing and proof requirements.

The score is a comparison aid, not an automatic roadmap generator. Product and architecture must still document:

```text
admit now
defer with architectural provision
place in industry pack
place in connector
support through configuration
reject/out of strategy
```

## 9. Current Investment Reading

Based on the first synthesis:

### Invest Now — v0.5 Family

```text
governed execution and reverse operations
CRM/Quote/FSM composition
Forms/checklists/evidence and immutable submissions
My Work and approval work items
manual assignment, scheduling and Planning
lightweight field PWA
customer/site/asset service history
formal Quote output
permission, idempotency, audit, recovery and performance
```

Standard: production-shaped end-to-end execution, not installable object coverage.

### Invest Next — v0.6 Family

```text
recurring service plans and generated work
Lead qualification
customer portal, Ticket/aftercare and booking
outbound notifications and follow-up
Contract/Invoice/payment-status ledger
operational analytics and human-confirmed summaries
```

Standard: one-off and recurring service operations with customer/commercial follow-through.

### Prepare Now, Build Later — v0.7 Family

```text
offline synchronization
route/location optimization
inventory and procurement
payment/accounting/communication integrations
AI phone/technician/support/workflow agents
```

Preparation in earlier versions means stable command/event/permission/provider contracts. It does not mean prematurely implementing these products.

### Verticalize After Shared Runtimes — v0.8+

```text
pool chemistry/billing
solar design/grant/compliance
HVAC diagnostics
landscape seasonal programs
pest-treatment compliance
aquarium water-parameter workflows
```

## 10. Build Standard And Coverage Levels

An object, page, or demo is not sufficient evidence that a customer requirement is met.

| Level | Meaning | Evidence required |
|---|---|---|
| L0 | unsupported | no governed path |
| L1 | modeled | schema/object exists; CRUD or prototype only |
| L2 | usable flow | primary happy path works for one role |
| L3 | production-shaped | permissions, validation, reverse paths, concurrency, audit, recovery, migration, role UX and operational visibility |
| L4 | scaled/optimized | measured scale, advanced automation/optimization, provider ecosystem or offline reliability as applicable |

Roadmap promises should normally require L3. Research prototypes may stop at L1/L2 but must not be counted as commercial coverage.

For each capability, the acceptance card should identify:

```text
named user and business job
entry and completion outcome
authoritative aggregate/state
commands and permissions
required input/evidence
reverse/exception operations
idempotency/concurrency behavior
audit and history
mobile/desktop/portal surfaces in scope
failure/retry/diagnostic behavior
migration and compatibility
performance/load profile
automated and pilot evidence
```

## 11. Interpreting The 90% Target

Runory's target is not “90% of every sentence in a brief.” It is:

> At least 90% of the weighted, normalized business jobs for a target customer profile can be completed at L3 using Runory shared products, configuration, supported connectors, and documented extension points; no custom fork of core business runtimes is required.

Measure two values separately:

```text
product coverage
  jobs completed by released shared Runory products/configuration/connectors

solution coverage
  jobs completed after approved industry/customer extensions are added
```

Suggested coverage factors:

```text
L0 unsupported          0.00
L1 modeled              0.20
L2 usable primary flow  0.60
L3 production-shaped    1.00
L4 optimized            1.00 plus quality evidence; never more feature credit
```

Weight each normalized job as Must=3, Important=2, Optional=1 for that customer profile. Keep regulatory blockers visible even if their numerical weight is small.

Current roadmap interpretation:

```text
v0.5 family completed
  proves the FSM execution core, not 90% suite coverage

v0.6 family completed
  covers recurring/customer/commercial operations for many SMBs

v0.7.4 completed
  is the first intended ~90% generic-platform milestone for the three current profiles

v0.8+ industry packs
  reduce implementation effort and move a vertical closer to out-of-box use
```

The ~90% claim must be recalculated from release evidence. It is a target, not a forecast guaranteed by the version label.

## 12. Current Three-Profile Residual 10%

At the intended v0.7.4 platform milestone, likely solution-specific work remains:

| Profile | Expected extension/implementation residue |
|---|---|
| general AI field-service operations | phone provider, call scripts, escalation policy, reporting definitions, customer-specific automations |
| pool service | chemistry/dosage policy, chemical billing formulas, pool-specific forms, local commission policy |
| solar installation | design-provider connector, grant/compliance mapping, risk/commissioning forms, regional privacy/deployment policy, communication cadence |

If these require changes to Workflow, Forms, Quote, Scheduling, permissions, audit, or command runtimes, the 90% architecture goal has failed. They should be expressible through packs, connectors, policy, forms, templates, and governed extension points.

## 13. Intake Template For New Customer Evidence

Add one source entry using this template:

```markdown
### DEM-FSM-NNN — Short anonymized profile

Source date:
Source type:
Industry/region:
Evidence level:
Commercial stage: public brief / discovery / pilot / paying deployment

Business outcome:

Normalized jobs:
- ...

Current tools being replaced:
- ...

Constraints that affect product design:
- ...

Industry/customer-specific details:
- ...

Candidate shared capabilities:
- ...

Initial classification and roadmap placement:
- ...

Unknowns / validation questions:
- ...
```

Do not copy personal data, customer secrets, credentials, private workflow documents, or full copyrighted postings into this repository. Paraphrase the business need and retain a controlled source reference only where authorized.

## 14. Synthesis And Review Process

### On Every New Source

1. anonymize and record the source;
2. extract business jobs, exceptions, actors, artifacts, and outcomes;
3. map them to existing normalized demand clusters;
4. add a new cluster only when the existing vocabulary cannot express the job;
5. classify core/product/pack/connector/configuration;
6. update evidence level and roadmap impact;
7. record unknowns rather than guessing.

### Synthesis Cadence

Perform a formal synthesis after every five material new sources or at least quarterly:

```text
recount cross-industry demand
review new/strengthened/weakened signals
re-score investment candidates
compare actual product coverage to L3 standards
identify extension pressure leaking into core forks
update milestone assumptions and explicit deferrals
publish decision changes with rationale
```

### Release Planning Gate

Every major product milestone must state:

- which customer-demand clusters it advances;
- which evidence supports the investment;
- which capability boundary is being created or reused;
- the required coverage level;
- which credible demands remain deferred and why.

## 15. Decision Log

| Date | Evidence change | Decision |
|---|---|---|
| 2026-07-03 | first three briefs normalized with XLink and mature-FSM evidence | retain v0.5 execution core; add mobile PWA, service history, and formal Quote output to v0.5.1 family scope |
| 2026-07-03 | recurring service, portal, billing and aftercare demand separated from single-job execution | define v0.6 as Recurring Service And Customer Operations |
| 2026-07-03 | offline, route optimization, inventory, financial/communication integrations and AI depend on mature operational truth | define v0.7 as Connected, Offline And Intelligent Operations; v0.7.4 is intended first ~90% generic-platform milestone |
| 2026-07-03 | pool chemistry and solar grant/design needs are industry-specific but share Forms/Workflow/document runtimes | reserve v0.8+ for vertical packs rather than hard-code them into core |
| 2026-07-03 | 90% product coverage is insufficient unless the residual 10% is independently deliverable without a core fork | define v0.8 extension productization, v0.9 90/10 validation/RC, and v1.0 GA release contract |

## 16. Current Product Judgment

The first synthesis supports Runory's direction:

```text
v0.5 is not too narrow; it is the dependency foundation.
v0.6 turns execution into an ongoing service business.
v0.7 makes the platform broadly solution-complete for the current profiles.
v0.8 makes selected industries closer to out-of-box.
v0.9 validates the 90/10 model with a broader cohort and independent extensions.
v1.0 turns the measured coverage and governed-extension model into a GA promise.
```

The benchmark must remain alive. As customer evidence grows, Runory should be willing to strengthen, defer, split, or cancel roadmap investments—but should always preserve the reasoning trail that connects real customer work to product architecture and release standards.
