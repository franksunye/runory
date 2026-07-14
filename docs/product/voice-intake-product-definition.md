# Runory Voice Intake Product Definition

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `product` |
| Applies to | `post-v0.5 POC` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | — |
| Superseded by | — |

Runory Voice Intake is a proposed cross-cutting business capability that converts a live customer phone conversation into governed Runory business actions, beginning with Field Service Management.

It supports the canonical [Product Definition](product-definition.md), specializes the current [FSM Canonical Execution Product Architecture](fsm-canonical-execution-product-architecture.md), and must follow the [Architecture Overview](../architecture/overview.md) and [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md).

## 1. Product statement

> Runory answers a service call, understands the request, and turns it into an executable work order.

The first product experience is:

```text
Customer calls
→ AI answers
→ Customer and service context are identified
→ Required intake facts are collected and confirmed
→ Runory creates a governed Work Order
→ Runory optionally creates and schedules a Service Visit
→ The operator can review the call, transcript, outcome, and linked records
```

Voice Intake is not a standalone phone bot. It is a new conversation channel into the same governed business runtime already used by the Cloud UI, mobile UI, MCP, Skills, Workflow, and Automation.

## 2. Target user and initial market

Initial target:

- small and medium field-service businesses;
- businesses that currently lose calls, rely on manual reception, or re-enter phone information into an FSM;
- teams that need after-hours, overflow, or first-line phone intake;
- owner-operated or dispatcher-led service businesses.

Initial vertical reference:

- home services;
- repair and maintenance;
- waterproofing;
- HVAC;
- plumbing;
- appliance and equipment service.

The POC does not attempt to prove a universal multi-industry conversational platform. It proves one narrow proposition:

> A real phone call can create a correct, reviewable, executable Runory work order without manual re-entry.

## 3. User jobs

### 3.1 Customer

The caller needs to:

- reach the business without waiting for an available employee;
- explain a service problem naturally;
- confirm the service address and contact information;
- receive a clear next step;
- optionally select an available service window;
- receive a work-order or appointment confirmation.

### 3.2 Business operator

The operator needs to:

- avoid missed calls and incomplete handwritten notes;
- receive a structured service request;
- understand what the AI heard and what it changed;
- review uncertain or high-risk calls;
- see the resulting Work Order and Service Visit in the normal FSM experience;
- take over when the AI cannot safely complete the request.

### 3.3 Workspace administrator

The administrator needs to configure:

- business identity and greeting;
- operating hours;
- supported service categories;
- service area and intake rules;
- required fields;
- escalation and transfer rules;
- appointment policy;
- recording and disclosure text;
- provider credentials and phone-number mapping.

## 4. Product boundaries

### 4.1 Voice Intake owns

The proposed `runory.voice-intake` Module owns:

- provider-neutral call records;
- intake-session state;
- provider reference mapping;
- call outcome and review status;
- links from a call to customer, site, work order, visit, and follow-up work;
- voice-intake permissions;
- voice-intake views;
- intake-specific Agent Skills;
- high-level intake Commands and Contracts.

### 4.2 Voice Intake does not own

Voice Intake must not duplicate or become authoritative for:

- Company or Contact;
- Service Site;
- Work Order;
- Service Visit;
- Schedule Entry;
- Assignment;
- Task or Work Item;
- Service Report;
- messaging infrastructure;
- provider-specific phone configuration.

Those remain owned by their existing Modules or platform capabilities.

### 4.3 Provider boundary

The first provider combination is:

```text
Twilio = phone number, PSTN, SMS, and telephony infrastructure
Retell AI = realtime voice-agent execution
Runory = business context, rules, Commands, authoritative records, audit, and operator UI
```

Twilio and Retell are replaceable providers. Their payloads and identifiers must not become the canonical Runory domain model.

## 5. Initial supported scenarios

### Scenario A — new customer, new service request

```text
Unknown phone number
→ collect name
→ collect service address
→ collect problem and service category
→ confirm urgency
→ create Contact / Service Site where required
→ create Work Order
→ return work-order confirmation
```

### Scenario B — existing customer, new service request

```text
Known phone number
→ identify candidate Contact and existing sites
→ confirm identity and site
→ check for potentially duplicate open work
→ collect new problem
→ create Work Order
```

### Scenario C — create and schedule

```text
Completed intake
→ query allowed appointment slots
→ caller selects a slot
→ create Service Visit and Schedule Entry
→ return confirmed time window
```

