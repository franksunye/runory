# Command Runtime Performance Baseline

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `architecture` |
| Applies to | `v0.5+` |
| Owner | Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | — |
| Superseded by | — |

## Purpose

Runory has established functional correctness for the governed Command architecture, but correctness testing is not performance validation. Passing 663 tests demonstrates behavioral coverage; it does not establish latency, throughput, concurrency, query efficiency, or production-scale operating limits.

This document defines the performance model, risk areas, initial budgets, measurement scenarios, and optimization order for the Command Runtime and its surrounding read models.

## Executive conclusion

The current abstraction introduces additional work compared with a direct database `UPDATE`, but it does not inherently create a severe or Module-count-dependent performance problem.

The primary risks are implementation-level:

- excessive serial database round trips;
- missing indexes, pagination, and query boundaries;
- unverified SQLite/libSQL concurrent-write behavior;
- application and database region mismatch;
- unbounded relation loading in Planning, My Work, Activity, and detail views.

The architecture should not be weakened by removing consistency, audit, idempotency, or event guarantees before measurement. Performance stabilization should preserve reliability and target avoidable query, transaction, and projection costs.

## Runtime cost of one Command

Compared with executing one direct `UPDATE`, a governed Command may perform:

1. Read the Workspace Command Contract.
2. Parse and resolve the Contract JSON.
3. Check the idempotency record.
4. Validate version, permissions, and current lifecycle state.
5. Read related Provider context.
6. Apply business writes atomically.
7. Write a Domain Event.
8. Write an Audit record.
9. Write a Command Execution record.
10. Write an Outbox record when asynchronous side effects are required.

This is database and application overhead, but much of it is required enterprise-system behavior rather than accidental abstraction cost:

- optimistic locking prevents lost updates;
- audit records support accountability and diagnosis;
- idempotency prevents duplicate jobs and repeated mutations;
- atomic transactions prevent partial lifecycle completion;
- Domain Events support Activity, automation, and downstream projections;
- Outbox delivery separates authoritative writes from non-authoritative side effects.

Removing these guarantees may reduce latency while making the system operationally unreliable. They are therefore part of the performance budget, not default optimization targets.

## Primary performance risks

### 1. Repeated Contract lookup and parsing

Workspace Command Contracts are queried by `(workspace_id, command_key)`. The indexed lookup should be inexpensive, but repeatedly reading and parsing identical JSON for high-frequency Commands is unnecessary.

Recommended optimization:

```text
workspaceId + commandKey + sourceVersion
→ Resolved Command Plan
```

The cache should invalidate only when the relevant Module or Contract is installed, upgraded, repaired, rolled back, or otherwise changes source version.

This is a low-risk, high-value optimization because it preserves the Contract as the authority while avoiding repeated resolution work.

### 2. Serial Provider pre-queries

A Provider may independently read:

- Assignment;
- Schedule;
- Visit Execution;
- required Forms;
- Module Installation;
- lifecycle and permission context.

Each query may be individually inexpensive. With remote libSQL access, however, serial round trips accumulate network latency and can dominate execution time.

Preferred direction:

- read related execution context in one bounded operation;
- combine compatible queries;
- check Module requirements in batches;
- avoid re-reading the same entity during validation and execution;
- submit authoritative writes in one database transaction or batch.

Provider query shape is likely to matter more than Contract JSON parsing.

### 3. Write amplification and concurrent writes

One business action may produce:

```text
1 business-state update
+ 1 Domain Event
+ 1 Audit record
+ 1 Command Execution record
+ optional Provider writes
+ optional Outbox record
```

This is normally manageable in PostgreSQL. SQLite/libSQL has a more sensitive write-concurrency model, so the commercial baseline must measure:

- transaction duration;
- lock or busy events;
- p50, p95, and p99 latency;
- timeout and retry rate;
- failed or partially retried Commands;
- concurrent writes per Workspace;
- transaction statement count.

The expected SME operating range—tens of active users and normal field-service Command frequency—appears reasonable, but this remains a hypothesis until tested.

### 4. Read-model growth

The first production bottleneck may occur outside Command execution. Higher-risk read paths include:

- Planning queries across date ranges, Resources, Assignments, and Schedules;
- My Work aggregation from multiple sources;
- Activity timelines;
- Form submissions and revision history;
- reverse relations on detail pages;
- unbounded lists without cursor or page limits;
- repeated field and metadata enrichment.

These datasets grow faster than the Workspace Contract table. Performance work must therefore cover projections and user-facing queries, not only mutation latency.

### 5. Installation-time synchronization

Platform Service snapshots may currently be repaired or synchronized repeatedly during Module installation. This does not affect routine business Commands, but it increases installation write volume and duration.

The synchronization trigger should be narrowed as part of v0.6 stabilization so repair runs only when the relevant source state changes or explicit repair is requested.

### 6. Region and network topology

When the application runtime and libSQL database are deployed in different regions, every serial query pays network round-trip latency. A function-to-database region mismatch can outweigh all in-process optimization.

Performance evidence must always record:

- application region;
- primary database region;
- client test region;
- cold or warm execution state;
- network path and deployment environment.

Latency results without this context are not comparable.

## Abstractions with limited request-time cost

Manifest files are not expected to be fully loaded or traversed for each business operation. Routine requests should not:

- traverse all Module YAML files;
- reinstall Packs;
- revalidate the full Catalog;
- regenerate database tables dynamically;
- repair every Workspace snapshot.

Manifest-related cost primarily occurs during:

- process startup or build validation;
- installation;
- upgrade;
- publication validation;
- Workspace snapshot repair.

A growing number of Manifests is therefore primarily a governance and maintenance concern, not a reason for per-request latency to grow linearly with Module count.

