# Test Case 08 — Exception Paths

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Priority | P1 |
| Primary roles | Workspace Owner + Service Supervisor (+ Dispatcher for schedule override) |
| Surface | Desktop browser |
| Prerequisite | [00 — Environment Setup](./00-test-environment-setup.md) |

## 1. Purpose

Verify that Runory's exception and boundary paths behave correctly through the
real product UI — Quote rejection, return, withdrawal, and expiry; Work Order
block, cancel, and reopen; Visit cancellation; schedule conflict detection and
override; premature completion guards; duplicate-operation idempotency; and
Invoice void restrictions. Every exception path must record a reason, remain
auditable, and prevent further invalid transitions without corrupting related
records.

This is the primary exception-path acceptance run. It answers:

> Can an authorized operator safely drive every governed exception transition
> through the supported UI, and does the system refuse invalid continuations
> without creating orphaned or duplicate records?

## 2. Scope

### 2.1 What this run proves

- Quote `reject`, `return`, `withdraw`, and `expire` transitions are governed,
  auditable, and terminal where specified.
- A returned Quote can be edited and resubmitted; rejected, withdrawn, and
  expired Quotes cannot continue.
- Work Order `block` records a reason and prevents further progression.
- Work Order `cancel` records a reason and cascades cancellation to related
  Service Visits.
- Work Order `reopen` from `completed` returns the Work Order to an actionable
  state for rework.
- Visit `cancel` records a reason and is reflected on the parent Work Order.
- Schedule conflicts are detected, warned, and overridable only with
  `schedule.conflict.override` permission.
- Completion guards reject premature Work Order completion (non-`in_progress`
  state or incomplete Visits) and premature Visit completion (unaccepted
  required field work).
- Duplicate governed commands (submit, approve, convert) are idempotent — they
  do not create duplicate records.
- A paid Invoice cannot be voided; an unpaid issued Invoice can be voided.

### 2.2 What this run does not prove

- Full happy-path execution (see test case 01).
- Quote commercial loop details (see test case 02).
- Payment and refund processing (see test case 03).
- Customer self-service access (see test case 04).
- Mobile field execution (see test case 05).
- Role-based permission boundaries for every role (see test case 07).

## 3. Authoritative state paths

```text
Work Order
  new
    -- work_order.triage --> triaged
    -- work_order.block --> blocked
    -- work_order.cancel --> cancelled
  triaged
    -- work_order.create_visit --> planned
    -- work_order.block --> blocked
    -- work_order.cancel --> cancelled
  planned
    -- work_order.start --> in_progress
    -- work_order.block --> blocked
    -- work_order.cancel --> cancelled
  in_progress
    -- work_order.complete --> completed
        (guard: all Visits must be completed or cancelled)
    -- work_order.block --> blocked
    -- work_order.cancel --> cancelled
  completed
    -- work_order.reopen --> reopened (rework required)
  blocked      (records block reason; cannot progress until resolved)
  cancelled    (records cancel reason; cascades to related Visits)
  reopened     (actionable again for rework)

Service Visit
  scheduled
    -- visit.start_travel --> en_route
    -- visit.cancel --> cancelled
  en_route
    -- visit.arrive --> on_site
    -- visit.cancel --> cancelled
  on_site
    -- visit.submit_work --> (work submitted, not yet completed)
    -- visit.complete --> completed
        (guard: required field work must be accepted)
    -- visit.cancel --> cancelled
  completed    (terminal)
  cancelled    (terminal, records cancel reason)

Quote
  draft
    -- quote.submit --> review
  review
    -- quote.approve --> approved
    -- quote.reject --> rejected (terminal)
    -- quote.return --> returned (editable, can resubmit)
    -- quote.withdraw --> withdrawn (terminal)
  returned
    -- quote.submit --> review (after revision)
  approved
    -- quote.send --> sent
  sent
    -- quote.accept --> accepted
    -- (system expiry) --> expired (terminal, if expiry time is set)
  accepted
    -- quote.convert --> converted (creates exactly one Work Order)
  converted   (terminal)
  rejected    (terminal)
  withdrawn   (terminal)
  expired     (terminal)

Invoice
  (draft)
    -- invoice.issue --> issued
  issued
    -- invoice.void --> voided (only if not paid)
  paid
    -- invoice.void --> REJECTED (paid Invoice cannot be voided)
```

