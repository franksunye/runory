# Runory Implementation Platform Product Design

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `implementation-platform` |
| Applies to | `v0.9+ / paid production delivery` |
| Owner | Product / Engineering / Customer Success / Commercial |
| Last reviewed | 2026-07-29 |
| Supersedes | — |
| Superseded by | — |

Runory should turn customer implementation into a first-class product capability rather than repeatedly operating it as an informal services project.

This document defines the product design for the Runory Implementation Platform. It supplements [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md), [Implementation Economics and Productization](implementation-economics-and-productization.md), and [Commercial Pricing and Packaging](commercial-pricing-and-packaging.md).

The delivery model remains authoritative for commercial sequence, implementation phases, approvals, provider ownership, UAT, and production cutover. The economics document remains authoritative for implementation-cost measurement and productization decisions. This document defines the product objects, workflows, surfaces, Agent interfaces, provider foundation, and minimum delivery system needed to operate those decisions.

## 1. Product decision

Runory implementation is itself a service operation that should run on Runory.

The complete model is:

```text
Customer implementation demand
→ Runory CRM and Sales qualification
→ Implementation Quote / Order
→ Implementation Work Order
→ Implementation Run
→ Blueprint and customer approvals
→ Workspace and provider provisioning
→ Migration and validation
→ UAT and production cutover
→ Hypercare and completion
→ reusable implementation assets and product backlog
```

The system must support four inseparable layers:

1. **Implementation service operations** — Runory receives, qualifies, sells, schedules, executes, and completes implementation work.
2. **Implementation system of record** — implementation has explicit objects, states, evidence, costs, approvals, and ownership.
3. **External-Agent implementation interface** — ChatGPT, Codex, Claude, and compatible enterprise Agents can assist through governed Runory Commands.
4. **Provider Foundation** — Twilio, Retell, Stripe, messaging, credentials, environments, testing, and cost controls are prepared before customer delivery begins.

None of these layers is optional for repeatable paid production delivery.

## 2. Runory as its own reference customer

Runory should use its own product to operate the customer implementation lifecycle.

A prospect may contact Runory through:

- Voice Intake;
- website form;
- email;
- partner referral;
- direct sales conversation;
- an approved external Agent.

A Voice Intake example is:

```text
Prospect calls Runory
→ Voice Intake identifies implementation intent
→ collects company, workflow, team, phone, payment, and system context
→ creates or updates Lead and Contact
→ creates an implementation qualification task
→ optionally schedules a discovery meeting
→ creates an initial Implementation Work Order after qualification
→ links the call, transcript, customer, opportunity, and implementation records
```

This provides an operational proof of the Runory proposition:

```text
Voice Intake
+ CRM
+ Sales
+ FSM / service execution
+ Payment
+ governed Agent operations
= Runory operating its own implementation service
```

The internal reference implementation must use the same business objects, Commands, permissions, audit, and workflow boundaries intended for customers and partners. It must not depend on hidden manual spreadsheets as the authoritative implementation state.

## 3. Product boundary

### 3.1 The Implementation Platform owns

The proposed implementation capability owns:

- implementation-specific commercial scope references;
- Implementation Order linkage;
- Implementation Run lifecycle;
- Implementation Blueprint versions;
- customer-input requests and completeness state;
- provider-connection references and readiness state;
- migration plans and batches;
- implementation test suites and evidence;
- approval gates;
- cutover and rollback plans;
- implementation issues and blockers;
- hypercare cases;
- implementation cost, time, and automation metrics;
- reusable implementation assets and productization candidates.

### 3.2 It does not duplicate

The Implementation Platform must not become authoritative for:

- Organization, Workspace, User, Role, Contact, Company, Opportunity, Quote, Invoice, Payment, Work Order, Service Visit, or Schedule Entry;
- Twilio, Retell, Stripe, or another provider's internal canonical objects;
- provider credentials or secret values;
- the customer's production business records after implementation;
- general project management unrelated to customer implementation.

It links to those authoritative records through stable identifiers and governed references.

## 4. Core product objects

