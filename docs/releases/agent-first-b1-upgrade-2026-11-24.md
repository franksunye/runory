# Agent-first B1 — Explicit Compatible Runtime Upgrade

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | B1.3, 2026-11-24 |
| Owner | Engineering / Operations |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Supports the [Agent-first engineering plan](../product/agent-first-engineering-execution-plan.md) and [independent Outbox evidence](agent-first-b1-outbox-2026-11-24.md).

## Verified prior candidate

[992994d source](https://github.com/franksunye/runory/commit/992994d8d34ff8986d1009794d23e6c4a984d60e) / [Self-hosted Candidate 45361187619](https://github.com/franksunye/runory/actions/runs/45361187619): **SUCCESS**. Core, Cloud, MCP, contracts, SDK, production types/build, governance and dependency checks were also successful when inspected; desktop/mobile recovery and full Release Gate were still running. The [candidate artifact 14904098913](https://github.com/franksunye/runory/actions/runs/45361187619/artifacts/14904098913) was created. Actual external provider delivery remains unverified.

## New compatible upgrade increment — requires fresh CI evidence

- [Release profile](../../deploy/self-host/release-profile.mjs) validates bundled template checksums and compares the actual packaged schema/Catalog resource tree and Catalog item/lock inventory. Exact unchanged resources are required; arbitrary migrations and Module upgrades are not supported.
- [Upgrade preparation](../../deploy/self-host/upgrade.mjs) restores the prior release's complete offline backup to a new empty volume, then [checks database integrity, migration history and installed/locked Catalog versions](../../apps/cloud/scripts/check-self-host-upgrade.mts). It keeps the original Catalog provenance rather than rewriting frozen versions. The new release marker is written only after successful verification.
- [Host operation](../../deploy/self-host/prepare-upgrade.sh) verifies distinct named volumes and stopped writers, checks compatibility before copying, uses the original volume read-only, and checks original bytes against the backup. It does not start/stop services, switch live traffic or delete data. The bundle wrapper records only the prepared target selection after successful preparation and verifies the selected existing volume before startup.
- [Unit coverage](../../deploy/self-host/upgrade.test.mjs) exercises compatible clone preparation, incompatible release rejection before copying, preserved original bytes, and injected validation failure. Candidate CI rehearses the prior verified image (or explicitly identified reconstruction if unavailable), actual business/attachment/workflow readback on the new image, implicit startup/downgrade denials and restart of the unchanged prior instance. The bundle exposes an explicit upgrade-scope result; later changes to schema or Catalog leave this path NOT_RUN instead of inheriting a prior PASS.
- Rollback is valid before live writes/cutover only. After accepting new live writes, reverting to the old volume would lose data; require controlled reconciliation or forward recovery. No multi-writer sync or silent destructive rollback.

This is the first runtime-only upgrade class, not broad schema/Module upgrade certification. Browser/TLS, genuine independent Agent installation, final release approval and a durable public distribution entry remain open. No production environment or customer data is changed.
