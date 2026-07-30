# Test Case 02 — Quote Commercial Loop

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Priority | P0 |
| Primary roles | Sales Representative → Sales Manager → Owner |
| Surface | Desktop browser |
| Prerequisite | [00 — Environment Setup](./00-test-environment-setup.md) |

## 1. Purpose

Verify the complete Quote commercial lifecycle through multi-role interaction:
a Sales Representative creates and submits a Quote, a Sales Manager approves
or rejects it, and the Owner sends and accepts it on behalf of the customer.
This deep-dives into Quote-specific behavior that test case 01 covers only as
part of the end-to-end smoke path.

## 2. Scope

### 2.1 What this run proves

- Sales Representative can create, edit, and submit a Quote but cannot approve.
- Sales Manager can approve, reject, or return a submitted Quote.
- Quote revision and snapshot lineage is preserved.
- Price book items and server-side calculations are correct.
- Quote status transitions are governed and auditable.
- Accepted Quote can be converted to a Work Order.

### 2.2 What this run does not prove

- Full Work Order execution (see test case 01).
- Invoice and payment (see test case 03).
- External customer self-service acceptance (see test case 04).

## 3. Authoritative state paths

```text
draft
  -- quote.submit --> review
  -- quote.approve --> approved
  -- quote.reject --> rejected
  -- quote.return --> returned (to draft for revision)
  -- quote.withdraw --> withdrawn

approved
  -- quote.send --> sent
  -- quote.accept --> accepted
  -- quote.convert --> converted (creates Work Order)
```

## 4. Preconditions

- [ ] Dev server running
- [ ] Demo workspace with Sales Quote Pack installed
- [ ] Price Book items seeded (or create them during the test)
- [ ] At least two test users assigned:
  - User A: `sales_representative` role
  - User B: `sales_manager` role
- [ ] Owner identity available for acceptance step

## 5. Test data

```text
Run ID: QUOTE-<YYYYMMDD>-<HHMM>
Quote title: <Run ID> Commercial HVAC service proposal
Customer: Acme Operations
Contact: Maya Chen
Line item 1: HVAC Inspection (qty 1, unit price from price book)
Line item 2: Filter Replacement (qty 2, unit price from price book)
Discount: 10% on line item 2
```

## 6. Execution procedure

### Stage 0 — Establish role identities

1. Log in as User A (Sales Representative).
2. Confirm the account menu shows the Sales Representative role.
3. Verify Quotes navigation is visible.
4. Log out and log in as User B (Sales Manager).
5. Confirm the account menu shows the Sales Manager role.
6. Log out and log in as Owner.

**Expected:** Each role is visible without developer tools. All three can see
the Quotes list.

**Fail when:** Role identity is ambiguous; a role cannot access Quotes.

### Stage 1 — Sales Rep creates a Quote (as User A)

1. Log in as User A (Sales Representative).
2. Navigate to Quotes, choose Create.
3. Enter the Run ID title and description.
4. Select Customer, Contact, and Service Site.
5. Add line item 1 from the Price Book (search/select product).
6. Add line item 2 from the Price Book.
7. Set quantity 2 on line item 2.
8. Apply a 10% discount on line item 2.
9. Save as draft.

**Expected:**

- Price Book selection populates unit price automatically.
- Line totals calculate: `qty × unit_price − discount`.
- Quote totals display: `subtotal`, `discount_total`, `tax_total`,
  `grand_total`.
- Status defaults to `draft`.
- All related selectors show names, not raw IDs.

**Fail when:** Price Book does not populate price; totals are incorrect;
discount is not reflected in `discount_total`.

### Stage 2 — Sales Rep edits the draft

1. Reopen the Quote.
2. Change the quantity on line item 1 to 2.
3. Add a new line item 3 (manual entry, not from Price Book).
4. Save.
5. Reload the page.

**Expected:**

- Changes persist after reload.
- Totals recalculate with the new quantities.
- Manual line item entry works alongside Price Book items.
- Draft state allows free editing of line items.

**Fail when:** Changes are lost on reload; totals do not update; manual line
items cannot be added.

### Stage 3 — Sales Rep submits for approval

1. From the Quote detail, choose `Submit for approval`.
2. Confirm the status changes to `review`.
3. Attempt to edit a line item.

**Expected:**

- `quote.submit` moves `draft → review`.
- Submitted Quote is read-only (line items cannot be edited while in review).
- The Quote timeline records the submission with actor and timestamp.
- The next available action depends on role (see Stage 4).

