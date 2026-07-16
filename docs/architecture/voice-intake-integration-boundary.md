# Voice Intake Integration Boundary

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `architecture` |
| Applies to | `post-v0.5 POC` |
| Owner | Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | — |
| Superseded by | — |

This document specializes, but does not replace, the canonical [Architecture Overview](overview.md) and [Contract-driven Command Architecture](contract-driven-command-architecture.md).

> **v0.5 scope decision (2026-07-16):** Retell Test Audio is sufficient for the current Voice Intake acceptance; Twilio/PSTN and generalized messaging execution are deferred. See [Voice Intake v0.5 Scope Decision](../product/voice-intake-v0.5-scope-decision.md). The provider-neutral boundary in this document remains the long-term architectural direction, not a mandate to build its deferred adapters now.

## Boundary

External conversation channels follow the same governed entry boundary as Cloud UI, mobile, MCP, Workflow, Automation, and Skills:

```text
Phone / SMS / future conversation channel
→ Telephony or Messaging Provider
→ Voice or Conversation Agent Provider
→ Runory Integration Adapter
→ named Command or governed query
→ Business Engine
→ authoritative business state + Domain Event + Audit + Outbox
```

Provider platforms execute communication transport and conversation runtime. They must not:

- become authoritative for Runory business records;
- directly operate the Runory database;
- call generic record-mutation APIs for governed actions;
- reproduce Work Order, Scheduling, Assignment, or other domain invariants;
- store provider-specific payload shapes as canonical FSM object definitions.

## Initial provider mapping

```text
Twilio
→ phone number, PSTN, inbound routing, optional SMS

Retell AI
→ realtime voice execution, turn taking, transcription, Tool invocation, transfer

Runory
→ Workspace resolution, business context, intake validation, named Commands,
  authoritative FSM records, Scheduling, audit, review UI, and provider-neutral history
```

Twilio and Retell are adapters and may be replaced. The Runory-owned contracts are:

- canonical Call and Intake representations;
- Integration Principal and Workspace resolution;
- intake schema and confirmation policy;
- provider-safe Tool contracts;
- named business Commands;
- idempotency and audit behavior;
- provider-neutral outcomes and review state.

## Adapter category

The portable-runtime adapter list is extended conceptually to include:

```text
Telephony Adapter
Voice Agent Adapter
Messaging Adapter
```

The POC implements only:

```text
Telephony Adapter = Twilio
Voice Agent Adapter = Retell
```

A generalized multi-provider adapter framework is deferred until the primary phone-to-work-order path is validated.

## Runtime rule

For a customer conversation to change business state:

```text
Provider Tool request
→ authenticate provider
→ resolve Workspace and Integration Principal
→ validate normalized input
→ invoke named Command
→ commit authoritative state, events, audit, and Outbox
→ return stable result
```

The voice model may collect, clarify, summarize, and request execution. It cannot declare business success independently of the Command result.

## Related documents

- [Voice Intake Product Definition](../product/voice-intake-product-definition.md)
- [Voice Intake Technical Specification](../product/voice-intake-technical-spec.md)
- [Voice Intake POC Execution Plan](../product/voice-intake-poc-execution-plan.md)
- [Architecture Overview](overview.md)
- [Contract-driven Command Architecture](contract-driven-command-architecture.md)
- [Module Architecture](module-architecture.md)
