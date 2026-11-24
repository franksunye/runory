# Agent-first B1 — Compose, Recovery and Candidate Distribution

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | B1 second candidate follow-up, 2026-11-24 |
| Owner | Engineering / Operations |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Supports the [Agent-first engineering plan](../product/agent-first-engineering-execution-plan.md) and [first B1 record](agent-first-b1-candidate-2026-11-24.md). This is source and test evidence, not a release announcement.

## Actual results on 85bf853

[Isolated candidate job](https://github.com/franksunye/runory/actions/runs/45353170592/job/138304380139), [source](https://github.com/franksunye/runory/commit/85bf853e3dc1727bf70a17d422d0a4f25562dfda):

| Check | Actual result |
| --- | --- |
| Production Docker build, source SHA and anonymous authorization denials | PASS |
| Production OTP session and owner workspace | PASS |
| Authenticated local catalog seed and FSM + Sales Quote Pack | PASS |
| Customer create/read and scoped key denial/revocation | PASS |
| Named Quote draft through scoped key and same-key retry | PASS |
| Local attachment upload | PASS |
| Customer list/readback | FAIL: fixture assumed data.records, whereas [record list route](../../apps/cloud/src/app/api/workspaces/[id]/objects/[objectKey]/records/route.ts) returns a directly enveloped array. Customer direct read and Quote relationship had already passed. |
| Download bytes, scheduler, replacement/recovery | NOT_RUN |

The follow-up corrects the fixture only for the list-envelope mismatch, and adds actual Compose operation, independent data-volume recreation, cold backup and restore into a new volume, exact file checksums, and a second fresh installation. It adds an operator helper and a workflow-generated downloadable engineering bundle after those isolated checks pass. The helper and snapshot have bounded tests; no new runtime evidence is claimed until CI completes.

The [snapshot](../../deploy/self-host/snapshot.mjs) is strictly same-image, offline and new-target only. No real data or backups are uploaded to Actions artifacts. The bundle contains the tested image, config, operator helper, license, checksum and source metadata; not a signed public release.

Remaining B1 work includes immutable approved catalog activation (the current seed is fixture-only), normal non-fixture owner mail/identity and browser/TLS acceptance, readiness and actual timer/outbox delivery/recovery, compatible upgrade with explicit backup, and independent Agent sessions. Existing Release Gate and Cloud GA requirements remain binding.