The first product model should include the following objects.

### 4.1 Implementation Opportunity

Links the commercial opportunity to the proposed implementation scope.

Minimum fields:

- customer and primary contact;
- target Workspace or proposed Workspace;
- requested product capabilities;
- target plan;
- locations, users, technicians, and expected usage;
- Voice, messaging, payment, migration, and integration needs;
- target pilot and go-live dates;
- fit status and disqualifying conditions;
- linked sales Opportunity.

### 4.2 Implementation Order

The accepted commercial and delivery boundary.

Minimum fields:

- accepted plan and subscription term;
- implementation package and fee;
- included configuration;
- provider scope;
- migration and integration scope;
- customer obligations;
- assumptions, exclusions, and change-request rules;
- UAT and go-live acceptance criteria;
- payment state;
- linked Quote, Contract, Invoice, and Payment records.

### 4.3 Implementation Run

The authoritative execution record for one customer implementation.

Minimum fields:

- customer, Workspace, Order, delivery owner, and partner;
- implementation type and industry template;
- current state and phase;
- target and actual dates;
- dependencies and blockers;
- customer-input completeness;
- Blueprint version;
- configuration package version;
- provider readiness;
- migration readiness;
- test and UAT status;
- approvals;
- cutover and rollback state;
- planned and actual effort;
- provider and test cost;
- automation ratio;
- implementation contribution;
- reusable assets generated.

Proposed lifecycle:

```text
qualified
→ awaiting_order
→ awaiting_customer_inputs
→ blueprint_review
→ configuration
→ provider_provisioning
→ migration
→ validation
→ uat
→ ready_for_go_live
→ live
→ hypercare
→ completed

Any active state
→ blocked
→ cancelled
→ rollback_required
```

### 4.4 Implementation Blueprint

A versioned, structured translation of customer business intent into implementable configuration.

Sections should include:

- Workspace profile, locale, timezone, currency, and business identity;
- users, teams, roles, and permissions;
- service catalog, areas, prices, and policies;
- lifecycle, forms, required fields, and automation;
- scheduling and dispatch rules;
- Voice Intake greeting, collection policy, transfer, exception, disclosure, and recording rules;
- messaging templates, consent, and opt-out behavior;
- payment flow and Stripe readiness;
- source-data profile and migration mapping;
- integrations;
- test scenarios;
- cutover, rollback, training, and hypercare plans;
- unresolved decisions and required approvals.

The Blueprint must distinguish:

- customer-confirmed facts;
- inferred proposals;
- missing inputs;
- conflicts;
- defaults;
- exceptions requiring expert review.

### 4.5 Customer Input Request

Tracks each item the customer must provide or confirm.

Examples:

- legal entity and address;
- carrier bill and number-port authorization;
- recording disclosure approval;
- service catalog and coverage areas;
- staff list and roles;
- migration files;
- Stripe KYC and bank verification;
- transfer contacts;
- UAT approver.

Each request should track owner, due date, status, validation result, evidence, and blocking impact.

### 4.6 Configuration Package

A versioned, previewable package of proposed Runory configuration.

It may contain:

- Pack installation;
- Module settings;
- fields and forms;
- views and dashboards;
- role and permission changes;
- workflow and automation definitions;
- provider mappings;
- notification templates;
- industry-template references.

It must support preview, approval, apply, audit, version comparison, and rollback where supported.

### 4.7 Provider Connection

Provider-neutral connection state for Twilio, Retell, Stripe, email, SMS, calendar, accounting, and future providers.

Minimum fields:

- provider type and adapter;
- customer ownership model;
- environment;
- non-secret provider references;
- readiness and compliance status;
- cost center and usage limits;
- provisioning history;
- test status;
- production enablement approval;
- termination or asset-transfer rules.

### 4.8 Migration Plan and Migration Batch

Tracks source profiling, mapping, dry runs, import batches, reconciliation, exceptions, and final delta import.

### 4.9 Test Suite and Test Run

Tracks generated and curated scenarios, execution results, evidence, pass thresholds, regressions, and unresolved defects.

