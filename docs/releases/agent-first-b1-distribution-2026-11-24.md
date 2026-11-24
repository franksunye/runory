# Agent-first B1 — Artifact Consumer and Preview Distribution

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | B1.4, 2026-11-24 |
| Owner | Product / Engineering / Operations |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Supports the [execution plan](../product/agent-first-engineering-execution-plan.md) and [bounded upgrade evidence](agent-first-b1-upgrade-2026-11-24.md).

## Verified baseline and active gate

[992994d candidate](https://github.com/franksunye/runory/actions/runs/45361187619) passed the previous independent runtime tests and produced a downloadable engineering artifact. The [a0e0d75 upgrade candidate](https://github.com/franksunye/runory/actions/runs/45364405125) then completed successfully: actual upgrade preparation, source preservation, target-image business and attachment readback, and pre-cutover restart/readback of the prior image all passed in the job log. [Artifact 14906421579](https://github.com/franksunye/runory/actions/runs/45364405125/artifacts/14906421579) was generated. Aggregate Release Gate is a separate check: the prior [desktop journey job](https://github.com/franksunye/runory/actions/runs/45364404995/job/138342554451) failed twice with ECONNRESET on the test-only persona switch after G1 and database recovery passed. Cause is not established. The follow-up changes only that idempotent test helper to use a fresh connection, one Playwright ECONNRESET retry, and an explicit returned persona assertion. No retry/waiver was added to business mutations; a fresh full Release Gate must pass. No result is inherited by a new source commit.

## New increment — implementation pending exact-commit CI

- [Agent entry](../../AGENTS.md) and [artifact installation contract](../../deploy/self-host/AGENT-INSTALL.md) provide a discovery-to-first-use path with precise preview scope and human identity/approval boundary. README and llms.txt source point to the official release index without claiming a release already exists.
- [Bundle helper](../../deploy/self-host/runory.sh) exposes the already packaged stdio MCP server via same-host scoped credentials, without a new host Node runtime or source build.
- [Candidate workflow](../../.github/workflows/self-hosted-candidate.yml) now runs a second, fresh-runner job that downloads the exact previously built artifact, verifies its image and checksums, uses only the extracted bundle's install/doctor commands, measures elapsed time, and [checks an actual Chromium owner login, business UI, packaged MCP readback, scoped write denial and revocation](../../apps/cloud/scripts/verify-self-host-bundle.mjs). Test-harness dependencies are separate from the installer. Only safe result labels and release identities are retained. This is deterministic consumer acceptance, not a genuine independent Agent trial.
- [Explicit preview publication](../../.github/workflows/self-hosted-preview-release.yml) requires maintainer dispatch, the exact trusted main SHA, completed Candidate plus consumer, aggregate Release Gate, documentation governance and applicable Command Contract governance. It verifies the exact candidate artifact and consumer identity, compatible upgrade scope, fixed file allowlist and checksums; publishes the same tested bytes under a new source-pinned prerelease tag. No automatic main-push publishing, rebuild in the privileged publication job, overwrite of existing release, or stable-production designation.
- Distribution target: GitHub Releases at the official repo, immutable-by-convention source-pinned engineering prerelease, checksummed archive and machine-readable Catalog, release profile and acceptance metadata. A signed production distribution, broader schema/Module upgrade support, public TLS/multi-user/live provider and independent Agent acceptance are separate. Before a prerelease exists, do not present the index as a working download.

No customer production data, external provider operation, public deployment or stable production release is part of this increment. Check exact Candidate and Release Gate results before the first manual preview publication.
