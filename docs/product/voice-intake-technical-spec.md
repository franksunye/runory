# Runory Voice Intake Technical Specification

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `architecture` |
| Applies to | `post-v0.5 POC` |
| Owner | Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | — |
| Superseded by | — |

This specification defines the proposed technical implementation for the first Runory Voice Intake POC. It supports the canonical [Architecture Overview](../architecture/overview.md), [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md), [Module Architecture](../architecture/module-architecture.md), and current FSM specifications. It does not replace those authorities.

## 1. Decision summary

The POC uses:

```text
Twilio
→ phone number, PSTN, inbound routing, optional SMS

Retell AI
→ realtime voice execution, turn taking, transcription, Tool calls, transfer

Runory
→ Workspace resolution, business context, validation, Commands, authoritative records,
  Scheduling, audit, review UI, and provider-neutral call history
```

The implementation adds one proposed official Module:

```text
runory.voice-intake
```

The implementation must not add provider-specific fields to authoritative FSM objects and must not permit Retell or Twilio to write generic records directly.

## 2. Architecture

```text
Caller
  |
  v
Twilio Phone Number
  |
  v
Retell Voice Agent
  |
  +-------------------+
  |                   |
  v                   v
Runory Tool API       Retell Call Webhooks
  |                   |
  +---------+---------+
            v
Runory Integration Gateway
  |
  v
Voice Intake application service
  |
  v
Named Command Runtime
  |
  +--> Contact / Company
  +--> Service Site
  +--> Work Order
  +--> Service Visit
  +--> Schedule Entry
  +--> Work Item / callback when required
  +--> Domain Event / Audit / Outbox
```

Provider calls are external inputs. Runory remains authoritative for business state.

## 3. Repository placement

Proposed structure:

```text
catalog/modules/runory.voice-intake/
  manifest.yaml
  objects.yaml
  commands.yaml
  permissions.yaml
  views.yaml
  agent-skills.yaml

packages/contracts/src/voice-intake/
  provider-events.ts
  intake.ts
  commands.ts
  results.ts

packages/platform-core/src/voice-intake/
  intake-service.ts
  provider-reference-repository.ts
  call-repository.ts
  command-handlers.ts
  policy.ts

apps/cloud/src/integrations/retell/
  client.ts
  signatures.ts
  mapper.ts
  types.ts

apps/cloud/src/integrations/twilio/
  client.ts
  signatures.ts
  types.ts

apps/cloud/src/app/api/integrations/retell/
  inbound-call/route.ts
  webhook/route.ts
  tools/customer-lookup/route.ts
  tools/intake-preview/route.ts
  tools/create-work-order/route.ts
  tools/create-and-schedule/route.ts
  tools/create-follow-up/route.ts

apps/cloud/src/app/w/[workspaceSlug]/calls/
  page.tsx
  [callId]/page.tsx
```

Exact file names may follow existing repository conventions. The architectural boundaries are mandatory; the folder names are proposed.

## 4. Module boundary

### 4.1 Module key

```text
runory.voice-intake
```

### 4.2 Dependencies

Required for the FSM POC:

```text
runory.contact
runory.service-site
runory.work-order
runory.service-visit
Scheduling capability
Audit capability
Outbox capability
```

Optional:

```text
runory.company
runory.task or Work Item capability
Messaging capability
Assignment capability
```

Pack installation must fail closed if required Command providers are unavailable.

### 4.3 Owned objects

#### `voice_call`

Provider-neutral record of an inbound or outbound call.

Minimum fields:

```text
id                    required
workspace_id          required
provider              required
provider_call_id      required
provider_phone_id     optional
caller_phone          required for inbound POC
callee_phone          optional
status                required
started_at            optional
answered_at           optional
ended_at              optional
duration_seconds      optional
transcript_text       optional or externalized
summary               optional
recording_reference   optional
primary_intent        optional
outcome               optional
review_status         required
work_order_id         optional relation
service_visit_id      optional relation
contact_id            optional relation
service_site_id       optional relation
created_at             required
updated_at             required
```

Unique constraint:

```text
workspace_id + provider + provider_call_id
```

#### `voice_intake_session`

Stores the structured intake state independently from the provider prompt.