Voice tests should link calls, transcripts, structured outcomes, provider events, resulting Runory records, and evaluation results.

### 4.10 Approval Gate

Represents explicit approval for material implementation decisions.

Initial gate types:

- Blueprint approval;
- number purchase or port request;
- recording and disclosure approval;
- production Voice Agent publication;
- live messaging activation;
- live payment activation;
- production-data import;
- UAT acceptance;
- production cutover;
- rollback;
- material provider-cost commitment.

### 4.11 Go-live Plan

Versioned cutover checklist with sequence, owners, timing, validation, communications, monitoring, and rollback criteria.

### 4.12 Implementation Issue and Hypercare Case

Implementation Issues record blockers, defects, decisions, and exceptions before go-live. Hypercare Cases record post-launch stabilization work without silently expanding the agreed implementation scope.

## 5. End-to-end service workflow

The Implementation Platform should support the following complete service flow.

### Phase A — Intake and qualification

```text
Voice / web / email / partner / external Agent
→ Lead and Contact
→ Implementation Opportunity
→ qualification checklist
→ fit decision
→ discovery meeting or disqualification
```

### Phase B — Scope, quote, and order

```text
Discovery inputs
→ draft Implementation Blueprint
→ estimate implementation scope and cost
→ Quote / proposal
→ customer acceptance
→ implementation fee payment condition
→ Implementation Order
→ Implementation Run creation
```

### Phase C — Blueprint and inputs

```text
structured discovery
→ missing-input requests
→ Blueprint generation
→ customer review
→ revisions
→ Blueprint approval
```

### Phase D — Configuration and provider provisioning

```text
approved Blueprint
→ Configuration Package preview
→ Runory configuration apply
→ Twilio / Retell / Stripe provisioning
→ provider readiness checks
→ customer approvals for cost, legal, and production actions
```

### Phase E — Migration and QA

```text
source profiling
→ mapping proposal
→ dry run
→ reconciliation
→ generated test suite
→ automated and manual tests
→ defect resolution
→ acceptance evidence
```

### Phase F — UAT and launch

```text
customer UAT
→ readiness check
→ go-live approval
→ production cutover
→ monitoring
→ rollback if required
```

### Phase G — Hypercare and product learning

```text
stabilization
→ issue resolution
→ handover
→ actual cost and time capture
→ reusable asset extraction
→ productization backlog
→ implementation completion
```

## 6. Product surfaces

The first complete product should provide the following surfaces.

### 6.1 Implementation Inbox

Shows new implementation demand, missing customer inputs, blocked Runs, pending approvals, failed provider actions, failed tests, upcoming cutovers, and hypercare alerts.

### 6.2 Implementation Pipeline

Commercial and delivery pipeline from Lead through completed implementation, with filters for owner, partner, plan, industry, state, risk, and target date.

### 6.3 Implementation Run Detail

Recommended sections:

- Summary;
- Scope and Order;
- Blueprint;
- Customer Inputs;
- Configuration;
- Providers;
- Migration;
- Tests and UAT;
- Approvals;
- Go-live and rollback;
- Issues and hypercare;
- Timeline and audit;
- Economics and productization output.

### 6.4 Blueprint Workbench

Supports conversational capture, structured editing, missing-input detection, comparison between versions, customer comments, approval, and generation of a Configuration Package.

### 6.5 Provider Center

Shows customer-level Twilio, Retell, Stripe, messaging, email, and future provider connections without exposing secrets.

It should support readiness, compliance, environment, usage, cost, errors, actions, and asset-transfer status.

### 6.6 Migration Workbench

Supports upload, source profiling, field mapping, transformation rules, dry run, exception resolution, import, and reconciliation.

### 6.7 Test and UAT Center

Supports scenario generation, test execution, Voice test calls, evidence review, customer acceptance, regression, and release gates.

### 6.8 Partner Delivery Console

Provides certified partners with scoped access to assigned customers, templates, guided workflows, approvals, evidence, training, support escalation, and implementation performance.

### 6.9 Customer Implementation Portal

Customer administrators should be able to see:

- current phase and target dates;
- required inputs;
- decisions and approvals;
- test and UAT status;
- upcoming cutover actions;
- open issues;
- implementation scope and change requests.

## 7. Implementation Agents

The product should define bounded Agent roles rather than one unrestricted Setup Agent.

| Agent | Primary responsibility |
| --- | --- |
| Intake Agent | Understand implementation demand from Voice, web, email, or external Agent entry and create qualification work |
| Discovery Agent | Collect business facts, read approved customer sources, identify gaps, and generate the Blueprint |
| Commercial Scoping Agent | Convert accepted scope into an effort estimate, implementation package, and Quote draft without arbitrary discount authority |
| Provisioning Agent | Prepare and apply Runory configuration and approved provider resources |
| Migration Agent | Profile sources, propose mappings, run dry imports, reconcile, and report exceptions |
| QA Agent | Generate tests, execute supported checks and Voice calls, evaluate results, and collect evidence |
| Launch Agent | Run readiness checks, request approvals, execute cutover, monitor, and coordinate rollback |
| Hypercare Agent | Detect launch issues, classify responsibility, create work, and track stabilization |
| Productization Agent | Review repeated manual work and propose templates, Commands, connectors, tests, or backlog candidates |

Agents may plan, draft, validate, sequence, and execute bounded Commands. They must not accept legal declarations, approve their own material production actions, bypass cost limits, or invent missing customer facts.

## 8. External-Agent implementation capability

Runory should allow approved external Agents such as ChatGPT, Codex, Claude, and compatible enterprise Agents to participate through MCP, Skills, or approved APIs.

External Agents should be able to:

- inspect the Implementation Run and available capabilities;
- capture or update customer-confirmed requirements;
- generate and explain a Blueprint draft;
- request missing customer inputs;
- preview configuration;
- initiate approved provisioning workflows;
- inspect provider readiness;
- propose migration mappings;
- run tests;
- request customer or Runory approval;
- report blockers and next actions.

They must call bounded business Commands such as:

```text
implementation.create_opportunity
implementation.qualify_opportunity
implementation.create_order_from_quote
implementation.create_run
implementation.capture_requirement
implementation.request_customer_input
implementation.generate_blueprint
implementation.compare_blueprint_versions
implementation.approve_blueprint
implementation.generate_configuration_package
implementation.preview_configuration
implementation.apply_configuration
implementation.create_test_suite
implementation.run_acceptance_checks
implementation.request_approval
implementation.approve_gate
implementation.calculate_readiness

telephony.create_customer_subaccount
telephony.search_phone_numbers
telephony.preview_number_purchase
telephony.purchase_phone_number
telephony.configure_routing
telephony.configure_sip_connection
telephony.check_regulatory_requirements
telephony.check_port_status

voice.create_agent_draft
voice.attach_knowledge_base
voice.configure_transfer_policy
voice.run_test_call
voice.publish_agent_version

payment.create_connect_onboarding_link
payment.check_provider_account_readiness
payment.configure_webhook
payment.enable_production_account

migration.profile_source
migration.propose_mapping
migration.preview_import
migration.execute_batch
migration.reconcile_batch

launch.preview_cutover
launch.execute_cutover
launch.verify_cutover
launch.rollback_cutover
```

These Commands are not generic provider API proxies. Each Command must enforce schema, scope, permission, approval, idempotency, environment, budget, audit, and compensation behavior.

## 9. Provider Foundation

Implementation speed depends on pre-built provider infrastructure, not only Agent intelligence.

### 9.1 Twilio Foundation

Runory should prepare:

- verified platform account and supported-region policy;
- one isolated Subaccount pattern per customer where Runory-operated ownership is used;
- customer-owned account connection pattern for larger customers;
- API credential and permission policy;
- number search and purchase workflow;
- temporary-number and call-forwarding pilot pattern;
- number-port checklist and status tracking;
- SIP Trunk and routing templates;
- Voice and messaging webhook templates;
- Messaging Service templates;
- regulatory, A2P, toll-free, consent, and opt-out workflows;
- usage limits, alerts, cost attribution, suspension, and termination controls;
- number and asset transfer procedures.

