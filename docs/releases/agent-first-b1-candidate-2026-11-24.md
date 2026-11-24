# Agent-first B1 — First Container Build and Verification Follow-up

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | B1 first candidate, 2026-11-24 |
| Owner | Engineering / Operations |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Supports the [Agent-first execution plan](../product/agent-first-engineering-execution-plan.md) and [B0 baseline](agent-first-b0-baseline-2026-11-24.md). This record is not a release announcement.

## Observed result

[Candidate source 33bc595](https://github.com/franksunye/runory/commit/33bc595c32789e3acf8c4545a9a4da5321af77c1) and [isolated candidate job](https://github.com/franksunye/runory/actions/runs/45344509024/job/138275740818):

- Docker build including production Next.js build: PASS.
- Production HTTP startup and exact source SHA check: PASS.
- Anonymous workspace/catalog/cron rejection: PASS.
- OTP / owner workspace verification stage: FAIL. The first failure report did not distinguish the cookie and workspace assertions. Source comparison shows a definite fixture mismatch: [listUserWorkspaces](../../packages/platform-core/src/tenancy.ts) returns workspaceId, while the fixture expected id. This establishes a test defect, not proof that the remaining authentication and application behavior passed.
- Later candidate installation, business and recovery stages were NOT_RUN.

At the observation time, documentation governance, production dependency audit, contracts, Cloud, MCP, SDK and four Core test shards plus production build checks on that SHA had succeeded. Desktop/mobile G1/G2 recovery jobs were not yet complete; consult the exact [Release Gate run](https://github.com/franksunye/runory/actions/runs/45344509032).

## Follow-up increment

The [candidate fixture](../../deploy/self-host/verify-candidate.mjs) now consumes the actual owner workspace contract, preserves production OTP/cookie checks, emits bounded safe assertion labels, and verifies a named Quote draft via scoped key, identical retry, local attachment content and authorization. The workflow replaces the application container with a new one on the original data volume and verifies the same synthetic IDs and bytes. The [preflight](../../deploy/self-host/preflight.mjs) validates the intentionally narrow independent runtime profile before server startup; unit tests cover rejected configurations.

These are implemented test and startup-path changes; new runtime evidence is pending until the next candidate run. No real customer data, live payment/voice resources, or production environment changes are involved.

## Remaining

B1 remains open: independent release artifact, explicit owner-controlled identity/mail setup, verified catalog import with released locks rather than the authenticated development seed convenience, meaningful readiness, actual timer and outbox outcomes, complete data/file backup/restore, and deployment/upgrade acceptance remain required. The first B2 command audit also identified that Command Runtime's idempotency lookup currently checks input hash under a workspace-wide command ID; inspect command, actor, and target binding before extending the external mutation tool surface. Do not treat this source observation as a confirmed exploit or modify approval/permission behavior to make an Agent test pass.