Special rules:

- **Schedule conflict override:** A Dispatcher with `schedule.conflict.override`
  permission can override a detected time-overlap conflict when creating a
  Visit. Without the permission, the conflicting Visit creation is blocked.
- **Work Order completion guard:** `work_order.complete` requires all linked
  Service Visits to be `completed` or `cancelled`. An incomplete Visit blocks
  Work Order completion.
- **Visit completion guard:** `visit.complete` requires required field work to
  be submitted and accepted. Unaccepted required work blocks Visit completion.
- **Work Order cancel cascade:** `work_order.cancel` cancels the Work Order and
  cascades cancellation to all related Service Visits that are not already
  terminal.
- **Quote expiry:** When a Quote in `sent` state has an expiry time set and the
  expiry time passes, the system transitions the Quote to `expired`. This is a
  system-triggered transition, not a manual command.

## 4. Preconditions

- [ ] Dev server running at `http://localhost:3000`
- [ ] Demo workspace created with CRM Lite, Sales Quote, and FSM Packs installed
- [ ] At least three test users available:
  - User A: `workspace_owner` role (primary operator)
  - User B: `service_supervisor` role (Invoice issuance and void)
  - User C: `dispatcher` role with `schedule.conflict.override` permission
- [ ] Price Book items seeded (or create them during the test)
- [ ] Stripe CLI webhook forwarding active (for Invoice payment in Stage 12)
- [ ] No database reset or manual seed repair will occur after the run begins

## 5. Test data

```text
Run ID: EXC-<YYYYMMDD>-<HHMM>

Customer: Acme Operations (or seeded demo customer)
Contact: Maya Chen (or seeded demo contact)
Service Site: Acme Warehouse - Oakland
Asset: Warehouse HVAC Unit
Technician: David Park

Quote A (reject):     <Run ID> Quote A — reject path
Quote B (return):     <Run ID> Quote B — return and resubmit path
Quote C (withdraw):   <Run ID> Quote C — withdraw path
Quote D (expire):     <Run ID> Quote D — expire path (set near-future expiry)
Quote E (idempotent): <Run ID> Quote E — duplicate convert idempotency

Work Order A (block):   <Run ID> WO A — block path
Work Order B (cancel):  <Run ID> WO B — cancel cascade path
Work Order C (reopen):  <Run ID> WO C — reopen path (must be completed first)
Work Order D (guards):  <Run ID> WO D — premature completion guards
Work Order E (convert): <Run ID> WO E — from Quote E idempotent convert

Visit A (cancel):       <Run ID> Visit A — standalone cancel path
Visit B (conflict 1):   <Run ID> Visit B — first visit for conflict test
Visit C (conflict 2):   <Run ID> Visit C — overlapping visit for conflict test

Invoice A (void unpaid): <Run ID> Invoice A — voidable (issued, unpaid)
Invoice B (void paid):   <Run ID> Invoice B — not voidable (paid)

Reject reason:      Pricing not acceptable for this scope
Return reason:      Update line items per customer feedback
Withdraw reason:    Customer deferred decision indefinitely
Block reason:       Awaiting replacement part from supplier
Cancel reason:      Customer cancelled contract
Reopen reason:      Follow-up repair required after inspection
Visit cancel reason: Technician unavailable, reschedule required

Quote D expiry:     Set 5 minutes in the future from submission
Payment test card:  4242 4242 4242 4242
```

## 6. Execution procedure

### Stage 0 — Establish baseline and verify roles

1. Log in as User A (Workspace Owner).
2. Confirm the account menu shows the Owner role.
3. Open Quotes, Work Orders, Planning, and Invoices to confirm all load.
4. Log out and log in as User B (Service Supervisor).
5. Confirm the account menu shows the Service Supervisor role.
6. Log out and log in as User C (Dispatcher).
7. Confirm the account menu shows the Dispatcher role.

