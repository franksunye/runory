# FSM Owner Single-Role E2E Acceptance Runbook

Status: Active product acceptance runbook  
Owner: Product + Engineering  
Last updated: 2026-07-14

## 1. Purpose

This runbook defines the repeatable browser acceptance path for the smallest
credible Field Service Management loop:

```text
Create work order
  -> triage and plan
  -> assign technician and schedule a visit
  -> start execution
  -> complete required field work
  -> complete the visit
  -> complete the work order
```

The run uses one Workspace Owner identity from beginning to end. This removes
role-switching noise and answers one focused question:

> Can one authorized operator complete the canonical FSM lifecycle through the
> supported product UI without editing governed state, opening technical
> modules, calling APIs directly, or repairing data manually?

This is a product acceptance run, not merely a database or command test. A
successful final status is insufficient when the user cannot understand the
next action, related data becomes inconsistent, or required field work can be
bypassed.

Related specifications:

- [v0.5 Commercial FSM Execution And Planning Plan](./v0.5-commercial-fsm-execution-plan.md)
- [v0.5.1 Commercial FSM Productization Technical Specification](./v0.5.1-commercial-fsm-productization-technical-spec.md)
- [v0.5.1 Local Commercial Acceptance Checklist](./v0.5.1-local-commercial-acceptance-checklist.md)
- [v0.5.1 Mobile Field Work Specification](./v0.5.1-mobile-field-work-spec.md)

## 2. Scope And Limits

### 2.1 What this run proves

- The Owner can discover and operate the complete happy path.
- Work Order, Service Visit, Assignment, Schedule, form/checklist, evidence,
  service result, and audit state remain connected.
- Governed lifecycle fields move only through named business actions.
- Required execution work cannot be silently skipped.
- The same names, people, dates, and statuses are visible across detail pages,
  Planning, My Work, and related-record sections.

### 2.2 What this run does not prove

- Dispatcher, Technician, Supervisor, or Sales permission boundaries.
- Mobile/offline field execution quality.
- Cross-user handoff, assignment acceptance, or reassignment.
- Conflict resolution, cancellation, blocking, or reopening.
- SLA escalation, inventory, billing, route optimization, or multi-visit work.

Those require separate role and exception-path runs. Owner success must never
be interpreted as proof that least-privilege access is correct.

## 3. Product Model Used By The Run

| Concept | Product responsibility | Must not be confused with |
| --- | --- | --- |
| Work Order | Business container and authoritative service obligation | A generic task or calendar event |
| Service Visit | One scheduled and executed field appointment | The Work Order itself |
| Assignment | Which resource is responsible for the visit/work | A display-only assignee label |
| Schedule Entry | When and where the assigned work occurs | Date fields copied independently across records |
| Execution checklist/form | Required steps, readings, notes, evidence, and sign-off | CRM Task or Workflow Work Item |
| Service Report/result | Business deliverable produced by field execution | A generic form definition page |
| CRM Task | General follow-up work shared by CRM | A required Work Order execution checklist |
| Workflow Work Item | Optional orchestration or approval work | A prerequisite for the standard SMB FSM path |

For this run, **required tasks** means the checklist/form/evidence bound to the
Service Visit. Completing unrelated records under `/tasks` does not satisfy the
field-work requirement.

## 4. Authoritative State Paths

### 4.1 Work Order

```text
new
  -- work_order.triage --> triaged
  -- work_order.create_visit / governed planning --> planned
  -- work_order.start --> in_progress
  -- work_order.complete --> completed
```

The UI may use friendlier labels such as “Ready for dispatch” or “Scheduled”,
but the persisted state and command semantics must remain unambiguous.

### 4.2 Service Visit

```text
scheduled
  -- visit.start_travel --> en_route
  -- visit.arrive --> on_site
  -- visit.submit_work --> on_site
  -- visit.complete --> completed
```

`visit.submit_work` records submission intent but does not complete the visit.
The required execution form/checklist and evidence are submitted through the
Forms runtime and must be accepted according to the binding policy before the
visit can complete.

### 4.3 Completion ordering

