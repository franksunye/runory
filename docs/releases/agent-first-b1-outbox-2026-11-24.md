# Agent-first B1 — Bounded Independent Outbox Execution

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | B1.2 independent operations, 2026-11-24 |
| Owner | Engineering / Operations |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Supports the [Agent-first engineering plan](../product/agent-first-engineering-execution-plan.md) and [owner initialization/readiness evidence](agent-first-b1-operator-readiness-2026-11-24.md).

## Verified prior candidate

[7c7f37d source](https://github.com/franksunye/runory/commit/7c7f37d6eab900455abcaf935e92f4befb37e4a7) / [Self-hosted Candidate 45357669254](https://github.com/franksunye/runory/actions/runs/45357669254): **SUCCESS**. Operator OTP, provider fixture, real overdue workflow event and duplicate-free repeat, readiness and scheduler health, two clean installations, same-release restoration and candidate packaging passed. [Candidate artifact 14902963394](https://github.com/franksunye/runory/actions/runs/45357669254/artifacts/14902963394) is the verified short-lived fallback. Full Release Gate was still running when inspected.

## New increment — requires fresh exact-commit verification

- [Outbox](../../packages/platform-core/src/outbox.ts): exact workspace/ID lookup, due selection including expired claims, queue counts, conditional completion/failure tied to the acquired lock. A stale email worker cannot settle a later claim; unrelated consumers keep their existing execution paths.
- [Email adapter](../../apps/cloud/src/integrations/email/resend-outbox.ts): type and tenant-scoped delivery/recipient validation, bounded provider request and stable idempotency key, safe error codes, explicit acknowledgement, atomic queue and communication projection writeback through the existing transaction helper.
- [Independent worker](../../apps/cloud/src/lib/self-host-outbox.ts): bounded batch, explicit owner opt-in and provider configuration, no automatic financial actions. Report outstanding and aged work for review; never manufacture delivery. The conservative 23-hour automatic replay horizon is not an external exactly-once guarantee.
- [Scheduler route](../../apps/cloud/src/app/api/platform/cron/outbox/route.ts): independent production profile only, authenticated by the cron secret. Scheduler receipt includes safe aggregate queue counts.
- Tests cover stale-worker fencing, due selection, persisted confirmation intent, disabled/aged/other queue boundaries, authentication, provider failure/backoff, stable key and atomic writeback via mocked transport. Candidate CI checks the protected scheduler route with external delivery disabled.

No new provider, queue database or production schedule. Real outbound delivery remains separate acceptance. Automatic payment, push and other message types are not certified by this increment. B1.3 explicit compatible upgrade/rollback, browser/TLS and independent Agent installation/official distribution remain open.