**Fail when:** A submitted Quote can still be freely edited; submission is not
auditable.

### Stage 4 — Sales Rep cannot approve (permission boundary)

1. While still logged in as User A (Sales Representative), look for an
   `Approve` action on the submitted Quote.

**Expected:**

- The `Approve` action is not visible or is disabled for Sales Representative.
- No workaround allows the Rep to approve their own Quote.

**Fail when:** A Sales Representative can approve a Quote (P1 finding).

### Stage 5 — Sales Manager approves (as User B)

1. Log out and log in as User B (Sales Manager).
2. Navigate to Quotes and find the submitted Quote.
3. Choose `Approve`.

**Expected:**

- `quote.approve` moves `review → approved`.
- The timeline records the Manager as the approver with timestamp.
- The Quote is now read-only for line items.
- The next action is `Send`.

**Fail when:** Manager cannot approve; approval is not auditable.

### Stage 6 — Sales Manager returns a Quote (negative path)

1. Create a second Quote as User A and submit it.
2. Log in as User B (Sales Manager).
3. Choose `Return` instead of `Approve`.
4. Enter a return reason.

**Expected:**

- `quote.return` moves `review → returned`.
- The return reason is visible on the Quote detail and timeline.
- The original submitter (User A) can now edit and resubmit.

**Fail when:** Return reason is lost; the returned Quote cannot be resubmitted.

### Stage 7 — Sales Rep resubmits a returned Quote (as User A)

1. Log in as User A.
2. Open the returned Quote.
3. Make a correction based on the return reason.
4. Resubmit for approval.

**Expected:**

- The returned Quote is editable again.
- Resubmission moves `returned → review`.
- The timeline shows both the return and the resubmission.

**Fail when:** A returned Quote cannot be edited or resubmitted.

### Stage 8 — Owner sends and accepts

1. Log in as Owner.
2. Open the approved Quote (from Stage 5).
3. Choose `Send` (mark as sent to customer).
4. Choose `Accept` (accept on behalf of the customer).

**Expected:**

- `quote.send` moves `approved → sent`.
- `quote.accept` moves `sent → accepted`.
- Both actions are auditable with actor and timestamp.
- The next action is `Convert to Work Order`.

**Fail when:** Send or accept is not available; acceptance is not auditable.

### Stage 9 — Convert to Work Order

1. From the accepted Quote, choose `Convert to Work Order`.
2. Confirm the Work Order is created.
3. Open the Work Order detail.
4. Return to the Quote detail and verify the link.

**Expected:**

- `quote.convert` creates exactly one Work Order.
- Work Order is linked to the Quote (visible on both detail pages).
- Quote status shows `converted`.
- Work Order status defaults to `new`.

**Fail when:** Conversion creates duplicates; Quote-to-Work-Order link is
missing; Quote status does not update.

### Stage 10 — Quote withdrawal (negative path)

1. Create a third Quote as User A and submit it.
2. Before approval, withdraw the Quote.

**Expected:**

- `quote.withdraw` moves `review → withdrawn`.
- A withdrawn Quote cannot be approved or accepted.
- The withdrawal is auditable.

**Fail when:** A withdrawn Quote can still be approved; withdrawal is not
auditable.

## 7. DB Spot-check

Run these queries via `sqlite3 apps/cloud/data/runory.db -header -column` after
the corresponding stage completes. Compare the DB values against what the UI
shows. Any mismatch is a P1 finding.

### After Stage 1 — Quote created with lines

```sql
SELECT ql.id, ql.description, ql.quantity, ql.unit_price, ql.discount_amount,
       ql.line_total,
       q.status, q.aggregate_version, q.subtotal, q.discount_total,
       q.tax_total, q.grand_total
FROM runory_business_quote q
LEFT JOIN runory_business_quote_line ql ON ql.quote_id = q.id
WHERE q.id = '<quote-id>';
```

**Verify:** Line items exist with the expected `quantity` and `unit_price`,
and each `line_total` is correct; the Quote totals (`subtotal`,
`discount_total`, `tax_total`, `grand_total`) match the UI; `status='draft'`.

### After Stage 3 — Quote submitted for approval

```sql
SELECT q.status, q.aggregate_version, q.updated_at,
       ce.command_type, ce.actor_id, ce.status AS cmd_status, ce.created_at
FROM runory_business_quote q
LEFT JOIN runory_runtime_command_executions ce
       ON ce.aggregate_type = 'quote' AND ce.aggregate_id = q.id
      AND ce.command_type = 'quote.submit_for_approval'
WHERE q.id = '<quote-id>';
```

