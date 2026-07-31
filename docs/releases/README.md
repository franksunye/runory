# Release Evidence

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `releases` |
| Applies to | `v0.5+` |
| Owner | Engineering / Operations |
| Last reviewed | 2026-07-31 |
| Supersedes | — |
| Superseded by | — |

This directory contains point-in-time acceptance, test, drill, migration, and performance evidence. Evidence records what happened and does not replace product, architecture, or operational specifications.

## Performance

- [Performance Baseline Report Template](performance-baseline-report-template.md) — required structure for performance evidence.
- [Performance Baseline and Budget](../architecture/performance-baseline-and-budget.md) — active performance requirements and v0.6 acceptance criteria.
- [v0.6.0 Foundation Performance Baseline — 2026-07-20](v0.6.0-foundation-performance-baseline-2026-07-20.md)

## v0.6

- [v0.6.0 Foundation Acceptance Review — 2026-07-20](v0.6.0-foundation-acceptance-review-2026-07-20.md)
- [v0.6.0 Architecture Inventory Baseline — 2026-07-20](v0.6.0-architecture-inventory-baseline-2026-07-20.md)
- [v0.6 Deferred Work Handoff](../architecture/v0.6-deferred-work-handoff.md)

## v0.7

- [v0.7.0 Commercial Completion Acceptance — 2026-07-20](v0.7.0-commercial-completion-acceptance-2026-07-20.md)
- [v0.6–v0.7 External Benchmark Retrospective — 2026-07-27](v0.6-v0.7-external-benchmark-retrospective-2026-07-27.md) — non-retroactive mapping and the bounded `V09-FIN-01` forward gap.

## v0.9

- [v0.9 E2E Gate Remapping — 2026-07-31](v0.9-e2e-gate-remapping-2026-07-31.md) — **active** G0–G5 means: G2 = Playwright functional coverage, G3 = human/Agent critical-path feel, G4 = device/provider, G5 = customer cohort.
- [v0.9 Engineering and E2E Convergence Review — 2026-07-30](v0.9-engineering-and-e2e-review-2026-07-30.md) — engineering conformance findings, E2E release-gate design, and required closure sequence.
- [v0.9.1 Engineering and E2E Remediation Re-review — 2026-07-30](v0.9.1-engineering-and-e2e-remediation-review-2026-07-30.md) — verifies the v0.9.1 repair, records finding disposition, and identifies the remaining architecture and E2E release blockers.
- [v0.9 G1/G2 Binding Evidence — 2026-07-30](v0.9-g1-g2-binding-evidence-2026-07-30.md) — clean-SHA PASS for API walkthrough and browser **projection subset** on `6627fd5e`; full G2 closed later via S0–S5 on `ae169811`.
- [v0.9 G3 Experience Sample Evidence — 2026-07-31](v0.9-g3-experience-sample-2026-07-31.md) — Agent browser critical-path feel sample PASS on `ae169811`.
- [G1 API artifact](v0.9-g1-api-walkthrough-6627fd5e.json) / [G2 browser summary](v0.9-g2-browser-projection-6627fd5e.json) — machine-readable evidence for the binding record above.

## FSM

- [FSM Owner E2E Run — 2026-07-14](fsm-owner-e2e-run-2026-07-14.md)

## Payments

- [Subscription Billing v0.5 Engineering Review — 2026-07-17](subscription-billing-v0.5-engineering-review-2026-07-17.md)
- [Payment v0.5 Engineering Review — 2026-07-17](payment-v0.5-engineering-review-2026-07-17.md)

New evidence documents must link to the specification, runbook, or release criterion they validate.
