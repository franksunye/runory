# Agent-first B0 — Source Baseline and First Candidate Boundary

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | 2026-11-24 source inspection; B0 / B1 entry |
| Owner | Product / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Validates the source-inventory portion of [AF-01](../product/agent-first-engineering-execution-plan.md). Reviewed source: [75a5022bfd5c2d1a3f32a0adfecb6841bae98442](https://github.com/franksunye/runory/tree/75a5022bfd5c2d1a3f32a0adfecb6841bae98442). Not a new production release or a complete B0 acceptance.

## 1. Confirmed source dependencies

| Area | Source evidence | Disposition |
| --- | --- | --- |
| Packaging | Cloud package builds production Next.js, copies schema/catalog resources via [sync-resources](../../apps/cloud/scripts/sync-resources.mjs), uses pinned pnpm/Node in CI | Single Linux amd64 container candidate; use same app and bundled resources, no second runtime. Root had no independent installer/image in the reviewed source. |
| Local persistence | [db.ts](../../packages/platform-core/src/db.ts) reads LIBSQL_URL or local file; [attachment storage](../../apps/cloud/src/lib/attachment-storage.ts) supports local root | Set explicit persistent volume paths. Test restart first; full file+DB recovery later. |
| Login | [auth](../../packages/platform-core/src/auth.ts) uses real OTP in production, existing dev code is deliberately blocked; admin emails configurable | Use existing secure identity in isolated test with separate synthetic mail provider. Production-compatible local owner/member delivery still needs acceptance. No debug bypass. |
| Entitlement | [entitlements](../../packages/platform-core/src/entitlements.ts) and first-login onboarding create local early_access quotas | Existing local record avoids mandatory subscription for bounded candidate; final self-host entitlement policy remains open. |
| Catalog | [pack listing](../../apps/cloud/src/app/api/workspaces/[id]/packs/route.ts) auto-seeds only under dev bootstrap; [authenticated seed](../../apps/cloud/src/app/api/platform/catalog/seed/route.ts) requires platform admin | Fresh production DB does not automatically expose all Packs. Isolated test may use real authorized admin seed; release artifact import must be separately implemented and validated. |
| Scheduler | [cron route](../../apps/cloud/src/app/api/platform/cron/workflow-timers/route.ts) has authenticated GET/POST; [coordinator](../../packages/platform-core/src/cron-coordinator.ts) has lease and dedupe | Add a minimal self-host scheduler adapter invoking same handler. Verify invocation, then actual due timers and outbox recovery. |
| Business interface | [command route](../../apps/cloud/src/app/api/workspaces/[id]/commands/[commandType]/route.ts) has existing named Quote/FSM/Forms/Invoice commands; [MCP](../../apps/mcp/src/server.ts) has 21 tools without named business invocation | Reuse HTTP/Command contracts, no new lifecycle or raw CRUD bypass. |
| Release | [release-backup gate](../../apps/cloud/scripts/release-backup-gate.ts) runs when explicitly enabled for Vercel production | Independent image build has only isolated temporary DB; do not disable Cloud backup or upgrade safety. |

## 2. Reference role-task inventory

Source-level classification: existing interfaces are **implemented in source / not independently verified in the self-hosted profile** unless noted. Reuse existing role-group policies and G1/G2 fixtures; complete per-command input, permission, idempotency and negative-test inventory under AF-04.

| Role | Existing module and action families | Missing independent evidence |
| --- | --- | --- |
| Owner | FSM/Sales Quote Packs, membership, API key, managed extension preview/apply | Clean production identity, install, scoped key, custom form/approval |
| Sales / manager | Company/Contact, Product Service/Price Book, Quote; quote.create_draft, quote.add_line, quote.submit_for_approval, quote.approve, quote.accept, quote.convert_to_work_order | Authenticated Agent execution, human approval and readback |
| Dispatcher | Work Order, Visit, Technician, Assignment, Schedule; work_order.triage, work_order.create_visit, assignment and schedule actions | Agent scope, role denial, conflicts/reassignment |
| Technician | Visit, Forms, evidence, service report; visit.start_travel, visit.arrive, form_submission.submit, visit.submit_work, visit.complete | Actual assignment and required human task restrictions; desktop/mobile parity |
| Supervisor / finance | Work Order completion, form return/accept, invoice.issue_from_work_order, payment visibility | Review/rework, invoice totals, scoped customer access; provider tests separate |

## 3. Verification and constraints

At inspection, the baseline commit's documentation, dependency audit, contracts/SDK/MCP/Cloud unit tests, core test shards and production build checks reported success; both G1/G2 recovery jobs were still running. These are the check states observed at that moment, not the final aggregate Release Gate or proof of a candidate install.

The current assistant container had Node.js 22, no pnpm or Docker executable, and could not resolve github.com for a direct clone. GitHub source access was available. A genuine independent unseeded Agent session is not available in this already Runory-seeded conversation. Record that discovery baseline as **BLOCKED**, not PASS or a fabricated search result. The first supported-host test has not run here.

B1 implementation is admitted as a bounded candidate increment: [container packaging](../../deploy/self-host/README.md), authenticated workflow-timer adapter and isolated [candidate CI](../../.github/workflows/self-hosted-candidate.yml). The new workflow must report its own actual result; do not infer it from earlier CI. This increment does not complete B1: remaining release artifact import, secure local enrollment/provider policy, readiness beyond liveness, Compose runtime, file persistence, recovery/upgrade and actual timer/outbox outcomes require further work.

B0 status: source inventory advanced, candidate profile selected for engineering verification, neutral Agent benchmark and detailed per-action matrix remain open. B2–B4 remain pending.