```text
required field work accepted
  -> Service Visit completed
  -> Work Order completed
```

The Work Order must reject completion while any related Service Visit remains
incomplete. The standard path must not require an active Workflow instance.

## 5. Test Data Convention

Create a new record for every run. Do not reuse a seeded Work Order, because a
pre-existing relation or completion artifact can hide a broken creation path.

Use this identifier consistently:

```text
Run ID: FSM-E2E-<YYYYMMDD>-<HHMM>
Work Order title: <Run ID> Preventive HVAC inspection
Visit title: <Run ID> On-site inspection
Completion reason: <Run ID> Required inspection completed
```

Recommended business context:

- Customer: Acme Operations
- Contact: Maya Chen
- Service Site: Acme Warehouse - Oakland
- Asset: Warehouse HVAC Unit
- Technician: David Park
- Priority: Medium
- Scheduled duration: 90 minutes
- Required work: safety inspection, filter/temperature check, completion note,
  and at least one evidence attachment when the binding requires evidence

Different values may be used, but every selected relation must resolve to a
human-readable record rather than a raw ID.

## 6. Preconditions

Record these before beginning:

- [ ] Dev service is running and current migrations/catalog resources are loaded.
- [ ] CRM Lite Pack and FSM Pack are installed.
- [ ] The workspace contains Customer, Contact, Site, Asset, and Technician data.
- [ ] Current identity visibly shows `Workspace Owner` or equivalent Owner role.
- [ ] The run will use only this identity; Demo identity will not be switched.
- [ ] Work Orders, Planning, My Work, Customer, Contact, Site, Asset, and
      Technician surfaces load without API or console errors.
- [ ] No database reset, direct API mutation, SQL update, or manual seed repair
      will occur after the run begins.

If migrations or catalog manifests changed after the dev server started,
restart the server before the run. Browser hard reload does not apply process
migrations or clear server-side manifest caches.

## 7. Execution Procedure

### Stage 0 — Establish The Baseline

1. Open `/w/<workspace-slug>/dashboard`.
2. Confirm the account menu identifies the Owner.
3. Open Work Orders and note the current record count.
4. Open Planning and My Work to confirm both load successfully.

Expected:

- The current user and role are understandable without opening developer tools.
- The operational surfaces are discoverable from the workspace shell.
- Existing errors do not contaminate the run.

Fail when:

- The identity is ambiguous or Demo identity and account identity disagree.
- A required surface is hidden from Owner or fails to load.

### Stage 1 — Create The Work Order

1. From Work Orders, choose Add/Create.
2. Enter the Run ID title and a concrete service description.
3. Select Customer, Contact, Service Site, Asset, priority, requested time, and
   SLA due time.
4. Save once.
5. Open the newly created detail page.

Expected:

- Status defaults to `new` and is not an ordinary editable field.
- Related selectors display names and preserve the selected IDs correctly.
- The detail page shows customer/site/asset context and the next action
  `Triage`.
- The record appears once in the Work Order list and timeline/audit history.

Fail when:

- Save attempts to generically update a governed status field.
- Related values are lost, mismatched, or displayed as raw IDs.
- Creation also creates duplicate visits, assignments, or schedule entries.

### Stage 2 — Triage And Define The Work

1. Choose `Triage` from the Work Order action area.
2. Confirm or update priority, Customer, and Contact when prompted.
3. Confirm that the required field-work definition is visible or can be chosen:
   checklist/form, expected evidence, and service result.

Expected:

- `work_order.triage` moves `new -> triaged`.
- The UI describes the next step as planning/dispatch, not generic editing.
- The Work Order timeline identifies who triaged it and when.

Fail when:

- Status can be changed with Edit/Save instead of the named action.
- There is no way to understand what the Technician must complete.

### Stage 3 — Assign And Schedule A Service Visit

1. From the Work Order, choose the product action for planning a visit.
2. Set Technician to David Park.
3. Set scheduled start and end using one coherent interaction.
4. Save/confirm the planning action once.

Expected:

