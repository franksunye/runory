# Runory Implementation Platform Technical Specification

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `implementation-platform` |
| Applies to | `v0.9+ / paid production delivery` |
| Owner | Product / Engineering / Customer Success |
| Last reviewed | 2026-07-29 |
| Supports | [Implementation Platform Product Design](implementation-platform-product-design.md) |
| Supersedes | — |
| Superseded by | — |

This specification defines the technical architecture, domain model, Commands, workflows, provider adapters, Agent interfaces, UI surfaces, security controls, observability, and phased delivery plan required to implement the [Runory Implementation Platform Product Design](implementation-platform-product-design.md).

It must conform to the canonical [Architecture Overview](../architecture/overview.md), [Contract-Driven Command Architecture](../architecture/contract-driven-command-architecture.md), [Module Architecture](../architecture/module-architecture.md), [Agent Operations](../agent-operations.md), [Voice Intake Integration Boundary](../architecture/voice-intake-integration-boundary.md), and [Payment Integration Boundary](../architecture/payment-integration-boundary.md).

## 1. Technical decision

The Implementation Platform is implemented as a first-class official business capability on the existing Runory Runtime, not as a separate project-management application and not as a collection of provider-specific scripts.

The target architecture is:

```text
External intake channels
Voice / web / email / partner / external Agent
                ↓
CRM + Sales + FSM authoritative records
                ↓
runory.implementation Module
                ↓
Implementation Run + Blueprint + Gates + Evidence
                ↓
Workflow / Automation orchestration
                ↓
Governed Commands and Contracts
                ↓
Provider adapters and durable Outbox effects
                ↓
Twilio / Retell / Stripe / email / storage / future providers
```

The following boundaries are mandatory:

1. Implementation business state is owned by `runory.implementation`.
2. Existing CRM, Sales, FSM, Payment, Identity, Scheduling, Workflow, Audit, and Outbox capabilities remain authoritative for their domains.
3. Provider resources are accessed through versioned adapters and provider-neutral Commands.
4. All mutation channels—UI, HTTP, Workflow, Automation, MCP, Skills, and external Agents—invoke the same named Commands.
5. Long-running implementation execution is represented as durable workflow state, not as one request, one database transaction, or an opaque Agent session.
6. Secrets are stored only in the platform secret boundary and never copied into business records, prompts, logs, audit payloads, or provider-reference objects.

## 2. Module and Pack placement

### 2.1 Official Module

Create one official Module:

```text
runory.implementation
```

The Module owns:

- implementation-specific objects and state machines;
- Command Contracts;
- implementation permissions;
- implementation workflows and automations;
- product surfaces and Agent Skills;
- provider-neutral connection references;
- implementation evidence and economics projections;
- extension points for industry templates and partner-specific delivery.

### 2.2 Dependencies

Initial dependencies:

```yaml
dependencies:
  - runory.company
  - runory.contact
  - runory.crm
  - runory.sales
  - runory.fsm
  - runory.payment
  - runory.task
  - platform.workflow
  - platform.automation
  - platform.assignment
  - platform.scheduling
  - platform.audit
  - platform.outbox
  - platform.files
  - platform.secrets
```

Voice Intake is optional at installation time but required for the internal Runory reference flow that accepts implementation demand by phone.

### 2.3 Commercial composition

The Module may be included in an internal or partner-facing Pack:

```text
Implementation Operations Pack
= CRM + Sales + FSM + Payment + runory.implementation
```

A Workspace Template may then provide implementation terminology, navigation, dashboards, default roles, views, and sample workflows.

## 3. Aggregate and ownership model

### 3.1 Authoritative aggregates