**Expected:**

- Each role identity is visible without developer tools.
- All three users can access the relevant operational surfaces.
- No console errors on any surface.

**Fail when:** Role identity is ambiguous; a role cannot access its required
surface.

### Stage 1 — Quote reject (review → rejected)

1. Log in as User A (Owner).
2. Create Quote A with the Run ID title, Customer, Contact, and Site.
3. Add at least one line item and save as draft.
4. Submit for approval (`quote.submit`): confirm `draft → review`.
5. Reject the Quote (`quote.reject`) with the reject reason.
6. Confirm the status changes to `rejected`.
7. Attempt to approve, send, or accept the rejected Quote.

**Expected:**

- `quote.reject` moves `review → rejected`.
- The reject reason is visible on the Quote detail and timeline.
- The timeline records the rejector actor and timestamp.
- No further lifecycle actions (approve, send, accept, convert) are available
  on a rejected Quote.
- The rejected Quote is read-only for line items.

**Fail when:** A rejected Quote can be approved, sent, accepted, or converted;
the reject reason is lost; the rejection is not auditable.

### Stage 2 — Quote return and resubmit (review → returned → review)

1. Create Quote B with the Run ID title and at least one line item.
2. Save as draft and submit for approval: confirm `draft → review`.
3. Return the Quote (`quote.return`) with the return reason.
4. Confirm the status changes to `returned`.
5. Verify the return reason is visible on the detail and timeline.
6. Edit a line item on the returned Quote (e.g., change quantity).
7. Resubmit for approval (`quote.submit`): confirm `returned → review`.

**Expected:**

- `quote.return` moves `review → returned`.
- The return reason is visible on the Quote detail and timeline.
- A returned Quote is editable (line items can be modified).
- Resubmission moves `returned → review`.
- The timeline shows both the return and the resubmission with actors and
  timestamps.

**Fail when:** A returned Quote cannot be edited or resubmitted; the return
reason is lost; resubmission does not move the Quote back to `review`.

### Stage 3 — Quote withdraw (review → withdrawn)

1. Create Quote C with the Run ID title and at least one line item.
2. Save as draft and submit for approval: confirm `draft → review`.
3. Before approval, withdraw the Quote (`quote.withdraw`) with the withdraw
   reason.
4. Confirm the status changes to `withdrawn`.
5. Attempt to approve, send, accept, or convert the withdrawn Quote.

**Expected:**

- `quote.withdraw` moves `review → withdrawn`.
- The withdraw reason is visible on the Quote detail and timeline.
- `withdrawn` is a terminal state — no further lifecycle actions are available.
- The withdrawn Quote is read-only.

**Fail when:** A withdrawn Quote can be approved, sent, accepted, or converted;
the withdraw reason is lost; withdrawal is not auditable.

### Stage 4 — Quote expire (sent → expired)

1. Create Quote D with the Run ID title and at least one line item.
2. Save as draft, submit for approval, approve, and send: confirm
   `draft → review → approved → sent`.
3. Set the Quote expiry time to approximately 5 minutes in the future (if the
   UI supports setting an expiry on a sent Quote; otherwise set it before
   sending).
4. Wait for the expiry time to pass.
5. Refresh the Quote detail page.
6. Confirm the status changes to `expired`.
7. Attempt to accept the expired Quote.

**Expected:**

- When the expiry time passes, the system transitions `sent → expired`.
- `expired` is a terminal state — the `Accept` action is no longer available.
- The expiry transition is recorded on the timeline with a timestamp.
- The Quote remains visible and read-only.

**Fail when:** An expired Quote can still be accepted; the expiry transition
does not trigger; the expiry is not auditable.

> Note: If the system does not support setting a custom expiry time in the UI,
> use a dev hook or configuration to set a short expiry window. Document the
> method used in the run record.

### Stage 5 — Work Order block (any state → blocked)