## Initial performance budgets

These are internal starting budgets, not permanent SLAs. They must be measured in a production-like environment and adjusted only with recorded evidence.

| Operation | Initial budget | Additional constraints |
| --- | ---: | --- |
| Simple state Command | p95 ≤ 200 ms | Application and database in the same region |
| Complex cross-domain Command | p95 ≤ 500 ms | Includes validation, Provider context, and authoritative writes |
| Standard list first page | p95 ≤ 300 ms | Bounded page size and indexed filters |
| Planning week view | p95 ≤ 600 ms | Representative Resource and Assignment volume |
| My Work first page | p95 ≤ 400 ms | Per-user filtering and pagination enabled |
| Command failure rate | < 0.5% | Excludes deliberate validation rejection |
| Write-lock or busy retry rate | < 1% | Under the defined concurrency test |
| Data integrity | 100% | No silent loss, partial commit, or duplicate authoritative effect |

Latency should be reported at p50, p95, and p99. Average latency alone is insufficient.

## Required baseline scenarios

| Scenario | Required measurements |
| --- | --- |
| Simple state Command | p50/p95/p99, query count, transaction duration, statement count |
| Create Visit and assign Resource | Provider query count, batch count, total writes, lock wait |
| Submit and accept Form | validation time, evidence volume, revision writes, cross-domain writes |
| Complete Visit | Schedule/Execution/Form coordination latency and atomicity |
| Planning week and month views | row volume, query plan, database time, API time, render time |
| My Work | source merge cost, per-user filter cost, pagination behavior |
| 20 concurrent technicians | throughput, p95/p99, busy retries, failures, duplicate prevention |
| 50 concurrent technicians | saturation point, write queueing, timeout behavior |
| Large Activity history | pagination, index use, first-page and deep-page latency |
| Large Form revision history | storage growth, query plan, detail-load latency |
| High-latency cross-region deployment | round-trip amplification and serial-query sensitivity |

Each baseline run must record dataset size, concurrency model, deployment regions, database configuration, test duration, and cold/warm state.

## Instrumentation requirements

The Command Runtime should expose or log at least:

- `command_key` and Workspace identifier;
- total Command duration;
- validation duration;
- Provider preparation duration;
- authoritative transaction duration;
- query and statement count where practical;
- Domain Event, Audit, Command Execution, and Outbox write duration;
- retry count and retry reason;
- optimistic-lock conflicts;
- database busy or lock events;
- success, validation rejection, and infrastructure failure classification.

Sensitive payloads must not be included in performance telemetry by default.

For read models, capture database duration separately from serialization, network, and browser rendering time.

## Test dataset profiles

At minimum, performance tests should use three data profiles:

| Profile | Representative scale |
| --- | --- |
| Small Workspace | 10 users, 1,000 records, 100 open work items |
| Commercial SME | 50 users, 50,000 records, 2,000 open work items, 12 months of Activity |
| Growth boundary | 200 users, 500,000 records, 20,000 open work items, multi-year history |

The Growth Boundary profile is not a promise that one SQLite/libSQL topology must support every workload indefinitely. Its purpose is to identify the point at which projection, archival, replica, partitioning, or database-topology changes become necessary.

## Optimization order

When measurements show a problem, optimize in this order:

1. Add or correct indexes, pagination, filters, and query boundaries.
2. Co-locate application and database regions.
3. Cache the Workspace Resolved Command Plan.
4. Combine serial Provider reads and batch requirement checks.
5. Eliminate repeated reads of the same business context.
6. Shorten transactions and prohibit external network calls inside transactions.
7. Move non-authoritative side effects to Outbox processing.
8. Optimize My Work, Planning, Activity, and relation projections.
9. Add read replicas, precomputed projections, or alternative storage where evidence requires them.
10. Consider reducing audit, event, or consistency guarantees only as an explicit architecture decision—not as a routine optimization.

## Acceptance criteria for v0.6 stabilization

Performance stabilization is complete when:

- the required baseline scenarios have reproducible test scripts;
- results are recorded for a production-like same-region deployment;
- simple and complex Command budgets are met or formally revised with evidence;
- Planning and My Work use bounded queries and pagination;
- required indexes are documented and verified through query plans;
- concurrent-write behavior is measured at 20 and 50 active technicians;
- no test produces silent loss, duplicate authoritative effects, or partial commits;
- p95/p99 latency, retries, and lock events are observable;
- known performance exceptions are documented with owners and follow-up milestones.

## Relationship to the existing optimization plan

[Performance Optimization Plan](performance-optimization-plan.md) documents concrete production symptoms and deployment-level improvements such as region alignment, HTTP caching, auth-query reduction, and cold-start behavior.

This document has a different scope:

- this document defines the ongoing performance model and acceptance baseline for Command Runtime and read models;
- the existing optimization plan records a specific production investigation and phased remediation plan.

Neither document replaces the other.

## Related documents

- [Architecture Overview](overview.md)
- [Contract-driven Command Architecture](contract-driven-command-architecture.md)
- [Performance Optimization Plan](performance-optimization-plan.md)
- [v0.5 Commercial FSM Technical Spec](../product/v0.5-commercial-fsm-technical-spec.md)
- [Post-v0.5 Product Milestone Roadmap](../product/post-v0.5-product-milestone-roadmap.md)

## Decision

Runory should retain the governed Command architecture. Its additional work is a mostly fixed and measurable reliability cost, not a cost that should grow linearly with the number of installed Modules.

The immediate engineering priority is to establish the commercial baseline and then address serial Provider queries, read-model boundaries, region topology, indexes, and SQLite/libSQL write concurrency using measured evidence.
