# Commercial FSM Customer Demand Benchmark

Status: Living internal reference  
Established: 2026-07-03  
Last synthesis: 2026-07-15  
Current evidence: 3 independent commercial customer briefs, 1 multi-platform marketplace scan, XLink operating case, mature FSM product benchmarks  
Maintainers: Product and Architecture

GA release contract: [Runory 1.0 — 90% Product Coverage, 10% Governed Extension](../product/v1.0-ga-release-goal.md)

## 1. Purpose

This document is Runory's durable market-demand reference for commercial field service management (FSM) and adjacent business operations.

It answers four recurring questions:

1. What work are real customers trying to accomplish?
2. Which needs repeat across industries and should become shared Runory capabilities?
3. Which needs belong in core, a typed product/module, an industry pack, a connector, or workspace configuration?
4. Where should Runory invest next, and what level of implementation is commercially credible?

This is not a collection of copied feature requests. It converts customer language into normalized business jobs, evidence strength, product boundaries, roadmap decisions, and measurable completion standards.

## 2. North-Star Principle

> Real customer work is the north star. Customer feature lists are evidence; product architecture and sequencing remain deliberate Runory decisions.

Runory should optimize for:

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

## 3. Evidence Model

Product decisions should combine four complementary sources:

```text
Customer demand samples
  = buyer language, desired outcomes, willingness to replace existing tools

Marketplace scans
  = current commercial demand, project packaging, buyer maturity and procurement behavior

XLink operating case
  = workflow depth, roles, exceptions, forms, handoffs and production pressure

Mature commercial FSM products
  = validated domain boundaries and proven execution patterns
```

Each source alone is insufficient:

- one customer brief may contain an unrealistic schedule or several product categories labeled as an “MVP”;
- public freelance marketplaces over-represent greenfield builds and under-represent confidential enterprise work;
- one live case may encode company-specific history and accidental architecture;
- mature vendors may contain enterprise complexity Runory does not need.

### 3.1 Evidence Levels

| Level | Meaning | Example | Permitted use |
|---|---|---|---|
| E0 | hypothesis or internal idea | “dispatchers may want a map” | discovery only |
| E1 | one stated buyer need | one brief requests offline mobile | backlog evidence, not automatic core scope |
| E2 | repeated independent demand | multiple industries request CRM + scheduling + communication | shared-capability candidate |
| E3 | observed operating requirement | XLink users must return work to an earlier step | production behavior and acceptance case |
| E4 | repeated market demand plus live/mature-domain validation | assignment, schedule, evidence and audit | architecture/release invariant candidate |

Evidence level describes confidence in the problem, not the correctness of a proposed solution.

## 4. Marketplace Research Method

### 4.1 Platforms Scanned

The 2026-07-15 scan covered:

```text
A.Team
Toptal
Braintrust
Arc.dev
Gun.io
Lemon.io
Upwork
```

Search vocabulary included:

```text
field service management
field service software
work order management
technician dispatch
service scheduling
mobile technician app
HVAC CRM
plumbing CRM
ServiceTitan replacement
Jobber replacement
route service SaaS
maintenance management
inspection and field reporting
```

### 4.2 Public-Visibility Constraint

The platforms do not expose equivalent evidence.

| Platform group | Public demand visibility | Research interpretation |
|---|---|---|
| Upwork | relatively high; buyer briefs and project language are commonly public or search-indexed | usable as direct customer-demand evidence after anonymization |
| A.Team / Toptal / Braintrust | low; projects are commonly matched inside a screened network | absence of public postings is not evidence of absent demand |
| Arc.dev / Gun.io / Lemon.io | low to medium; public material is weighted toward talent profiles or broad roles | useful for channel strategy, weak for detailed feature-frequency measurement |

**Rule:** marketplace search results must be labeled by visibility class. Runory must never treat “not publicly discoverable” as “no customer demand.”

### 4.3 What The Scan Can And Cannot Prove

The scan can support:

- recurring buyer vocabulary;
- recurring product outcomes;
- greenfield versus replacement-system intent;
- common integration and implementation expectations;
- which projects are packaged as a complete product rather than a narrow coding task.

The scan cannot reliably support:

- total market volume by platform;
- comparative win rates;
- enterprise demand hidden behind private matching;
- exact budget distributions without a larger controlled sample;
- frequency claims based only on search-result counts.

## 5. Customer Source Register

