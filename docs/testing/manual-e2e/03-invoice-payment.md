# Test Case 03 — Invoice and Payment

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Priority | P0 |
| Primary roles | Service Supervisor → Customer (via Stripe) |
| Surface | Desktop browser + Stripe Checkout |
| Prerequisite | [00 — Environment Setup](./00-test-environment-setup.md), Stripe sandbox configured |

## 1. Purpose

Verify the complete financial closure loop: a completed Work Order becomes
an issued Invoice, a payment request generates a Stripe Checkout link, the
customer pays with a test card, the webhook updates Invoice and Payment
status, and a refund can be processed. Also verify payment reconciliation.

## 2. Scope

### 2.1 What this run proves

- A completed Work Order can produce an official Invoice.
- Invoice line items snapshot the originating Quote/Work Order.
- Payment request creates a Stripe Checkout session with correct amount.
- Stripe webhook updates Payment and Invoice status in real time.
- Full and partial refunds work through governed commands.
- Payment reconciliation compares Runory state with provider snapshot.
- Replayed provider events are idempotent.

### 2.2 What this run does not prove

- SaaS subscription billing (organization-level billing is separate).
- Stripe Connect onboarding (requires registered Connect account).
- Customer self-service payment via access portal (see test case 04).

## 3. Preconditions

- [ ] Stripe CLI webhook forwarding active (`pnpm dev:stripe`)
- [ ] `.env.local` contains valid `STRIPE_SECRET_KEY=sk_test_...`
- [ ] `STRIPE_PAYMENT_MODE=test`
- [ ] A completed Work Order exists (from test case 01 or created fresh)
- [ ] Service Supervisor role available for Invoice issuance

## 4. Test data

```text
Run ID: PAY-<YYYYMMDD>-<HHMM>
Invoice note: <Run ID> HVAC preventive maintenance service
Payment test card: 4242 4242 4242 4242
Decline test card: 4000 0000 0000 0002
Refund reason: customer requested cancellation
```

## 6. Execution procedure

### Stage 0 — Verify Stripe connectivity

1. Open a terminal and confirm the Stripe CLI listener is forwarding events.
2. Open `/w/<slug>/billing` in the browser and confirm no Stripe config errors.
3. Verify the workspace shows Stripe test mode is active.

**Expected:** Stripe listener shows `Ready!` and is forwarding to
`localhost:3000/api/integrations/stripe/webhook`.

**Fail when:** Stripe listener is not running; webhook secret is missing.

### Stage 1 — Issue an Invoice from a completed Work Order

1. Log in as Owner or Service Supervisor.
2. Open the completed Work Order from test case 01 (or complete a new one).
3. Choose `Issue Invoice` from the Work Order detail.
4. Review the Invoice draft: line items, quantities, unit prices, totals.
5. Confirm `subtotal`, `discount_total`, `tax_total`, `grand_total`.
6. Choose `Issue` to make it official.

**Expected:**

- `invoice.issue` creates an Invoice with status `issued` or `open`.
- Line items snapshot the originating Work Order/Quote data.
- Invoice `balance_due` equals `grand_total`.
- Invoice is linked to the Work Order and Customer.

**Fail when:** Invoice cannot be created from a non-completed Work Order;
totals are incorrect; `balance_due` does not match `grand_total`.

### Stage 2 — Create a payment request

1. From the Invoice detail, choose `Request Payment` or `Send Payment Link`.
2. Confirm the amount matches the Invoice `balance_due`.
3. Confirm the currency is correct (USD or configured currency).
4. Copy the generated Checkout URL.

**Expected:**

- Payment request is created with status `pending`.
- The Checkout URL points to Stripe Checkout (`checkout.stripe.com`).
- Payment amount equals Invoice `balance_due`.
- Payment record is linked to the Invoice.

**Fail when:** Amount does not match Invoice balance; Checkout URL is not
generated; currency is wrong.

### Stage 3 — Complete payment via Stripe Checkout

1. Open the Checkout URL in a new tab.
2. Enter card number `4242 4242 4242 4242`.
3. Enter any future expiry date and any CVC.
4. Enter the customer name and email if prompted.
5. Click `Pay`.
6. Return to the Runory Invoice detail page and refresh.

**Expected:**

