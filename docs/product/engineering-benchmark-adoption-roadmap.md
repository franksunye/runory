# Runory Engineering Benchmark Adoption Roadmap

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product` |
| Applies to | `v0.6–v1.0` |
| Owner | Product / Architecture / Engineering |
| Last reviewed | 2026-07-27 |
| Supports | [Product Roadmap](product-roadmap.md) |
| Governing guardrails | [External Benchmark Adoption Guardrails](external-benchmark-adoption-guardrails.md) |
| Research inputs | [Adjacent Platform Landscape](../research/adjacent-platform-landscape.md), [Twenty Platform Benchmark](../research/twenty-platform-benchmark.md) |
| Supersedes | — |
| Superseded by | — |

## 1. Purpose

The Product Roadmap answers which FSM business capability becomes commercially usable in each version. This companion roadmap answers:

> **Which engineering, UX, workflow, platform, and delivery capabilities must mature at each version, and which external reference platforms should inform those decisions?**

Runory must not evolve through isolated feature delivery or internal assumptions alone. It should continuously study adjacent platforms, extract reusable patterns, and adopt them only when they strengthen the current milestone without weakening Runory's governed-execution boundary.

The operating principle is:

> **Look outward continuously; adopt selectively; keep the Runtime contract internally coherent.**

External products are references, not upstream product owners. Runory should borrow proven interaction patterns, platform mechanics, and engineering practices while preserving its own Business Commands, domain invariants, transaction guarantees, Agent authorization model, and authoritative business state.

All benchmark-driven scope in this roadmap is governed by the [External Benchmark Adoption Guardrails](external-benchmark-adoption-guardrails.md). The guardrails are binding, not advisory.

## 2. Dual-track Milestone Model

Every milestone has two parallel conclusions:

```text
Product Track
What FSM business capability becomes commercially usable?

