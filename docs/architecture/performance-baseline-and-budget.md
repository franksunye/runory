# Performance Baseline and Budget

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `architecture` |
| Applies to | `v0.5+` |
| Owner | Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | — |
| Superseded by | — |

## Purpose

Runory's current command and platform abstractions add measurable runtime overhead, but they do not inherently imply severe performance problems. The primary risks are implementation-level: query count, missing indexes, unbounded read models, cross-region database access, and SQLite/libSQL write concurrency.

Correctness has been demonstrated through the current automated test suite. Correctness tests do not constitute performance validation. Performance must be measured independently before commercial readiness is claimed.

This document defines:

- the expected cost of the Command Runtime;
- the principal performance risks;
- the initial performance budget;
- the required benchmark scenarios;
- the optimization order;
- the v0.6 performance acceptance criteria.

## Architectural position

The Command Runtime introduces mostly fixed, controllable overhead. Its cost does not grow linearly with the number of installed Modules or Manifest files during normal business requests.

The architecture should not be weakened merely to reduce database operations. The following capabilities are reliability requirements, not optional abstraction overhead:

- optimistic concurrency control;
- idempotency;
- permission and lifecycle validation;
- atomic cross-entity updates;
- audit records;
- domain events;
- command execution records;
- durable outbox delivery where required.

Removing these mechanisms could reduce latency while also allowing duplicate work, overwritten updates, partial commits, or untraceable state changes.

## Command execution cost model

Compared with a direct single-row `UPDATE`, a governed Command may perform the following work:

1. Query the Workspace Command Contract.
2. Parse and resolve Contract configuration.
3. Check the idempotency record.
4. Validate expected version, permission, and current lifecycle state.
5. Load Provider-specific related context.
6. Execute authoritative business writes atomically.
7. Append a Domain Event.
8. Append an Audit record.
9. Persist Command Execution state.
10. Append an Outbox message when asynchronous delivery is required.

The exact number of statements depends on the Command and Provider. Benchmark reports must therefore record query count and transaction composition, not latency alone.

## Primary performance risks

### 1. Repeated Contract resolution

Workspace Command Contracts are queried by `(workspace_id, command_key)`. The indexed lookup should be inexpensive, but repeatedly loading and parsing unchanged Contract JSON is unnecessary for high-frequency Commands.

Recommended optimization:

```text
workspaceId + commandKey + sourceVersion
→ Resolved Command Plan
```

The cache must be invalidated on:

- Module or Pack installation;
- upgrade;
- rollback;
- repair;
- Contract replacement.

This is a low-risk, high-return optimization after a baseline confirms meaningful repeated cost.

### 2. Serial Provider pre-queries

A Provider may load Assignment, Schedule, Visit Execution, required Forms, Module installation state, and related records in sequence.

Individually these queries may be inexpensive. Across a remote libSQL connection, serial round trips can dominate end-to-end latency.

Preferred implementation:

- load related command context in one bounded operation;
- combine compatible queries;
- batch Module requirement checks;
- avoid repeatedly reading the same entity inside one Command;
- submit authoritative writes as one transaction or database batch.

Provider round-trip count is likely more important than Contract parsing cost.

### 3. Write amplification and SQLite/libSQL concurrency

A single business action may produce:

```text
1 authoritative business-state update
+ 1 Domain Event
+ 1 Audit record
+ 1 Command Execution record
+ Provider-specific writes
+ optional Outbox record
```

This is generally manageable for PostgreSQL. SQLite/libSQL has a more constrained write-concurrency model and must be validated under realistic contention.

Measure:

- transaction duration;
- database busy or write-lock waits;
- p50, p95, and p99 latency;
- retry count and retry success rate;
- failed or timed-out writes;
- concurrent writes per Workspace;
- partial-commit or lost-update incidents, which must remain zero.

The expected SME usage profile—tens of active users and ordinary work-order frequency—appears reasonable, but this remains an engineering hypothesis until load-tested.

### 4. Read-model growth

The first material bottleneck may appear in projections rather than Commands.

High-risk read paths include:

- Planning across date ranges, resources, assignments, and schedules;
- My Work aggregation across multiple sources;
- Activity timelines;
- Form submissions and revision history;
- detail-page reverse relationships;
- lists without pagination or explicit bounds.

These datasets can grow much faster than Command Contract tables. Read-model benchmarks must therefore be part of commercial performance evaluation.

### 5. Installation-time synchronization

Platform Service snapshots may currently be repaired or synchronized repeatedly during Module installation. This does not affect routine business requests, but it increases installation write volume and duration.

Synchronization timing should be narrowed as part of v0.6 stabilization.

### 6. Application/database region mismatch

Remote libSQL latency can multiply the cost of otherwise small queries. Application functions and the primary database should be deployed in the same or nearest practical region.

Benchmark results must record:

- application region;
- database region;
- network path;
- local versus remote database mode.

A cross-region test must not be compared directly with a co-located test without identifying the topology.

## Abstractions with negligible request-time cost

Manifest files are not expected to be fully loaded or validated for every business request.

Normal Command execution should not:

- traverse all Module YAML or JSON manifests;
- reinstall Packs;
- revalidate the entire Catalog;
- regenerate database tables;
- rebuild every Workspace snapshot.