| Aggregate | Authority | Purpose |
| --- | --- | --- |
| `implementation_opportunity` | `runory.implementation` | Implementation-specific qualification attached to a sales Opportunity |
| `implementation_order` | `runory.implementation` | Accepted implementation scope and delivery boundary |
| `implementation_run` | `runory.implementation` | Authoritative execution state for one implementation |
| `implementation_blueprint` | `runory.implementation` | Versioned structured implementation intent |
| `customer_input_request` | `runory.implementation` | Customer-owned input, evidence, and blocking state |
| `configuration_package` | `runory.implementation` | Versioned previewable configuration proposal |
| `provider_connection` | `runory.implementation` | Provider-neutral readiness and resource references |
| `migration_plan` / `migration_batch` | `runory.implementation` | Source profiling, mapping, import, reconciliation, and exceptions |
| `implementation_test_suite` / `implementation_test_run` | `runory.implementation` | Acceptance scenarios, execution, evidence, and thresholds |
| `approval_gate` | `runory.implementation` | Explicit approval for material actions |
| `go_live_plan` | `runory.implementation` | Cutover, validation, monitoring, and rollback plan |
| `implementation_issue` | `runory.implementation` | Pre-launch defect, blocker, decision, or exception |
| `hypercare_case` | `runory.implementation` | Post-launch stabilization work |
| `implementation_asset` | `runory.implementation` | Reusable template, mapping, policy, test, connector, or learning |
| `productization_candidate` | `runory.implementation` | Candidate improvement generated from repeated delivery work |

### 3.2 Non-authoritative references

The Module stores stable references to, but does not duplicate:

- Organization and Workspace;
- Company, Contact, Lead, and Opportunity;
- Quote, Contract, Invoice, Payment, and subscription account;
- Work Order, Assignment, Work Item, Service Visit, and Schedule Entry;
- provider-owned accounts, agents, phone numbers, payments, calls, or messages;
- secret values.

### 3.3 Record conventions

Every aggregate must include:

```text
id
workspace_id
aggregate_version
created_at
updated_at
created_by
updated_by
status or state
```

Where applicable, records must also include:

```text
implementation_run_id
source_type
source_id
provider_type
provider_reference
schema_version
configuration_version
```

All references must use stable IDs, not display names or mutable provider labels.

## 4. State machines

### 4.1 Implementation Run

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

Rules:

- `awaiting_order` requires a linked commercial Opportunity.
- `configuration` requires an approved Blueprint version.
- `provider_provisioning` requires the relevant provider scope in the accepted Order.
- `uat` requires required validation thresholds to pass or explicit accepted exceptions.
- `ready_for_go_live` requires all mandatory approval gates to be approved.
- `completed` requires hypercare closure, economics capture, and productization review.
- entering `blocked` must identify blocker type, owner, expected resolution date, and affected gate.

### 4.2 Blueprint

```text
draft
→ awaiting_inputs
→ ready_for_review
→ in_review
→ approved
→ superseded

Any non-approved state
→ rejected
```

An approved version is immutable. Changes create a new version derived from the prior version.

### 4.3 Configuration Package

```text
draft
→ validated
→ preview_ready
→ awaiting_approval
→ approved
→ applying
→ applied
→ superseded

applying
→ failed
→ rollback_required
→ rolled_back
```

### 4.4 Provider Connection

```text
not_started
→ onboarding
→ awaiting_customer_action
→ awaiting_provider_review
→ configured
→ test_ready
→ production_ready
→ active

Any active state
→ degraded
→ suspended
→ disconnecting
→ disconnected
```

Provider readiness must be modeled separately from provider connectivity. A valid API connection does not imply regulatory, KYC, routing, payment, or production readiness.

### 4.5 Approval Gate

```text
not_required
pending
approved
rejected
expired
revoked
```

Approval is bound to an exact subject version, scope, environment, estimated cost, and evidence set. Material subject changes invalidate or supersede the prior approval.

## 5. Blueprint schema

The Blueprint is a versioned structured document, not an unvalidated text blob.

Recommended top-level schema:

```json
{
  "schemaVersion": "1.0",
  "workspaceProfile": {},
  "organization": {},
  "usersAndRoles": {},
  "serviceCatalog": {},
  "serviceAreas": {},
  "businessLifecycle": {},
  "formsAndFields": {},
  "schedulingAndDispatch": {},
  "voiceIntake": {},
  "messaging": {},
  "payments": {},
  "migration": {},
  "integrations": {},
  "testing": {},
  "cutover": {},
  "training": {},
  "hypercare": {},
  "decisions": [],
  "missingInputs": [],
  "conflicts": [],
  "expertReviews": []
}
```

Each implementable value must carry provenance:

```json
{
  "value": "America/Chicago",
  "status": "confirmed",
  "sourceType": "customer_interview",
  "sourceId": "...",
  "capturedAt": "...",
  "capturedBy": "...",
  "confidence": 1.0
}
```