1. Create a Work Order (from a converted Quote or directly) with the Run ID
   title for WO A.
2. Triage the Work Order: confirm `new → triaged`.
3. Block the Work Order (`work_order.block`) with the block reason.
4. Confirm the status changes to `blocked`.
5. Verify the block reason is visible on the Work Order detail and timeline.
6. Attempt to start or complete the blocked Work Order.

**Expected:**

- `work_order.block` moves the Work Order to `blocked` from any non-terminal
  state.
- The block reason is recorded and visible on the detail page and timeline.
- A blocked Work Order cannot be started or completed.
- The timeline records the blocker actor and timestamp.

**Fail when:** A blocked Work Order can be started or completed; the block
reason is not recorded; blocking is not auditable.

### Stage 6 — Work Order cancel with Visit cascade

1. Create Work Order B with the Run ID title.
2. Triage the Work Order: confirm `new → triaged`.
3. Plan and dispatch: create a Service Visit and Assignment (`planned`).
4. Note the linked Service Visit ID.
5. Cancel the Work Order (`work_order.cancel`) with the cancel reason.
6. Confirm the Work Order status changes to `cancelled`.
7. Verify the cancel reason is visible on the detail and timeline.
8. Open the linked Service Visit and verify its status.

**Expected:**

- `work_order.cancel` moves the Work Order to `cancelled`.
- The cancel reason is recorded and visible on the Work Order detail and
  timeline.
- The related Service Visit is also cancelled (cascade).
- The Visit cancellation is auditable on the Visit timeline.
- Both the Work Order and Visit show `cancelled` consistently across detail,
  list, Planning, and My Work.

**Fail when:** The Work Order is cancelled but the related Visit remains active;
the cancel reason is not recorded; the cascade does not occur; surfaces
disagree on the cancelled state.

### Stage 7 — Work Order reopen (completed → reopened)

1. Complete a Work Order through the happy path (or use Work Order C):
   convert a Quote, triage, plan, start, execute the Visit, complete the
   Visit, and complete the Work Order.
2. Confirm the Work Order status is `completed`.
3. Reopen the Work Order (`work_order.reopen`) with the reopen reason.
4. Confirm the status changes to `reopened` (or the equivalent actionable
   state).
5. Verify the reopen reason is visible on the detail and timeline.
6. Confirm the Work Order is actionable again (e.g., can create a new Visit or
   resume work).

**Expected:**

- `work_order.reopen` moves `completed → reopened`.
- The reopen reason is recorded and visible on the detail and timeline.
- The reopened Work Order is actionable — new Visits can be created and work
  can resume.
- The timeline shows both the original completion and the reopen with actors
  and timestamps.

**Fail when:** A completed Work Order cannot be reopened; the reopen reason is
not recorded; the reopened Work Order is not actionable; reopening is not
auditable.

### Stage 8 — Visit cancel (records reason)

1. Create a Work Order, triage, and plan a Visit (Visit A).
2. Start the Work Order: confirm `planned → in_progress`.
3. Start travel on the Visit: confirm `scheduled → en_route`.
4. Cancel the Visit (`visit.cancel`) with the visit cancel reason.
5. Confirm the Visit status changes to `cancelled`.
6. Verify the cancel reason is visible on the Visit detail and timeline.
7. Open the parent Work Order and verify it reflects the cancelled Visit.

**Expected:**

- `visit.cancel` moves the Visit to `cancelled`.
- The cancel reason is recorded and visible on the Visit detail and timeline.
- The parent Work Order shows the Visit as cancelled.
- The Work Order remains `in_progress` (a cancelled Visit does not auto-complete
  or auto-cancel the Work Order).
- The cancellation is auditable.

**Fail when:** A Visit is cancelled without a reason; the parent Work Order does
not reflect the cancellation; the Work Order is auto-cancelled or auto-completed
by the Visit cancellation.

### Stage 9 — Schedule conflict detection and override

1. Log in as User A (Owner) or User C (Dispatcher).
2. Create a Work Order, triage, and plan a Visit (Visit B) for Technician David
   Park with a scheduled window of 10:00–11:00.