Minimum fields:

```text
id
workspace_id
voice_call_id
schema_key
schema_version
status
confirmed_values_json
inferred_values_json
missing_fields_json
conflicts_json
warnings_json
confirmation_state
created_at
updated_at
completed_at
```

#### `voice_provider_reference`

Maps provider resources to Runory Workspace and configuration.

Minimum fields:

```text
id
workspace_id
provider
resource_type
provider_resource_id
status
configuration_reference
created_at
updated_at
```

Secrets must not be stored in catalog manifests or plaintext business records.

### 4.4 Module-contributed extension fields

If the existing extension mechanism can contribute fields safely, Voice Intake may contribute read-only or governed relation fields such as:

```text
work_order.intake_channel
work_order.intake_call_id
work_order.intake_confidence
```

The authoritative relation remains on `voice_call`. The extension fields are optional projections or convenient links, not a second source of truth.

## 5. Intake schema

The POC uses one versioned schema:

```yaml
key: home-service-basic
version: 1
required:
  - caller_phone
  - contact_name
  - service_address
  - issue_description
  - service_category
  - urgency
confirm_before_execute:
  - service_address
  - service_category
  - urgency
conditional:
  - when: schedule_requested == true
    require:
      - selected_slot_id
```

Runory owns this schema. Retell receives a derived prompt, Tool descriptions, and dynamic context, but the provider configuration is not authoritative.

Field state values:

```text
confirmed
inferred
missing
conflicting
rejected
```

## 6. Commands

### 6.1 `service_intake.preview`

Purpose:

- validate normalized intake;
- resolve candidate Contact and Service Site;
- detect possible duplicate open Work Orders;
- evaluate service-area and policy warnings;
- return required confirmation and available next Commands;
- perform no authoritative business mutation except optional intake-session state.

Input:

```json
{
  "providerCallId": "call_123",
  "callerPhone": "+12125550123",
  "contactName": "John Smith",
  "serviceAddress": "123 Main Street, Austin, TX",
  "serviceCategory": "water_leak",
  "issueDescription": "Kitchen pipe is leaking",
  "urgency": "urgent"
}
```

Result:

```json
{
  "intakeSessionId": "...",
  "candidateContactId": "...",
  "candidateServiceSiteId": "...",
  "duplicateCandidates": [],
  "warnings": [],
  "missingFields": [],
  "requiresConfirmation": ["serviceAddress", "serviceCategory", "urgency"],
  "nextCommands": ["service_intake.create_work_order"]
}
```

### 6.2 `service_intake.create_work_order`

Purpose:

- create or resolve permitted Contact and Service Site records;
- create one Work Order;
- link the Voice Call and Intake Session;
- emit audit and domain events;
- create Outbox effects where configured.

Required contract characteristics:

```text
idempotent: true
requires idempotency key: true
permission: voice_intake.execute
atomic business effects: true
```

Recommended idempotency key:

```text
retell:<workspace_id>:<provider_call_id>:create-work-order:v1
```

### 6.3 `service_intake.create_and_schedule`

Purpose:

- perform all effects of `service_intake.create_work_order`;
- create Service Visit;
- reserve the selected Schedule Entry through Scheduling capability;
- fail atomically if the selected slot is no longer valid.

The Command must not write `scheduled_start` fields as a substitute for a Scheduling reservation when the Scheduling capability is installed and authoritative.

### 6.4 `service_intake.create_follow_up`

Purpose:

- create a visible human obligation when the AI cannot complete safely;
- link the obligation to the Voice Call, Contact, and candidate Work Order where available;
- capture reason, priority, SLA, and requested callback window.

## 7. Query Tools exposed to Retell

The provider may call only narrow, provider-safe Tool endpoints.

### `lookup_caller`

Returns:

- candidate contacts;
- masked or minimal site summaries;
- existing open work count;
- permitted greeting context.

It must not expose unrestricted customer history.

### `preview_service_intake`

Calls `service_intake.preview`.

### `get_available_slots`

Returns provider-safe slot IDs and spoken labels. Slot IDs must be opaque and short-lived.

### `create_work_order`

Calls `service_intake.create_work_order` only after confirmation conditions are met.

### `create_and_schedule`