Customer briefs are paraphrased and anonymized. Personal data, full copyrighted postings, credentials and customer-confidential workflow material must not be copied into the repository.

### DEM-FSM-001 — AI Operations Manager For Field-Service SMBs

Source type: public commercial SaaS build request  
Likely channel class: open freelance marketplace  
Industries named: HVAC, plumbing, landscaping, electrical, pest control, roofing  
Evidence level: E1, with several needs promoted through other sources

Business outcome:

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

Commercial signal:

- the buyer is purchasing an operating product, not a chatbot;
- AI is described as an operations layer over CRM, scheduling, communication and billing;
- multi-tenancy, roles, reliability and dashboards are part of the buying requirement.

### DEM-FSM-002 — Pool Service Vertical SaaS

Source type: public vertical-SaaS build request  
Likely channel class: open freelance marketplace  
Industries named: pool service, with planned landscaping, HVAC and aquarium expansion  
Evidence level: E1 for vertical details; E2/E4 for several shared FSM patterns

Business outcome:

> Run recurring route service and broader customer, technician, inventory, commercial and communication operations in one extensible platform.

Normalized jobs:

```text
manage customers with multiple properties and service history
schedule recurring service and routes
assign technicians and manage calendars
execute mobile checklists, photos, readings, signatures and reports
operate with weak or no connectivity
manage equipment, chemicals, parts, purchasing and truck stock
bill before or after service and track payment
communicate through notifications and two-way SMS
expose a customer portal
manage leads, sales teams and commissions
use technician assistance and anomaly detection
integrate accounting and payment providers
```

Commercial signal:

- recurring work is a distinct product layer, not merely repeated one-off work orders;
- route service combines planning, field evidence, inventory, billing and customer communication;
- the customer expects an extensible vertical platform rather than a single-industry hard-coded application.

### DEM-FSM-003 — Solar Installation CRM And Automation

Source type: owner-operated installation-business replacement-system request  
Likely channel class: open freelance marketplace  
Industry: solar PV installation and aftercare  
Evidence level: E1 for solar-specific rules; E2/E4 for CRM-to-service journey patterns

Business outcome:

> Replace disconnected CRM, accounting, automation and field-service subscriptions with one Lead-to-Aftercare operating system.

Normalized jobs:

```text
capture and prioritize leads by service area
produce, review, send, follow up and accept proposals
generate and store contracts, risk assessments and signed documents
invoice deposits and final balances and track payment state
schedule installation teams
complete commissioning forms
populate compliance and grant paperwork
provide customer document and support access
manage aftercare tickets and engineer callouts
automate stage-specific email follow-up with AI assistance
export owned business data and meet privacy or residency obligations
```

Commercial signal:

- buyers are willing to replace several subscriptions when one system owns the full journey;
- the commercial journey continues after quote acceptance into installation, payment, compliance and aftercare;
- industry paperwork is vertical policy, while document, form, workflow and record-mapping capabilities are shared.

### CASE-FSM-001 — XLink Waterproof Repair

Source type: nearby production operating system  
Industry: waterproof repair/service  
Evidence level: E3

Primary contribution:

```text
real multi-role workflow depth
forms required at process nodes
return, rollback, take-back, cancel, reopen and additional-handler behavior
deadline and reminder patterns
commercial and field-service linkage
actual operator vocabulary and exception pressure
```

XLink is an acceptance case and requirements mine, not the architecture to copy.

### BENCH-FSM-001 — Mature Commercial FSM Products

Source type: official Salesforce, Microsoft Dynamics 365, ServiceNow, Oracle and related domain documentation  
Evidence level: E4 when combined with repeated demand and the operating case

Primary contribution:

```text
work request versus schedulable visit or booking separation
resource assignment and dispatch workspaces
calendar, timeline and map planning
mobile worker execution
inspection, forms and evidence patterns
work-order, asset and service-history boundaries
role-specific product surfaces
```

## 6. Marketplace-Level Demand Findings

The current sample is small, but the demand shape is consistent and commercially meaningful.

### 6.1 Buyers Purchase An Operating System, Not Isolated CRUD

Across the three commercial briefs, buyers ask for a connected chain:

```text
Lead / Request
→ Customer / Site / Asset
→ Quote / Contract
→ Work Order / Visit
→ Assignment / Schedule / Route
→ Mobile Execution / Evidence
→ Invoice / Payment
→ Follow-up / Aftercare
→ Reporting / Automation
```