- Stripe Checkout shows `Payment successful`.
- Runory Invoice status changes to `paid`.
- `balance_due` updates to `0`.
- Payment record shows: provider payment ID, amount, currency, status
  `succeeded`, and timestamp.
- Invoice timeline records the payment event with actor and timestamp.
- The Stripe CLI terminal shows the webhook event being forwarded.

**Fail when:** Webhook does not update Invoice status; payment record is
missing; Invoice balance is not updated; duplicate payment records appear.

### Stage 4 — Verify payment record details

1. Open the Payment record (from Invoice detail or a Payments list).
2. Verify all fields: amount, currency, provider, provider payment ID,
   status, created/updated timestamps.
3. Check that the payment is linked to the Invoice and Customer.

**Expected:**

- Payment status is `succeeded`.
- Provider account is correctly identified.
- No sensitive data (card number, CVC) is stored or displayed.
- Payment is linked to Invoice and Customer records.

**Fail when:** Sensitive card data is visible; payment is not linked;
timestamps are missing.

### Stage 5 — Process a full refund

1. From the Payment record, choose `Refund`.
2. Enter the full amount for refund.
3. Enter refund reason: `customer requested cancellation`.
4. Confirm the refund.

**Expected:**

- Refund record is created with status `processing`.
- The Stripe CLI terminal shows `refund.created` and `refund.succeeded`
  events.
- After webhook processing, refund status changes to `succeeded`.
- Payment status changes to `refunded`.
- Invoice `balance_due` is restored to the original amount (refund reversal).
- Invoice timeline records the refund event.

**Fail when:** Refund cannot be created; webhook does not update refund
status; Invoice balance is not restored; refund amount is wrong.

### Stage 6 — Verify refund record

1. Open the refund record.
2. Verify: amount, reason, status, timestamp, and link to the original
   payment.

**Expected:**

- Refund status is `succeeded`.
- Refund amount equals the original payment amount.
- Refund reason is recorded.
- Refund is linked to the original Payment and Invoice.

**Fail when:** Refund details are missing; link to original payment is broken.

### Stage 7 — Payment reconciliation

1. Navigate to the Invoice or Payment detail.
2. Choose `Reconcile` (if visible) or use the reconciliation API via browser
   dev tools:
   ```text
   POST /api/workspaces/<id>/payments/<paymentId>/reconcile
   ```
3. Review the reconciliation result.

**Expected:**

- Reconciliation returns `consistent` status (Runory and Stripe agree).
- Reconciliation result shows: provider account, payment ID, currency,
  amount, payment status, and refunded amount — all matching.
- Result is persisted and auditable.
- No sensitive provider payload is exposed.

**Fail when:** Reconciliation returns `divergent` without explanation;
reconciliation result is not persisted; sensitive data is exposed.

### Stage 8 — Payment failure path (negative test)

1. Create a new Invoice and payment request (or reuse a non-paid Invoice).
2. Open the Checkout URL.
3. Use the decline test card: `4000 0000 0000 0002`.
4. Attempt payment.

**Expected:**

- Stripe Checkout shows `Your card was declined`.
- Runory Payment status shows `failed` (after webhook processing).
- Invoice remains `open` or `issued` with original `balance_due`.
- The failure is auditable.

**Fail when:** A failed payment updates the Invoice as paid; failure is not
recorded; Invoice balance changes on a failed payment.

### Stage 9 — Partial payment and partial refund

1. Create a new Invoice with a total greater than $100.
2. Create a payment request for the full amount.
3. (If the UI supports partial payment) Pay a partial amount.
4. Otherwise, pay the full amount with test card `4242 4242 4242 4242`.
5. Process a partial refund (less than the full amount).

**Expected:**

- Partial refund moves payment status to `partially_refunded`.
- Invoice `balance_due` reflects the refunded amount.
- A second partial refund can be processed if remaining balance allows.
- Total refunded amount never exceeds the original payment.

**Fail when:** Partial refund is not supported; refund amount exceeds
payment; Invoice balance is not correctly updated.

## 7. DB Spot-check

Run these queries via `sqlite3 apps/cloud/data/runory.db -header -column` after
the corresponding stage completes. Compare the DB values against what the UI
shows. Any mismatch is a P1 finding.

### After Stage 1 — Invoice issued

```sql
SELECT id, status, total_minor, amount_paid_minor, balance_due_minor,
       issued_at, aggregate_version
FROM runory_business_invoice
WHERE id = '<invoice-id>';
```