3. Attempt to create a second Visit (Visit C) for the same Technician with an
   overlapping window of 10:30–11:30 on the same day.
4. Observe the conflict warning.
5. If logged in as a user without `schedule.conflict.override`, confirm the
   conflicting Visit creation is blocked.
6. Log in as User C (Dispatcher with `schedule.conflict.override`).
7. Retry creating Visit C with the overlapping window and choose to override
   the conflict.
8. Confirm Visit C is created despite the overlap.

**Expected:**

- The system detects the time overlap between Visit B and Visit C for the same
  Technician.
- A conflict warning is displayed with the conflicting Visit details.
- Without `schedule.conflict.override` permission, the conflicting Visit cannot
  be created.
- With `schedule.conflict.override` permission, the Dispatcher can override the
  warning and create Visit C.
- Both Visits exist and are visible in Planning with their respective time
  windows.
- The override is auditable (the timeline or audit log records that a conflict
  was overridden).

**Fail when:** No conflict warning is shown for overlapping Visits; a user
without override permission can bypass the conflict; the override does not
create the Visit; the override is not auditable.

### Stage 10 — Premature completion guards

1. Create Work Order D, triage, and plan a Visit but do not start the Work
   Order (status is `planned`).
2. Attempt to complete the Work Order (`work_order.complete`).
3. Confirm the completion is rejected with a business-language explanation.
4. Start the Work Order: confirm `planned → in_progress`.
5. Start travel and arrive on site for the Visit.
6. Before completing the Visit (required field work not yet submitted/accepted),
   attempt to complete the Work Order.
7. Confirm the completion is rejected because the Visit is not completed.
8. Complete the required field work, submit, and complete the Visit.
9. Now attempt to complete the Work Order.
10. Confirm the completion succeeds: `in_progress → completed`.

**Expected:**

- A Work Order not in `in_progress` state cannot be completed (step 2).
- A Work Order with an incomplete (non-terminal) Visit cannot be completed
  (step 6).
- The UI explains the missing prerequisite in business language, not a raw
  error.
- After all Visits are completed or cancelled, the Work Order can be completed
  (step 9).
- Each guard rejection is auditable.

**Fail when:** A non-`in_progress` Work Order can be completed; a Work Order
with an incomplete Visit can be completed; the guard rejection message is a raw
stack trace or unhelpful; completion bypasses the Visit check.

### Stage 11 — Idempotency of duplicate operations

1. Create Quote E with at least one line item, save as draft, and submit for
   approval: confirm `draft → review`.
2. Attempt to submit the same Quote again (trigger `quote.submit` a second
   time).
3. Confirm no duplicate submission event or record is created.
4. Approve the Quote: confirm `review → approved`.
5. Attempt to approve the same Quote again (trigger `quote.approve` a second
   time).
6. Confirm no duplicate approval event or record is created.
7. Send and accept the Quote: confirm `approved → sent → accepted`.
8. Convert the accepted Quote to a Work Order: confirm one Work Order is
   created (Work Order E).
9. Attempt to convert the same accepted Quote again (trigger `quote.convert` a
   second time).
10. Confirm no duplicate Work Order is created.

**Expected:**

- A duplicate `quote.submit` on an already-submitted Quote is rejected or is a
  no-op; no duplicate timeline event is created.
- A duplicate `quote.approve` on an already-approved Quote is rejected or is a
  no-op; no duplicate timeline event is created.
- A duplicate `quote.convert` on an already-converted Quote is rejected or is a
  no-op; exactly one Work Order exists from the conversion.
- Each duplicate attempt produces a clear business-language message, not a
  silent success or a raw error.

**Fail when:** A duplicate submit creates a duplicate submission record; a
duplicate approve creates a duplicate approval event; a duplicate convert
creates a second Work Order; duplicate operations silently succeed without
indication.

### Stage 12 — Invoice void (paid Invoice cannot be voided)