This reinforces Runory's typed-capability composition strategy. A generic database builder alone would not meet the stated outcomes.

### 6.2 Replacement Intent Is A Stronger Signal Than Feature Count

At least one source explicitly seeks to replace several disconnected subscriptions. The underlying buying drivers are:

- duplicate entry;
- fragmented business truth;
- missed handoffs;
- weak automation between stages;
- excessive per-user or per-module cost;
- inability to adapt the workflow without custom development.

Runory should measure commercial value through systems consolidated, handoffs automated and operational truth unified—not only through feature parity.

### 6.3 Mobile Field Execution Is Mandatory, But Not Sufficient

The requested mobile surface repeatedly includes:

```text
assigned work
customer and site context
checklists and structured readings
photos and attachments
signatures
status and time capture
service history
offline or poor-connectivity behavior
```

A mobile work-order list without evidence integrity, sync behavior, permissions and recovery remains L1/L2 rather than commercially credible L3 coverage.

### 6.4 Scheduling Has Three Distinct Maturity Levels

```text
Level A — assignment and manual calendar planning
Level B — recurring schedules, routes, capacity and skills
Level C — travel-time, optimization, prediction and disruption handling
```

The current evidence supports Level A as core early scope, Level B as the next commercial layer and Level C as a later optimized capability.

### 6.5 AI Demand Is Real But Depends On Operational Truth

AI appears in phone operations, follow-up, anomaly detection and technician assistance. The repeated pattern is:

```text
AI reads trusted business state
AI proposes or performs a bounded operation
permissions and policy constrain the action
human review exists where risk requires it
every action remains visible and auditable
```

This supports Runory's “AI over governed runtime” direction and argues against shipping autonomous agents before commands, events, permissions, audit and recovery are mature.

### 6.6 Integration Demand Is Provider-Specific But Product-Neutral

Repeated provider categories include:

```text
payments
accounting
SMS and telephony
maps and travel time
e-signature
industry calculation or design services
```

Provider names belong in connectors. Provider-specific fields and failure behavior must not leak into core domain objects.

### 6.7 The Best-Fit Commercial Project Is Larger Than A Coding Gig

The strongest briefs require a combination of:

```text
product scoping
domain modeling
workflow architecture
full-stack implementation
mobile UX
integration design
security and tenancy
deployment and operations
```

This is commercially relevant for Runory in two ways:

1. the repository can become a reusable delivery accelerator for high-value custom FSM implementations;
2. repeated delivery work can be converted into shared modules, packs, connectors and implementation playbooks.

## 7. Normalized Demand Map

Presence means the job is materially requested, not that the customer used identical terminology.

| Demand cluster | 001 | 002 | 003 | Cross-source signal | Current placement |
|---|:---:|:---:|:---:|---|---|
| customer/contact CRM | ✓ | ✓ | ✓ | E2; fundamental | v0.5 |
| scheduling and dispatch | ✓ | ✓ | ✓ | E4 with XLink/vendors | v0.5 |
| authentication, roles, security and audit | ✓ | ✓ | ✓ | E4 platform trust | v0.4 foundation + v0.5 enforcement |
| customer communication and automation | ✓ | ✓ | ✓ | E2 | v0.7 candidate; provider depth remains evidence-gated |
| invoicing and payment state | ✓ | ✓ | ✓ | E2 | v0.7 commercial-completion candidate |
| AI assistance and automation | ✓ | ✓ | ✓ | E2 demand; dependencies immature | v0.8 governed Agent scenarios |
| operational reporting | ✓ | ✓ | — | E2 | v0.5 queues/basic; v0.7 workflow-specific candidate |
| forms, checklists, evidence and signature | — | ✓ | ✓ | E4 with XLink/vendors | v0.5/v0.5.1 |
| customer and service history | — | ✓ | ✓ | E4 with XLink/vendors | v0.5.1 |
| customer portal and support access | — | ✓ | ✓ | E2 | v0.7.3 discussion |
| proposal, quote and acceptance | — | — | ✓ | E4 through XLink/vendors and journey criticality | v0.5 |
| multiple properties, sites and equipment | — | ✓ | ✓ | E4 with mature FSM | v0.5 |
| mobile field execution | implied | ✓ | ✓ | E4 with XLink/vendors | v0.5.1 |
| recurring service | — | ✓ | — | E1 buyer; strong vertical pattern | v0.7 candidate |
| route sequencing and optimization | — | ✓ | — | E1 buyer; mature FSM pattern | v0.7 manual assistance candidate; optimization deferred |
| offline-first field execution | — | ✓ | — | E1 buyer; mature FSM pattern | v0.7 |
| inventory, purchasing and truck stock | — | ✓ | — | E1 vertical breadth | v0.7 |
| accounting and payment integrations | — | ✓ | ✓ | E2 | v0.7 |
| sales commissions | — | ✓ | — | E1 adjacent domain | v0.7 or sales pack |
| industry compliance or calculation | — | chemical | solar/grant | vertical-specific | v0.8+ packs/extensions |
| owned-data export and portability | implied | implied | ✓ | E1 explicit; platform trust requirement | foundation + GA contract |
| replacement of fragmented tools | implied | implied | ✓ | commercially important | solution packaging and migration |

