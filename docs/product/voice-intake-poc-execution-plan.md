# Runory Voice Intake POC Execution Plan

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `fsm` |
| Applies to | `post-v0.5 POC` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | — |
| Superseded by | — |

This plan turns the proposed [Voice Intake Product Definition](voice-intake-product-definition.md) and [Voice Intake Technical Specification](voice-intake-technical-spec.md) into a bounded implementation and acceptance sequence.

The POC validates one proposition:

> A real inbound phone call can create a correct, governed, reviewable Runory Work Order and optionally schedule a Service Visit.

## 1. Scope lock

### Included

- one Runory Workspace;
- one US phone number;
- Twilio telephony;
- one Retell AI Agent;
- English inbound calls;
- one home-service intake schema;
- new and existing caller handling;
- Contact and Service Site matching or creation;
- Work Order creation;
- optional fixed-slot Service Visit scheduling;
- call transcript and summary;
- Calls list and Call Detail;
- human follow-up outcome;
- audit, idempotency, and failure visibility.

### Excluded

- outbound calls;
- marketing campaigns;
- direct SMS conversations;
- automatic quotes;
- payments;
- production-grade multi-tenant self-service onboarding;
- multi-language;
- multiple voice providers;
- complex dispatch optimization;
- full contact-center routing;
- commercial billing.

Any requested work outside this boundary must be recorded as follow-up, not absorbed into the POC.

## 2. POC scenarios

### POC-01 — new caller creates Work Order

```text
Caller is unknown
→ AI collects name, address, category, description, urgency
→ AI confirms critical facts
→ Runory creates Contact, Service Site, and Work Order
→ AI reads confirmation
→ operator opens the linked Work Order
```

### POC-02 — existing caller creates Work Order

```text
Caller phone matches a Contact
→ AI confirms identity and one known Service Site
→ Runory checks possible duplicate open work
→ AI collects new issue
→ Runory creates Work Order
```

### POC-03 — caller schedules a Service Visit

```text
Intake is complete
→ Runory returns allowed slots
→ caller selects one
→ Runory creates Work Order, Service Visit, and Schedule Entry
→ Planning/My Work shows the reservation
```

### POC-04 — incomplete or unsafe call creates follow-up

```text
caller asks for a human
or required facts remain unresolved
or policy blocks automatic completion
→ Runory creates visible follow-up work
→ call is marked needs_review
```

### POC-05 — retry does not duplicate

```text
Retell repeats a Tool call or webhook
→ Runory returns the prior result
→ no duplicate Contact, Site, Work Order, Visit, or follow-up is created
```

## 3. Delivery stages

### Stage 0 — environment and provider setup

Deliverables:

- Twilio account and one US local number;
- Retell account and one test Agent;
- Twilio number connected to Retell;
- local and preview environment secrets;
- one test Workspace mapping;
- one transfer target or callback policy;
- recording disclosure text;
- test-call log template.

