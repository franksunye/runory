# Customer Implementation and Agent-assisted Delivery Model

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `product-delivery` |
| Applies to | `v0.9+ / paid production workspaces` |
| Owner | Product / Engineering / Customer Success |
| Last reviewed | 2026-07-29 |
| Supersedes | — |
| Superseded by | — |

Runory paid production delivery is not a self-serve subscription alone. It combines a Runory subscription, a bounded implementation project, provider onboarding, customer approval, production cutover, and ongoing operation.

This document defines the commercial and operational delivery model. It supports the [Product Definition](product-definition.md), [Voice Intake Product Definition](voice-intake-product-definition.md), [Payment Product Definition](payment-product-definition.md), [Voice Intake Integration Boundary](../architecture/voice-intake-integration-boundary.md), [Payment Integration Boundary](../architecture/payment-integration-boundary.md), and the canonical self-serve journey in [Getting Started](../getting-started.md).

It does not replace provider-specific technical specifications or implementation runbooks.

## 1. Delivery decision

Runory uses two distinct customer journeys:

```text
Free Workspace
→ product exploration with demo or bounded test data
→ no paid provider-dependent production capability

Paid Production Workspace
→ solution assessment
→ order and payment
→ implementation
→ UAT / pilot
→ production go-live
→ subscription and ongoing optimization
```

The Free Workspace should demonstrate the end-to-end product model, but must not silently activate cost-bearing or regulated production services such as live telephony, SMS, number porting, or merchant payment processing.

A paid subscription does not by itself mean the Workspace is production-ready. Production readiness is established by an accepted Implementation Run and explicit go-live approval.

## 2. What implementation includes

A standard implementation may cover the following domains.

| Domain | Required work |
| --- | --- |
| Workspace foundation | Organization and Workspace creation, locale, timezone, currency, business identity, operating hours, environment selection |
| Identity and access | Owner, administrator, dispatcher, salesperson, technician, finance, support, and least-privilege role configuration |
| Business configuration | Service catalog, service areas, price rules, Work Order lifecycle, scheduling policy, forms, required fields, escalation rules |
| Voice Intake | Number strategy, Twilio resources, Retell Agent, greeting, knowledge, transfer, recording, disclosure, webhook, call outcome mapping |
| Messaging | SMS/email sender setup, templates, consent, opt-out behavior, appointment and payment notifications |
| Workspace payments | Customer-owned Stripe Connected Account, onboarding, Checkout, webhook, refund permissions, reconciliation visibility |
| Data migration | Customer, contact, site, employee, service, price, open Work Order, and optional historical record mapping and import |
| Integrations | Calendar, email, CRM, accounting, web forms, API, MCP, or customer-specific provider connection when in scope |
| Validation and launch | Test data, scenario suite, UAT, production credentials, final import, cutover, training, and hypercare |

Implementation scope must be written into the order. Anything outside the accepted standard scope is a change request, separate migration package, or custom integration.

## 3. Provider and asset ownership

### 3.1 Phone number and telephony

Runory supports three initial patterns:

1. **Temporary or new number** — quickest pilot path; the customer may forward its existing number.
2. **Existing Twilio number** — connected through an approved account and provider boundary.
3. **Existing carrier number** — initially forwarded, then optionally ported after pilot acceptance.

Number porting must not be a prerequisite for the first pilot. It depends on customer authorization, carrier records, regulatory documents, and third-party review.

For early SMB delivery, Runory may operate a platform Twilio account with one isolated Subaccount per customer. The commercial agreement must state number use, cost responsibility, suspension conditions, and the customer's right and process to port an eligible business number away at termination.

Larger customers may use their own Twilio account. Runory then receives bounded credentials or authorization rather than account ownership.

### 3.2 Voice provider

Retell is the initial realtime Voice Agent provider. Retell configuration is customer-specific, but provider payloads, prompts, identifiers, and lifecycle controls remain behind the provider adapter defined by the Voice Intake architecture.

### 3.3 Workspace payment account

The customer must own the merchant account that receives its customer payments. Production Workspace payments use a customer-owned Stripe Connected Account and Direct Charges. Runory platform subscription billing remains a separate financial domain.

