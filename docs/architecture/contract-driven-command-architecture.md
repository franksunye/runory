# Contract-Driven Command Architecture

Status: Accepted architecture direction; manifest/runtime enforcement is incremental

Date: 2026-07-14

Owner: Runory Product and Engineering

Related specifications:

- [Architecture Overview](./overview.md)
- [Architecture Decision Record](./architecture-decision-record.md)
- [Module Architecture](./module-architecture.md)
- [v0.5 Commercial FSM Technical Specification](../product/v0.5-commercial-fsm-technical-spec.md)
- [v0.5.1 Commercial FSM Productization Technical Specification](../product/v0.5.1-commercial-fsm-productization-technical-spec.md)
- [v0.6 Command Architecture Stabilization TODO](./v0.6-command-architecture-stabilization-todo.md)

## 1. Decision

Runory uses a **Contract-Driven Command Architecture** for governed business
change:

```text
Command  = the only governed business-action entry point
Contract = the machine-readable definition of a complete command
Runtime  = the validator, transaction coordinator, and enforcement boundary
```

UI, HTTP APIs, mobile clients, Workflow, Automation, MCP, Skills, and agents
MUST invoke the same named Command when they intend the same governed business
change. None of those channels may reproduce the Command with generic record
updates or coordinated client-side writes.

A written specification alone is not a guarantee. A Contract becomes an
architecture guarantee only when the Catalog validates it, the Runtime enforces
it, and generated contract tests prove its postconditions.

## 2. Why This Is A Platform Contract

Runory composes independently versioned Modules into Packs that may be installed,
upgraded, and uninstalled. A business action can therefore span more than one
capability. For example, completing a Service Visit affects:

```text
Service Visit aggregate
+ Visit Execution runtime
+ Scheduling runtime
+ Domain Event
+ Audit
+ optional Outbox messages
```

Relying on a feature developer to remember every participant creates silent
partial transitions. The Module must declare the complete semantic outcome
before implementation, and the Pack installation must prove that every required
capability provider is present and compatible.

This contract is generic. It applies to FSM, Quote, CRM, Customer Service,
After-sales, future official Modules, and third-party Modules admitted to the
Catalog.

## 3. Authoritative Ownership

Every mutable business fact has exactly one authoritative owner.

| Concern | Authoritative owner | Examples of non-authoritative consumers |
| --- | --- | --- |
| Business lifecycle | Domain aggregate through named Commands | Workflow stage, UI badge, dashboard |
| Resource reservation | Schedule Entry through Scheduling Commands/providers | Calendar, timeline, map |
| Current responsibility | Assignment through Assignment Commands/providers | record assignee label, My Work |
| Human obligation | Work Item | queues and notification badges |
| Form response | versioned Form Submission | service report rendering |
| Process orchestration | Workflow instance | record lifecycle projection |

A projection may mirror an authoritative fact for presentation, but it must be
read-only, identify its source, and be rebuildable. A projection cannot become a
second editable owner.

## 4. Command Contract

A governed Command Contract declares at least:

```text
stable command key and contract version
owning versioned Contract source (business Module or Platform Service) and aggregate
input and result schemas
legal source and target states
permission and actor policy
expected-version and idempotency policy
required atomic capability effects
events and audit facts
external/outbox effects
postconditions
compensation policy when applicable
```

The Contract declares business semantics, not SQL, physical table names, or UI
implementation details.

Target Module Manifest shape:

```yaml
domain:
  aggregates:
    - key: service_visit
      stateField: status
      versionField: aggregate_version

  commands:
    - key: visit.complete
      contractVersion: 1
      aggregate: service_visit
      transition:
        from: [on_site]
        to: completed
      permission: visit.execute
      idempotent: true
      requiresExpectedVersion: true

      requiredEffects:
        - capability: visit_execution.complete
          scope: same_visit
          consistency: atomic
        - capability: scheduling.complete_reservation
          scope: linked_schedule
          consistency: atomic

      emits:
        - visit.completed

      postconditions:
        - service_visit.status == completed
        - service_visit.actual_end != null
        - visit_execution.status == completed
        - linked_schedule.status == completed
```

The concrete provider for `scheduling.complete_reservation` owns how the
Schedule Entry is found, versioned, and changed. The Service Visit Module does
not embed Scheduling SQL in its manifest.

## 5. Consistency Classes

Every effect must declare one consistency class.

### 5.1 Atomic business effects

Authoritative local business facts that must agree when the Command returns:

- aggregate state and version;
- Assignment, Schedule, Work Item, and execution state when required by the
  business action;
- required domain events and audit facts.

All atomic providers contribute statements to one Runtime-managed database
transaction. If any required provider is missing or any statement fails, none
of the Command persists.

### 5.2 Durable external effects

