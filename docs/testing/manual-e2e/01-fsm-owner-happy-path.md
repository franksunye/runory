# Test Case 01 — FSM Owner Happy Path

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Priority | P0 |
| Primary role | Workspace Owner |
| Surface | Desktop browser |
| Prerequisite | [00 — Environment Setup](./00-test-environment-setup.md) |
| Inherited from | `fsm-owner-single-role-e2e-acceptance-runbook.md` |

## 1. Purpose

Verify that one Workspace Owner can complete the canonical Reactive Repair
journey end to end through the product UI — from Quote creation through Work
Order execution to Invoice and payment — without editing governed state,
calling APIs directly, or repairing data manually.

This is the primary product acceptance run. It answers:

> Can one authorized operator complete the full FSM commercial lifecycle
> through the supported product UI?

## 2. Scope

### 2.1 What this run proves

- The Owner can discover and operate the complete happy path.
- Quote, Work Order, Service Visit, Assignment, Schedule, form/checklist,
  evidence, service result, Invoice, and payment state remain connected.
- Governed lifecycle fields move only through named business actions.
- Required execution work cannot be silently skipped.
- Cross-surface consistency holds across detail pages, Planning, My Work, and
  related-record sections.

### 2.2 What this run does not prove

- Least-privilege role boundaries (see test case 07).
- Mobile field execution quality (see test case 05).
- External customer access (see test case 04).
- Exception paths: cancellation, return, reopen (see test case 08).

## 3. Canonical journey

```text
Quote create
  → submit for approval
  → approve
  → send to customer
  → accept
  → convert to Work Order
  → triage
  → plan and dispatch (create Visit + Assignment + Schedule)
  → start Work Order
  → start travel → arrive on site
  → complete required field work (form + evidence)
  → submit work
  → complete Visit
  → complete Work Order
  → issue Invoice
  → create payment request
  → customer pays via Stripe Checkout
  → payment confirmed
  → Invoice marked paid
```

## 4. Preconditions

- [ ] Dev server running at `http://localhost:3000`
- [ ] Demo workspace created with CRM Lite, Sales Quote, and FSM Packs installed
- [ ] Stripe CLI webhook forwarding active (`pnpm dev:stripe`)
- [ ] `.env.local` contains valid Stripe test-mode keys
- [ ] Current identity shows `Workspace Owner` or equivalent Owner role
- [ ] No database reset or manual seed repair will occur after the run begins

## 5. Test data

```text
Run ID: FSM-<YYYYMMDD>-<HHMM>
Quote title:    <Run ID> HVAC preventive maintenance
Work Order title: <Run ID> Preventive HVAC inspection
Visit title:    <Run ID> On-site inspection
Invoice note:   <Run ID> Service completed
Completion reason: <Run ID> Required inspection completed

Customer: Acme Operations (or seeded demo customer)
Contact: Maya Chen (or seeded demo contact)
Service Site: Acme Warehouse - Oakland
Asset: Warehouse HVAC Unit
Technician: David Park
Priority: Medium
Scheduled duration: 90 minutes
Payment amount: use Stripe test card 4242 4242 4242 4242
```

## 6. Execution procedure

### Stage 0 — Establish the baseline

1. Open `/w/<workspace-slug>/dashboard`.
2. Confirm the account menu identifies the Owner.
3. Open Work Orders, Quotes, Planning, and My Work to confirm all load.

**Expected:**

- Current user and role are understandable without developer tools.
- Operational surfaces are discoverable from the workspace shell.
- No console errors on any surface.

**Fail when:** Identity is ambiguous; a required surface is hidden from Owner
or fails to load.

### Stage 1 — Create a Quote

1. Navigate to Quotes (`/quotes`).
2. Choose Add/Create.
3. Enter the Run ID title and a service description.
4. Select Customer, Contact, and Service Site.
5. Add at least one quote line item (product/service, quantity, unit price).
6. Verify the quote total calculates correctly.
7. Save.

**Expected:**

- Quote is created with status `draft`.
- Quote line items show product name, quantity, and calculated line total.
- Quote total (`subtotal`, `discount_total`, `tax_total`, `grand_total`) is
  visible and correct.
- Related selectors display names, not raw IDs.

**Fail when:** Total calculation is wrong; related values are lost or shown as
raw IDs; save attempts to mutate governed status fields.

### Stage 2 — Submit and approve the Quote

