# Thin FSM and Agent Runtime Architecture

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `agent-runtime` |
| Applies to | `v0.6+` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-14 |
| Supports | [Product Roadmap](../product/product-roadmap.md), [Agent Operations](../agent-operations.md), [Contract-driven Command Architecture](./contract-driven-command-architecture.md) |
| Supersedes | — |
| Superseded by | — |

## 1. Product Thesis

Runory should not reproduce every advanced feature, rule builder, dashboard, and automation surface found in a traditional FSM suite.

```text
Thin, deterministic FSM Core
+ essential visual interfaces
+ scheduled and event-driven Agents
= advanced FSM operating capability
```

The FSM Core remains the authoritative system of record. Agents provide interpretation, monitoring, recommendation, coordination, and governed execution over that Core.

## 2. Three-layer Product Model

### Thin FSM Core

Runory must own deterministic business objects, lifecycle rules, Commands, permissions, idempotency, audit, scheduling truth, commercial calculations, payments, and integration records. Agents never write directly to the database and never become the source of truth.

### Essential UI

Runory retains interfaces where humans need fast visual control: Work lists and details, calendar and dispatch, customer/site/asset detail, commercial documents, mobile field execution, configuration, approvals, and audit.

### Agent Operations Layer

Approved Agents may provide scheduled monitoring, SLA checks, follow-up, exception detection, management summaries, ad hoc analysis, dispatch recommendations, communication orchestration, data-quality inspection, bulk preparation, and implementation assistance.

## 3. Agent-first Replacement Boundary

The following areas should default to Agent-first delivery unless customer evidence proves a dedicated UI is necessary:

| Traditional capability | Runory approach |
| --- | --- |
| SLA monitoring center | Scheduled Agent queries plus actionable tasks |
| Follow-up sequences | Agent policy plus message/task Commands |
| Large report catalog | Governed metrics and Agent-generated analysis |
| Manager cockpit | Saved views plus scheduled operating brief |
| Exception dashboards | Agent inspection plus durable exception tasks |
| Smart dispatch | Agent recommendation over deterministic schedule queries |
| Reminder automation | Agent policy over communication Commands |
| Data-quality center | Scheduled Agent checks and correction proposals |
| Complex workflow builder | Small trigger layer plus Agent policy and Commands |
| Implementation administration | Agent-guided Workspace Extensions |

Agents may assist but must not replace authoritative records, state invariants, pricing and payment calculations, permissions, schedule-conflict enforcement, inventory ledgers, audit, or field evidence.

## 4. Runtime Trigger Model

Runory must not depend on directly opening a particular desktop Agent application. Business events create durable Agent Tasks that can be claimed by any approved Agent Runner.

```text
Runory Event or Schedule
        ↓
Agent Task Inbox
        ↓
Registered Agent Runner
        ↓
Codex, Claude, ChatGPT, or another approved Agent
        ↓
Runory MCP Tools / APIs
        ↓
Permission + Validation + Command + Audit
```

Codex, Claude, and ChatGPT are replaceable Agent environments. Runory owns task durability, authorization, validation, and results.

## 5. Agent Task Inbox

A task contains at minimum:

```json
{
  "taskType": "dispatch_work_order",
  "workspaceId": "ws_123",
  "objectType": "work_order",
  "objectId": "wo_456",
  "priority": "normal",
  "requiredCapability": "fsm.dispatch",
  "status": "pending",
  "deduplicationKey": "dispatch:wo_456:v1"
}
```

The Inbox owns durable storage, deduplication, priority, availability time, task leasing, retry, timeout, human takeover, result recording, and audit linkage.

## 6. Agent Runner

An Agent Runner claims tasks and invokes an approved Agent. Supported modes may include:

1. Desktop Runner associated with a personal Agent application.
2. Local Runner on the customer's server or Local Runory deployment.
3. Managed Cloud Runner enabled by the customer.

The Runner initiates outbound connectivity through WebSocket, Server-Sent Events, long polling, or periodic polling. Runory should not require inbound public access to a user's computer.

Runner registration records identity, Workspace authorization, supported capabilities, provider type, heartbeat, concurrency, cost limits, allowed risk levels, and secret references.

## 7. Execution Contract

Runtime Agent Tasks follow:

```text
claim → inspect → reason → propose → validate → confirm where required
→ execute Command → verify → record result → release task
```

Workspace customization continues to follow:

```text
discover → plan → validate → preview → apply → verify → audit → rollback
```

Both task families share permission, audit, risk classification, and Command boundaries.

## 8. Automation Levels

- **Level 1 — Recommend:** Agent proposes; a human approves.
- **Level 2 — Policy-constrained execution:** Agent executes only when deterministic policy conditions pass.
- **Level 3 — Autonomous routine operations:** Agent handles approved routine work and escalates exceptions.

High-risk payment, refund, deletion, permission, and material commercial actions always require explicit policy and confirmation.

## 9. Work Order Dispatch Example

```text
1. A Work Order is created.
2. Runory publishes work_order.created.
3. Workspace policy enables dispatch assistance.
4. Runory creates dispatch_work_order.
5. An authorized Runner claims it.
6. The Agent reads customer timing, technician skills, territory, capacity, and schedule.
7. The Agent proposes assignments with reasons.
8. Runory validates permissions, conflicts, and scheduling invariants.
9. Policy permits execution or requests dispatcher confirmation.
10. Runory executes the authoritative scheduling Command.
11. Agent Task, Agent Run, Command, and audit records are linked.
```

## 10. Availability and Fallback

A personal desktop Agent may be offline, asleep, unauthenticated, or waiting for approval. Production FSM operations require fallback:

```text
preferred Desktop Runner
→ Local Runner after lease timeout
→ managed Cloud Runner when enabled
→ human operations queue
```

Runory must never silently lose a task because a specific desktop application is unavailable.

## 11. Initial FSM Task Families

```text
dispatch_work_order
follow_up_quote
review_overdue_payment
check_visit_completion
inspect_schedule_conflict
prepare_daily_operations_brief
review_record_data_quality
```

Each task family requires bounded inputs, approved read tools and Commands, deterministic validation, risk policy, idempotency, success criteria, and evaluation scenarios.

## 12. Minimal POC

The first POC validates one journey:

> A Work Order is created, Runory creates an Agent Task, a Runner claims it, the Agent generates a scheduling recommendation through MCP, a user confirms it, and Runory executes the scheduling Command.

Acceptance requires no direct database mutation, no duplicate assignment on retry, permission and conflict enforcement, visible recommendation reasoning, linked task/run/Command/audit records, and offline-runner fallback.

## 13. Product Implication

Runory's differentiation is not having more fixed features than established FSM suites. It is providing fewer fixed surfaces, stronger deterministic business primitives, and Agents that dynamically perform monitoring, coordination, analysis, and governed action.