### 9.2 Retell Foundation

Runory should prepare:

- provider account and environment strategy;
- standard Voice Agent templates;
- industry and scenario Prompt templates;
- structured-output schemas;
- Runory Tool contracts;
- knowledge-base templates;
- transfer and escalation policies;
- emergency and high-risk handling policies;
- recording and disclosure configuration patterns;
- webhook mapping;
- version publication and rollback;
- automated test-call and evaluation workflow;
- usage, latency, failure, and cost monitoring.

### 9.3 Stripe Foundation

Runory should prepare:

- Stripe Connect platform configuration;
- merchant-owned Connected Account onboarding;
- Direct Charges model;
- test and production environment separation;
- Checkout and Payment Link patterns;
- signed webhook processing;
- refund and failure workflows;
- readiness and capability checks;
- KYC and bank-verification status handling;
- Workspace-to-provider-account mapping;
- production enablement and disablement approvals;
- reconciliation visibility and support diagnostics.

### 9.4 Shared Provider Foundation

Shared capabilities include:

- centralized secret management;
- customer and environment isolation;
- provider adapter contracts;
- sandbox and test accounts;
- credential rotation;
- retry, idempotency, and compensation;
- usage metering and cost attribution;
- provider health and incident diagnostics;
- audit without secret leakage;
- termination, export, and asset-transfer procedures.

## 10. Automation and approval boundary

The Implementation Platform should automate repetitive work aggressively while preserving explicit human responsibility.

### 10.1 High-automation candidates

- qualification question sequencing;
- customer website, document, and file extraction;
- missing-input detection;
- Blueprint drafting;
- standard Workspace configuration;
- Pack and template installation;
- Twilio Subaccount and resource provisioning;
- Retell Agent and knowledge setup;
- Stripe Connect onboarding initiation;
- migration profiling and mapping suggestions;
- test generation and supported test execution;
- evidence collection;
- readiness checks;
- implementation status communication;
- productization-candidate extraction.

### 10.2 Mandatory human or customer approval

- accepted commercial scope and implementation Order;
- customer legal and regulatory declarations;
- number purchase and number porting;
- recording, disclosure, consent, and outbound messaging policy;
- production Voice Agent publication;
- live payment activation;
- production-data import or replacement;
- UAT acceptance;
- production cutover and rollback;
- non-trivial or unbounded provider cost;
- exceptions that change customer promises, service eligibility, pricing, emergency handling, or financial behavior.

## 11. Reusable implementation assets

Every completed Run should produce reusable assets where appropriate:

- industry implementation template;
- discovery question set;
- Blueprint fragment;
- service-catalog template;
- role and permission preset;
- workflow or automation template;
- Retell Prompt and policy template;
- Twilio provisioning recipe;
- Stripe onboarding recipe;
- migration mapping recipe;
- test suite;
- troubleshooting rule;
- governed Command or connector candidate;
- partner training material.

Reusable assets must have version, owner, supported scope, validation evidence, compatibility, and deprecation status. A copied customer configuration is not automatically a supported product asset.

## 12. Productization feedback loop

The required loop is:

```text
Customer Implementation Run
→ actual effort, errors, blockers, and cost
→ repeated-step analysis
→ Eliminate / Standardize / Automate / Delegate / Retain
→ approved product backlog
→ template, workflow, Command, connector, or product change
→ next implementation uses the improved capability
→ measured comparison
```

A Productization Agent may propose candidates, but Product and Engineering owners decide whether a repeated need belongs in the supported product.

## 13. Minimum viable complete product

The first implementation product should be a minimum complete loop, not a set of disconnected setup scripts.

### 13.1 Required objects

- Implementation Opportunity;
- Implementation Order reference;
- Implementation Run;
- Implementation Blueprint;
- Customer Input Request;
- Provider Connection;
- Test Suite / Test Run;
- Approval Gate;
- Go-live Plan;
- Implementation Issue.

### 13.2 Required surfaces