1. From the Quote detail, choose `Submit for approval`.
2. Confirm the quote status changes to `review` (or equivalent pending state).
3. Choose `Approve`.
4. Confirm the quote status changes to `approved`.

**Expected:**

- `quote.submit` moves `draft → review`.
- `quote.approve` moves `review → approved`.
- The Quote timeline records who submitted and who approved, with timestamps.
- The next action is `Send` or `Mark as sent`.

**Fail when:** Status can be changed with Edit/Save instead of named actions;
approval is not auditable.

### Stage 3 — Send and accept the Quote

1. Choose `Send` (or `Mark as sent`).
2. Confirm the quote status changes to `sent`.
3. Choose `Accept` (accept on behalf of the customer).
4. Confirm the quote status changes to `accepted`.

**Expected:**

- `quote.send` moves `approved → sent`.
- `quote.accept` moves `sent → accepted`.
- The next action is `Convert to Work Order`.

**Fail when:** Acceptance is not auditable; the conversion action is not
visible after acceptance.

### Stage 4 — Convert to Work Order

1. Choose `Convert to Work Order`.
2. Confirm a new Work Order is created and linked to the Quote.
3. Open the Work Order detail page.

**Expected:**

- `quote.convert` creates exactly one Work Order.
- Work Order status defaults to `new`.
- Work Order detail shows the originating Quote, Customer, Contact, and Site.
- The next action is `Triage`.

**Fail when:** Conversion creates duplicate Work Orders; Quote context is lost;
Work Order status is editable as a generic field.

### Stage 5 — Triage the Work Order

1. Choose `Triage` from the Work Order action area.
2. Confirm or update priority, Customer, and Contact.
3. Confirm the required field-work definition is visible or can be chosen.

**Expected:**

- `work_order.triage` moves `new → triaged`.
- The UI describes the next step as planning/dispatch.
- The Work Order timeline identifies who triaged and when.

**Fail when:** Status can be changed with Edit/Save; no way to understand what
the Technician must complete.

### Stage 6 — Assign and schedule a Service Visit

1. From the Work Order, choose the product action for planning a visit.
2. Set Technician to David Park.
3. Set scheduled start and end using one coherent interaction.
4. Save/confirm.

**Expected:**

- Exactly one linked Service Visit is created.
- Exactly one active Assignment and one Schedule Entry are created.
- Work Order moves `triaged → planned` through governed planning.
- Work Order, Service Visit, Planning, My Work, and Technician context show
  the same Technician and time range.
- Repeating/retrying does not create duplicates.

**Fail when:** Assignment is only a scalar field; Work Order/Visit/Planning
disagree; the only way to plan is to manually create unrelated records.

### Stage 7 — Verify the pre-start completion guard

1. Before starting, confirm `Complete Work Order` is unavailable or rejected.

**Expected:**

- A non-`in_progress` Work Order cannot complete.
- The UI explains the missing prerequisite in business language.

**Fail when:** Work Order completion bypasses Visit or required-work checks.

### Stage 8 — Start the Work Order and Visit

1. On the Work Order, choose `Start work`.
2. Open the linked Service Visit.
3. Choose `Start travel`, then `Arrive on site`.

**Expected:**

- Work Order moves `planned → in_progress`.
- Visit moves `scheduled → en_route → on_site`.
- Timeline events identify the Owner actor.
- An `in_progress` Work Order with an incomplete Visit rejects completion.

**Fail when:** Owner execution silently changes the assigned Technician;
actual time fields must be manually edited.

### Stage 9 — Complete required field work

1. From the Service Visit, open the bound execution checklist/form.
2. Complete every required checklist item and reading.
3. Add the required note, evidence attachment, and sign-off.
4. Submit the work.

**Expected:**

- Required vs optional work is visually clear.
- Draft answers persist during navigation/reload.
- Submission is immutable/versioned.
- Evidence remains associated with this Visit.
- `visit.submit_work` does not pretend the Visit is completed.

**Fail when:** No execution form for the new Visit; required items can be
omitted; Owner must navigate through Workflow internals to proceed.

### Stage 10 — Complete the Service Visit

1. Choose `Complete visit`.
2. Confirm the Visit detail and related service result/report.

**Expected:**

- Submitted-but-unaccepted required forms block completion.
- Accepted required work allows `on_site → completed`.
- Actual end time is recorded automatically.
- Service result is human-readable and linked to Work Order, Visit,
  Technician, Customer, Site, Asset, evidence, and completion time.