Allowed fact states:

```text
confirmed
proposed
inferred
missing
conflicting
not_applicable
expert_review_required
```

Only `confirmed`, explicitly accepted `proposed`, approved defaults, or policy-authorized derived values may generate production configuration.

## 6. Command model

### 6.1 Command families

The first version should implement these Command families.

#### Opportunity and Order

```text
implementation.opportunity.create
implementation.opportunity.qualify
implementation.opportunity.disqualify
implementation.order.create_from_quote
implementation.order.accept
implementation.order.mark_payment_condition_satisfied
implementation.run.create_from_order
```

#### Discovery and Blueprint

```text
implementation.input.request
implementation.input.submit
implementation.input.validate
implementation.blueprint.create_draft
implementation.blueprint.generate_from_sources
implementation.blueprint.update_section
implementation.blueprint.mark_ready_for_review
implementation.blueprint.approve
implementation.blueprint.reject
implementation.blueprint.create_revision
```

#### Configuration

```text
implementation.configuration.generate_package
implementation.configuration.validate_package
implementation.configuration.preview_package
implementation.configuration.request_approval
implementation.configuration.apply_package
implementation.configuration.rollback_package
```

#### Provider lifecycle

```text
implementation.provider.create_connection
implementation.provider.begin_onboarding
implementation.provider.refresh_readiness
implementation.provider.request_production_enablement
implementation.provider.activate
implementation.provider.suspend
implementation.provider.disconnect
```

Provider-specific actions remain behind semantic Commands:

```text
telephony.create_customer_subaccount
telephony.search_phone_numbers
telephony.preview_number_purchase
telephony.purchase_phone_number
telephony.configure_routing
telephony.configure_sip_connection
telephony.check_regulatory_requirements
telephony.submit_customer_documents
telephony.check_port_status

voice.create_agent_draft
voice.attach_knowledge_base
voice.configure_transfer_policy
voice.publish_agent_version
voice.run_test_call

payment.create_connect_onboarding_link
payment.check_provider_account_readiness
payment.configure_webhook
payment.enable_production_account
```

#### Migration

```text
implementation.migration.create_plan
implementation.migration.profile_source
implementation.migration.propose_mapping
implementation.migration.approve_mapping
implementation.migration.run_dry_run
implementation.migration.execute_batch
implementation.migration.reconcile_batch
implementation.migration.accept_exceptions
implementation.migration.execute_final_delta
```

#### Testing and UAT

```text
implementation.test.create_suite
implementation.test.generate_scenarios
implementation.test.approve_suite
implementation.test.execute_run
implementation.test.record_manual_result
implementation.test.evaluate_run
implementation.uat.request_acceptance
implementation.uat.accept
implementation.uat.reject
```

#### Launch and Hypercare

```text
implementation.launch.create_plan
implementation.launch.run_readiness_check
implementation.launch.request_approval
implementation.launch.execute_cutover
implementation.launch.validate_cutover
implementation.launch.execute_rollback
implementation.hypercare.open_case
implementation.hypercare.resolve_case
implementation.run.complete
```

#### Productization

```text
implementation.asset.publish
implementation.productization.create_candidate
implementation.productization.classify_candidate
implementation.productization.accept_to_backlog
implementation.productization.reject_candidate
```

### 6.2 Contract requirements

Every Command Contract must declare:

- stable key and contract version;
- owning aggregate;
- input and result schemas;
- legal source and target states;
- permission;
- expected-version policy;
- idempotency policy;
- required atomic capability effects;
- events and audit facts;
- durable external effects;
- postconditions;
- compensation behavior;
- approval dependency where applicable;
- cost and environment policy where applicable.

### 6.3 Example Contract

```yaml
key: implementation.configuration.apply_package
contractVersion: 1
aggregate: configuration_package
transition:
  from: [approved]
  to: applied
permission: implementation.configuration.apply
idempotent: true
requiresExpectedVersion: true
requiresApproval:
  gateType: configuration_apply
  subjectVersionField: version
requiredEffects:
  - capability: module.install_or_verify
    consistency: atomic
  - capability: workspace.apply_configuration
    consistency: atomic
  - capability: extension.apply_version
    consistency: atomic
emits:
  - implementation.configuration.applied
externalEffects:
  - outbox: implementation.provider.provisioning.requested
postconditions:
  - configuration_package.status == applied
  - implementation_run.configuration_version == configuration_package.version
  - audit_event.exists == true
compensation:
  command: implementation.configuration.rollback_package
```

