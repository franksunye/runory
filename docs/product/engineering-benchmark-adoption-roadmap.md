# Runory Engineering Benchmark Adoption Roadmap

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product-engineering` |
| Applies to | `v0.6–v1.0` |
| Owner | Product / Architecture / Engineering |
| Last reviewed | 2026-07-27 |
| Supports | [Product Roadmap](product-roadmap.md) |
| Research inputs | [Adjacent Platform Landscape](../research/adjacent-platform-landscape.md), [Twenty Platform Benchmark](../research/twenty-platform-benchmark.md) |
| Supersedes | — |
| Superseded by | — |

## 1. Purpose

The Product Roadmap answers which FSM business capability becomes commercially usable in each version. This companion roadmap answers a second question:

> **Which engineering, UX, workflow, platform, and delivery capabilities must mature at each version, and which external reference platforms should inform those decisions?**

Runory must not evolve through isolated feature delivery or internal assumptions alone. It should continuously study adjacent platforms, extract reusable patterns, and adopt them only when they strengthen the current milestone without weakening Runory's governed-execution boundary.

The operating principle is:

> **Look outward continuously; adopt selectively; keep the Runtime contract internally coherent.**

External products are references, not upstream product owners. Runory should borrow proven interaction patterns, platform mechanics, and engineering practices while preserving its own Business Commands, domain invariants, transaction guarantees, Agent authorization model, and authoritative business state.

## 2. Dual-track Milestone Model

Every milestone has two parallel conclusions:

```text
Product Track
What FSM business capability becomes commercially usable?