Runory must not settle customer gross receipts into the Runory platform balance.

### 3.4 Credentials

Provider credentials must be stored in the approved secret-management boundary. They must not be pasted into documents, prompts, audit payloads, support tickets, or general Workspace records.

## 4. Commercial sequence and payment timing

Runory should not complete production implementation speculatively and ask the customer to decide afterward.

The standard sequence is:

```text
1. Free exploration or product demo
2. Discovery and qualification
3. Solution assessment and scoped order
4. Contract / order acceptance
5. Implementation fee payment
6. Kickoff and customer-input collection
7. Configuration and provider provisioning
8. UAT / pilot
9. Go-live approval and production cutover
10. Subscription operation and optimization
```

### 4.1 Discovery

A bounded discovery call or assessment may be free. It determines:

- business type, location, language, timezone, and operating hours;
- user, technician, team, and location counts;
- service catalog and service area complexity;
- phone-number status, call volume, routing, transfer, and recording requirements;
- SMS and messaging requirements;
- Stripe and payment requirements;
- existing systems and migration volume;
- custom integration or compliance dependencies;
- target pilot and go-live date.

Discovery must not create production provider resources or consume material implementation effort.

### 4.2 Payment policy

Recommended default terms:

- standard implementation fee: `100%` paid before kickoff;
- larger implementation: `50%` at kickoff and `50%` before production cutover;
- subscription: starts at production go-live, or at a clearly stated earlier date when the customer receives an active production Workspace;
- third-party test usage: included only within the stated pilot allowance; excess usage is chargeable;
- number, messaging, Voice Agent, and other provider usage: passed through or metered according to the order;
- custom development and complex migration: separately scoped and priced.

Early-customer discounts may reduce or waive part of the implementation fee, but the order should still show the standard fee and the explicit discount. This avoids establishing an expectation that implementation is inherently free.

## 5. Implementation phases and gates

### Phase 0 — Qualification

**Output:** fit decision and preliminary scope.

Exit gate:

- target workflow is supported;
- required providers and regions are viable;
- material unknowns are identified;
- customer understands subscription, implementation, and provider usage charges.

### Phase 1 — Order and kickoff

**Output:** accepted order, named owners, target dates, and input checklist.

Exit gate:

- payment condition satisfied;
- customer and Runory implementation owners assigned;
- customer-input obligations accepted;
- scope, assumptions, exclusions, and acceptance criteria recorded.

### Phase 2 — Discovery blueprint

**Output:** structured Implementation Blueprint.

The blueprint includes:

- Workspace profile;
- users and roles;
- service catalog and business rules;
- lifecycle and scheduling configuration;
- Voice Intake conversation policy;
- transfer and exception policy;
- payment workflow;
- migration mapping;
- compliance and customer approvals;
- test scenarios;
- cutover plan.

Exit gate: customer business owner approves the blueprint.

### Phase 3 — Provisioning and configuration

**Output:** configured non-production or pilot environment.

Exit gate:

- Runory configuration applied successfully;
- provider connections verified;
- credentials stored correctly;
- test number and test payment path available when in scope;
- audit records and rollback points exist for governed changes.

### Phase 4 — Migration and validation

**Output:** migrated sample data and test evidence.

Exit gate:

- field mapping accepted;
- migration reconciliation passes;
- scenario suite meets the agreed pass threshold;
- critical and high-severity defects are closed;
- unresolved exceptions have an accepted manual fallback.

### Phase 5 — UAT / pilot

**Output:** customer acceptance evidence.

Voice pilots should normally use a temporary number or forwarding before permanent porting. Payment pilots should use Stripe test mode before production onboarding and live credentials.

Exit gate:

- named customer approver accepts UAT;
- production disclosure, routing, payment, and exception behavior are approved;
- support and escalation contacts are confirmed.

### Phase 6 — Production cutover

**Output:** active production Workspace.

Exit gate:

- production credentials enabled;
- phone routing or forwarding activated;
- live payment account enabled when in scope;
- final delta import completed;
- monitoring and usage alerts enabled;
- go-live approval recorded.