## 7. Workflow and Saga orchestration

Implementation is a long-running process. Workflow owns sequencing, waiting, timers, branching, retries, and human tasks. Commands own legality and complete atomic outcomes.

### 7.1 Canonical implementation workflow

```text
Order accepted
→ create Implementation Run
→ collect required inputs
→ generate Blueprint
→ wait for customer approval
→ generate Configuration Package
→ apply Runory configuration
→ provision in-scope providers
→ wait for customer/provider actions
→ profile and migrate data
→ generate and run tests
→ request UAT
→ run readiness checks
→ request go-live approval
→ execute cutover
→ monitor hypercare
→ capture economics and reusable assets
→ complete Run
```

### 7.2 Durable waiting states

Workflow must support durable waits for:

- customer input;
- customer approval;
- implementation payment condition;
- number-port completion;
- Twilio regulatory review;
- Retell provisioning or publish completion;
- Stripe KYC and bank verification;
- UAT response;
- scheduled cutover time;
- hypercare observation period.

### 7.3 Retry and compensation

External provider operations are asynchronous Outbox effects with:

- deterministic idempotency key;
- bounded retry policy;
- exponential backoff;
- dead-letter or operator-review state;
- provider request and response references;
- explicit compensation where possible;
- no silent success after partial failure.

Examples:

- number purchase failure does not invalidate the Blueprint, but blocks provider readiness;
- Retell Agent publication failure preserves the previous production version;
- failed configuration apply must not leave a partially advanced Run state;
- failed cutover invokes the explicit rollback plan rather than ad-hoc manual recovery.

## 8. Provider Foundation architecture

### 8.1 Adapter contract

Each provider adapter implements a versioned semantic interface. Provider API payloads do not enter the canonical domain model.

```ts
interface ProviderAdapter<TConfig, TReadiness, TActionResult> {
  validateConfig(config: TConfig): Promise<ValidationResult>;
  inspectReadiness(context: ProviderContext): Promise<TReadiness>;
  previewAction(action: ProviderAction): Promise<ActionPreview>;
  executeAction(action: ProviderAction): Promise<TActionResult>;
  compensateAction?(action: ProviderAction): Promise<CompensationResult>;
  normalizeWebhook(payload: unknown): Promise<NormalizedProviderEvent>;
}
```

### 8.2 Twilio adapter

Initial responsibilities:

- customer Subaccount creation and mapping;
- number search and purchase preview;
- number purchase and release;
- voice routing and webhook configuration;
- SIP Trunk configuration for Retell;
- messaging service setup;
- regulatory requirement discovery and status;
- porting request status tracking;
- usage and cost retrieval;
- customer asset-transfer metadata.

### 8.3 Retell adapter

Initial responsibilities:

- Voice Agent draft creation;
- versioned prompt and structured-output configuration;
- knowledge-base attachment;
- Runory Tool contract binding;
- transfer, fallback, silence, interruption, and emergency policies;
- test-call initiation;
- transcript and result normalization;
- production publication and rollback to prior version;
- usage and cost retrieval.

### 8.4 Stripe adapter

Initial responsibilities:

- Connected Account onboarding link creation;
- account requirements and readiness status;
- webhook registration and verification;
- test/live environment separation;
- merchant-owned Direct-Charge readiness;
- refund and reconciliation capability checks;
- production enablement gating.

The customer must complete KYC, banking, and contractual acceptance. Runory may guide and inspect readiness but must not accept declarations on the customer's behalf.

### 8.5 Provider resource registry

`provider_connection` stores only:

```text
provider_type
adapter_key
adapter_version
environment
ownership_model
provider_account_reference
provider_resource_references
readiness_state
compliance_state
last_checked_at
usage_limit
cost_center
termination_policy
```

No access token, secret key, credential, full regulatory document, or sensitive banking detail is stored in this object.

## 9. Secret and credential boundary

Provider credentials are stored in the platform secret service using tenant and environment scoping.

Required properties:

- encryption at rest and in transit;
- Workspace and provider scoping;
- environment separation;
- key rotation support;
- minimum-privilege credentials;
- access audit without secret-value logging;
- masked diagnostic output;
- revocation and disconnect workflow;
- no secret exposure through MCP or Agent responses.

External Agents receive capability results, never raw provider credentials.

## 10. Agent architecture

### 10.1 External-Agent role

ChatGPT, Codex, Claude, and compatible Agents may:

- collect and clarify implementation intent;
- inspect schemas, Blueprint state, missing inputs, and readiness;
- propose Blueprint changes;
- generate test cases and explanations;
- invoke approved Commands through MCP or Skills;
- monitor and summarize Implementation Runs.

They may not:

- directly mutate the database;
- issue arbitrary provider API requests;
- access secrets;
- bypass approval gates;
- publish production Voice Agents, activate live payments, or cut over production without an approved Command path.

### 10.2 MCP / Skill surface

The first external-Agent surface should expose bounded tools grouped by capability:

```text
implementation.inspect_run
implementation.list_missing_inputs
implementation.propose_blueprint_change
implementation.preview_configuration
implementation.request_customer_input
implementation.run_readiness_check
implementation.summarize_blockers
implementation.generate_test_suite
```

Cost-bearing or production-changing operations must use two-step preview/confirm semantics:

```text
preview
→ return scope, cost, risk, environment, dependencies, and required approval
→ explicit approval
→ apply
```

### 10.3 Implementation Agents

The product may define specialized Agent profiles, but they remain orchestration and reasoning roles over the same Command surface:

| Agent | Primary responsibility |
| --- | --- |
| Intake Agent | Convert calls, forms, email, and partner input into qualified implementation demand |
| Discovery Agent | Collect inputs, identify gaps, and generate Blueprint drafts |
| Provisioning Agent | Generate and apply configuration; orchestrate provider setup |
| Migration Agent | Profile, map, dry-run, reconcile, and report exceptions |
| QA Agent | Generate scenarios, run tests, evaluate evidence, and identify defects |
| Launch Agent | Check readiness, collect approvals, execute cutover, and monitor rollback conditions |
| Hypercare Agent | Monitor incidents, usage, cost, and unresolved stabilization work |
| Productization Agent | Extract reusable assets and backlog candidates from completed Runs |

## 11. Intake integration

### 11.1 Voice Intake reference flow

Runory's own Voice Intake should use existing Voice Intake records and Commands, then create implementation demand through governed integration:

```text
call.completed or intake.confirmed
→ classify implementation intent
→ create/update Contact and Company
→ create Lead or Opportunity
→ implementation.opportunity.create
→ create qualification Work Item
→ optionally create discovery Schedule Entry
→ link call, transcript, outcome, and implementation records
```

The Voice Agent must not create a paid Implementation Order or production Run without qualification and commercial acceptance.

### 11.2 Other channels

Web, email, referral, and external Agent channels must normalize into the same qualification contract and source attribution model.

## 12. Migration architecture

Migration is modeled as a versioned plan plus immutable execution batches.

Required stages:

```text
source registration
→ profile
→ field mapping proposal
→ mapping approval
→ dry run
→ validation and exception report
→ production batch
→ reconciliation
→ final delta
→ closure
```

Requirements:

- uploaded files stored through the platform file boundary;
- source checksum and schema fingerprint;
- deterministic mapping version;
- dry-run output without authoritative writes;
- idempotent batch execution;
- row-level result and exception status;
- reconciliation totals;
- rollback or compensating-delete policy where legally and technically safe;
- no production import without approval.

## 13. Testing and evidence

### 13.1 Test model

A Test Suite contains versioned scenarios with:

```text
scenario_key
category
preconditions
input
expected Commands
expected authoritative records
expected provider effects
expected customer-visible result
risk level
automation mode
```

### 13.2 Required scenario categories

- standard happy path;
- missing or conflicting customer information;
- permission failure;
- duplicate or idempotent retry;
- provider timeout and retry;
- cost-limit rejection;
- human handoff;
- rollback;
- migration exception;
- UAT acceptance and rejection;
- Voice Intake transfer, disclosure, and emergency behavior;
- Stripe test/live separation.

### 13.3 Evidence

Evidence records may include:

- Command invocation and result IDs;
- domain events;
- audit records;
- Outbox delivery state;
- provider event references;
- call transcript references;
- generated business records;
- screenshots or attachments;
- reconciliation reports;
- approver identity and timestamp.

Evidence must avoid secret values and unnecessary sensitive data.

## 14. UI and API surfaces

### 14.1 UI routes

Suggested initial routes:

```text
/w/[workspaceId]/implementation
/w/[workspaceId]/implementation/pipeline
/w/[workspaceId]/implementation/runs/[runId]
/w/[workspaceId]/implementation/runs/[runId]/blueprint
/w/[workspaceId]/implementation/runs/[runId]/providers
/w/[workspaceId]/implementation/runs/[runId]/migration
/w/[workspaceId]/implementation/runs/[runId]/tests
/w/[workspaceId]/implementation/runs/[runId]/approvals
/w/[workspaceId]/implementation/runs/[runId]/launch
/w/[workspaceId]/implementation/assets
```

These surfaces should use the existing schema-driven UI and shared Product Surface standards. A special-purpose page is justified only for orchestration views that cannot be expressed proportionally through metadata-driven object pages.

### 14.2 Run Detail projections

The Run Detail page is a projection over authoritative objects. Recommended sections:

- summary and health;
- order and scope;
- Blueprint;
- customer inputs;
- configuration;
- providers;
- migration;
- tests and UAT;
- approvals;
- launch and rollback;
- issues and hypercare;
- timeline and audit;
- economics and productization output.

### 14.3 HTTP APIs

REST or equivalent application APIs must be thin channel adapters over Commands and Queries.

Recommended query endpoints:

```text
GET /api/workspaces/:workspaceId/implementation/runs
GET /api/workspaces/:workspaceId/implementation/runs/:runId
GET /api/workspaces/:workspaceId/implementation/runs/:runId/readiness
GET /api/workspaces/:workspaceId/implementation/runs/:runId/timeline
GET /api/workspaces/:workspaceId/implementation/assets
```

Mutation endpoints must invoke named Commands rather than generic record updates.

## 15. Permissions and roles

Initial permissions:

```text
implementation.read
implementation.create
implementation.qualify
implementation.order.read
implementation.order.manage
implementation.blueprint.read
implementation.blueprint.edit
implementation.blueprint.approve
implementation.configuration.preview
implementation.configuration.apply
implementation.provider.read
implementation.provider.manage
implementation.migration.manage
implementation.test.manage
implementation.uat.approve
implementation.launch.approve
implementation.launch.execute
implementation.economics.read
implementation.partner.deliver
implementation.admin
```

Recommended roles:

- Runory Commercial;
- Implementation Manager;
- Implementation Specialist;
- Provider Operations;
- Migration Specialist;
- QA / UAT Coordinator;
- Customer Administrator;
- Customer Approver;
- Certified Implementation Partner;
- Support / Hypercare.

Customer and partner roles must be limited to assigned Runs and allowed evidence. Provider operations and economics may require stricter internal-only scopes.

## 16. Approval and policy engine

Approval requirements must be policy-driven by action, environment, cost, risk, and ownership model.

Mandatory approval examples:

- number purchase or port;
- regulatory submission;
- recording and disclosure activation;
- production Voice Agent publication;
- live messaging enablement;
- live payment enablement;
- production data import or replacement;
- configuration apply with material business impact;
- go-live and rollback;
- provider cost above configured threshold.

The runtime must verify:

```text
approved gate exists
+ gate subject matches exact version
+ gate has not expired or been revoked
+ actor is authorized
+ environment matches
+ cost remains within approved bounds
```

## 17. Events and automations

Initial domain events:

```text
implementation.opportunity.created
implementation.opportunity.qualified
implementation.order.accepted
implementation.run.created
implementation.run.state_changed
implementation.input.requested
implementation.input.submitted
implementation.blueprint.approved
implementation.configuration.applied
implementation.provider.readiness_changed
implementation.migration.completed
implementation.test.completed
implementation.uat.accepted
implementation.launch.approved
implementation.launch.completed
implementation.rollback.completed
implementation.hypercare.completed
implementation.run.completed
implementation.asset.published
implementation.productization_candidate.created
```

Automations may:

- notify owners of missing inputs;
- escalate overdue approvals;
- refresh provider readiness;
- create Work Items from failed Outbox delivery;
- schedule recurring health checks during hypercare;
- create productization candidates at Run completion.

Automations must invoke Commands and must not directly mutate authoritative records.

## 18. Observability and economics

Every Implementation Run must expose technical and economic telemetry:

- phase durations;
- planned and actual human effort;
- manual versus automated steps;
- Command success, retry, and failure rates;
- provider provisioning time and failure rate;
- provider and test cost by Workspace;
- migration reconciliation rate;
- test pass rate;
- UAT cycle count;
- blocked days by dependency type;
- hypercare hours and incident count;
- reusable assets generated;
- implementation contribution.

Required correlation fields:

```text
request_id
command_id
workflow_instance_id
implementation_run_id
workspace_id
provider_connection_id
outbox_message_id
provider_request_reference
```

No metric or log may include raw secrets.

## 19. Security and compliance

Required controls:

- tenant isolation by Organization and Workspace;
- least-privilege RBAC;
- environment separation;
- secret-management boundary;
- audit for every material action;
- signed and replay-safe provider webhooks;
- provider webhook normalization and idempotency;
- file malware and content validation where supported;
- PII minimization and retention policy;
- customer-controlled recording and communication consent settings;
- explicit asset ownership and termination handling;
- no production mutation from an unauthenticated or unscoped Agent.

## 20. Failure model

The platform must fail visibly and closed.

Canonical error families:

```text
IMPLEMENTATION_INVALID_STATE
IMPLEMENTATION_INPUT_INCOMPLETE
IMPLEMENTATION_BLUEPRINT_NOT_APPROVED
IMPLEMENTATION_CONFIGURATION_INVALID
IMPLEMENTATION_APPROVAL_REQUIRED
IMPLEMENTATION_APPROVAL_STALE
IMPLEMENTATION_PROVIDER_NOT_READY
IMPLEMENTATION_PROVIDER_ACTION_FAILED
IMPLEMENTATION_COST_LIMIT_EXCEEDED
IMPLEMENTATION_MIGRATION_RECONCILIATION_FAILED
IMPLEMENTATION_TEST_THRESHOLD_NOT_MET
IMPLEMENTATION_UAT_NOT_ACCEPTED
IMPLEMENTATION_CUTOVER_BLOCKED
IMPLEMENTATION_ROLLBACK_REQUIRED
```

Errors must return stable code, human-readable explanation, affected object, retryability, missing dependency, and next allowed action.

## 21. Versioning and compatibility

- Blueprints, Configuration Packages, mappings, test suites, and Go-live Plans are versioned and immutable after approval.
- Command Contracts use explicit contract versions.
- Provider adapters use semantic adapter versions.
- Pack locks pin compatible Module, Contract, and provider-capability versions.
- Workspace Extensions may customize declared extension points but must not replace implementation lifecycle invariants.
- Upgrades must preserve active Run readability and support migration of in-flight workflow instances.

## 22. Initial implementation scope

The first Minimum Complete Product should support one internal Runory implementation service and one external pilot customer.

Included:

1. implementation Opportunity, Order, Run, Blueprint, Input Request, Provider Connection, Approval Gate, Test Suite, and Go-live Plan;
2. Run lifecycle and core UI surfaces;
3. Voice/web intake normalization into an Implementation Opportunity;
4. Blueprint generation and approval;
5. Configuration Package preview and apply for standard Workspace configuration;
6. Twilio Subaccount/new-number path;
7. Retell Voice Agent draft, knowledge, routing, test call, and publish path;
8. Stripe Connect onboarding/readiness path;
9. small CSV migration with mapping, dry run, import, and reconciliation;
10. generated test suite and UAT acceptance;
11. go-live approval, cutover checklist, and hypercare monitoring;
12. MCP read/propose surface and bounded mutation Commands;
13. audit, Outbox, idempotency, cost limits, and approval enforcement;
14. actual implementation time, cost, and automation capture.

Excluded from the first version:

- general-purpose project management;
- arbitrary provider API proxying;
- automatic number port completion;
- automatic regulatory or KYC approval;
- broad accounting and ERP connectors;
- unrestricted self-service production activation;
- fully autonomous production cutover;
- multi-region provider abstraction beyond the first supported market;
- unbounded custom-code generation.