Engineering Maturity Track
What product, platform, runtime, UX, and delivery guarantee becomes production-grade?
```

A version is complete only when both conclusions are satisfied.

| Version | Product conclusion | Engineering maturity conclusion |
| --- | --- | --- |
| v0.6 | The shared FSM foundation is stable. | Architecture boundaries, Command enforcement, observability, compatibility, and runtime baselines are machine-auditable. |
| v0.7 | One Reactive Repair job reaches a governed paid or refunded Invoice. | Financial and external-event execution remains correct under retry, concurrency, replay, partial failure, and reconciliation. |
| v0.8 | Approved Agents can configure, adapt, and deploy Runory FSM. | Agent contracts, manifests, Object View foundations, Workflow Builder foundations, and controlled change lifecycle become usable platform capabilities. |
| v0.9 | The same product can be delivered repeatedly without Core forks. | Packs, migrations, provisioning, upgrades, diagnostics, configuration diff, and support tooling become repeatable delivery infrastructure. |
| v1.0 | Runory is a complete commercially supported FSM product. | Reliability, security, upgradeability, operability, UX consistency, supportability, and documented engineering gates reach GA level. |

## 3. Adoption Rules

A reference-platform capability enters a milestone only when all of the following are true:

1. It directly supports that milestone's product or engineering conclusion.
2. It can be expressed through Runory's existing architectural boundaries.
3. It does not introduce an alternative mutation path around governed Commands.
4. It has an explicit owner, acceptance test, and compatibility implication.
5. It is adopted as a Runory capability rather than copied as an isolated UI or framework experiment.
6. Code reuse, if any, is license-compatible and technically separable.

Each adopted pattern must be classified as one of:

- **Adopt** — use substantially as an established pattern;
- **Adapt** — retain the core idea but redesign for Runory contracts;
- **Defer** — valuable, but not required in the current milestone;
- **Reject** — conflicts with Runory's product or architecture principles.

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

The product goal is commercial completion through Invoice and payment. The engineering goal is stronger:

> Financial state must remain correct under duplicate requests, concurrency, delayed or reordered provider events, partial failure, refund, replay, and reconciliation.

Required maturity:

- idempotent financial Commands and provider-event handlers;
- immutable Invoice snapshots and allocation lineage;
- explicit transaction boundaries and optimistic-concurrency policy;
- refund reversal and compensation semantics;
- payment-provider event deduplication and replay;
- reconciliation jobs and operator-visible discrepancies;
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
- reconciliation identifies provider/Runory divergence;
- every financial transition has an actor, cause, prior state, resulting state, and audit record;
- operator tooling can diagnose and safely resolve supported failure cases without direct database mutation.

## 6. v0.8 — Agent Platform, Product Surface, and Workflow Control

v0.8 is where external research becomes most visibly productized. It must not be reduced to exposing more MCP tools.

### 6.1 Agent Capability Contract

Required capabilities:

- versioned capability discovery;
- named Command schemas and machine-readable preconditions;
- structured preview, apply, verify, and rollback results;
- stable error and remediation contracts;
- delegated Agent identity and authorization;
- execution limits, risk classification, and high-risk confirmation;
- Agent Run logs and task-level evaluation;
- one authorization and execution boundary shared by Agent, desktop, mobile, voice, and background jobs.

Primary references:

- Twenty MCP and application-capability exposure;
- NocoBase external-Agent, metadata, API, MCP, and plugin boundaries;
- Directus generated API and permission ergonomics.

Runory adaptation:

> Agents discover business capabilities and named Commands, not unrestricted table or record mutation.

### 6.2 Manifest, Pack, and Extension Foundation

Required capabilities:

- Manifest v1 for Modules, Packs, and Workspace Extensions;
- stable Module, Object, Field, View, Command, Workflow, Role, and Permission identifiers;
- dependency and compatibility validation;
- install, seed, migration, verification, upgrade, and rollback hooks;
- typed SDK and minimal CLI workflow;
- ownership boundaries for Official Modules, Industry Packs, and Workspace Extensions;
- generated implementation and compatibility reports.

Primary references:

- Twenty Apps, manifests, stable IDs, CLI, typed SDK, and publish/install lifecycle;
- NocoBase microkernel and plugin lifecycle;
- Frappe Apps and long-lived module installation practices;
- Odoo module packaging and commercial Pack composition.

### 6.3 Object View Framework Foundation

Runory already owns its FSM objects. v0.8 should add the shared Product View layer between business data and individual pages.

Target model:

```text
Business Object
→ View Definition
→ Query / Filter / Sort / Group
→ Field Presentation
→ Record Actions
→ Desktop Table / Mobile Card / Board / Agent View
```

Minimum scope:

- shared View Definition and stable View IDs;
- visible fields, ordering, sorting, filtering, grouping, and saved views;
- role-default views;
- record actions and primary action;
- desktop-table and mobile-card projection;
- consistent loading, empty, error, permission, and partial-data states;
- Customer, Work Order, and one commercial object as reference implementations.

Primary references:

- Twenty for object lists, saved views, record pages, navigation, density, command menu, and interaction consistency;
- Directus for data/view separation and configurable layouts;
- NocoBase for metadata-to-UI composition.

Runory adaptation:

- emphasize current execution state;
- surface owner, SLA, risk, exception, and next action;
- preserve role-specific operational density;
- avoid generic record-management UX where an FSM-specific action model is clearer.

### 6.4 Workflow Builder Foundation

The v0.8 target is not a full low-code automation product. It is the first credible Workflow Control Surface for Agent-managed, human-governed workflows.

Required modes:

1. **Overview** — business-readable process explanation;
2. **Review** — Agent-generated change Diff, impact, and risk;
3. **Configure** — advanced editing for implementers;
4. **Run** — actual execution path, timing, work items, approvals, errors, retries, and audit.

Minimum engineering scope:

- workflow schema-to-canvas mapping;
- trigger, Business Command, condition, branch, approval, human task, wait, retry, escalation, completion, and compensation nodes;
- Inspector panel driven by schema;
- validation and compatibility checks;
- Draft, version, publish, and rollback lifecycle;
- visual version Diff;
- run-path highlighting and node-level diagnostics;
- permissions and governance metadata visible in the Builder;
- read-only mode suitable for ordinary business users.

Primary references:

- Twenty for canvas UX, side-panel configuration, branching, version status, and Run visualization;
- Windmill for execution diagnostics, retries, errors, and workflow-as-code discipline;
- NocoBase for workflow/plugin integration;
- Frappe for business-readable workflow states and approvals.

Runory adaptation:

> The Builder visualizes and governs workflows whose state transitions and actions remain Runtime-owned and Command-driven.

### 6.5 v0.8 acceptance evidence

- an approved Agent modifies a Workspace using preview, Diff, approval, apply, verify, audit, and rollback;
- a Pack installs and upgrades through a stable Manifest without Core edits;
- Customer and Work Order views are produced from shared View Definitions on desktop and mobile;
- an Agent proposes a workflow change, a user reviews it visually, the Runtime validates it, and a published Run can be inspected end to end.

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

### 7.2 Reference inputs

| Reference | Adopt or adapt in v0.9 |
| --- | --- |
| Frappe | Bench migration discipline, App lifecycle, operational upgrade practices |
| Odoo | Module dependency handling, implementation partner workflow, customer expansion mechanics |
| Twenty | App installation, publishing, versioning, and workspace-level product polish |
| NocoBase | Plugin composition, environment configuration, self-host operational practices |
| Directus | Extension packaging and environment/configuration portability |

### 7.3 Product convergence

By v0.9, benchmark adoption must reduce fragmentation rather than add more alternatives.

Required convergence work:

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
- number of customer requirements satisfied through configuration, Pack, and Extension;
- number of Core changes required per customer, with target zero;
- manual migration and upgrade interventions;
- failed or rolled-back installations/upgrades;
- support hours during onboarding and first 30 days;
- percentage of shared Product Surface and workflow components reused across customer solutions.

## 8. v1.0 — GA Engineering and Experience Gate

v1.0 requires an explicit engineering contract, not only feature completeness.

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
- desktop and mobile experiences share View and action contracts where appropriate;
- accessibility and keyboard-operation baseline;
- Workflow Builder and Run visualization are understandable in read-only mode by business users;
- product polish is benchmarked against Twenty and other current references before GA sign-off.

### 8.6 GA benchmark review

Before GA, run a formal benchmark review against the then-current versions of:

- Twenty — Product Surface, Workflow Builder, Apps, Agent/MCP;
- NocoBase — metadata, plugin, AI, MCP, self-hosting;
- Frappe / ERPNext — module lifecycle, migration, business workflows;
- Windmill — workflow runtime and diagnostics;
- Directus — data/view platform and extensions;
- Odoo — module ecosystem, implementation, and commercial expansion.

The review does not require feature parity. It must identify:

- missing table-stakes capabilities;
- deliberate Runory differences;
- accepted gaps and post-1.0 disposition;
- any architecture or UX debt that would materially weaken commercial credibility.

## 9. Post-1.0 Benchmark Use

### v2.0 — Advanced FSM

Study and selectively adopt:

- Odoo and ERPNext inventory, procurement, recurring service, and financial-integration patterns;
- mature FSM vendors for dispatch, route, asset, offline, and technician workflows;
- Directus and NocoBase for richer customer-specific data and experience composition.

### v3.0 — Agentic Operations

Study and selectively adopt:

- workflow and durable-execution platforms for long-running operational Agents;
- Agent evaluation, identity, governance, and control-plane platforms;
- operational inbox, exception management, and human-in-the-loop patterns.

Runory must keep operational Agents inside the same Command, permission, workflow, audit, and authoritative-state boundaries.

### v4.0 — SMB Platform and Ecosystem

Study and selectively adopt:

- Odoo's module-market and partner ecosystem;
- Frappe's framework-to-ERP evolution;
- Twenty's Apps and developer experience;
- NocoBase's plugin and metadata platform;
- WordPress-like discovery, installation, ownership, and upgrade expectations.

The transition beyond FSM remains evidence-driven and requires a separate product decision.

## 10. Continuous Industry Review Process

### Cadence

- lightweight review of priority platforms at least monthly;
- material document update at least quarterly;
- mandatory review before v0.8 Product Surface or Workflow Builder architecture freeze;
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
- owner and decision status.

### Decision log template

```text
Reference platform:
Observed capability:
Why it matters:
Runory classification: Adopt / Adapt / Defer / Reject
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

The immediate research-to-engineering sequence is:

1. preserve v0.6 architecture correctness and compatibility;
2. complete v0.7 financial integrity before broad platform work;
3. specify Object View Framework and Workflow Builder during v0.7, ready for v0.8 implementation;
4. define Manifest v1 and Agent Capability Contract before v0.8 implementation begins;
5. use v0.9 to converge and operationalize these capabilities across real customers;
6. run a formal current-market benchmark before v1.0 GA.

> **Runory should not chase every adjacent platform feature. It should adopt the best proven ideas at the version where they reinforce the product, while continuously deepening governed business execution as its strategic center.**