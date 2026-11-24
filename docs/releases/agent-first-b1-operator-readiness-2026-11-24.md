# Agent-first B1 — Owner Initialization and Runtime Readiness

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | B1.1 and B1.2 independent deployment, 2026-11-24 |
| Owner | Engineering / Operations |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Supports the [Agent-first engineering plan](../product/agent-first-engineering-execution-plan.md) and [bundled Catalog evidence](agent-first-b1-bundled-catalog-2026-11-24.md).

## Verified baseline

[4142f92 source](https://github.com/franksunye/runory/commit/4142f921bff3d57165c6f8261773b0652cf67415) / [Self-hosted Candidate workflow 45354935937](https://github.com/franksunye/runory/actions/runs/45354935937): **SUCCESS**. Build, bounded automatic Catalog initialization, authorized locked Pack installation without development seed, Compose operation, same-release cold recovery, second clean installation and candidate packaging passed. The candidate bundle [artifact 14901194921](https://github.com/franksunye/runory/actions/runs/45354935937/artifacts/14901194921) was produced; 377,163,547 bytes as reported by GitHub. This is a retained engineering fallback, not a public production release. Full Release Gate was not yet complete at the observation time.

## New increment — implementation pending exact-commit verification

- B1.1: the [operator delivery adapter](../../packages/platform-core/src/operator-otp.ts) is restricted to the explicit independent production profile and the configured single owner. It delivers the existing DB-backed OTP challenge through a private, one-claim ephemeral host mount; no HTTP code retrieval, debug identities, rate-limit bypass or new session scheme. Owner-only mode uses a host-authorized identity label, not external email verification. Existing custom-mail delivery remains available for normal multi-user login. [Owner terminal command](../../apps/cloud/scripts/self-host-owner-code.mts) and existing login UI provide the setup path. Unit and real container HTTP checks cover recipient denial, one-claim delivery, invalid-code and replay denial, login and isolated provider compatibility. Shared OTP verification now conditionally reserves an attempt and consumes a pending challenge exactly once; the concurrent replay regression test ensures only one session is created.
- B1.2: candidate HTTP readiness now checks actual source marker, writable attachment directory and verified bundled Catalog/Pack locks through the existing database and migration helpers. The independent scheduler has a recent execution receipt and health check; the operator helper exposes status and doctor. The fixture creates a real overdue workflow through existing authorized APIs, verifies a single emitted domain event after repeated scheduling, and checks it across recreation and recovery. The second fresh installation uses the operator-only mode and the actual scheduler service.
- No general Outbox delivery worker, external provider delivery, browser/TLS certification, multi-user provider setup, upgrade or public release is claimed. Retain the previous working candidate until the new increment passes the exact candidate and release gates. B1.3 compatible upgrade/rollback and B1.4 independent Agent installation and supported distribution remain open.

No production records, provider enrollment, external message sends or deployment are authorized by this isolated verification.