- Implementation Inbox;
- Pipeline;
- Run Detail;
- Blueprint Workbench;
- Provider Center;
- Test / UAT Center;
- customer input and approval portal.

### 13.3 Required initial Commands

- create and advance Implementation Run;
- capture inputs and generate Blueprint;
- preview and apply standard Workspace configuration;
- create Twilio customer resources and search numbers;
- create Retell Agent draft and run a test call;
- initiate Stripe Connect onboarding and check readiness;
- request and record approvals;
- calculate go-live readiness;
- execute and verify a bounded cutover.

### 13.4 Required first reference scenario

The first end-to-end reference scenario should be:

```text
Prospect contacts Runory through Voice Intake
→ Lead and Implementation Opportunity created
→ discovery scheduled
→ Quote and Implementation Order accepted
→ Implementation Run opened
→ Blueprint generated and approved
→ Workspace configured
→ temporary Twilio number provisioned
→ Retell Agent configured
→ test calls pass
→ Stripe onboarding initiated when in scope
→ customer UAT accepted
→ production cutover completed
→ hypercare completed
→ implementation economics and reusable assets recorded
```

This scenario proves the service workflow, internal reference use, external-Agent boundary, Provider Foundation, automated implementation, and governed production launch together.

## 14. Success measures

The product should measure:

- time from first implementation contact to qualified opportunity;
- time from paid Order to approved Blueprint;
- time from Blueprint approval to usable pilot;
- time to production;
- customer-input blocked days;
- human hours by phase and role;
- percentage of steps completed through product workflows or Agents;
- provider provisioning success rate;
- Voice test first-pass rate;
- migration reconciliation rate;
- UAT first-pass rate;
- defects and rollback rate;
- hypercare hours;
- provider and test cost;
- implementation contribution margin;
- reusable assets generated;
- partner delivery success without Runory escalation;
- reduction in effort and elapsed time across comparable cohorts.

Automation is successful only when time and cost fall without weakening correctness, security, approvals, audit, customer acceptance, or supportability.

## 15. Delivery sequence

Recommended implementation-platform sequence:

### Stage 1 — Operate the first customer explicitly

Use existing CRM, Sales, FSM, Payment, Voice Intake, and Agent Operations capabilities plus a minimal Implementation Run and Blueprint.

### Stage 2 — Standardize the common path

Add input checklists, industry templates, provider recipes, tests, approval gates, and customer-visible status.

### Stage 3 — Automate provider and configuration work

Add governed Commands for Workspace, Twilio, Retell, Stripe, migration, testing, and cutover.

### Stage 4 — External-Agent and partner delivery

Expose the bounded implementation capability through MCP / Skills and provide the Partner Delivery Console.

### Stage 5 — Bounded self-service

Allow standard customers to complete low-risk parts directly while retaining approvals and expert handling for regulated, financial, production-data, and exceptional business decisions.

## 16. Non-goals

The first version does not attempt to:

- make every implementation fully self-service;
- replace customer business owners or legal responsibility;
- provide unrestricted external-Agent access to provider consoles;
- automate carrier, KYC, regulatory, or bank approvals outside Runory's control;
- build a generic professional-services automation platform;
- absorb unlimited custom development into standard implementation;
- guarantee zero implementation fee;
- create a parallel project-management system unrelated to Runory delivery.

## 17. Related documents

- [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md)
- [Implementation Economics and Productization](implementation-economics-and-productization.md)
- [Commercial Pricing and Packaging](commercial-pricing-and-packaging.md)
- [Product Definition](product-definition.md)
- [Voice Intake Product Definition](voice-intake-product-definition.md)
- [Voice Intake Technical Specification](voice-intake-technical-spec.md)
- [Voice Intake Integration Boundary](../architecture/voice-intake-integration-boundary.md)
- [Payment Product Definition](payment-product-definition.md)
- [Payment Technical Specification](payment-technical-spec.md)
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md)
- [Stripe Connect Pre-GA Completion Plan](stripe-connect-pre-ga-plan.md)
- [Agent Operations](../agent-operations.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
