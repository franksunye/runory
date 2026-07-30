# Quote Commercial Loop — QUOTE-20260730-1800

- Date/time: 2026-07-30 18:00–18:11 (UTC+8)
- Reviewer: Automated E2E (dev persona switching)
- Branch/commit: main (post eb4c6db7)
- Workspace slug/id: demo-workspace-7343c5763a
- Environment: dev
- Browser: Chrome (headless automation)
- Evidence layer: API business walkthrough
- Roles used: Sales Rep (Sarah Chen), Sales Manager (Michael Torres), Owner
- Quote 1 id (approved): rec_31b664fb-05ce-4ca3-8c39-0d3c8ee4e5ea
- Quote 2 id (returned): N/A (not tested)
- Quote 3 id (withdrawn): N/A (not tested)
- Work Order id (from conversion): wo_a24657c3-14b0-487e-93c9-3315be7c6bd8

## Run record

| Stage | Result | Evidence | Finding |
| --- | --- | --- | --- |
| 0. Role identities | PASS | Persona switching confirmed via /api/dev/persona; Sarah Chen and Michael Torres avatars visible | — |
| 1. Rep creates Quote | PASS (with findings) | Quote rec_31b664fb created, status=draft, subtotal=250, discount=10, total=260 | F1, F2, F5, F6 |
| 2. Rep edits draft | SKIPPED | No line items section available to edit | F1 |
| 3. Rep submits | PASS | status changed draft→in_review, aggregate_version=2, quote.submit_for_approval cmd succeeded | — |
| 4. Rep cannot approve | PASS | No Approve button visible for Sales Rep role | — |
| 5. Manager approves | PASS | status changed in_review→approved, aggregate_version=3, actor=Sales Manager | F8 |
| 6. Manager returns | NOT TESTED | — | — |
| 7. Rep resubmits | NOT TESTED | — | — |
| 8. Owner sends/accepts | PASS (with findings) | status: approved→sent→accepted, aggregate_version=5, accepted_at set | F3 |
| 9. Convert to Work Order | PASS (with findings) | WO created (wo_a24657c3), work_order_count=1, source linked | F4, F7 |
| 10. Withdrawal | NOT TESTED | — | — |
| Cross-surface consistency | PASS (with findings) | DB spot-checks confirm state transitions and command audit chain | F5, F6 |

Final decision: FAIL — Core lifecycle verified but suite contract not met: 1 required stage SKIPPED (Stage 2), 3 required stages NOT TESTED (Stages 6, 7, 10), and 4 unresolved P1 findings (F1–F4). Per E2E README §4, PASS requires every required stage to pass and zero P0/P1 findings. This record is retained as discovery evidence, not release-acceptance evidence.

## Findings

### F1. [P1] Quote creation form lacks line items section
- Expected: Form should include a line items section with Price Book item search/select, quantity, discount, and automatic line total calculation
- Actual: Form only has manual amount entry fields (subtotal, discount, tax, total). Related Quote Lines section shows "0 records" after creation
- Reproduction: Navigate to /w/{slug}/quotes/new — no line item UI present
- Impact: Users cannot add Price Book items; automatic price population and calculation are missing; test case Stages 1-2 (line item editing) cannot be executed
- Owner: Frontend / quote module

### F2. [P1] Number input fields have step validation issues
- Expected: Amount fields should accept decimal values (e.g., 260.40) for currency amounts
- Actual: Tax Amount field rejected integer "20" with stepMismatch (closest valid: 19.4, 20.4); Total Amount rejected "260.40" (closest valid: 260, 261)
- Reproduction: Enter "260.40" in Total Amount field — browser shows validation error
- Impact: Users cannot save quotes with standard decimal currency amounts; workarounds required
- Owner: Frontend form schema

### F3. [P1] Business action buttons don't refresh after state transition
- Expected: Action buttons should update immediately after a command execution (e.g., "Accept" appears after "Mark as sent")
- Actual: After clicking "Mark as sent", the Accept button did not appear until manual page reload
- Reproduction: Click any business action button (Mark as sent, Accept, etc.) — new action buttons don't appear without refresh
- Impact: Poor UX; users must manually refresh to see next available actions; may cause confusion about available operations
- Owner: Frontend / ObjectDetailPage component