Frequency is not the only prioritization rule. Quote appears explicitly in one brief but remains v0.5 because it is journey-critical and independently validated. AI appears in all three but remains later because useful AI depends on trusted business records, commands, events, permissions and evaluations.

## 8. Product-Boundary Classification

### 8.1 Core Platform Runtime

Use when the capability protects all business products or provides universal execution semantics.

```text
tenant isolation
authentication and execution context
command, idempotency, audit and outbox
Workflow and work items
Forms definitions and submissions
assignment and scheduling runtime
attachment and evidence integrity
migration and owned-data export contracts
```

### 8.2 Typed Shared Product Capability

Use when users recognize a stable business job with reusable internals and meaningful invariants.

```text
CRM customer and opportunity
Quote
Work Order and Visit
Planning
Invoice and Contract
Inventory
Ticket and customer support
Asset and service history
```

A shared capability is not automatically a universal untyped object.

### 8.3 Industry Pack

Use when several customers in one vertical share vocabulary, calculations, policies, forms, dashboards or default processes.

```text
pool chemistry and dosage
solar commissioning and grant paperwork
HVAC diagnostic measurements
pest-treatment compliance
landscape property zones and seasonal programs
```

Industry packs consume shared objects and runtimes. They must not fork Workflow, Forms, Scheduling, Quote, Inventory or permission systems.

### 8.4 Connector

Use when the primary variability is an external provider or protocol.

```text
Stripe or another payment provider
QuickBooks, Zoho Books or Xero
Twilio or another SMS/telephony provider
e-signature providers
maps and travel-time providers
industry design or calculation providers
```

Connectors use provider-neutral contracts, idempotency, replay, health and visible failure. Provider names must not leak into the core domain model.

### 8.5 Workspace Configuration And Governed Extension

Use when variation is primarily customer policy or presentation.

```text
form names and fields
checklist items and evidence requirements
approval groups and thresholds
workflow timing and allowed return paths
document terminology and branding
service categories, priorities and regions
email copy and reminder cadence
customer-specific reporting definitions
```

Configuration may specialize behavior only inside governed extension points; it cannot bypass domain invariants.

## 9. Investment Prioritization

New demand is evaluated from 0–3 on:

| Dimension | Question |
|---|---|
| journey criticality | Does the promised user journey fail without it? |
| recurrence | Is it repeated across independent customers or industries? |
| portability | Can many solutions reuse the same capability? |
| commercial value | Does it affect adoption, retention, revenue, labor or risk? |
| prerequisite leverage | Does it unlock several later capabilities? |
| evidence confidence | Is it stated, repeated, observed and domain-validated? |

Complexity, irreversible architecture risk, compliance burden and operational cost are recorded separately as Low/Medium/High. They affect sequencing and proof requirements; they do not erase demand.

## 10. Current Investment Reading

### Invest Now — v0.5 Family

```text
governed execution and reverse operations
CRM, Quote and FSM composition
Forms, checklists, evidence and immutable submissions
My Work and approval work items
manual assignment, scheduling and Planning
lightweight field PWA
customer, site, asset and service history
formal Quote output
permission, idempotency, audit, recovery and performance
```

Standard: production-shaped end-to-end execution, not installable object coverage.

### Earlier v0.6 Product Proposal — Transferred to Discussion

v0.6 closed at `v0.6.0` Foundation. The product candidates below were not
released as `v0.6.1–v0.6.6`; their canonical disposition is maintained in
[v0.6 Deferred Work Handoff](../architecture/v0.6-deferred-work-handoff.md)
and they are compared, not automatically committed, in
[v0.7 Planning Brief](../product/v0.7-planning-brief.md).