**Verify:** `status='review'` and `aggregate_version` has incremented since
Stage 1; a `quote.submit_for_approval` command execution row exists (the
`quote.submit` audit entry) with `cmd_status` reflecting success.

### After Stage 5 — Sales Manager approved

```sql
SELECT q.status, q.approved_at, q.aggregate_version,
       ce.command_type, ce.actor_id, ce.created_at
FROM runory_business_quote q
LEFT JOIN runory_runtime_command_executions ce
       ON ce.aggregate_type = 'quote' AND ce.aggregate_id = q.id
      AND ce.command_type = 'quote.approve'
WHERE q.id = '<quote-id>';
```

**Verify:** `status='approved'` and `approved_at` is set; the joined
`quote.approve` command execution exists and its `actor_id` matches the Sales
Manager (User B), not the Sales Representative who submitted.

### After Stage 6 — Quote returned

```sql
SELECT q.status, q.aggregate_version,
       ce.command_type, ce.actor_id, ce.created_at
FROM runory_business_quote q
LEFT JOIN runory_runtime_command_executions ce
       ON ce.aggregate_type = 'quote' AND ce.aggregate_id = q.id
      AND ce.command_type = 'quote.return_for_changes'
WHERE q.id = '<quote-id>';
```

**Verify:** The Quote reflects the returned state and is editable again; a
`quote.return_for_changes` command execution exists (the `quote.return` audit
entry).

### After Stage 9 — Convert to Work Order

```sql
SELECT q.status AS quote_status, q.work_order_id, q.aggregate_version,
       (SELECT COUNT(*) FROM runory_business_work_order wo
        WHERE wo.source_type = 'quote' AND wo.source_id = q.id) AS work_order_count
FROM runory_business_quote q
WHERE q.id = '<quote-id>';
```

**Verify:** Exactly one Work Order was created (`work_order_count=1`);
`work_order_id` is set; Quote `status='converted'`.

### After Stage 10 — Withdrawal

```sql
SELECT q.status, q.withdrawn_at, q.aggregate_version,
       (SELECT COUNT(*) FROM runory_business_work_order wo
        WHERE wo.source_type = 'quote' AND wo.source_id = q.id) AS work_order_count
FROM runory_business_quote q
WHERE q.id = '<quote-id>';
```

**Verify:** `status='withdrawn'` and `withdrawn_at` is set;
`work_order_count=0` (no Work Order was created from this withdrawn Quote).

## 8. Cross-surface consistency checks

| Field | Quote detail | Quote list | Work Order (after convert) | Timeline |
| --- | --- | --- | --- | --- |
| Customer | | | | N/A |
| Status | | | N/A | |
| Grand total | | | N/A | N/A |
| Line items | | | N/A | N/A |
| Approver | | | N/A | |
| Conversion link | | | | |

## 9. Run record template

```markdown
### Quote Commercial Loop — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- Workspace slug/id:
- Browser:
- Roles used: Sales Rep, Sales Manager, Owner
- Quote 1 id (approved): 
- Quote 2 id (returned): 
- Quote 3 id (withdrawn): 
- Work Order id (from conversion): 

| Stage | Result | Evidence | Finding |
| --- | --- | --- | --- |
| 0. Role identities | PASS / FAIL | | |
| 1. Rep creates Quote | PASS / FAIL | | |
| 2. Rep edits draft | PASS / FAIL | | |
| 3. Rep submits | PASS / FAIL | | |
| 4. Rep cannot approve | PASS / FAIL | | |
| 5. Manager approves | PASS / FAIL | | |
| 6. Manager returns | PASS / FAIL | | |
| 7. Rep resubmits | PASS / FAIL | | |
| 8. Owner sends/accepts | PASS / FAIL | | |
| 9. Convert to Work Order | PASS / FAIL | | |
| 10. Withdrawal | PASS / FAIL | | |
| Cross-surface consistency | PASS / FAIL | | |

Final decision: PASS / FAIL

Findings:
1. [P0/P1/P2/P3] <title>
   - Expected:
   - Actual:
   - Reproduction:
   - Owner / milestone:

Run integrity:
- No direct API/SQL mutation: YES / NO
- Identity switches documented: YES / NO
- No reset during run: YES / NO
```