### F4. [P1] Quote status not updated to "converted" after Work Order conversion
- Expected: quote.convert_to_work_order should transition status from "accepted" to "converted" per the test case state path
- Actual: Command contract defines operation as "action" (not "transition"); quote status remains "accepted" after conversion
- Reproduction: Convert an accepted quote to work order — check quote status in DB, still "accepted"
- Impact: Quote status doesn't reflect conversion; violates test case state path; downstream logic depending on "converted" status will fail
- Owner: Platform core / quote-commands

### F5. [P2] Combobox selectors show raw database IDs immediately after selection
- Expected: All related selectors should show display names, not raw IDs
- Actual: After selecting a company/contact/site, the combobox briefly shows the raw record ID (e.g., "rec_657c757e...") before re-rendering to show the display name
- Reproduction: Select any associated entity in the quote form — observe raw ID flash in the input field
- Impact: Exposes internal database IDs to users; poor UX; violates test case expectation "All related selectors show names, not raw IDs"
- Owner: Frontend / combobox component

### F6. [P2] Tax Amount value not persisted to database
- Expected: Tax Amount (20.4) entered in the form should be saved to the quote record
- Actual: tax_total field is NULL in database despite UI showing the value "20.4"
- Reproduction: Create a quote with tax amount — check runory_business_quote.tax_total in DB
- Impact: Quote totals are incomplete; grand_total calculation may be incorrect
- Owner: Frontend form submission / metadata API

### F7. [P2] Service Site not transferred from quote to work order
- Expected: Work order should inherit service_site_id from the quote during conversion
- Actual: service_site_id is NULL on the created work order (wo_a24657c3)
- Reproduction: Convert a quote with a selected service site to work order — check work order's service_site_id
- Impact: Work order is missing location information; technician dispatch may be affected
- Owner: FSM module / convertToWorkOrder command

### F8. [P3] Duplicate action buttons in UI
- Expected: Each action should appear once in the UI
- Actual: Delete, Approve, and Reject buttons appear twice — once in "Business actions" section and once in "Work Items" section
- Reproduction: Open any quote detail page — observe duplicate buttons
- Impact: Confusing UI; potential for unintended duplicate actions
- Owner: Frontend / ObjectDetailPage component

## Run integrity
- No direct API/SQL mutation: YES (all actions through product UI)
- Identity switches documented: YES (Sales Rep → Sales Manager → Owner via /api/dev/persona)
- No reset during run: YES

## DB Spot-check results

### After Stage 1 — Quote created
```
status=draft, aggregate_version=1, subtotal=250.0, discount_total=10.0, grand_total=260.0
tax_total=NULL (Finding F6)
company_id=rec_657c757e (Acme Operations) ✓
contact_id=rec_952400ae (Maya Chen) ✓
service_site_id=rec_c50d4e81 (Acme HQ) ✓
```

### After Stage 3 — Quote submitted
```
status=in_review, aggregate_version=2
quote.submit_for_approval cmd: succeeded, actor=usr_f5f1d97b (Sarah Chen)
```

### After Stage 5 — Sales Manager approved
```
status=approved, aggregate_version=3, approved_at=2026-07-30T10:07:09.548Z
quote.approve cmd: succeeded, actor=usr_e561a3c9 (Michael Torres — NOT the Sales Rep)
```

### After Stage 8 — Owner sent and accepted
```
status=sent→accepted, aggregate_version=5, accepted_at=2026-07-30T10:10:24.408Z
quote.mark_sent cmd: succeeded, actor=Owner
quote.accept cmd: succeeded, actor=Owner
```

### After Stage 9 — Convert to Work Order
```
quote_status=accepted (should be "converted" — Finding F4)
work_order_id=wo_a24657c3 ✓
work_order_count=1 ✓
aggregate_version=6
WO: WO-20260730-BE7C6BD8, status=new, source_type=quote, source_id linked ✓
WO service_site_id=NULL (Finding F7)
```

## Command execution audit chain

| # | Command | Actor | Status | Timestamp |
| --- | --- | --- | --- | --- |
| 1 | quote.submit_for_approval | Sarah Chen (Sales Rep) | succeeded | 10:05:53 |
| 2 | quote.approve | Michael Torres (Sales Manager) | succeeded | 10:07:09 |
| 3 | quote.mark_sent | Owner | succeeded | 10:08:18 |
| 4 | quote.accept | Owner | succeeded | 10:10:24 |
| 5 | quote.convert_to_work_order | Owner | succeeded | 10:10:58 |
