# FSM Owner E2E Re-run — FSM-E2E-20260714-1058

- Date/time: 2026-07-14 10:58–11:18 Asia/Shanghai
- Reviewer: Codex, executing as the local Owner identity
- Branch/commit: `main` / `186c56f` plus the current v0.5 working tree
- Workspace: `demo-workspace-223bcc4fef`
- Work Order: `rec_5fb9097a-c91b-4ea9-8310-183243a3043c`
- Service Visit: `visit_673f29f9-a563-49db-88ca-1b79376d7ca1`
- Technician: David Park

## Decision

**PASS — the canonical Owner FSM path now closes end to end for local v0.5
commercial evaluation.**

The re-run covered governed planning and dispatch, field execution with a real
snapshotted form, required checklist/evidence/signature guards, Visit and Work
Order completion, and the operational projections consumed by My Work,
Planning, and Activity.

## Stage results

| Stage | Result | Evidence |
| --- | --- | --- |
| Create Work Order | PASS | Created `FSM-E2E-20260714-1058 Preventive HVAC inspection` with customer, contact, site, asset, requested date, and SLA. |
| Triage | PASS | Governed command moved the Work Order from `new` to `triaged`. |
| Plan & dispatch | PASS | One command moved the Work Order to `planned` and atomically created the Visit, assignment, schedule entry, execution, required form, and work item. |
| Projection consistency | PASS | My Work showed the Visit for David Park; Planning showed the same technician and 2026-07-16 09:00–10:30 schedule. |
| Premature completion guards | PASS | A planned Work Order could not complete; after Start, it still could not complete while the Visit was incomplete. |
| Field execution | PASS | Travel, arrival, and work submission advanced the Visit through the governed execution path. |
| Evidence guard | PASS | Visit completion was rejected before the required field-work submission existed. |
| Required work | PASS | Submitted the exact snapshotted form with checklist values, evidence attachments, and customer signature by Maya Chen. |
| Complete Visit | PASS | Required work item and Visit completed successfully. |
| Complete Work Order | PASS | Work Order completed only after its Visit was complete. |
| Final reconciliation | PASS | The completed item disappeared from My Work, remained historically visible in Planning, and both Work Order and Visit timelines recorded actor-attributed events. |
| Detail presentation | PASS | Work Order detail now shows the canonical related Service Visit with David Park, schedule, and status; misleading legacy Work Order schedule scalars are hidden. |

## Defect found and fixed during the run

The Owner could supervise the Visit but could not complete its technician-owned
execution work item because generic candidate eligibility was applied without a
supervisor exception. The runtime now permits an active workspace Admin/Owner
to complete only `visit_execution:*` work items while retaining strict candidate
eligibility for generic workflow tasks. An automated regression test covers the
Owner-to-technician execution case.

## Final aggregate state

```text
Work Order: new -> triaged -> planned -> in_progress -> completed
Visit:      scheduled -> en_route -> on_site -> completed
Work item:  ready -> completed
Form:       required snapshot -> submitted revision 1
Schedule:   confirmed, no conflict
```

## Verification

- Targeted FSM regression: 34/34 tests passed.
- Full platform-core regression: 646/646 tests passed earlier in this re-run.
- Platform Core typecheck: passed.
- Cloud typecheck: passed.
- `git diff --check`: passed.
- Chrome product check: completed Work Order, human-readable relations,
  canonical related Service Visit, timeline, and unobstructed Demo identity
  submenu verified.

## Run integrity

- No database reset during the run.
- No direct SQL mutation; database access was used only for verification.
- Business mutations used the same command/form APIs as the product UI.
- Chrome was used for the final product-state and overlay verification.