Calls `service_intake.create_and_schedule` only with a valid slot token.

### `create_follow_up`

Creates a callback or review obligation.

Retell must not receive a generic `create_record`, `update_record`, direct SQL, unrestricted MCP, or broad admin Tool.

## 8. Workspace and machine identity

Provider requests do not use browser session identity.

The POC requires an Integration Principal containing:

```text
principal type: integration
provider: retell
workspace_id
allowed endpoints
allowed command keys
credential version
status
```

Authorization flow:

```text
provider signature or API credential
→ resolve provider resource
→ resolve Workspace
→ resolve Integration Principal
→ authorize Tool / Command
→ execute with audit actor metadata
```

Audit actor metadata must identify:

```text
entry_channel = voice
provider = retell
provider_call_id
integration_principal_id
workspace_id
command_key
```

## 9. Webhooks

### 9.1 Inbound-call context webhook

Responsibilities:

- validate provider request;
- resolve phone-number mapping to Workspace;
- look up caller using normalized E.164 phone;
- return permitted dynamic variables and Agent selection;
- create or upsert initial `voice_call` record;
- never create a Work Order at this stage.

### 9.2 Call lifecycle webhook

Handled events may include:

```text
call_started
call_answered
call_ended
call_analyzed
call_failed
```

Requirements:

- event-level idempotency;
- out-of-order tolerance;
- monotonic status handling;
- raw payload retention only according to policy;
- no duplicate business Commands from repeated events.

### 9.3 Tool endpoints

Each Tool request must include:

- provider call ID;
- Tool invocation ID where available;
- normalized input;
- authenticated provider context.

Recommended idempotency key:

```text
provider + call_id + tool_invocation_id + command_version
```

## 10. Provider adapters

### 10.1 Retell adapter

Owns:

- request and webhook signature verification;
- provider payload types;
- mapping provider events to canonical call events;
- dynamic variable response;
- outbound API calls to retrieve call metadata when required;
- provider error translation.

It must not own:

- FSM business rules;
- intake completion policy;
- Work Order creation logic;
- Scheduling rules;
- Workspace permissions.

### 10.2 Twilio adapter

POC responsibilities are limited to:

- phone-number provisioning or mapping;
- telephony configuration required by Retell;
- optional SMS confirmation in a later POC increment;
- provider status diagnostics.

The POC may initially configure Twilio manually. Runory self-service provisioning is out of scope.

## 11. Call status and outcomes

Canonical call status:

```text
created
ringing
in_progress
completed
failed
```

Canonical outcome:

```text
work_order_created
work_order_and_visit_created
follow_up_created
transferred_to_human
information_only
abandoned
spam
failed
```

Review status:

```text
not_required
needs_review
reviewed
resolved
```

Provider-specific statuses map into these values without replacing them.

## 12. Error handling

### Provider unavailable

- do not report business success;
- preserve received event data;
- expose diagnostic state;
- create an operator-visible failure when customer follow-up is required.

### Runory Tool timeout

- return a neutral retryable response to the provider;
- rely on idempotency for safe retry;
- do not allow the voice model to invent success.

### Validation failure

- return missing or conflicting fields;
- continue the conversation when safe;
- do not execute a mutation Command.

### Schedule conflict

- return `SLOT_NO_LONGER_AVAILABLE`;
- request a new slot;
- do not leave a Work Order partially scheduled if the Contract requires atomic creation and scheduling.

### Duplicate provider event

- return the prior successful result;
- create no duplicate Work Order, Visit, or follow-up obligation.

### Partial external effect failure

- authoritative local mutation remains governed by Command transaction;
- SMS, webhook, provider notification, and other external effects use Outbox;
- retry is observable and idempotent.

## 13. Privacy and retention

The POC must define configurable policy for:

- recording disclosure;
- transcript retention;
- recording retention;
- raw provider payload retention;
- access permissions;
- deletion or redaction requests;
- sensitive-field masking in UI and logs.

Default POC posture:

- store transcript and summary for test calls;
- store recording as provider reference, not copied binary data;
- restrict Calls and Call Detail to owners/admins or a dedicated permission;
- never log provider secrets or full authorization headers;
- mask phone numbers in general diagnostic logs.