Email, webhook, ERP, payment, telephony, and other cross-boundary effects cannot
share the local database transaction. The Command writes an Outbox message in
the atomic transaction. Delivery is asynchronous, retried, observable, and
idempotent.

### 5.3 Rebuildable projections

Planning presentation, dashboards, search indexes, activity summaries, and
other read models may be produced synchronously or by durable event projection.
They must be idempotent and rebuildable from authoritative facts.

An independent business fact is not a projection merely because a UI displays
it. A Schedule Entry is an authoritative resource reservation; a calendar block
is its projection.

## 6. Runtime Execution

For every invocation, Command Runtime must:

1. resolve workspace, actor, installed Contract version, and capability
   providers;
2. validate input, permission, current aggregate version, and legal transition;
3. reject execution when a required atomic provider is missing or incompatible;
4. ask the aggregate handler and capability providers to prepare their atomic
   effects;
5. commit authoritative state, versions, domain events, audit, and Outbox rows
   in one transaction;
6. evaluate enforceable postconditions before reporting success;
7. return a stable result envelope with new versions, event IDs, warnings, and
   next available Commands;
8. return the prior result for a valid idempotent retry and reject reuse of the
   same idempotency key with different input.

The Runtime must fail closed:

```text
COMMAND_CONTRACT_INCOMPLETE
visit.complete requires scheduling.complete_reservation@^1
```

It must never silently omit a required effect because a Module, provider, table,
or handler is unavailable.

## 7. Module, Pack, And Catalog Responsibilities

### Module

A Module owns its aggregates, state machines, named Command Contracts, input and
result schemas, domain invariants, events, permissions, and provider
implementations for capabilities it supplies.

### Platform Runtime capability

Shared capabilities such as Scheduling, Assignment, Forms, Workflow, Automation,
Audit, and Outbox expose versioned semantic provider interfaces. They do not own
industry-specific transition policy.

### Pack

A Pack composes Modules and must have a complete capability closure. It does not
redefine Module invariants. A Pack lock records the exact Command Contract and
provider versions used by the release.

### Catalog and installer

Before publish, install, upgrade, or uninstall, Catalog validation must check:

- every Command aggregate, field, state, permission, event, and schema exists;
- every required effect resolves to exactly one compatible provider unless the
  Contract explicitly allows composition;
- every `atomic` provider supports the same transaction boundary;
- Workflow and Automation definitions reference available Commands and event
  schemas;
- provider or Command removal does not break an installed dependent Module;
- Contract changes have compatible versioning, migrations, and upgrade policy;
- generated contract tests and sandbox journeys pass.

An uninstall that would remove a required provider is blocked until dependents
are removed, upgraded, or rebound to a compatible replacement. Retained business
data remains readable through stable snapshots and migrations.

## 8. Workflow And Automation Relationship

Command is the business execution kernel. Workflow and Automation are
orchestration layers.

```text
Workflow / Automation decides when and in what order
                         ↓
Command decides whether the business action is legal and complete
                         ↓
Runtime guarantees its transaction, events, audit, and durable effects
```

Workflow may pause, wait for a person, branch, retry, or invoke a sequence of
Commands. It must not hold one database transaction across steps. Each step is
an independently atomic and idempotent Command; long-running recovery uses Saga
and explicit compensation Commands.

Automation may react to a versioned Domain Event and invoke a Command or enqueue
an external effect. It must not use generic field updates for governed fields.
Loop detection, causation/correlation IDs, idempotency keys, and retry policy are
required for event-triggered invocation.

The core business path must remain executable by Commands without requiring a
Workflow instance. Workflow adds approvals, cross-role obligations, timers,
returns, and advanced orchestration; it does not provide missing domain
integrity.

## 9. Contract-Generated Quality Gates

The SDK and Catalog should generate a standard test suite for each Command:

- every declared legal transition succeeds;
- every undeclared transition fails with a stable error;
- every required atomic effect satisfies its postcondition;
- aggregate and participant versions advance correctly;
- stale expected versions fail;
- idempotent retries do not duplicate state, events, audit, or Outbox rows;
- permission and assignment rules are enforced;
- transaction rollback leaves no partial effects;
- emitted events match their registered schemas;
- completed/cancelled authoritative facts disappear from active queues and
  conflict calculations;
- supported Workflow, Automation, UI, API, MCP, and mobile channels produce the
  same result when invoking the same Command.

Pack sandbox journeys test composition across Modules. Release gates must fail
when a Contract has no implementation, an implementation has no Contract, or a
declared postcondition is not proven.

## 10. Runtime Diagnostics And Reconciliation

Contract enforcement prevents new partial transitions. It does not eliminate
legacy data, failed historical releases, or prohibited manual database changes.
Runory therefore also provides:

- invariant diagnostics by workspace and Contract version;
- projection lag and Outbox health;
- repair migrations or explicit reconciliation Commands;
- audit evidence for every repair;
- no silent mutation by UI read paths.