1. Log in as User B (Service Supervisor) or User A (Owner).
2. Complete a Work Order (or use a previously completed one).
3. Issue Invoice A from the completed Work Order: confirm status is `issued`.
4. Issue Invoice B from another completed Work Order: confirm status is
   `issued`.
5. Create a payment request for Invoice B and pay it via Stripe Checkout using
   test card `4242 4242 4242 4242`.
6. Confirm Invoice B status changes to `paid` and `balance_due` is `0`.
7. Attempt to void Invoice B (`invoice.void`).
8. Confirm the void is rejected because the Invoice is paid.
9. Void Invoice A (`invoice.void`) which is still `issued` and unpaid.
10. Confirm Invoice A status changes to `voided`.

**Expected:**

- `invoice.void` on a paid Invoice is rejected with a business-language
  explanation.
- `invoice.void` on an unpaid `issued` Invoice succeeds: `issued → voided`.
- The void action is auditable on the Invoice timeline.
- A voided Invoice is read-only and cannot be paid or re-issued.
- The paid Invoice (Invoice B) remains `paid` and unaffected by the rejected
  void attempt.

**Fail when:** A paid Invoice can be voided; an unpaid issued Invoice cannot be
voided; the void rejection does not explain why; a voided Invoice can still be
paid; the rejected void attempt alters the paid Invoice state.

## 7. DB Spot-check

Run these queries via `sqlite3 apps/cloud/data/runory.db -header -column` after
the corresponding stage completes. Compare the DB values against what the UI
shows. Any mismatch is a P1 finding.

### After Stage 1 — Quote rejected (review → rejected)

```sql
SELECT q.status, q.rejected_reason, q.aggregate_version,
       (SELECT COUNT(*) FROM runory_runtime_audit_logs
        WHERE workspace_id = q.workspace_id AND entity_type = 'quote'
          AND entity_id = q.id AND action = 'quote.reject') AS reject_audit
FROM runory_business_quote q
WHERE id = '<quote-a-id>';
```

**Verify:** `status = rejected`; `rejected_reason` matches the reason entered
in the UI; `reject_audit = 1` (the rejection is auditable with the rejector as
actor). A missing reason or zero audit count is a P1 finding.

### After Stage 6 — Work Order cancel cascade (WO + Visit)

```sql
SELECT wo.status AS wo_status, wo.cancellation_reason,
       (SELECT status FROM runory_business_service_visit
        WHERE work_order_id = wo.id LIMIT 1) AS visit_status,
       (SELECT notes FROM runory_business_service_visit
        WHERE work_order_id = wo.id LIMIT 1) AS visit_notes
FROM runory_business_work_order wo
WHERE id = '<work-order-b-id>';
```

**Verify:** `wo_status = cancelled` and `cancellation_reason` matches the UI;
`visit_status = cancelled` (the cascade reached the related Service Visit); the
cancel reason is reflected on the visit (`visit_notes` contains the cascade
reason). Any disagreement between Work Order and Visit status is a P1 finding.

### After Stage 7 — Work Order reopen (completed → reopened)

```sql
SELECT wo.status, wo.completion_reason, wo.reopen_reason, wo.aggregate_version,
       (SELECT COUNT(*) FROM runory_runtime_audit_logs
        WHERE workspace_id = wo.workspace_id AND entity_type = 'work_order'
          AND entity_id = wo.id AND action = 'work_order.reopen') AS reopen_audit
FROM runory_business_work_order wo
WHERE id = '<work-order-c-id>';
```

**Verify:** `status = reopened`; `completion_reason` is still populated from
the original `completed` transition (reopening must not erase the original
completion record); `reopen_reason` matches the UI; `reopen_audit = 1`.

### After Stage 11 — Idempotency (single Work Order from duplicate convert)

```sql
SELECT (SELECT COUNT(*) FROM runory_business_work_order
        WHERE workspace_id = '<workspace-id>'
          AND source_type = 'quote' AND source_id = '<quote-e-id>') AS wo_from_quote,
       (SELECT aggregate_version FROM runory_business_quote
        WHERE id = '<quote-e-id>') AS quote_aggregate_version;
```