Production legal and regional policy remains a separate launch gate.

## 14. UI

### Calls list

Minimum columns:

```text
Time
Caller
Duration
Intent
Outcome
Review status
Linked Work Order
Linked Service Visit
```

Filters:

```text
Outcome
Review status
Date
Has Work Order
Failed calls
```

### Call detail

Minimum sections:

1. call header and status;
2. recording control or provider link;
3. transcript;
4. structured intake values and confidence state;
5. Agent and Tool actions;
6. warnings and unresolved fields;
7. linked Contact, Site, Work Order, and Visit;
8. audit timeline;
9. operator review action.

The default UI must use business-readable labels and must not expose raw provider payloads as the primary experience.

## 15. Configuration

POC configuration can be file- or admin-backed, but must model:

```text
workspace
provider phone/resource mapping
Retell Agent ID
greeting/business name
operating hours
time zone
service categories
intake schema version
transfer target
recording disclosure
scheduling policy
```

Secrets remain in environment variables or the approved secret store.

## 16. Observability

Required structured metrics:

```text
calls_received_total
calls_completed_total
calls_failed_total
tool_invocations_total
tool_failures_total
command_success_total
command_failure_total
idempotent_replays_total
work_orders_created_total
visits_created_total
follow_ups_created_total
calls_needing_review_total
```

Required correlation keys:

```text
workspace_id
voice_call_id
provider_call_id
provider_event_id
command_id
idempotency_key
```

Logs must allow one call to be traced across provider event, Tool call, Command, audit, and resulting business record.

## 17. Testing

### Contract tests

- valid intake creates exactly one Work Order;
- retry returns prior result;
- conflicting idempotency input is rejected;
- missing required provider capability fails closed;
- scheduling conflict rolls back required atomic effects;
- unauthorized Integration Principal is rejected.

### Adapter tests

- signature validation;
- provider status mapping;
- event ordering;
- duplicated webhooks;
- malformed payloads;
- provider timeout and API error translation.

### Conversation scenario tests

- new customer;
- existing customer and known site;
- multiple possible sites;
- duplicate open Work Order candidate;
- missing address;
- customer changes an earlier answer;
- unavailable appointment slot;
- customer requests human;
- high-risk or unsupported issue;
- call disconnect before completion.

### End-to-end tests

A real test call must prove:

```text
phone call
→ Retell Tool calls
→ Runory Command
→ Work Order visible in UI
→ optional Visit visible in Planning/My Work
→ Call Detail linked to business records
```

## 18. Acceptance gates

The technical POC is accepted only when:

1. Provider requests authenticate and resolve one Workspace safely.
2. Retell can query permitted customer context without broad data exposure.
3. A confirmed intake creates one governed Work Order.
4. Replayed Tool requests create no duplicates.
5. Scheduling uses the authoritative Scheduling capability.
6. All business writes have audit attribution.
7. Failed or incomplete calls remain visible and actionable.
8. Call Detail presents transcript, structured intake, actions, and linked records.
9. Existing FSM UI and Commands remain the normal operational surface after intake.
10. The implementation does not require provider-specific changes to core FSM object ownership.

## 19. Deferred architecture

Deferred until after POC validation:

- generalized `runory.conversation` Module;
- independent messaging Module;
- multiple telephony providers;
- multiple voice-agent providers;
- direct SMS conversation state;
- outbound campaigns;
- conversation analytics and automated quality evaluation;
- provider configuration marketplace;
- native Runory realtime voice runtime;
- Dialogflow CX execution adapter;
- Twilio ConversationRelay execution adapter.

## 20. Related documents

- [Voice Intake Product Definition](voice-intake-product-definition.md)
- [Voice Intake POC Execution Plan](voice-intake-poc-execution-plan.md)
- [Architecture Overview](../architecture/overview.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
- [Module Architecture](../architecture/module-architecture.md)
- [FSM Canonical Execution Product Architecture](fsm-canonical-execution-product-architecture.md)
- [v0.5 Commercial FSM Technical Spec](v0.5-commercial-fsm-technical-spec.md)
- [v0.5.1 Local Commercial Acceptance Checklist](v0.5.1-local-commercial-acceptance-checklist.md)