Configuration values:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
RETELL_API_KEY
RETELL_AGENT_ID
RETELL_WEBHOOK_SECRET
VOICE_INTAKE_WORKSPACE_ID
VOICE_INTAKE_TIME_ZONE
```

Exit gate:

- a test phone call reaches Retell;
- Retell answers with the intended greeting;
- provider call metadata can be retrieved;
- secrets are not committed.

### Stage 1 — Module skeleton and canonical contracts

Tasks:

- add proposed `runory.voice-intake` Module manifest;
- define `voice_call`, `voice_intake_session`, and provider-reference objects;
- define permissions;
- define call status, outcome, and review status enums;
- define normalized provider event and intake schemas in `packages/contracts`;
- add catalog validation and Module tests;
- confirm dependencies on Contact, Service Site, Work Order, Service Visit, Scheduling, Audit, and Outbox.

Exit gate:

- Module installs in the demo Workspace;
- schemas validate;
- no provider-specific payload appears in canonical object definitions;
- tests prove unique provider-call identity.

### Stage 2 — Integration Principal and Retell gateway

Tasks:

- introduce or reuse machine Integration Principal support;
- map Retell phone or Agent resources to one Workspace;
- implement Retell signature or credential verification;
- implement inbound-call context endpoint;
- create or update the initial `voice_call`;
- implement lifecycle webhook endpoint;
- add event idempotency and status ordering rules;
- add correlation logging.

Exit gate:

- an authenticated Retell event creates or updates one canonical Call record;
- an invalid signature is rejected;
- a duplicate event is safe;
- provider call status is visible in Runory.

### Stage 3 — caller lookup and intake preview

Tasks:

- normalize E.164 phone numbers;
- implement candidate Contact lookup;
- return minimal permitted customer and site context;
- implement `service_intake.preview`;
- identify missing, inferred, confirmed, and conflicting fields;
- detect possible duplicate open Work Orders;
- define the `home-service-basic@1` intake schema;
- configure Retell Tool definitions and prompt behavior.

Exit gate:

- Retell can greet a known caller using permitted information;
- unknown callers receive no false match;
- multiple candidate sites trigger confirmation;
- preview performs no Work Order mutation;
- duplicate candidates appear as warnings.

### Stage 4 — governed Work Order creation

Tasks:

- implement `service_intake.create_work_order` Contract;
- implement one atomic application service or Command handler;
- create or resolve Contact and Service Site according to policy;
- create Work Order through the authoritative FSM path;
- link Call and Intake Session;
- emit Domain Event and Audit;
- return stable provider-safe result;
- implement Tool endpoint;
- implement command-level idempotency.

Exit gate:

- a confirmed call creates exactly one Work Order;
- retry returns the same Work Order result;
- audit identifies voice entry, provider, call ID, Integration Principal, and Command;
- Work Order appears in the existing FSM UI;
- no generic record API is exposed to Retell.

### Stage 5 — scheduling increment

Tasks:

- implement provider-safe available-slot query;
- issue opaque, short-lived slot IDs;
- implement `service_intake.create_and_schedule` Contract;
- create Service Visit through FSM authority;
- reserve Schedule Entry through Scheduling capability;
- reject expired or conflicting slots;
- expose linked Visit and Planning data.

Exit gate:

- caller can select one valid slot;
- Work Order and Visit are linked;
- Planning/My Work shows the reservation;
- conflicting retry or consumed slot creates no double booking;
- failure does not leave a falsely confirmed appointment.

### Stage 6 — human follow-up and failure behavior

Tasks:

- define transfer and follow-up reasons;
- implement `service_intake.create_follow_up`;
- configure Retell transfer where practical;
- create callback or review work when transfer is unavailable;
- mark Call `needs_review`;
- ensure incomplete calls remain visible;
- add provider and Tool failure messages that do not invent success.

Exit gate:

- caller request for a human is honored or converted into visible follow-up;
- high-risk or incomplete intake does not auto-create an invalid Work Order;
- failed calls are searchable and actionable.

### Stage 7 — Calls UI

#### Calls list

Tasks:

- add navigation entry for authorized roles;
- show time, caller, duration, intent, outcome, review status, Work Order, and Visit;
- add basic filters;
- show failed and needs-review states clearly.

#### Call detail

Tasks:

- show transcript and summary;
- show structured intake and field states;
- show Agent Tool actions and results;
- show warnings and unresolved fields;
- show linked business records;
- show audit timeline;
- allow operator review and resolution.

Exit gate:

- operator can understand the complete call outcome without reading raw JSON;
- operator can navigate to Work Order and Visit;
- provider diagnostics remain secondary.

### Stage 8 — scenario testing and acceptance hardening

Tasks:

- create scripted call scenarios;
- make repeated real calls;
- record expected and actual results;
- test retries, duplicate webhooks, timeout, and slot conflict;
- test known caller, unknown caller, multiple sites, and duplicate work candidates;
- test incomplete call and human request;
- add automated Contract, adapter, and end-to-end tests;
- run existing FSM and architecture gates;
- write POC evidence under `docs/releases/` after acceptance.

Exit gate:

- all hard gates in section 7 pass;
- known defects are classified as blocker or deferred;
- one reproducible demo flow is documented.

## 4. Workstreams and ownership

### Platform and backend

- Module and object definitions;
- Contracts and Command handlers;
- Integration Principal;
- idempotency;
- Scheduling integration;
- audit and Outbox;
- automated tests.

### Provider and frontend

- Twilio and Retell configuration;
- provider adapters and webhooks;
- Retell Agent and Tool definitions;
- Calls UI and Call Detail;
- real-call test execution;
- provider observability.

### Product and operations

- service categories;
- required intake fields;
- confirmation wording;
- transfer policy;
- test scenarios;
- acceptance review.

Ownership can be assigned according to the engineering team's current capacity. The sequence and exit gates, rather than a fixed staffing assumption, govern delivery.

## 5. Implementation order

The recommended vertical-slice order is:

```text
1. Phone call reaches Retell
2. Retell lifecycle creates voice_call
3. Retell sends normalized completed intake
4. Runory creates one governed Work Order
5. Calls UI links to Work Order
6. Add realtime caller lookup
7. Add realtime preview and confirmation
8. Add scheduling
9. Add follow-up and transfer
10. Harden retries, failures, and evaluation
```

Do not begin with generalized Conversations architecture, multi-provider abstractions, or self-service configuration. Provider-neutral contracts are required; broad platform productization is deferred.

## 6. Hard acceptance gates

### Architecture

- [ ] Retell and Twilio are adapters, not business authorities.
- [ ] Retell has no generic record mutation Tool.
- [ ] Work Order and Visit mutations use named Commands.
- [ ] Scheduling reservation uses the authoritative Scheduling capability.
- [ ] External effects use Outbox where applicable.
- [ ] Provider payloads do not leak into FSM object ownership.

### Security

- [ ] Every provider request is authenticated.
- [ ] Phone or Agent resource maps to exactly one Workspace.
- [ ] Integration Principal has minimal Command scope.
- [ ] Secrets are absent from source, logs, and call records.
- [ ] Caller lookup returns only permitted data.
- [ ] Audit captures provider and call attribution.

### Correctness

- [ ] Confirmed intake creates one Work Order.
- [ ] Replay creates zero duplicates.
- [ ] Conflicting idempotency input is rejected.
- [ ] Invalid slot cannot be confirmed.
- [ ] Incomplete intake does not report success.
- [ ] Human request produces transfer or follow-up.
- [ ] Tool or provider failure cannot produce a false success message.

### Product experience

- [ ] One real phone call can complete the primary demo.
- [ ] The Work Order is understandable in the normal FSM UI.
- [ ] The operator can review transcript, fields, actions, and warnings.
- [ ] Failures and needs-review calls are visible.
- [ ] Raw technical provider concepts do not dominate the UI.

### Regression

- [ ] Platform Core typecheck passes.
- [ ] Cloud typecheck passes.
- [ ] Existing architecture tests pass.
- [ ] FSM Pack tests pass.
- [ ] v0.5/v0.5.1 closure validation passes.
- [ ] Documentation checker passes.

## 7. Test call matrix

| ID | Scenario | Expected outcome |
| --- | --- | --- |
| TC-01 | Unknown caller, complete intake | Contact/Site/Work Order created |
| TC-02 | Known caller, known site | Existing Contact/Site reused; Work Order created |
| TC-03 | Known caller, multiple sites | AI asks caller to confirm one site |
| TC-04 | Missing address | no Work Order until resolved or follow-up created |
| TC-05 | Caller changes service category | final confirmed value is authoritative |
| TC-06 | Duplicate open issue candidate | warning and confirmation before creation |
| TC-07 | Valid slot selected | Work Order, Visit, Schedule Entry created |
| TC-08 | Slot consumed before commit | slot conflict returned; no false confirmation |
| TC-09 | Caller asks for human | transfer or follow-up outcome |
| TC-10 | Unsupported or high-risk request | no unsafe completion; review or follow-up |
| TC-11 | Tool request repeated | prior result returned; no duplicate |
| TC-12 | Call disconnects early | incomplete Call visible and reviewable |
| TC-13 | Invalid webhook signature | request rejected and logged safely |
| TC-14 | Runory timeout | neutral retry behavior; no invented success |

## 8. POC demonstration script

1. Open an empty or known demo Workspace.
2. Show Calls, Work Orders, and Planning with no new test record.
3. Call the Twilio number from a real phone.
4. Describe a supported service problem.
5. Confirm name, service address, issue, urgency, and slot.
6. End the call.
7. Refresh Calls and open the Call Detail.
8. Show transcript, structured intake, Tool actions, and successful outcome.
9. Open the linked Work Order.
10. Open the linked Service Visit or Planning entry.
11. Repeat the final Tool request or webhook and show no duplicate record.
12. Run one human-follow-up scenario.

## 9. Risks and controls

| Risk | Control |
| --- | --- |
| Retell prompt skips required confirmation | Runory Contract rejects unconfirmed critical fields |
| provider retries create duplicates | provider-event and Command idempotency |
| caller phone matches wrong Contact | return candidates and require confirmation |
| appointment double booking | opaque slot token and authoritative Scheduling commit |
| provider reports success before Runory commits | Tool result is the only success source |
| partial Contact/Site/Work Order state | one governed Command transaction |
| sensitive data exposed in prompt | minimal dynamic context and masked fields |
| architecture over-expands | scope lock and deferred list |
| POC works only for one scripted phrase | varied real-call test matrix |
| local SQLite test contention | run database-reset suites serially as current acceptance guidance requires |

## 10. Stop and review conditions

Pause implementation and review architecture if any of the following occurs:

- Work Order creation requires direct database mutation outside the Command Runtime;
- Scheduling has no authoritative reservation Command that can be safely reused;
- machine identity cannot be restricted to one Workspace and narrow Commands;
- provider retries cannot be correlated reliably;
- business rules must be duplicated inside Retell configuration;
- a provider-specific model change is proposed for core FSM objects;
- the POC expands into a generalized contact-center platform before the primary call-to-work-order path passes.

## 11. Completion output

When accepted, add an immutable evidence document:

```text
docs/releases/voice-intake-poc-e2e-run-YYYY-MM-DD.md
```

It should record:

- tested commit;
- provider configuration identifiers without secrets;
- test Workspace;
- scenarios executed;
- automated checks;
- observed metrics;
- screenshots or call references where appropriate;
- known limitations;
- acceptance decision.

After acceptance, product and engineering should decide whether to:

1. productize `runory.voice-intake`;
2. add SMS and messaging;
3. create an AI Service Receptionist Pack;
4. add a second voice provider;
5. remain focused on one field-service vertical for data and quality accumulation.

## 12. Related documents

- [Voice Intake Product Definition](voice-intake-product-definition.md)
- [Voice Intake Technical Specification](voice-intake-technical-spec.md)
- [FSM Canonical Execution Product Architecture](fsm-canonical-execution-product-architecture.md)
- [v0.5.1 Local Commercial Acceptance Checklist](v0.5.1-local-commercial-acceptance-checklist.md)
- [Architecture Overview](../architecture/overview.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