- Exactly one linked Service Visit is created.
- Exactly one active Assignment and one Schedule Entry are created.
- Work Order moves `triaged -> planned` through governed planning.
- Work Order, Service Visit, Planning, My Work, and Technician context show the
  same Technician and time range.
- Planning displays the visit at the correct duration and location.
- Repeating/retrying the action does not create duplicates.

Fail when:

- Assignment is only a scalar Work Order field with no Visit/Schedule relation.
- Work Order, Visit, Planning, and My Work disagree.
- The only way to plan is to manually create unrelated records on several pages.

### Stage 4 — Verify The Pre-Start Completion Guard

1. Before starting, confirm `Complete Work Order` is unavailable or rejected.

Expected:

- A non-`in_progress` Work Order cannot complete.
- The UI explains the missing prerequisite in business language and makes the
  next record/action reachable.
- A rejected command does not partially mutate status or timestamps.

Fail when:

- Work Order completion bypasses Visit or required-work checks.
- The user receives only an internal command/SQL error with no recovery path.

### Stage 5 — Start The Work Order And Visit

1. On the Work Order, choose `Start work`.
2. Open the linked Service Visit.
3. Choose `Start travel`, then `Arrive on site`.
4. Before completing the Visit, attempt `Complete Work Order` when the UI
   exposes it, then return to the Visit.

Expected:

- Work Order moves `planned -> in_progress` through `work_order.start`.
- Visit moves `scheduled -> en_route -> on_site` through named commands.
- An `in_progress` Work Order with an incomplete Visit rejects completion
  without partially mutating the Work Order.
- Actual start/travel timing is recorded according to command semantics.
- Timeline events identify the Owner actor even though the operational
  Technician remains David Park.

Fail when:

- Owner execution silently changes the assigned Technician.
- Actual time fields must be manually edited.
- The product offers contradictory Work Order and Visit execution states with
  no explanation.

### Stage 6 — Complete Required Field Work

1. From the Service Visit, open the bound execution checklist/form.
2. Complete every required checklist item and reading.
3. Add the required note, evidence attachment, and sign-off when configured.
4. Submit the work.
5. As Owner in this single-role run, perform the required acceptance/review if
   the binding requires it.

Expected:

- Required versus optional work is visually clear.
- Draft answers persist during navigation/reload.
- Submission is immutable/versioned according to Forms policy.
- Evidence remains associated with this Visit and is visible in the service
  result/report context.
- `visit.submit_work` does not itself pretend that the Visit is completed.

Fail when:

- There is no execution checklist/form for the newly created Visit.
- Completing a generic CRM Task is treated as field-work completion.
- Required items or evidence can be omitted without a policy-approved reason.
- The Owner must navigate through Workflow/Automation internals to proceed.

### Stage 7 — Complete The Service Visit

1. Choose `Complete visit`.
2. Confirm the Visit detail and related service result/report.

Expected:

- Submitted-but-unaccepted required forms block completion.
- Accepted required work allows `on_site -> completed`.
- Actual end time is recorded automatically.
- Service result/report is human-readable and linked to the Work Order, Visit,
  Technician, Customer, Site, Asset, evidence, and completion time.

Fail when:

- A Visit with no required execution artifact can pass the canonical run.
- Completion leaves a scheduled/active assignment or schedule state without an
  intentional historical representation.

### Stage 8 — Complete The Work Order

1. Return to the Work Order.
2. Choose `Complete` and enter the Run ID completion reason.
3. Confirm the detail page, list, Planning, My Work, and timeline.

Expected:

- `work_order.complete` moves `in_progress -> completed`.
- `completed_at` and completion reason are recorded by the command.
- All required Visits are completed/cancelled and no ready Work Items remain.
- The completed job no longer appears as active work in My Work or active
  Planning views, while history remains discoverable.
- Refreshing the browser preserves the same result.

Fail when:

- Completion is a generic status edit.
- Active-work surfaces still treat the completed job as actionable.
- Related names, assignment, schedule, evidence, or report links disappear.

## 8. Cross-Surface Consistency Matrix

Record the observed value at the end of Stages 3, 5, and 8.