**Fail when:** A Visit with no required execution artifact can pass; completion
leaves an active assignment or schedule state.

### Stage 11 — Complete the Work Order

1. Return to the Work Order.
2. Choose `Complete` and enter the Run ID completion reason.
3. Confirm the detail page, list, Planning, My Work, and timeline.

**Expected:**

- `work_order.complete` moves `in_progress → completed`.
- `completed_at` and completion reason are recorded.
- The completed job no longer appears as active work in My Work or Planning.
- History remains discoverable.
- Refreshing the browser preserves the same result.

**Fail when:** Completion is a generic status edit; active-work surfaces still
treat the completed job as actionable; related links disappear.

### Stage 12 — Issue an Invoice

1. From the completed Work Order (or the Quotes/Invoices area), choose
   `Issue Invoice` or navigate to the Invoice creation path.
2. Confirm the Invoice is created from the Work Order/Quote snapshot.
3. Verify Invoice line items, totals, and customer details.
4. Choose `Issue` to make the Invoice official.

**Expected:**

- `invoice.issue` creates an official Invoice with a snapshot of the
  completed work.
- Invoice shows line items, `subtotal`, `discount_total`, `tax_total`,
  `grand_total`, and `balance_due`.
- Invoice status is `issued` or `open`.
- Invoice is linked to the originating Work Order and Customer.

**Fail when:** Invoice cannot be created from a completed Work Order; Invoice
totals are incorrect; Invoice is not linked to its source records.

### Stage 13 — Create a payment request

1. From the Invoice detail, choose `Request Payment` or `Create Payment Link`.
2. Confirm the payment request is created.
3. Open the generated Stripe Checkout URL.

**Expected:**

- Payment request is created with the correct amount and currency.
- Stripe Checkout page loads with the Invoice amount.
- Payment request status is `pending` or `open`.

**Fail when:** Payment amount does not match Invoice balance; Checkout URL is
not generated; currency is wrong.

### Stage 14 — Complete payment via Stripe Checkout

1. On the Stripe Checkout page, enter test card `4242 4242 4242 4242`.
2. Use any future expiry date and any CVC.
3. Submit payment.
4. Return to the Runory Invoice detail page and refresh.

**Expected:**

- Stripe Checkout shows payment successful.
- The Invoice detail page reflects `paid` status (or `partially_paid` if
  partial).
- Payment record shows the provider payment ID, amount, and timestamp.
- Invoice `balance_due` updates to `0` for full payment.
- The Invoice timeline records the payment event.

**Fail when:** Webhook does not update Invoice status; payment record is
missing; Invoice balance is not updated; duplicate payment records appear.

## 7. DB Spot-check

Run these queries via `sqlite3 apps/cloud/data/runory.db -header -column` after
the corresponding stage completes. Compare the DB values against what the UI
shows. Any mismatch is a P1 finding.

### After Stage 1 — Quote created (draft)

```sql
SELECT id, status, aggregate_version, subtotal, discount_total, tax_total,
       grand_total, currency, created_at
FROM runory_business_quote
WHERE id = '<quote-id>';
```

**Verify:** `status='draft'` and `aggregate_version=1`; the four monetary
fields (`subtotal`, `discount_total`, `tax_total`, `grand_total`) match the
Quote detail page.

### After Stage 2 — Quote approved

```sql
SELECT id, status, aggregate_version, approved_at, updated_at
FROM runory_business_quote
WHERE id = '<quote-id>';
```

**Verify:** `status='approved'`; `aggregate_version` has incremented by at
least 1 since Stage 1; `approved_at` and `updated_at` are newer than the
submission timestamp.

### After Stage 4 — Convert to Work Order

```sql
SELECT wo.id AS work_order_id, wo.status AS work_order_status,
       wo.source_type, wo.source_id,
       q.status AS quote_status, q.work_order_id,
       q.aggregate_version AS quote_version
FROM runory_business_work_order wo
LEFT JOIN runory_business_quote q ON q.id = wo.source_id
WHERE wo.source_type = 'quote' AND wo.source_id = '<quote-id>';
```

**Verify:** Exactly one Work Order row exists with `source_type='quote'` and
`source_id=<quote-id>`; the Quote row shows `status='converted'` and
`work_order_id` points at the new Work Order.

### After Stage 6 — Plan and dispatch (Visit + Assignment + Schedule)

