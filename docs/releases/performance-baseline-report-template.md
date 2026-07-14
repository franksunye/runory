# Performance Baseline Report Template

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | Release or benchmark date |
| Owner | Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | — |
| Superseded by | — |

> Use this template for reproducible performance evidence. Replace all placeholder values before accepting the report.

## Benchmark identity

| Field | Value |
| --- | --- |
| Release / commit | |
| Benchmark date | |
| Application region | |
| Database region | |
| Database mode | local SQLite / remote libSQL |
| Runtime | |
| Dataset profile | |
| Concurrency profile | |
| Test duration | |

## Results

| Scenario | p50 | p95 | p99 | Error rate | Queries / request | Transaction duration | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Simple state Command | | | | | | | |
| Complex cross-domain Command | | | | | | | |
| Create Visit and assign work | | | | | | | |
| Submit and accept Form | | | | | | | |
| Complete Visit | | | | | | | |
| Planning week view | | | | | | | |
| My Work | | | | | | | |
| Activity first page | | | | | | | |

## Concurrency

| Scenario | Users | Writes / second | Busy or lock waits | Retries | Failures | Lost updates | Partial commits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Technician workload | 20 | | | | | 0 | 0 |
| Technician workload | 50 | | | | | 0 | 0 |

## Query-plan findings

Record missing indexes, scans, unbounded queries, and material serial round trips.

## Budget exceptions

Document every missed budget, its cause, user impact, owner, and approved remediation or exception.

## Decision

- [ ] Meets the active [Performance Baseline and Budget](../architecture/performance-baseline-and-budget.md).
- [ ] Approved with documented exceptions.
- [ ] Fails commercial performance acceptance.

## Related evidence

Link raw benchmark output, query plans, monitoring dashboards, and load-test scripts where available.