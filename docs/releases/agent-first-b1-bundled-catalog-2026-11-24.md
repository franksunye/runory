# Agent-first B1 — Verified Candidate and Bundled Catalog Initialization

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | B1 independent deployment, 2026-11-24 |
| Owner | Engineering / Operations |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Supports the [Agent-first engineering plan](../product/agent-first-engineering-execution-plan.md) and [prior recovery evidence](agent-first-b1-compose-recovery-2026-11-24.md).

## Verified engineering baseline

[0c2c157 source](https://github.com/franksunye/runory/commit/0c2c1577c47e3fb696339a17a6994eefca366931) / [Self-hosted Candidate workflow 45354168206](https://github.com/franksunye/runory/actions/runs/45354168206): **SUCCESS**. The actual Compose installation, production OTP, scoped record and Quote Command, attachment verification, scheduler invocation, container recreation, cold snapshot, restoration into a separate data volume, and a second clean installation stage completed successfully. Startup/snapshot unit tests and the image build passed. The tested source-free engineering bundle was uploaded as [artifact 14901817023](https://github.com/franksunye/runory/actions/runs/45354168206/artifacts/14901817023) (376,248,516 bytes as reported by GitHub); it is short-lived, not a public stable release.

This preserves a verified fallback engineering candidate; the test-only seed was still part of its initialization. No live provider, independent Agent, upgrade or production acceptance claim is made.

## New increment — implementation pending verification

- [Offline catalog builder](../../apps/cloud/scripts/build-self-host-catalog.mts) selects the existing FSM/Sales Quote Packs and their exact Module dependency closure, uses the existing Catalog validator/freeze/release/lock services against a separate fresh local database, verifies the source and locks, and rejects any preexisting identity, credentials, Workspace or installation in the template. The synthetic build actor is build-only, not an HTTP login or a Cloud release manager.
- [Volume initializer](../../deploy/self-host/initialize.mjs) verifies the bundled template checksum and release identity; initializes only a new empty volume, and never replaces or silently upgrades existing business data. Unit tests cover restart preservation, tamper, mismatch, partial volume and link rejection.
- [Bundled Pack contract](../../apps/cloud/src/lib/self-host-catalog.ts) checks exact active source versions and resolved lock entries before calling the existing authorized installer. Independent candidates reject development seed and out-of-scope Pack installs. Cloud paths preserve their existing behavior.
- The revised CI fixture requires the two released local Pack entries before any installation, with no developer seed request. Candidate package contains a non-sensitive machine-readable catalog and lock inventory. All previous recovery and authorization assertions remain binding.

New source changes do not inherit the previous candidate's PASS. See the exact subsequent workflow result before publishing any artifact. Remaining: normal non-fixture mail and browser/TLS acceptance, verified job firing/outbox recovery, explicit compatible-version upgrade, independent Agent install/operation, final release authorization. Neither candidate is a supported production distribution or Cloud GA.