**Verify:** `status='issued'`, `total_minor > 0`,
`balance_due_minor = total_minor`, and `amount_paid_minor = 0`.

### After Stage 3 — Payment complete

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

**Verify:** Invoice `status='paid'`, `balance_due_minor = 0`, and
`amount_paid_minor = total_minor`; Payment `status='succeeded'` with
`provider_payment_id` and `succeeded_at` set.

### After Stage 5 — Full refund

```sql
SELECT p.id AS payment_id, p.status AS payment_status, p.amount_minor,
       p.refunded_amount_minor,
       i.balance_due_minor, i.amount_paid_minor, i.status AS invoice_status,
       r.id AS refund_id, r.status AS refund_status,
       r.amount_minor AS refund_amount, r.succeeded_at
FROM runory_business_payment p
JOIN runory_business_payment_request pr ON pr.id = p.payment_request_id
LEFT JOIN runory_business_invoice i
       ON i.id = pr.source_object_id AND pr.source_object_type = 'invoice'
LEFT JOIN runory_business_refund r ON r.payment_id = p.id
WHERE pr.source_object_type = 'invoice' AND pr.source_object_id = '<invoice-id>';
```

**Verify:** Payment `status='refunded'` and
`refunded_amount_minor = amount_minor`; Invoice `balance_due_minor` is restored
to the original total; Refund `status='succeeded'` with
`refund_amount = payment.amount_minor`.

### After Stage 7 — Reconciliation

```sql
SELECT prr.id AS reconciliation_id, prr.payment_id, prr.status,
       prr.reconciled_by, prr.reconciled_at, prr.divergences_json,
       prr.aggregate_version
FROM runory_business_payment_reconciliation_result prr
JOIN runory_business_payment p ON p.id = prr.payment_id
JOIN runory_business_payment_request pr ON pr.id = p.payment_request_id
WHERE pr.source_object_type = 'invoice' AND pr.source_object_id = '<invoice-id>';
```

**Verify:** A reconciliation result row exists with `status='consistent'`
(Runory and Stripe agree) and `divergences_json` is empty (`[]`).

### After Stage 8 — Payment failure

```sql
SELECT i.id AS invoice_id, i.status AS invoice_status, i.balance_due_minor,
       p.id AS payment_id, p.status AS payment_status, p.failure_code,
       p.failure_message
FROM runory_business_invoice i
LEFT JOIN runory_business_payment_request pr
       ON pr.source_object_type = 'invoice' AND pr.source_object_id = i.id
LEFT JOIN runory_business_payment p ON p.payment_request_id = pr.id
WHERE i.id = '<invoice-id>';
```

**Verify:** Payment `status='failed'` with `failure_code` set; Invoice
`status` is unchanged (`issued` / `open`) and `balance_due_minor` is unchanged
from Stage 1.

## 8. Cross-surface consistency matrix

| Field | Invoice | Payment | Refund | Reconciliation | Timeline |
| --- | --- | --- | --- | --- | --- |
| Amount | | | | | N/A |
| Status | | | | | N/A |
| Balance due | | N/A | | N/A | N/A |
| Customer | | | N/A | N/A | N/A |
| Provider payment ID | N/A | | N/A | | N/A |
| Refunded amount | | | | | N/A |

## 9. Run record template

```markdown
### Invoice and Payment — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- Workspace slug/id:
- Browser:
- Stripe CLI version:
- Invoice id:
- Payment id:
- Refund id:
- Reconciliation result id:

| Stage | Result | Evidence | Finding |
| --- | --- | --- | --- |
| 0. Stripe connectivity | PASS / FAIL | | |
| 1. Issue Invoice | PASS / FAIL | | |
| 2. Create payment request | PASS / FAIL | | |
| 3. Complete payment | PASS / FAIL | | |
| 4. Verify payment record | PASS / FAIL | | |
| 5. Full refund | PASS / FAIL | | |
| 6. Verify refund record | PASS / FAIL | | |
| 7. Reconciliation | PASS / FAIL | | |
| 8. Payment failure | PASS / FAIL | | |
| 9. Partial payment/refund | PASS / FAIL | | |
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
- Stripe webhook forwarding active: YES / NO
- No reset during run: YES / NO
```