```text
recurring service plans and generated work
Lead qualification
customer portal, Ticket, aftercare and booking
outbound notifications and follow-up
Contract, Invoice and payment-status ledger
operational analytics and human-confirmed summaries
migration tooling for common source systems
```

Standard: one-off and recurring service operations with customer and commercial follow-through.

### Prepare Now, Build Later — v0.7 Family

```text
offline synchronization
route and location optimization
inventory and procurement
payment, accounting and communication integrations
AI phone, technician, support and workflow agents
```

Preparation in earlier versions means stable command, event, permission and provider contracts. It does not mean prematurely implementing these products.

### Verticalize After Shared Runtimes — v0.8+

```text
pool chemistry and billing
solar design, grant and compliance
HVAC diagnostics
landscape seasonal programs
pest-treatment compliance
```

## 11. Build Standard And Coverage Levels

| Level | Meaning | Evidence required |
|---|---|---|
| L0 | unsupported | no governed path |
| L1 | modeled | schema or object exists; CRUD or prototype only |
| L2 | usable flow | primary happy path works for one role |
| L3 | production-shaped | permissions, validation, reverse paths, concurrency, audit, recovery, migration, role UX and operational visibility |
| L4 | scaled or optimized | measured scale, advanced automation or optimization, provider ecosystem or offline reliability as applicable |

Roadmap promises should normally require L3. Research prototypes may stop at L1/L2 but must not be counted as commercial coverage.

For each capability, the acceptance card should identify:

```text
named user and business job
entry and completion outcome
authoritative aggregate and state
commands and permissions
required input and evidence
reverse and exception operations
idempotency and concurrency behavior
audit and history
mobile, desktop and portal surfaces in scope
failure, retry and diagnostic behavior
migration and compatibility
performance and load profile
automated and pilot evidence
```

## 12. Interpreting The 90% Target

Runory's target is not “90% of every sentence in a brief.” It is:

> At least 90% of the weighted, normalized business jobs for a target customer profile can be completed at L3 using Runory shared products, configuration, supported connectors and documented extension points; no custom fork of core business runtimes is required.

Measure separately:

```text
product coverage
  jobs completed by released shared Runory products, configuration and connectors

solution coverage
  jobs completed after approved industry or customer extensions are added
```

Suggested coverage factors:

```text
L0 unsupported          0.00
L1 modeled              0.20
L2 usable primary flow  0.60
L3 production-shaped    1.00
L4 optimized            1.00 plus quality evidence; never more feature credit
```

Weight each normalized job as Must=3, Important=2 or Optional=1 for the customer profile. Keep regulatory blockers visible even when their numerical weight is small.

## 13. Commercial Opportunity Reading

The marketplace evidence supports two related Runory business models.

### 13.1 Product Revenue

Provide a configurable FSM SaaS for service SMBs that need:

```text
faster deployment than custom software
more adaptability than rigid vertical SaaS
lower integration and migration friction
AI assistance grounded in operational truth
```

### 13.2 Productized Implementation Revenue

Use Runory as the delivery base for paid engagements:

```text
FSM discovery and solution architecture
replacement-system implementation
vertical workflow pack development
connector implementation
data migration
AI voice and operations automation
```

Each implementation should be reviewed for reusable assets. Repeated assets graduate into shared capabilities, packs, connectors or implementation templates rather than remaining customer-specific forks.

### 13.3 Marketplace Positioning

Runory-related commercial work should be positioned as:

> Production-ready FSM and AI operations systems—from workflow and architecture through full-stack delivery—not generic hourly full-stack development.

Best-fit demand signals include:

```text
replace ServiceTitan, Jobber, spreadsheets or disconnected tools
build a vertical FSM SaaS
build technician dispatch and mobile execution
connect CRM, quote, scheduling, invoice and aftercare
add AI phone intake or operations automation to an existing service business
```

Poor-fit demand includes isolated UI work, generic CRUD, low-budget clones and projects without an accountable business owner or operating workflow.

## 14. Intake Template For New Marketplace Evidence