### Phase 7 — Hypercare and transition

**Output:** stabilized service and handover.

Recommended initial hypercare is 7–14 days. It covers monitored failures, prompt or routing corrections, configuration defects, and customer operator support. New functionality or changed business scope is not hypercare.

## 6. Agent-assisted implementation model

Runory should use the same product principle for implementation that it uses for customer operations:

> Agent plans and prepares; the governed Runtime validates, previews, applies, audits, and rolls back.

A generic ChatGPT session must not receive unrestricted provider administrator credentials or arbitrary production mutation access. External Agents should call bounded Runory Commands through MCP, Skills, or approved APIs.

### 6.1 Implementation Agents

| Agent | Responsibility |
| --- | --- |
| Discovery Agent | Conversational intake, website/document analysis, missing-input detection, Implementation Blueprint generation |
| Provisioning Agent | Runory Workspace, Twilio Subaccount, number, Retell Agent, Stripe connection, webhook, and environment configuration |
| Migration Agent | Source profiling, field mapping proposal, validation, import, reconciliation, and exception report |
| QA Agent | Test-case generation, simulated and live test execution, transcript/result analysis, regression checks, acceptance report |
| Launch Agent | Readiness checks, approval collection, cutover plan execution, monitoring activation, and hypercare tracking |

### 6.2 Candidate governed Commands

```text
implementation.create_run
implementation.capture_business_profile
implementation.generate_blueprint
implementation.preview_configuration
implementation.apply_workspace_configuration
implementation.import_source_profile
implementation.preview_migration_mapping
implementation.execute_migration
implementation.generate_test_suite
implementation.run_acceptance_checks
implementation.request_customer_approval
implementation.approve_gate

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
voice.publish_agent_version
voice.attach_knowledge_base
voice.configure_transfer_policy
voice.run_test_call

payment.create_connect_onboarding_link
payment.check_provider_account_readiness
payment.configure_webhook
payment.enable_production_account

launch.preview_cutover
launch.execute_cutover
launch.rollback_cutover
```

These are business Commands, not unrestricted provider API proxies.

### 6.3 Mandatory controls

Every implementation Command must define:

- actor and Workspace scope;
- required role and approval policy;
- validated input schema;
- preview behavior for material changes;
- idempotency key;
- budget or usage limit;
- environment boundary;
- audit event;
- failure and compensation behavior;
- output contract and provider-reference mapping.

Human approval is mandatory before at least:

- purchasing or porting a number;
- accepting legal or regulatory declarations;
- enabling recording or customer communications;
- publishing a production Voice Agent;
- enabling live payment collection;
- importing or replacing production data;
- production cutover;
- incurring unbounded or non-trivial provider cost.

## 7. What can be highly automated

For a standard supported customer, Runory should aim to automate:

- discovery question sequencing and completeness checks;
- website, document, and CSV extraction;
- initial service catalog and knowledge draft;
- role and workflow configuration draft;
- Twilio Subaccount and provider-resource provisioning;
- phone-number search and configuration preview;
- Retell Agent, knowledge, webhook, and transfer setup;
- Stripe Connect onboarding initiation and readiness checks;
- migration profiling and mapping proposal;
- scenario and regression-suite generation;
- test-call execution and transcript evaluation;
- acceptance evidence and customer-facing implementation status;
- launch checklist and ongoing health checks.

The target is to move human effort away from repetitive console configuration and toward business validation, exception handling, compliance confirmation, and final acceptance.

## 8. What remains customer- or third-party-dependent

Agent assistance does not remove the need for:

- customer-provided legal entity, address, owner, banking, carrier, and identity evidence;
- customer acceptance of terms, disclosures, recording rules, and merchant agreements;
- customer confirmation of prices, promises, service boundaries, emergencies, and human-transfer policy;
- carrier and provider manual review;
- number portability and regulatory eligibility;
- Stripe KYC and bank verification;
- final UAT and production approval.

Runory may collect, validate, package, submit, and track these items, but it must not invent evidence or accept declarations on behalf of the customer.

