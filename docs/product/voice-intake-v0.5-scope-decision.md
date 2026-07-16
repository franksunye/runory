# Voice Intake v0.5 Scope Decision

| Metadata | Value |
| --- | --- |
| Status | `accepted` |
| Topic | `product / architecture` |
| Applies to | `v0.5` |
| Owner | Product / Engineering |
| Decided | 2026-07-16 |
| Supersedes | Voice Intake POC assumptions that require Twilio/PSTN for v0.5 acceptance |

## Decision

Runory v0.5 delivers a narrow, demonstrable **Voice Intake business loop**. It does not attempt to deliver a general customer-communications product.

The loop is complete when an inbound Retell conversation can create or match the relevant customer records, create a governed Work Order, retain a reviewable call record, and send a customer email confirmation where an email address is available.

Retell Test Audio is the accepted v0.5 voice execution and acceptance surface. A Twilio phone number is not required to accept v0.5, because it adds cost without proving a different Runory business outcome.

## v0.5 acceptance scope

The following are the required customer-visible outcomes:

1. Retell invokes a scoped Runory Voice Intake Tool after collecting and confirming the required facts.
2. Runory matches or creates the Contact and Service Site, then creates exactly one governed Work Order.
3. The Work Order and linked Voice Call show an attributable source and Activity/Audit trail.
4. The call transcript or summary is retained in a Runory conversation timeline linked to the business records.
5. If the caller has an email address, Runory creates and sends a Work Order confirmation email.
6. An operator can review the call, the communication timeline, and the email's current delivery state in Runory.

The v0.5 implementation owns a small, provider-neutral internal model:

```text
Conversation
  -> Notification (business intent)
  -> Message (immutable channel fact)
  -> MessageDelivery (per-recipient transport state)
```

This is an internal foundation and is intentionally not introduced as a standalone "communications module" or a new daily-work product area beyond the Voice Intake review experience.

## Explicitly deferred to v1.0 or later

- Twilio number procurement, PSTN routing, and SMS sending/receiving.
- Receiving-domain DNS, inbound Resend webhooks, automatic email-reply threading, and attachment ingestion.
- Multi-channel inboxes, conversation assignment, routing, collaboration, and customer-service queues.
- Campaigns, automated follow-ups, templates, and workflow-driven messaging.
- Delivery/engagement operations such as bounce remediation, suppression management, reporting, and quality analytics.
- Recording retention policy, redaction, consent automation, and broader data-governance controls.
- Multi-provider administration, a provider marketplace, and a generalized realtime communications runtime.

These are valid future products. Their data should attach to the model above rather than require a replacement, but they are not acceptance requirements for v0.5 and must not expand the current implementation without a new product decision.

## Engineering guardrails

- Keep Retell and Resend integration details in adapters; neither provider owns Runory business state.
- Use the existing named Voice Intake path, idempotency behavior, and audit trail for business mutations.
- Outbox is execution/diagnostic infrastructure. The customer-facing record is the Conversation timeline.
- Do not add provider SDKs, receiving webhooks, DNS setup, queueing, or new operational UI merely to anticipate deferred capabilities.
- A change belongs in v0.5 only if it makes one of the six acceptance outcomes above more reliable, understandable, or easier to verify.

## Acceptance evidence

v0.5 closure requires one production-safe Retell Test Audio acceptance run in the target Workspace, followed by verification in Runory that the created records, Activity, call content, confirmation Message, and Delivery are linked and understandable.

## Related documents

- [Voice Intake Product Definition](voice-intake-product-definition.md)
- [Voice Intake Technical Specification](voice-intake-technical-spec.md)
- [Voice Intake POC Execution Plan](voice-intake-poc-execution-plan.md)
- [Voice Intake Integration Boundary](../architecture/voice-intake-integration-boundary.md)
