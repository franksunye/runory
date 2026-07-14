# FSM Owner E2E Run — FSM-E2E-20260714-0923

- Date/time: 2026-07-14 09:23–09:47 Asia/Shanghai
- Reviewer: Codex, executing as the visible Owner identity
- Branch/commit: `main` / `186c56f`
- App version: v0.5 local development acceptance build
- Workspace slug/id: `demo-workspace-d397594503`
- Browser: Google Chrome
- Identity shown: Local workspace owner
- Workspace role shown: Workspace Admin
- Work Order id: `rec_db724282-85c5-489b-8eb9-6bc32cc43f91`
- Service Visit id: `rec_afb0f96c-346e-4b01-a33c-eb86672001b6`
- Assignment id: not exposed in the UI
- Schedule Entry id: not exposed in the UI
- Form submission/report id: none; no field-work form or evidence surface was
  available

## Decision

**FAIL — the Owner FSM path is not commercially acceptable yet.**

Remediation design:
[FSM Canonical Execution — Product And Architecture Blueprint](../product/fsm-canonical-execution-product-architecture.md).

The product can create and triage a Work Order, save a technician and dates,
and independently run a Service Visit through travel, arrival, submission, and
completion. It cannot connect those operations into one governed FSM path. The
Work Order remains `triaged` after its Visit is created and completed, so the
Work Order cannot be started or completed.

The completed Visit also had no checklist, form, measurement, attachment,
signature, or evidence requirement. `Submit work` and `Complete visit` accepted
an empty execution record.

## Stage Results

| Stage | Result | Evidence / observed behavior | Finding |
| --- | --- | --- | --- |
| 0. Baseline | PASS | Dashboard loaded; Owner identity and Workspace Admin role were visible; Work Order, Planning, My Work, and FSM navigation loaded. | — |
| 1. Create Work Order | PASS | Created `FSM-E2E-20260714-0923 Preventive HVAC inspection`; Work Order list changed from 6 to 7 records; initial state was `new`. | — |
| 2. Triage | PASS | `Triage` business action changed the Work Order from `new` to `triaged`. | — |
| 3. Assign and schedule | FAIL | David Park and Requested/Scheduled/SLA dates saved correctly, but neither Work Order detail nor Planning provided Create Visit / Plan / Dispatch. A hidden `/service-visits` URL was required to continue. | P0-1, P1-1 |
| 4. Completion guards | FAIL | No required-work guard was observable. A Visit with no checklist, form, or evidence could be completed. The Work Order completion guard could not be reached because the Work Order never became `planned`. | P1-2 |
| 5. Start execution | FAIL | Visit actions `Start travel` and `Arrive on site` worked. Work Order `Start` was never available because the Work Order remained `triaged`. | P0-1 |
| 6. Required field work | FAIL | The Visit detail exposed only `Submit work`; there was no task/form/evidence UI. Submitting did not change visible state, timestamp, or Activity Timeline count. | P1-2, P1-3 |
| 7. Complete Visit | FAIL | `Complete visit` changed the Visit to `completed` and set Actual End, despite no execution evidence. This is a command success but an acceptance failure. | P1-2 |
| 8. Complete Work Order | FAIL | After the related Visit completed, the Work Order still showed `triaged`, with only Block and Cancel actions. Start and Complete were unavailable. | P0-1 |
| Cross-surface consistency | FAIL | Planning did not supply the missing dispatch transition. My Work correctly omitted the still-triaged Work Order and completed Visit, but the Work Order and Visit lifecycle states disagreed. Visit Activity Timeline remained at 1 after multiple commands. | P0-1, P1-3 |

## Observed Lifecycle

```text
Work Order: new --Triage--> triaged ------------------------------X
                                   no visible Plan/Create Visit

Service Visit (created from hidden list route):
scheduled --Start travel--> en_route --Arrive--> on_site
          --Submit work--> on_site --Complete visit--> completed

Final aggregate state:
Work Order = triaged
Service Visit = completed
```

## Findings

### P0-1 — No product path from triaged Work Order to planned Work Order