Engineering Maturity Track
What product, platform, runtime, UX, and delivery guarantee becomes production-grade?
```

A version is complete only when both conclusions are satisfied. This rule is
prospective. Because this roadmap postdates v0.6.0 and v0.7.0, those releases
are mapped through the
[v0.6–v0.7 External Benchmark Retrospective](../releases/v0.6-v0.7-external-benchmark-retrospective-2026-07-27.md).
Later research may schedule forward hardening, but it does not silently change
an existing release Tag or accepted scope.

| Version | Product conclusion | Engineering maturity conclusion |
| --- | --- | --- |
| v0.6 | The shared FSM foundation is stable. | Architecture boundaries, Command enforcement, observability, compatibility, and runtime baselines are machine-auditable. |
| v0.7 | One Reactive Repair job reaches a governed paid or refunded Invoice. | Financial and external-event execution is correct under retry, concurrency, replay, partial failure and refund, with reconciliation explicitly bounded for forward hardening. |
| v0.8 | Operators and customers complete the canonical journey through coherent, secure surfaces. | Existing View and Workflow foundations converge; customer access and merchant-owned Stripe Connect payment are secure, scoped, auditable, and Command-driven. |
| v0.9 | The same product can be delivered repeatedly without Core forks. | Packs, migrations, provisioning, upgrades, diagnostics, configuration diff, and support tooling become repeatable delivery infrastructure. |
| v1.0 | Runory is a complete commercially supported FSM product. | Reliability, security, upgradeability, operability, UX consistency, supportability, and documented engineering gates reach GA level. |

## 3. Adoption Rules

The authoritative selection and complexity rules are defined in [External Benchmark Adoption Guardrails](external-benchmark-adoption-guardrails.md).

A reference-platform capability enters a milestone only when all of the following are true:

1. It directly supports that milestone's product or engineering conclusion.
2. It answers the four mandatory guardrail questions.
3. It can be expressed through one existing or explicitly approved Runory model.
4. It does not introduce an alternative mutation path around governed Commands.
5. It has an explicit owner, acceptance test, complexity assessment, and compatibility implication.
6. It is adopted as a Runory capability rather than copied as an isolated UI or framework experiment.
7. It fits the milestone's structural-change budget.
8. Code reuse, if any, is license-compatible and technically separable.

Each observed pattern must be classified as:

- **Adopt** — use substantially as an established pattern;
- **Adapt** — retain the core idea but redesign for Runory contracts;
- **Defer** — valuable, but not required in the current milestone;
- **Reject** — conflicts with Runory's product or architecture principles.

The default is **Defer** when the current problem, cost of delay, reused Runory model, or long-term complexity cannot be stated clearly.

## 4. v0.6 — Foundation Correctness and Engineering Baseline

### 4.1 Engineering objective

v0.6 establishes the stable internal foundation on which later platform and UX sophistication can safely be built.

Required maturity:

- clear Core, Platform Service, Module, Provider Adapter, projection, and persistence ownership;
- Command, Contract, Provider, permission, and transaction enforcement;
- tenant, Principal, row-visibility, provisioning, and repair consistency;
- shared webhook, Outbox, replay, reconciliation, and integration primitives;
- architecture tests and compatibility fixtures;
- logs, metrics, traces, business-event visibility, and performance baselines;
- migration and upgrade evidence for the v0.5 behavior baseline.

### 4.2 Reference inputs

| Reference | Adopt or adapt in v0.6 | Explicitly defer |
| --- | --- | --- |
| Directus | Clear metadata/data boundary; permission and extension-boundary review | Rich Data Studio and general-purpose layout builder |
| Frappe | Stable identifiers, metadata ownership, migration discipline, app/module boundary lessons | Broad ERP-style DocType configurability |
| Windmill | Execution visibility, retry/error terminology, run diagnostics concepts | General script runtime and user-authored technical automation |
| Twenty | Design-system inventory and object-page decomposition as research inputs | Major Product Surface rewrite and Workflow Builder |

### 4.3 Release evidence

- architecture conformance tests prevent forbidden dependencies and bypass paths;
- all governed writes enter through the Command boundary;
- duplicate webhook, retry, and concurrent-command fixtures pass;
- baseline operational dashboards expose Command, workflow, integration, and tenant failures;
- the v0.5 canonical journeys remain behavior-compatible.

## 5. v0.7 — Transactional Integrity and Financial Reliability

### 5.1 Engineering objective

> Financial state must remain correct under duplicate requests, concurrency,
> delayed or reordered provider events, partial failure, refund, and replay.
> Provider reconciliation must have an explicit boundary and forward owner.

Required maturity:

- idempotent financial Commands and provider-event handlers;
- immutable Invoice snapshots and allocation lineage;
- explicit transaction boundaries and optimistic-concurrency policy;
- refund reversal and compensation semantics;
- payment-provider event deduplication and replay;
- a declared provider-retrieval/reconciliation boundary and an owned forward
  plan for operator-visible discrepancies;
- durable financial audit and repair-safe diagnostics;
- tests for duplicate issue, duplicate allocation, over-allocation, concurrent payment, late webhook, and partial failure.

### 5.2 Reference inputs

| Reference | Adopt or adapt in v0.7 | Runory-specific requirement |
| --- | --- | --- |
| Odoo | Commercial-document lifecycle clarity and operator-visible financial states | Do not expand into general accounting; preserve bounded FSM commercial completion |
| Frappe / ERPNext | Immutable document and amendment/reversal concepts | Map all writes to named Commands and Runory audit/outbox guarantees |
| Directus | Operator-facing event and record inspection patterns | Diagnostics must explain authoritative state, not merely display raw records |
| Windmill | Retry, failure, run-history, and replay visibility | Provider execution remains inside governed integration and Command boundaries |

### 5.3 Release evidence

- no duplicate Invoice, allocation, or refund under repeated requests;
- the provider/Runory reconciliation boundary and residual implementation gap
  are explicitly recorded;
- every financial transition has an actor, cause, prior state, resulting state, and audit record;
- payment/refund and Outbox failures are visible and recoverable within the
  released scope without routine direct database mutation.

## 6. v0.8 — Product Surface and Customer Access Maturity

Accepted execution plan: [v0.8 Product Maturity and Customer Access](v0.8-product-maturity-execution-plan.md).

The repository already contains View Definitions, Workflow V2, manifests,
installation/upgrade validation, Workspace Extensions, and governed Agent
change paths. v0.8 converges and productizes those foundations rather than
recreating them as simultaneous public platforms.

### 6.1 Existing View contract convergence

- type and validate the existing View Definition configuration;
- converge query, field-presentation, action, and UI-state vocabulary;
- support role defaults and bounded user preferences;
- prove Contact/Company, Work Order, and Invoice reference surfaces;
- share desktop/mobile actions where appropriate;
- remove superseded page-specific configuration.

Primary references: Twenty, Directus, and NocoBase.

> Improve `view_definitions`; do not add a second Object View framework.

### 6.2 Minimum customer access boundary

- expiring, revocable, tenant-scoped access grants;
- customer and record binding with visible-field allowlists;
- bounded Quote, service report, Invoice, and payment-status access;
- governed Quote acceptance and hosted-payment handoff;
- Stripe-managed Connected Account onboarding and readiness synchronization;
- Direct Checkout/refund execution in the Workspace merchant's account;
- dedicated Connect webhook isolation by connected account and mode;
- access, failure, acceptance, expiry, and revocation audit;
- enumeration, replay, stale-link, cross-record, and cross-tenant defenses;
- responsive, accessible, failure-complete customer states.

This is not a general portal or a second identity, authorization, document, or
payment model. Stripe Connect completes the existing provider-account boundary;
it does not introduce platform-held merchant funds, wallets, application fees,
or general payment orchestration.

### 6.3 Workflow visibility through Workflow V2

- business-readable Overview and Run projections of existing definitions,
  versions, instances, and Work Items;
- current step, completed path, pending work, failure, retry, and audit context;
- a later Adopt/Adapt/Defer decision for canvas, Review, and Configure modes.

The full Workflow Builder is deferred until repeated implementation evidence
shows the existing editor and read-only Run visibility are insufficient.

### 6.4 Existing Agent and MPT boundary

Current MCP, Command discovery, Workspace Extension, manifest, installer,
upgrade, and compatibility paths remain regression-tested. v0.8 does not
require Agent-generated official MPT, a marketplace, universal SDK, general
plugin lifecycle, Agent-assisted Local deployment, or an Agent-only execution
path.

### 6.5 v0.8 acceptance evidence

- three reference operator surfaces use the same typed View contract;
- a customer completes Quote acceptance/payment through existing Commands;
- two sandbox merchants receive Direct Charges in their own isolated Connected
  Accounts, including refund and webhook evidence;
- tenant, customer, record, and field isolation pass;
- canonical Workflow state is understandable through Workflow V2;
- Agent and extension regressions pass without adding product scope;
- no duplicate View, Workflow, identity, authorization, document, payment, or
  Agent model remains.

## 7. v0.9 — Repeatable Delivery and Product Convergence

### 7.1 Engineering objective

v0.9 proves that implementation is a repeatable product operation rather than a sequence of bespoke engineering projects.

Required maturity:

- automated Workspace provisioning and reference-solution installation;
- data-import and migration framework with dry-run, validation, mapping, and reconciliation;
- configuration and extension Diff between reference and customer Workspaces;
- compatibility report before install and upgrade;
- controlled release channels and deprecation policy;
- upgrade and rollback procedure across maintained customer solutions;
- Workspace health checks and repair tooling;
- support diagnostics package and implementation evidence report;
- customer extension isolation and zero Core forks;
- measurable implementation time, manual intervention, support load, and upgrade effort.

### 7.1.1 Minimum financial reconciliation hardening

Before v0.9 freezes public contracts, complete `V09-FIN-01` from the
[v0.6–v0.7 External Benchmark Retrospective](../releases/v0.6-v0.7-external-benchmark-retrospective-2026-07-27.md):

- compare one Runory Payment/Invoice settlement with a provider snapshot;
- expose `consistent`, `divergent`, and `unknown` results to authorized
  operators;
- converge supported missed/reordered event cases through named, idempotent,
  audited Commands;
- preserve tenant, provider-account, currency, allocation, and refund
  invariants;
- exclude accounting, bank-statement, payout, fee, tax, and dispute systems.

### 7.2 Reference inputs

| Reference | Adopt or adapt in v0.9 |
| --- | --- |
| Frappe | Migration discipline, App lifecycle, operational upgrade practices |
| Odoo | Module dependency handling, implementation-partner workflow, customer expansion mechanics |
| Twenty | App installation, publishing, versioning, and workspace-level product polish |
| NocoBase | Plugin composition, environment configuration, self-host operational practices |
| Directus | Extension packaging and environment/configuration portability |

### 7.3 Product convergence

Benchmark adoption must reduce fragmentation rather than add alternatives:

- one design system and interaction vocabulary;
- one Object View model;
- one Workflow Definition and Run model;
- one Manifest and compatibility model;
- one Agent Capability Contract;
- one lifecycle vocabulary for Draft, Preview, Apply, Publish, Upgrade, Rollback, and Repair;
- removal of duplicate page-specific or module-specific infrastructure.

### 7.4 Repeatability metrics

Track at minimum:

- elapsed time from new Workspace to accepted reference solution;
- number of requirements satisfied through configuration, Pack, and Extension;
- number of Core changes required per customer, with target zero;
- manual migration and upgrade interventions;
- failed or rolled-back installations/upgrades;
- support hours during onboarding and first 30 days;
- percentage of shared Product Surface and workflow components reused.

## 8. v1.0 — GA Engineering and Experience Gate

### 8.1 Reliability

- published Command, workflow, webhook, and background-job reliability baselines;
- P95/P99 latency and infrastructure-cost budgets;
- retry, dead-letter, replay, and reconciliation procedures;
- backup/restore and disaster-recovery drills;
- no supported journey requires routine direct database repair.

### 8.2 Security and Governance

- tenant isolation and permission regression suites;
- Agent delegated-authority tests;
- secret and credential lifecycle;
- complete and queryable audit coverage;
- risk-aware actions and approval boundaries;
- dependency, vulnerability, and license review.

### 8.3 Upgradeability

- supported N-1 upgrade path;
- migration dry-run and rollback evidence;
- Pack, View, Workflow, and Workspace Extension compatibility checks;
- stable deprecation policy;
- zero customer-specific Core forks.

### 8.4 Operability and Supportability

- logs, metrics, traces, business events, and health status;
- Command, workflow, integration, payment, voice, and Agent diagnostics;
- environment and configuration report;
- customer-support and incident runbooks;
- clear Cloud, Local, Pack, extension, and provider support boundaries.

### 8.5 Product Surface and UX Quality

- consistent navigation, list, record, action, saved-view, permission, and error patterns;
- desktop and mobile share View and action contracts where appropriate;
- accessibility and keyboard-operation baseline;
- Workflow Overview and Run visualization are understandable to business users;
- product polish is benchmarked against current references before GA.

### 8.6 GA benchmark review

Before GA, review the then-current versions of Twenty, NocoBase, Frappe / ERPNext, Windmill, Directus, and Odoo.

The review does not require feature parity. It must identify:

- missing table-stakes capabilities;
- deliberate Runory differences;
- accepted gaps and post-1.0 disposition;
- architecture or UX debt that materially weakens commercial credibility.

All resulting decisions must pass the guardrails.

## 9. Post-1.0 Benchmark Use

### v2.0 — Advanced FSM

Study and selectively adopt mature inventory, procurement, recurring service, financial integration, dispatch, route, asset, offline, and technician-workflow patterns.

### v3.0 — Agentic Operations

Study durable execution, Agent evaluation, identity, governance, control-plane, operational inbox, exception management, and human-in-the-loop patterns while keeping Agents inside Runory's Command, permission, workflow, audit, and authoritative-state boundaries.

### v4.0 — SMB Platform and Ecosystem

Study Odoo's module market, Frappe's framework evolution, Twenty's Apps and developer experience, NocoBase's plugin/metadata platform, and WordPress-like discovery, installation, ownership, and upgrade expectations.

The transition beyond FSM remains evidence-driven and requires a separate product decision.

## 10. Continuous Industry Review Process

### Cadence

- lightweight review of priority platforms at least monthly;
- material document update at least quarterly;
- mandatory review before v0.8 Product Surface contract freeze;
- mandatory review before v0.9 public-contract freeze;
- mandatory review before v1.0 GA sign-off.

### Required output

Each review records:

- relevant release or product change;
- Runory capability affected;
- classification: Adopt, Adapt, Defer, or Reject;
- target version;
- architecture and migration implications;
- UX and design-system implications;
- license or dependency implications;
- owner and decision status;
- completed guardrail questions and complexity assessment.

### Decision log template

```text
Reference platform:
Observed capability:
Current Runory problem solved:
Cost of not doing it now:
Existing Runory model reused:
Long-term complexity introduced:
Simplification or duplication removed:
Classification: Adopt / Adapt / Defer / Reject
Target version:
Runory-owned contract affected:
Acceptance evidence:
Migration or compatibility impact:
Decision owner:
```

## 11. Cross-version Commitments

```text
External references inform decisions; they do not become accidental architecture.
Product Surface improvements use shared View and action contracts, not page-specific forks.
Workflow UX never bypasses Runtime-owned workflow semantics or Business Commands.
Apps, Packs, and Extensions use stable manifests, ownership, compatibility, and upgrade rules.
Agent access shares the same identity, permission, validation, transaction, audit, and state boundaries as human access.
Every adopted pattern has a target version, owner, acceptance evidence, and lifecycle implication.
```

## 12. Current Priorities

1. preserve the released v0.6 architecture and v0.7 financial baselines;
2. inventory existing View, Workflow, Manifest, Extension, and Agent models before adding abstractions;
3. converge the existing View contract on Contact/Company, Work Order, and Invoice;
4. implement bounded customer access through existing Commands and providers;
5. improve Workflow Overview and Run visibility without a new canvas or Runtime;
6. use v0.9 customer evidence to decide Contract and implementation-automation gaps;
7. run a formal current-market benchmark before v1.0 GA.

> **Runory should not chase every adjacent platform feature. It should adopt the best proven ideas at the version where they reinforce the product, while continuously deepening governed business execution as its strategic center.**