### Scenario D — human follow-up

```text
AI cannot safely complete intake
or caller asks for a human
or a high-risk condition is detected
→ create a governed callback/follow-up obligation
→ mark call for operator review
→ transfer live when configured and available
```

## 6. Required business facts

The POC intake model must support at least:

- caller phone;
- customer or contact name;
- service address;
- service category;
- problem description;
- urgency;
- preferred service window;
- consent or acknowledgement where required;
- confirmation state;
- confidence and unresolved fields;
- provider call identifier.

The caller does not need to provide every field verbally. Runory can reuse verified workspace data, but any reused sensitive or operationally important fact must be confirmed before the final Command executes.

## 7. Conversation principles

1. One question at a time.
2. Do not invent missing business facts.
3. Distinguish confirmed, inferred, missing, and conflicting values.
4. Confirm address, service type, urgency, and appointment before execution.
5. Do not promise pricing, coverage, arrival times, refunds, or outcomes unless a Runory Tool returns an authorized answer.
6. Use deterministic business validation for execution-critical decisions.
7. Stop and hand off when confidence, safety, permission, or policy thresholds are not met.

## 8. POC scope

The POC includes:

- one Runory Workspace;
- one US phone number;
- English;
- inbound calls;
- one FSM-oriented intake template;
- a limited service-category list;
- caller lookup by phone;
- Contact and Service Site matching or creation;
- Work Order creation;
- optional fixed-slot Service Visit scheduling;
- call transcript and summary;
- provider call status;
- operator call list and call detail;
- explicit human follow-up outcome;
- idempotent webhook and Tool handling.

The POC excludes:

- outbound campaigns;
- generalized direct SMS conversations;
- automatic pricing or quotation;
- payment collection;
- complex route optimization;
- multilingual support;
- multi-provider production failover;
- a self-service phone-number marketplace;
- full contact-center queue management;
- broad cross-industry configuration.

## 9. Success criteria

The POC is successful when repeated real test calls demonstrate:

- the call is answered and completed without infrastructure errors;
- the correct Workspace and intake policy are selected;
- required facts are collected or explicitly marked unresolved;
- the same provider event cannot create duplicate records;
- the resulting Work Order is understandable and executable in the existing FSM UI;
- appointment creation does not bypass Scheduling authority;
- operator review shows the transcript, structured intake, actions, warnings, and linked records;
- failure and handoff cases create visible follow-up work;
- every business mutation is attributable through audit and Command result data.

Initial measurement targets:

| Metric | POC target |
| --- | ---: |
| Successful call ingestion | ≥ 98% |
| Work Order creation success after confirmed intake | ≥ 95% |
| Required-field completion | ≥ 90% |
| Duplicate Work Order from retry | 0 |
| Appointment conflict caused by Voice Intake | 0 |
| Business mutation outside named Commands | 0 |
| High-risk case incorrectly auto-completed | 0 |

These are POC gates, not commercial SLA commitments.

## 10. Commercial packaging direction

The POC introduces one Module, not a new Pack:

```text
runory.voice-intake
```

If validated, the commercial packaging may become:

```text
AI Service Receptionist Pack
=
CRM Lite Pack
+ FSM Pack
+ Customer Service capabilities
+ Voice Intake
+ Messaging
+ Conversation Inbox Template
```

The Pack is a commercial composition. It must not redefine the authoritative business objects owned by CRM, FSM, Scheduling, Assignment, or Customer Service Modules.

## 11. Strategic position

Sameday and Slang primarily connect a voice experience to another operational system. Runory can make the conversation a first-class entry into its own business runtime.

The intended differentiation is:

```text
not only answer the call
not only summarize the call
not only create an appointment

but create and advance governed business work
```

The long-term platform direction is a provider-neutral Runory Conversations capability across voice, SMS, web chat, and other channels. Voice Intake is the first bounded implementation and must not prematurely claim that broader platform as complete.

## 12. Related documents

- [Voice Intake Technical Specification](voice-intake-technical-spec.md)
- [Voice Intake POC Execution Plan](voice-intake-poc-execution-plan.md)
- [FSM Canonical Execution Product Architecture](fsm-canonical-execution-product-architecture.md)
- [v0.5 Commercial FSM Technical Spec](v0.5-commercial-fsm-technical-spec.md)
- [Architecture Overview](../architecture/overview.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
- [Module Architecture](../architecture/module-architecture.md)