```markdown
### DEM-FSM-NNN — Short anonymized profile

Source date:
Source platform:
Public visibility: public brief / indexed summary / private match / customer discovery
Source type:
Industry/region:
Evidence level:
Commercial stage: public brief / discovery / pilot / paying deployment

Business outcome:

Normalized jobs:
- ...

Current tools being replaced:
- ...

Constraints affecting product design:
- ...

Industry or customer-specific details:
- ...

Candidate shared capabilities:
- ...

Initial classification and roadmap placement:
- ...

Budget or procurement signal, when safely available:
- fixed-price / hourly / long-term / team request / unknown

Unknowns and validation questions:
- ...
```

Do not copy personal data, customer secrets, credentials, private workflow documents or full copyrighted postings. Paraphrase the business need and retain a controlled source reference only where authorized.

## 15. Research Backlog

The next marketplace synthesis should collect at least ten additional material briefs, with priority on:

```text
HVAC and plumbing dispatch
facilities maintenance
inspection and compliance services
installation and aftercare
recurring route service
multi-contractor and franchise operations
ServiceTitan or Jobber replacement
AI phone intake connected to work-order creation
```

For each platform, record:

```text
public visibility class
search date and vocabulary
number of material briefs reviewed
number admitted as evidence
industry
buyer outcome
replacement tools
normalized jobs
budget model when visible
```

Private-network opportunities from A.Team, Toptal, Braintrust, Arc.dev, Gun.io and Lemon.io should be added only when legitimately received through the platform or customer discovery. They must not be reconstructed from unsupported assumptions.

## 16. Synthesis And Review Process

### On Every New Source

1. anonymize and record the source;
2. extract business jobs, exceptions, actors, artifacts and outcomes;
3. map them to existing normalized demand clusters;
4. add a new cluster only when existing vocabulary cannot express the job;
5. classify core, product, pack, connector or configuration;
6. update evidence level and roadmap impact;
7. record unknowns rather than guessing.

### Synthesis Cadence

Perform a formal synthesis after every five material new sources or at least quarterly:

```text
recount cross-industry demand
review new, strengthened or weakened signals
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

## 17. Decision Log

| Date | Evidence change | Decision |
|---|---|---|
| 2026-07-03 | first three briefs normalized with XLink and mature-FSM evidence | retain v0.5 execution core; add mobile PWA, service history and formal Quote output to v0.5.1 family scope |
| 2026-07-03 | recurring service, portal, billing and aftercare demand separated from single-job execution | define v0.6 as Recurring Service And Customer Operations |
| 2026-07-03 | offline, route optimization, inventory, financial or communication integrations and AI depend on mature operational truth | define v0.7 as Connected, Offline And Intelligent Operations |
| 2026-07-03 | pool chemistry and solar grant or design needs are industry-specific but share Forms, Workflow and document runtimes | reserve v0.8+ for vertical packs rather than hard-code them into core |
| 2026-07-15 | scan of A.Team, Toptal, Braintrust, Arc.dev, Gun.io, Lemon.io and Upwork showed major public-visibility differences | add marketplace visibility classification; do not interpret absent public listings as absent demand |
| 2026-07-15 | commercial briefs consistently request connected operational products rather than isolated coding tasks | reinforce typed CRM + Quote + FSM + billing composition and productized implementation strategy |
| 2026-07-15 | replacement-system intent exposes migration, owned-data portability and integration as buying requirements | add migration and export contracts to platform and v0.6 planning |
| 2026-07-15 | AI demand is repeatedly layered over scheduling, communication, billing and service records | retain AI after governed operational truth; prioritize bounded, auditable actions |
| 2026-07-20 | v0.6.0 Foundation shipped while the proposed v0.6.1–v0.6.6 product increments remained unstarted | freeze v0.6 at v0.6.0; transfer product proposals to the v0.7 discussion pool, move repeatability validation to v0.9, and retain only evidence-selected scope |

## 18. Current Product Judgment

The current evidence supports Runory's direction:

```text
v0.5 is not too narrow; it is the dependency foundation.
v0.6 turns execution into an ongoing service business.
v0.7 makes the platform broadly solution-complete for the current profiles.
v0.8 makes selected industries closer to out-of-box.
v0.9 validates the 90/10 model with a broader cohort and independent extensions.
v1.0 turns measured coverage and governed extension into a GA promise.
```

The marketplace evidence also supports a near-term commercial thesis:

> Runory can be both a SaaS product and a reusable implementation platform for customers seeking to replace fragmented field-service tools or build vertical FSM products.

The benchmark must remain alive. As evidence grows, Runory should strengthen, defer, split or cancel roadmap investments while preserving the reasoning trail connecting real customer work to product architecture and release standards.