## 9. Implementation Run as the system of record

Each paid onboarding must have one authoritative Implementation Run with structured phases and evidence.

Suggested state model:

```text
qualified
→ awaiting_order
→ awaiting_customer_inputs
→ blueprint_review
→ provisioning
→ migration
→ validation
→ uat
→ ready_for_go_live
→ live
→ hypercare
→ completed

Any active phase
→ blocked
→ cancelled
→ rollback_required
```

Minimum tracked data:

- customer, Workspace, order, plan, and implementation owner;
- scope, assumptions, exclusions, dependencies, and target dates;
- provider accounts and non-secret reference identifiers;
- customer-input checklist;
- configuration version and applied Commands;
- migration batches and reconciliation results;
- test scenarios, runs, pass rate, and open defects;
- approvals, approvers, timestamps, and evidence;
- cutover and rollback record;
- usage, cost, and health alerts during pilot and hypercare.

The Implementation Run should be visible to Runory staff, the responsible partner, and the customer administrator according to role.

## 10. Partner delivery model

A partner may perform discovery, configuration review, training, and first-line support, but must use the same Implementation Run, governed Commands, approval gates, and evidence model.

Partner discount should correspond to delivery responsibility:

- referral partner: introduces the customer; Runory implements;
- reseller: owns commercial relationship and selected onboarding tasks;
- implementation partner: owns blueprint, configuration, training, and first-line support under Runory certification;
- custom solution partner: separately contracted for approved extensions and integrations.

No partner may bypass production approval, credential, audit, provider-ownership, or payment-settlement boundaries.

## 11. Initial service targets

Indicative targets, subject to provider review and customer responsiveness:

| Implementation type | Indicative elapsed time |
| --- | ---: |
| Core Workspace without Voice, migration, or custom integration | 3–5 business days |
| New number plus standard Voice Intake | 1–2 weeks |
| Existing number port | commonly 2–4 weeks or longer |
| Stripe plus moderate migration and multiple teams | 2–4 weeks |
| Enterprise integration or complex workflow | 4–8 weeks or separately planned |

These are planning targets, not unconditional commitments. External carrier, regulatory, KYC, customer-input, and integration dependencies must be shown as blockers in the Implementation Run.

## 12. Product implications

Repeatable paid delivery requires product capabilities, not only internal process:

1. an Implementation Run object and customer-facing status view;
2. structured discovery and blueprint schemas;
3. provider-neutral provisioning Commands;
4. encrypted credential and provider-account references;
5. preview, approval, idempotency, audit, rollback, and cost controls;
6. migration mapping, dry-run, reconciliation, and exception handling;
7. automated test and evidence capture, including Voice test calls;
8. cutover and rollback orchestration;
9. usage metering and provider-cost attribution by Workspace;
10. partner roles, permissions, certification, and responsibility boundaries.

These capabilities are part of Runory's long-term differentiation: the platform should make implementation repeatable and Agent-assisted rather than reproducing a traditional bespoke software project for every customer.

## 13. Related documents

- [Getting Started](../getting-started.md) — free, self-serve product exploration and the transition to paid production delivery.
- [Voice Intake Product Definition](voice-intake-product-definition.md) — customer and operator experience for phone-to-Work-Order execution.
- [Voice Intake Technical Specification](voice-intake-technical-spec.md) — Twilio, Retell, webhook, state, and Command implementation.
- [Voice Intake Integration Boundary](../architecture/voice-intake-integration-boundary.md) — provider-neutral conversation-channel boundary.
- [Payment Product Definition](payment-product-definition.md) — separation of Runory billing and Workspace merchant payments.
- [Payment Technical Specification](payment-technical-spec.md) — Stripe-first provider-neutral payment implementation.
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md) — business-payment and provider-adapter boundary.
- [Stripe Connect Pre-GA Completion Plan](stripe-connect-pre-ga-plan.md) — merchant-owned settlement and production readiness.
- [Agent Operations](../agent-operations.md) — plan, preview, apply, audit, and rollback model.
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md) — governed Command authority.