Read-side effective-status logic is a defensive availability measure, not a
replacement for correcting authoritative data.

## 11. Versioning And Compatibility

Command keys are stable public business APIs. A Contract change is classified as:

| Change | Compatibility expectation |
| --- | --- |
| Add optional input/result field | compatible minor change |
| Add event metadata with preserved schema | compatible minor change |
| Add required atomic effect or postcondition | Contract version change plus provider/install preflight |
| Remove state, transition, event, or provider | breaking change with migration |
| Change authoritative owner | architecture migration with explicit ADR |

Running Workflow instances pin immutable Workflow definitions and compatible
Command Contract ranges. Pack release locks make the resolved composition
reproducible.

## 12. Adoption Plan

The architecture decision is effective immediately. Enforcement is delivered
incrementally:

1. add typed Aggregate, Command, effect, event, and postcondition schemas to the
   Module Manifest contract;
2. register current Quote and FSM Commands and shared capability providers;
3. add Catalog capability-closure and Workflow/Automation reference validation;
4. make Command Runtime resolve providers and fail closed;
5. generate contract tests and Pack sandbox journeys;
6. add invariant diagnostics and historical reconciliation tooling;
7. require these gates for Stable Catalog promotion.

Initial enforcement slice implemented on 2026-07-14:

- typed Aggregate, Command operation (`create` / `transition` / `action`),
  required-effect, consistency, cardinality,
  capability-provider, event, and postcondition declarations in Module Manifest;
- runtime Contract and Provider registries with SemVer capability resolution;
- fail-closed checks for missing providers, expected versions, audit facts, and
  required Domain Events;
- Catalog and direct-installer validation of Module structure and capability
  closure;
- `visit.complete` and `work_order.complete` contracts backed by the
  `scheduling.complete_reservation@1.0.0` atomic provider;
- Contract/manifest alignment, missing-provider, missing-event,
  missing-required-Schedule, and full FSM journey tests.

Workspace-scoped resolution slice implemented next:

- workspace provisioning snapshots Platform Service Contracts, while Module
  installation snapshots Module Contracts. Both persist the exact validated
  source kind, source ID, source version, and Contract JSON into
  `workspace_command_contracts`;
- runtime resolves the workspace snapshot before the two legacy static bridge
  contracts;
- repeated installation repairs missing snapshots idempotently and uninstall
  removes contracts owned by the removed Module;
- `visit.start_travel`, `visit.arrive`, `visit.submit_work`, and `visit.cancel`
  are resolved from the installed Service Visit manifest;
- Visit execution activation/cancellation and Schedule cancellation are
  cardinality-checked atomic Providers, not SQL embedded in the Visit handler.
- Work Order triage, create-Visit, block/unblock, start, complete, cancel, and
  reopen are manifest-resolved. Create-Visit passes validated dispatch data
  through explicit `effectInputs` to an atomic Provider that creates the Visit,
  Assignment, Schedule, execution item, and required-form snapshots.
  Cancellation delegates Assignment release, Schedule cancellation, and
  child-Visit cancellation to atomic Providers.
- All Quote Commands are manifest-resolved. Creation is represented as an
  explicit `create` operation without a fictitious source state. Calculation,
  revision copying, approval-process startup, and Work Order conversion are
  atomic Providers rather than pre-transaction writes. Optional composition
  Commands declare `requiresModules`; Quote-to-Work-Order therefore fails
  closed unless a compatible Work Order Module is installed.
- The workspace now pins 26 Module-owned Command Contracts: all Service Visit,
  Work Order, and Quote Commands in the v0.5 commercial path.
- Workflow and Forms are first-class Platform Service Contract sources rather
  than synthetic Modules. Their 11 Commands use the same workspace snapshot,
  validation, Runtime enforcement, audit, and Domain Event path. Form
  acceptance declares optional atomic providers for service-report projection
  and linked Work Item completion.
- A fully composed workspace therefore pins 37 governed Commands: 26 owned by
  business Modules and 11 owned by Platform Services.

Remaining adoption work includes persistence of resolved provider versions,
general executable postcondition adapters, Workflow/Automation editor
integration, uninstall impact analysis, and invariant diagnostics.

Until the manifest-driven Runtime is complete, existing named handlers remain
the execution path and must carry explicit atomic consistency tests. No new
governed lifecycle may be added without a written transition/effect contract.

## 13. Non-Negotiable Rules

```text
No governed field transition through generic CRUD.
No UI, Workflow, Automation, MCP, Skill, or agent-coordinated parallel writes.
No required business effect implemented only as a read-side projection.
No external call inside a local atomic transaction; use Outbox.
No active Command when a required capability provider is missing.
No Pack release without generated Contract and composition tests.
No breaking Contract or provider removal without migration and compatibility review.
```