```sql
SELECT sv.id AS visit_id, sv.status AS visit_status, sv.technician_id,
       sv.assignment_id, sv.schedule_entry_id,
       a.status AS assignment_status, a.resource_id AS assigned_resource,
       se.status AS schedule_status, se.start_at, se.end_at
FROM runory_business_service_visit sv
LEFT JOIN runory_runtime_assignments a ON a.id = sv.assignment_id
LEFT JOIN runory_runtime_schedule_entries se ON se.id = sv.schedule_entry_id
WHERE sv.work_order_id = '<work-order-id>';
```

**Verify:** One Service Visit, one Assignment, and one Schedule Entry exist
and are mutually linked (`assignment_id` and `schedule_entry_id` on the Visit
are non-null); `assigned_resource` matches the Technician shown in Planning
and My Work; statuses are pre-start (e.g. `scheduled` / `assigned`).

### After Stage 11 — Complete Work Order

```sql
SELECT wo.id, wo.status AS work_order_status, wo.completion_reason,
       wo.completed_at, wo.aggregate_version,
       sv.id AS visit_id, sv.status AS visit_status,
       sv.completed_at AS visit_completed_at,
       se.status AS schedule_status
FROM runory_business_work_order wo
LEFT JOIN runory_business_service_visit sv ON sv.work_order_id = wo.id
LEFT JOIN runory_runtime_schedule_entries se ON se.id = sv.schedule_entry_id
WHERE wo.id = '<work-order-id>';
```

**Verify:** Work Order `status='completed'` with `completion_reason` and
`completed_at` set; the linked Service Visit and Schedule Entry are also
`completed`.

### After Stage 14 — Payment complete

```sql
SELECT i.id AS invoice_id, i.status AS invoice_status, i.total_minor,
       i.balance_due_minor, i.amount_paid_minor, i.paid_at,
       p.id AS payment_id, p.status AS payment_status, p.amount_minor,
       p.provider_payment_id, p.succeeded_at
FROM runory_business_invoice i
LEFT JOIN runory_business_payment_request pr
       ON pr.source_object_type = 'invoice' AND pr.source_object_id = i.id
LEFT JOIN runory_business_payment p ON p.payment_request_id = pr.id
WHERE i.id = '<invoice-id>';
```

**Verify:** Invoice `status='paid'`, `balance_due_minor=0`, and
`amount_paid_minor=total_minor`; Payment `status='succeeded'` with
`provider_payment_id` and `succeeded_at` set.

## 8. Cross-surface consistency matrix

Record observed values at the end of Stages 6, 11, and 14.

| Field | Quote | Work Order | Service Visit | Planning | My Work | Invoice | Payment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Customer | | | | N/A | | | |
| Site | | | | | N/A | N/A | N/A |
| Technician | N/A | | | | | N/A | N/A |
| Scheduled time | N/A | | | | | N/A | N/A |
| Status | | | | | | | |
| Amount | | N/A | N/A | N/A | N/A | | |
| Completion | | | | | | N/A | N/A |

Any unexplained disagreement is a failed run even when the Work Order reaches
`completed` and the Invoice reaches `paid`.

## 9. Run record template

```markdown
### FSM Owner Happy Path — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- Workspace slug/id:
- Browser:
- Identity shown:
- Quote id:
- Work Order id:
- Service Visit id:
- Invoice id:
- Payment id:

| Stage | Result | Evidence / observed behavior | Finding |
| --- | --- | --- | --- |
| 0. Baseline | PASS / FAIL | | |
| 1. Create Quote | PASS / FAIL | | |
| 2. Submit and approve | PASS / FAIL | | |
| 3. Send and accept | PASS / FAIL | | |
| 4. Convert to Work Order | PASS / FAIL | | |
| 5. Triage | PASS / FAIL | | |
| 6. Assign and schedule | PASS / FAIL | | |
| 7. Completion guards | PASS / FAIL | | |
| 8. Start execution | PASS / FAIL | | |
| 9. Required field work | PASS / FAIL | | |
| 10. Complete Visit | PASS / FAIL | | |
| 11. Complete Work Order | PASS / FAIL | | |
| 12. Issue Invoice | PASS / FAIL | | |
| 13. Create payment request | PASS / FAIL | | |
| 14. Complete payment | PASS / FAIL | | |
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
- No identity switching: YES / NO
- No reset during run: YES / NO
```