Manifest-related cost occurs primarily during:

- process startup;
- installation;
- upgrade;
- release validation;
- Workspace snapshot repair.

A large Manifest set is primarily a governance and maintenance concern, not an inherent per-request performance problem.

## Initial performance budget

These values are internal starting budgets, not permanent public SLAs. They assume application and database are deployed in the same practical region and exclude large file upload time.

| Operation | Initial budget |
| --- | ---: |
| Simple state Command | p95 ≤ 200 ms |
| Complex cross-domain Command | p95 ≤ 500 ms |
| Standard list first page | p95 ≤ 300 ms server response |
| Standard detail aggregate | p95 ≤ 400 ms server response |
| Planning week view | p95 ≤ 700 ms server response |
| Command error rate under expected load | < 0.5% excluding intentional validation failures |
| Silent lost updates | 0 |
| Partial authoritative commits | 0 |
| Unbounded list or relationship query | 0 permitted |

The budget may be adjusted after the first reproducible baseline, but any adjustment must document deployment topology, dataset size, and business rationale.

## Required benchmark scenarios

| Scenario | Required observations |
| --- | --- |
| Simple state Command | p50/p95/p99, query count, transaction duration |
| Create Visit and assign work | Provider query count, batch statement count, write duration |
| Submit and accept Form | validation time, evidence count, cross-domain writes |
| Complete Visit | Schedule, Execution, Form, Event, Audit, and Outbox latency |
| Planning week and month views | dataset size, query plan, rows scanned, response and render time |
| My Work | per-user filtering, source aggregation, pagination behavior |
| 20 concurrent technicians | write wait, retry rate, failure rate, p95/p99 |
| 50 concurrent technicians | saturation point, database busy behavior, recovery |
| Large Activity history | pagination, index use, first-page and subsequent-page latency |
| Large Form revision history | revision count, evidence count, bounded loading |
| Installation and repair | statements written, duration, repeated synchronization |
| Cross-region topology | latency amplification per serial database round trip |

## Benchmark datasets

At minimum, tests should include:

- 1 Workspace with 20 users;
- 1 Workspace with 50 users;
- 10,000 work orders;
- 25,000 assignments and schedules;
- 50,000 Activity entries;
- 10,000 Form submissions with revision history;
- representative evidence metadata;
- realistic role and permission assignments.

Large binary photo uploads should be benchmarked separately from transactional metadata submission.

## Required instrumentation

Each benchmark run should capture:

- Command key and Provider;
- request correlation ID;
- application and database regions;
- total request latency;
- database query count;
- database execution and wait time;
- transaction duration;
- rows read and written where available;
- cache hit or miss for resolved Command plans;
- retries and failure category;
- Outbox enqueue time, excluding asynchronous delivery completion;
- dataset size and concurrency level.

Results should be stored as release evidence under `docs/releases/` and linked from this document.

## Optimization order

When a benchmark violates the budget, optimize in this order:

1. Add missing indexes, pagination, and query bounds.
2. Remove application/database region mismatch.
3. Cache Workspace Resolved Command Plans.
4. Combine serial Provider queries.
5. Avoid repeated reads of the same business context.
6. Shorten transactions and prohibit external network calls inside transactions.
7. Move non-authoritative side effects to the Outbox.
8. Optimize My Work, Planning, Activity, and detail projections.
9. Consider database or topology changes if measured SME concurrency exceeds SQLite/libSQL's practical write envelope.
10. Only after these steps, evaluate whether any audit or event data can be reduced without weakening correctness or compliance.

## Transaction rules

Performance optimization must preserve the following rules:

- authoritative state changes commit atomically;
- no external HTTP or third-party API call occurs inside a database transaction;
- Outbox delivery is asynchronous, but Outbox enqueue is part of the authoritative transaction when delivery is required;
- validation queries must be bounded;
- list and reverse-relationship reads must be paginated;
- retries must be safe through idempotency and optimistic concurrency control.

## v0.6 performance acceptance criteria

Performance stabilization is complete only when all of the following are true:

- benchmark scenarios are automated or reproducibly scripted;
- the benchmark topology and datasets are documented;
- simple and complex Commands meet the agreed p95 budget, or an approved exception is recorded;
- Planning, My Work, Activity, and detail projections have explicit pagination and query bounds;
- required indexes are validated through query-plan inspection;
- 20-user and 50-user concurrent write tests have recorded results;
- no silent lost update or partial authoritative commit is observed;
- retry and busy-lock behavior is measured and bounded;
- resolved Command Plan caching has either been implemented or rejected using benchmark evidence;
- Provider serial query hotspots have been identified and reduced where material;
- application/database region placement is documented;
- a performance evidence report is linked from this document and from the release index.

## Decision

Performance concerns do not justify replacing the Command architecture.

The current abstraction introduces controlled reliability costs. The more likely performance failures are excessive serial Provider queries, missing pagination and indexes, unvalidated SQLite/libSQL write contention, cross-region database access, and unbounded aggregate reads.

Runory should establish the v0.5 commercial baseline and make performance stabilization an explicit v0.6 acceptance gate.