**Verify:** `wo_from_quote = 1` (exactly one Work Order exists from Quote E
despite the duplicate `quote.convert`); `quote_aggregate_version` is unchanged
from before the duplicate convert attempt (an idempotent rejection must not
bump the aggregate version). `wo_from_quote > 1` is a P0 finding (duplicate
record created).

### After Stage 12 — Invoice void (paid vs unpaid)

```sql
SELECT id, status, voided_at, balance_due_minor, amount_paid_minor
FROM runory_business_invoice
WHERE id IN ('<invoice-a-id>', '<invoice-b-id>');
```

**Verify:** Invoice A `status = void` (the DB stores `void`; the UI labels this
"voided") with `voided_at` set; Invoice B `status = paid` and unchanged — the
rejected void attempt must not have mutated the paid Invoice, and
`balance_due_minor = 0` on Invoice B. Any change to Invoice B is a P0 finding.

## 8. Cross-surface consistency matrix

Record observed values at the end of the relevant stages. Any unexplained
disagreement is a failed run even when the exception transition itself
succeeds.

| Record / Field | Detail page | List view | Planning | My Work | Timeline |
| --- | --- | --- | --- | --- | --- |
| Quote A status (rejected) | | | N/A | N/A | |
| Quote A reject reason | | | N/A | N/A | |
| Quote B status (returned → review) | | | N/A | N/A | |
| Quote C status (withdrawn) | | | N/A | N/A | |
| Quote D status (expired) | | | N/A | N/A | |
| WO A status (blocked) + reason | | | | | |
| WO B status (cancelled) + reason | | | | | |
| WO B Visit status (cancelled cascade) | | | | | |
| WO C status (reopened) | | | | | |
| Visit A status (cancelled) + reason | | | | | |
| Visit B + C overlap (conflict override) | | | | | N/A |
| WO D completion guard rejections | | | | | |
| Invoice A status (voided) | | | N/A | N/A | |
| Invoice B status (paid, void rejected) | | | N/A | N/A | |

## 9. Run record template

```markdown
### Exception Paths — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- Workspace slug/id:
- Browser:
- Roles used: Owner, Service Supervisor, Dispatcher
- Quote A id (rejected):
- Quote B id (returned/resubmitted):
- Quote C id (withdrawn):
- Quote D id (expired):
- Quote E id (idempotent convert):
- Work Order A id (blocked):
- Work Order B id (cancelled):
- Work Order C id (reopened):
- Work Order D id (completion guards):
- Work Order E id (from idempotent convert):
- Visit A id (cancelled):
- Visit B id (conflict):
- Visit C id (conflict override):
- Invoice A id (voided):
- Invoice B id (paid, void rejected):

| Stage | Result | Evidence / observed behavior | Finding |
| --- | --- | --- | --- |
| 0. Baseline and roles | PASS / FAIL | | |
| 1. Quote reject | PASS / FAIL | | |
| 2. Quote return and resubmit | PASS / FAIL | | |
| 3. Quote withdraw | PASS / FAIL | | |
| 4. Quote expire | PASS / FAIL | | |
| 5. Work Order block | PASS / FAIL | | |
| 6. Work Order cancel cascade | PASS / FAIL | | |
| 7. Work Order reopen | PASS / FAIL | | |
| 8. Visit cancel | PASS / FAIL | | |
| 9. Schedule conflict override | PASS / FAIL | | |
| 10. Premature completion guards | PASS / FAIL | | |
| 11. Idempotency | PASS / FAIL | | |
| 12. Invoice void | PASS / FAIL | | |
| Cross-surface consistency | PASS / FAIL | | |

Final decision: PASS / FAIL

Findings:

1. [P0/P1/P2/P3] <title>
   - Expected:
   - Actual:
   - Reproduction:
   - Affected record(s):
   - Owner / milestone:

Run integrity:
- No direct API/SQL mutation: YES / NO
- Identity switches documented: YES / NO
- No reset during run: YES / NO
```