- Expected: after triage, the Owner can create/confirm a Visit and dispatch it;
  the governed command moves the Work Order to `planned` and exposes Start.
- Actual: the Work Order detail only exposed Block and Cancel. Planning was a
  read-only planning view with no create/dispatch action. Creating a Visit from
  the hidden Service Visit list did not update the Work Order.
- Reproduction:
  1. Create a Work Order.
  2. Run Triage.
  3. Assign a technician and schedule dates in Edit.
  4. Return to detail or Planning.
  5. Observe there is no Plan/Create Visit/Dispatch action.
  6. Even after manually creating and completing a related Visit, observe the
     Work Order remains `triaged`.
- Affected records: Work Order `rec_db724282-85c5-489b-8eb9-6bc32cc43f91`;
  Visit `rec_afb0f96c-346e-4b01-a33c-eb86672001b6`.
- Owner / milestone: FSM product + command integration / before v0.5 commercial
  evaluation.

### P1-1 — Service Visit creation is hidden and bypasses the governed command

- Expected: Visit creation is contextual to the Work Order or Planning and uses
  the same command that enforces the Work Order lifecycle transition.
- Actual: Service Visit has a functioning list/create page at
  `/service-visits`, but no navigation or contextual Work Order action exposes
  it. Its generic create form allows status `scheduled` to be selected directly.
- Risk: users cannot discover the path, while knowledgeable users can create a
  Visit that is disconnected from the Work Order aggregate lifecycle.
- Owner / milestone: FSM UX + lifecycle architecture / before v0.5 commercial
  evaluation.

### P1-2 — Empty field work can be submitted and completed

- Expected: Submit and Complete are gated by the required Visit checklist,
  forms, measurements, attachments, signature, and/or exception reason defined
  by the Work Order template.
- Actual: the new Visit had no required-work surface. `Submit work` succeeded,
  then `Complete visit` completed the Visit with no evidence.
- Risk: a commercially material Work Order can appear operationally complete
  without proof of service.
- Owner / milestone: FSM execution model + forms integration / before v0.5
  commercial evaluation.

### P1-3 — Visit command history is not visible or auditable in the detail UI

- Expected: travel, arrival, work submission, and completion appear once in the
  Activity Timeline with actor and timestamp; repeated submission is either
  idempotent with visible feedback or rejected clearly.
- Actual: the Visit Activity Timeline count stayed at 1 after Start travel,
  Arrive, Submit work, repeated Submit work, and Complete visit. Submit work did
  not change visible status or Updated time.
- Risk: acceptance reviewers and supervisors cannot distinguish an unsubmitted
  visit from a submitted one or audit who performed lifecycle actions.
- Owner / milestone: timeline/event projection / before v0.5 commercial
  evaluation.

## What Worked

- Owner identity and workspace role were visible throughout the run.
- Generic Work Order creation saved a valid record.
- Managed Work Order status was read-only in Edit and correctly directed users
  to business actions.
- Triage, Visit travel, arrival, and Visit completion commands updated their
  respective record states.
- Lookup values rendered as names rather than raw ids.
- Assignment and schedule dates persisted and rendered consistently in the Work
  Order detail.
- My Work did not retain the completed Visit and did not invent a ready item for
  the still-triaged Work Order.

## Run Integrity

- No direct API/SQL mutation used: YES
- No identity switching used: YES
- No reset performed during run: YES
- Hidden UI route used: YES, solely to establish whether the remaining Visit
  lifecycle could execute

## Exit Criteria for Re-run

Do not consider this path fixed until all of the following are demonstrable from
the visible product UI:

1. A triaged Work Order has one clear next action: Plan/Dispatch or Create Visit.
2. That action creates/links the Visit and moves the Work Order to `planned`
   atomically.
3. The Work Order and Visit cannot be advanced by generic editable status
   fields.
4. The Visit presents required work and blocks submission/completion while any
   required item is incomplete or unaccepted.
5. Visit command history is visible and actor-attributed.
6. Completing all Visits makes Work Order completion available; completing the
   Work Order then reconciles Work Order, Visit, Planning, My Work, and Activity.