## 23. Delivery phases

### Phase 1 — Domain and manual operating loop

- Module manifest and objects;
- Run lifecycle;
- Blueprint and Input Requests;
- Approval Gates;
- Inbox, Pipeline, and Run Detail;
- manual provider readiness tracking;
- audit and economics capture.

### Phase 2 — Governed configuration and providers

- Configuration Package;
- standard Workspace configuration Commands;
- Twilio, Retell, and Stripe adapters;
- Outbox delivery, retries, and provider events;
- Provider Center;
- cost and environment policy.

### Phase 3 — Migration, QA, and launch

- migration plan and batches;
- generated test suites;
- automated Voice test calls;
- UAT Center;
- readiness checks;
- cutover and rollback orchestration;
- hypercare workflow.

### Phase 4 — External Agent and partner delivery

- MCP / Skills;
- external-Agent implementation workflows;
- partner-scoped permissions;
- reusable implementation assets;
- implementation templates and certification support.

### Phase 5 — Productization optimization

- automation-ratio measurement;
- productization candidate generation;
- template recommendation;
- bounded self-service for low-risk standard customers;
- cohort economics and continuous improvement.

## 24. Acceptance criteria

The specification is considered implemented for the first reference customer only when:

- [ ] one implementation demand can enter through Voice or web and become a linked Opportunity and Implementation Run;
- [ ] an approved Order is required before production implementation begins;
- [ ] a structured Blueprint can be generated, reviewed, versioned, and approved;
- [ ] missing customer inputs are visible and block dependent steps;
- [ ] a Configuration Package can be previewed and applied through governed Commands;
- [ ] Twilio, Retell, and Stripe readiness can be inspected without exposing secrets;
- [ ] at least one cost-bearing provider action uses preview, approval, idempotency, audit, and bounded execution;
- [ ] a small migration can complete dry run, import, and reconciliation;
- [ ] a generated test suite can link execution evidence to expected business outcomes;
- [ ] UAT acceptance is required before go-live readiness;
- [ ] production cutover requires explicit approval and has a rollback path;
- [ ] external Agents can inspect and propose without direct database or provider access;
- [ ] Implementation Run economics and automation ratio are captured;
- [ ] completion creates at least one reusable asset or explicit no-reuse decision;
- [ ] all material writes pass Command Contract tests;
- [ ] provider failures are observable, retried where safe, and never reported as silent success.

## 25. Required tests

### Contract tests

- legal and illegal state transitions;
- permission enforcement;
- expected-version conflict;
- idempotent retry;
- approval subject-version validation;
- cost-limit enforcement;
- required capability-provider closure;
- event, audit, and Outbox postconditions.

### Integration tests

- Twilio adapter sandbox;
- Retell adapter sandbox;
- Stripe test-mode onboarding and readiness;
- signed webhook verification and replay protection;
- migration dry run and reconciliation;
- Workflow pause/resume across external waits.

### End-to-end tests

```text
Voice/web implementation demand
→ qualification
→ Order
→ Run
→ Blueprint
→ configuration
→ provider readiness
→ migration
→ tests
→ UAT
→ go-live
→ hypercare
→ completion
```

The first E2E test must run against a fresh Workspace with deterministic test fixtures and capture evidence suitable for a release record.

## 26. Related documents

- [Implementation Platform Product Design](implementation-platform-product-design.md)
- [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md)
- [Implementation Economics and Productization](implementation-economics-and-productization.md)
- [Commercial Pricing and Packaging](commercial-pricing-and-packaging.md)
- [Product Definition](product-definition.md)
- [Architecture Overview](../architecture/overview.md)
- [Contract-Driven Command Architecture](../architecture/contract-driven-command-architecture.md)
- [Module Architecture](../architecture/module-architecture.md)
- [Voice Intake Product Definition](voice-intake-product-definition.md)
- [Voice Intake Technical Specification](voice-intake-technical-spec.md)
- [Voice Intake Integration Boundary](../architecture/voice-intake-integration-boundary.md)
- [Payment Product Definition](payment-product-definition.md)
- [Payment Technical Specification](payment-technical-spec.md)
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md)
- [Stripe Connect Pre-GA Completion Plan](stripe-connect-pre-ga-plan.md)
- [Agent Operations](../agent-operations.md)