| Field | Work Order | Service Visit | Planning | My Work | Technician/People | Required result |
| --- | --- | --- | --- | --- | --- | --- |
| Customer |  |  | N/A |  | N/A | Same business identity |
| Site/location |  |  |  |  | N/A | Same site and map location |
| Assigned Technician |  |  |  |  |  | Same user-linked resource |
| Scheduled start/end |  |  |  |  |  | Same timezone-aware interval |
| Execution status |  |  |  |  | N/A | Understandable aggregate relationship |
| Required work |  |  | N/A |  | N/A | Same checklist/form binding |
| Completion |  |  |  |  |  | Removed from active work, retained in history |

Any unexplained disagreement is a failed run even when the Work Order reaches
`completed`.

## 9. Severity And Release Decision

| Severity | Definition | Examples |
| --- | --- | --- |
| P0 Blocker | The path cannot finish safely or business data is corrupted | Cannot create/assign/start/complete; duplicate Visit; cross-workspace leak |
| P1 Major | The path finishes only by bypassing a core FSM invariant | Generic status edit; missing required-work guard; Work Order/Visit disagreement |
| P2 Product gap | The path is correct but confusing or unnecessarily difficult | Poor copy, hidden next action, raw ID, inconsistent date formatting |
| P3 Polish | Cosmetic issue with no material ambiguity | Spacing, minor truncation, non-blocking visual detail |

The run passes only when:

- Every required stage passes.
- There are no P0 or P1 findings.
- P2/P3 findings have an owner and target milestone.
- The path is understandable without explaining internal Packs, database
  tables, command APIs, Workflow, or Automation.

## 10. Run Record Template

Copy this section for every execution and store it in the issue, release note,
or acceptance evidence location.

```markdown
### FSM Owner E2E Run — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- App version:
- Workspace slug/id:
- Browser:
- Identity shown:
- Workspace role shown:
- Work Order id:
- Service Visit id:
- Assignment id (if observable):
- Schedule Entry id (if observable):
- Form submission/report id (if observable):

| Stage | Result | Evidence / observed behavior | Finding |
| --- | --- | --- | --- |
| 0. Baseline | PASS / FAIL |  |  |
| 1. Create Work Order | PASS / FAIL |  |  |
| 2. Triage | PASS / FAIL |  |  |
| 3. Assign and schedule | PASS / FAIL |  |  |
| 4. Completion guards | PASS / FAIL |  |  |
| 5. Start execution | PASS / FAIL |  |  |
| 6. Required field work | PASS / FAIL |  |  |
| 7. Complete Visit | PASS / FAIL |  |  |
| 8. Complete Work Order | PASS / FAIL |  |  |
| Cross-surface consistency | PASS / FAIL |  |  |

Final decision: PASS / FAIL

Findings:

1. [P0/P1/P2/P3] <title>
   - Expected:
   - Actual:
   - Reproduction:
   - Affected record(s):
   - Owner / milestone:

Notes:

- No direct API/SQL mutation used: YES / NO
- No identity switching used: YES / NO
- No reset performed during run: YES / NO
```

## 11. Follow-Up Suites

After this Owner path passes, run separate suites in this order:

1. Dispatcher creates/triages/assigns; Technician sees only assigned work.
2. Technician executes Visit and submits evidence; Supervisor reviews/closes.
3. Reassignment and rescheduling with conflict visibility.
4. Block/unblock, cancel, and reopen exception paths.
5. Mobile/PWA execution, poor network, draft persistence, and offline posture.
6. Multi-visit Work Order and partial completion.

These suites reuse the same aggregate and consistency invariants. They add
authorization and handoff evidence rather than redefining the core path.

## 12. Execution Records

Architecture and product remediation:
[FSM Canonical Execution — Product And Architecture Blueprint](./fsm-canonical-execution-product-architecture.md).

- [2026-07-14 — FSM-E2E-20260714-0923](../releases/fsm-owner-e2e-run-2026-07-14.md)
  — **FAIL**: Visit execution can complete, but there is no visible governed
  transition from a triaged Work Order to a planned Work Order, and field-work
  evidence is not required.
