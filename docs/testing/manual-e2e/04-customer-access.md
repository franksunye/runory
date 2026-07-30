# Test Case 04 — Customer Access

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Priority | P0 |
| Primary roles | Workspace Owner → Customer (external) |
| Surface | Desktop browser — standalone customer portal + Stripe Checkout |
| Prerequisite | [00 — Environment Setup](./00-test-environment-setup.md), Stripe sandbox configured, completed journey from [01](./01-fsm-owner-happy-path.md) or [03](./03-invoice-payment.md) |

## 1. Purpose

Verify that an external customer can securely access a read-only view of their
service journey through a magic-link portal, accept a Quote, and pay an
Invoice via Stripe Checkout — all without a Runory account, without seeing
internal IDs, and without the ability to mutate any state other than the two
governed customer actions (`quote.accept` and `invoice.pay`).

This test also verifies the Workspace-side grant lifecycle: an Owner issues a
single-use-token grant, the token is exchanged for a signed session cookie,
and revocation or expiry immediately blocks further access.

This is the external-user acceptance run. It answers:

> Can a customer review, accept, and pay for their job through a secure,
> standalone portal — and can the Owner revoke that access at will?

## 2. Scope

### 2.1 What this run proves

- An Owner can issue a customer-access grant bound to a Quote or Work Order
  root with a scoped capability set.
- The raw access token is delivered exactly once via a URL fragment
  (`#token=...`) and is never persisted, logged, or placed in a query string.
- The customer portal is a standalone headless page (no MarketingHeader or
  Footer) that exchanges the token for a signed, HttpOnly session cookie.
- The portal renders a read-only journey: Quote → Work Order → Service
  Reports → Invoice → Payment — with no internal IDs exposed.
- The customer can accept a Quote (`quote.accept`) and the acceptance is
  audited with `actor_type=customer`.
- The customer can initiate payment (`invoice.pay`) which redirects to Stripe
  Checkout with a server-derived amount and return URLs.
- After payment, the portal reflects the updated Invoice and Payment status.
- Grant revocation by the Owner immediately blocks all further customer
  access, including active sessions.
- Token expiry blocks exchange; expired session cookies no longer resolve.
- A customer session in one Workspace cannot access data in another
  Workspace.
- Inline translation works in both `en` and `zh` locales.
- All customer-access responses carry protective headers
  (`Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`,
  `X-Robots-Tag: noindex, nofollow`).

### 2.2 What this run does not prove

- Internal operator-side Quote/Invoice management (see [01](./01-fsm-owner-happy-path.md) and [03](./03-invoice-payment.md)).
- Stripe Connect onboarding readiness (requires registered Connect account).
- Mobile-responsive layout of the customer portal (visual QA only, not a
  separate mobile run).
- PWA or push notification behavior (see [06](./06-pwa-notifications.md)).

## 3. Preconditions

- [ ] Dev server running at `http://localhost:3000`
- [ ] Stripe CLI webhook forwarding active (`pnpm dev:stripe`)
- [ ] `.env.local` contains valid `STRIPE_SECRET_KEY=sk_test_...` and
      `STRIPE_PAYMENT_MODE=test`
- [ ] `CUSTOMER_ACCESS_SESSION_SECRET` is set in `.env.local` (at least 32
      characters)
- [ ] A demo workspace exists with CRM Lite Pack, Sales Quote Pack, and FSM
      Pack installed
- [ ] A complete journey exists or will be created during the run:
      - Quote in `sent` status (for acceptance testing)
      - Work Order in `completed` status with at least one Service Report
      - Invoice in `issued` status with `balance_due > 0`
- [ ] A second workspace exists for cross-tenant security testing (Stage 9)
- [ ] Owner identity available for grant issuance and revocation
- [ ] An incognito/private browser window available for the customer session

## 4. Test data

```text
Run ID: CUST-<YYYYMMDD>-<HHMM>

Primary workspace slug/id: <workspace-A>
Secondary workspace slug/id: <workspace-B>   (for cross-tenant test)

Quote (sent status):   <quote-id>     (root for the grant)
Work Order (completed): <work-order-id>
Service Report:         <service-report-id>
Invoice (issued):       <invoice-id>
Contact (grant subject): <contact-id>
Customer name:          <expected display name>

Grant capabilities (full set):
  quote.view, quote.accept, work_order.view_status,
  service_report.view, invoice.view, invoice.pay, payment.view_status

Grant expiry (normal):  24 hours from issue
Grant expiry (short):   1 minute from issue (for expiry test)

Payment test card: 4242 4242 4242 4242
Decline test card: 4000 0000 0000 0002
```

## 5. Execution procedure

### Stage 0 — Prepare the journey and verify the baseline

1. Log in as Owner in the primary workspace (`/w/<workspace-A-slug>/dashboard`).
2. Verify a Quote exists in `sent` status (create one from [02](./02-quote-commercial-loop.md) if needed — submit, approve, send — but do **not** accept).
3. Verify a Work Order exists in `completed` status with at least one Service
   Report (from [01](./01-fsm-owner-happy-path.md) or created fresh).
4. Verify an Invoice exists in `issued` status with `balance_due > 0` (from
   [03](./03-invoice-payment.md) or created fresh).
5. Record the Quote ID, Work Order ID, Invoice ID, and Contact ID for the
   grant.
6. Confirm Stripe is configured: open `/w/<workspace-A-slug>/billing` and
   verify no Stripe config errors.

**Expected:**

- All required journey records exist and are in the correct status.
- Stripe test mode is active with a valid Connect account.

**Fail when:** The journey is incomplete; Stripe is not configured; the
`CUSTOMER_ACCESS_SESSION_SECRET` is missing.

### Stage 1 — Owner creates a customer access grant

1. As Owner, issue a grant using the Workspace API (via browser dev tools,
   `issue-grant.cjs` script, or the product UI if available):
   ```text
   POST /api/workspaces/<workspace-A-id>/customer-access/grants

   {
     "subjectType": "contact",
     "subjectId": "<contact-id>",
     "rootObjectType": "quote",
     "rootRecordId": "<quote-id>",
     "capabilities": [
       "quote.view", "quote.accept", "work_order.view_status",
       "service_report.view", "invoice.view", "invoice.pay",
       "payment.view_status"
     ],
     "expiresAt": "<ISO 24h from now>"
   }
   ```
2. Inspect the response.

**Expected:**

- Response is `201` with `{ grant, accessUrl }`.
- `accessUrl` contains the token in the URL **fragment**
  (`/access#token=<raw-token>`), not in the query string.
- The grant metadata shows `status: "active"`, the correct capabilities,
  and the specified expiry.
- The raw token is returned exactly once in `accessUrl` and is **not** present
  in the grant metadata (`token_hash` is never exposed).
- The `customer_access.issue` audit event is recorded with the Owner as actor.

**Fail when:** The token appears in the query string instead of the fragment;
`token_hash` or the raw token is exposed in the grant metadata; the grant is
not auditable; the response is missing `accessUrl`.

### Stage 2 — Customer accesses the portal via magic link

1. Open the `accessUrl` from Stage 1 in a new incognito/private window.
2. Observe the loading state ("Securing your access…").
3. Wait for the token exchange to complete and the portal to render.
4. Verify the URL fragment (`#token=...`) has been cleared from the address
   bar after exchange.
5. Open browser dev tools → Application → Cookies and confirm a
   `runory_customer_access` cookie exists (HttpOnly).
6. Verify the portal is a standalone page: no MarketingHeader, no Footer, no
   workspace navigation shell.
7. Verify the greeting shows the customer's display name
   ("Hello, {name}").
8. Verify the service provider name (workspace name) is shown.
9. Verify the session expiry time is displayed in the footer.
10. Change the locale by navigating to `/<other-locale>/access` (e.g., from
    `/en/access` to `/zh/access`) and verify all labels translate correctly.

**Expected:**

- The token is exchanged via `POST /api/customer-access/exchange` and a signed
  session cookie is set.
- The URL fragment is cleared so the token cannot be shared from the address
  bar.
- The portal renders as a headless standalone page.
- The customer name and workspace name are derived server-side from the grant
  subject and workspace.
- Inline translations work for both `en` and `zh`.
- The `customer_access.exchange` audit event is recorded.

**Fail when:** The token remains visible in the URL after exchange; the
portal shows workspace navigation chrome; the customer name is a raw ID or
"Customer" when a name exists; translations are missing or mixed; the
exchange fails silently.

### Stage 3 — Customer views the Quote and accepts it

1. In the customer portal, locate the Quote card.
2. Verify the Quote displays: quote number, revision number, title, line
   items (description, quantity, line total), subtotal, discount, tax, total,
   valid-until date, and terms (if any).
3. Verify no internal record IDs are visible anywhere on the card.
4. Verify the "Accept quote" button is present (status `sent` + `quote.accept`
   capability).
5. Click "Accept quote".
6. Verify the confirmation dialog shows: quote number, revision, amount
   (grand total with currency), and valid-until date.
7. Confirm acceptance.
8. Observe the success message ("Quote accepted successfully").
9. Verify the Quote card now shows "Accepted" status with the accepted date.
10. Verify the "Accept quote" button is no longer visible.
11. In the Owner's browser, open the Quote detail and refresh. Verify the
    Quote status is now `accepted` and the timeline records the acceptance
    with `actor_type=customer`.

**Expected:**

- The `POST /api/customer-access/quotes/<quoteId>/accept` call succeeds.
- The server derives the actor, version, and command ID — the browser
  submits no business input.
- The Quote transitions `sent → accepted`.
- The acceptance is audited with `actor_type=customer` and the grant ID as
  actor.
- The Owner's workspace reflects the accepted Quote after refresh.
- Idempotency key
  `customer-access:<grantId>:quote.accept:<quoteId>` prevents duplicate
  acceptance on retry.

**Fail when:** The customer can accept a Quote that is not in `sent` status;
internal IDs are shown; the acceptance is not reflected in the Owner's
workspace; the acceptance is not auditable; the browser can submit actor or
version values.

### Stage 4 — Customer views Work Order and Service Reports

1. In the customer portal, locate the Work Order card (if the Quote was
   converted to a Work Order).
2. Verify the Work Order displays: work order number (not raw ID), title,
   status label, scheduled start/end time, and completed time.
3. Verify the status is shown in human-readable form (e.g., "Completed",
   "In progress") — not as a raw status key.
4. Locate the Service Reports card.
5. Verify each report displays: summary, resolution, and completed date.
6. Verify no technician assignment data, internal IDs, or attachment storage
   identifiers are exposed.

**Expected:**

- The Work Order and Service Reports are resolved from the grant root through
  the journey chain (Quote → Work Order → Service Reports).
- The customer sees only what the grant capabilities allow
  (`work_order.view_status`, `service_report.view`).
- No internal IDs, assignment data, or provider references are exposed.

**Fail when:** Raw record IDs are shown; technician assignment data is
leaked; the Work Order or Service Reports from a different customer are
visible; the status is shown as a raw key instead of a localized label.

### Stage 5 — Customer views Invoice and initiates payment

1. In the customer portal, locate the Invoice card.
2. Verify the Invoice displays: invoice number, line items, total, amount
   paid (if any), balance due, issued date, due date, and status label.
3. Verify the "Pay now" button is present (status `issued` or
   `partially_paid`, `balance_due > 0`, `invoice.pay` capability).
4. Click "Pay now".
5. Verify the confirmation dialog shows: invoice number and balance due
   (with currency).
6. Confirm checkout.
7. Verify the browser redirects to Stripe Checkout
   (`checkout.stripe.com`).
8. On the Stripe Checkout page, enter card number `4242 4242 4242 4242` with
   any future expiry date and any CVC.
9. Complete the payment.
10. Verify the browser returns to the customer portal with
    `?checkout=returned` in the URL.
11. Verify the "Payment successful — refreshing your status…" notice appears.
12. Verify the Invoice card now shows "Paid in full" with balance `0`.
13. Verify the Payment status card shows "Payment received" with the amount.
14. In the Owner's browser, open the Invoice detail and refresh. Verify the
    Invoice status is `paid` and `balance_due` is `0`.

**Expected:**

- The `POST /api/customer-access/invoices/<invoiceId>/checkout` call returns
  a `checkoutUrl` pointing to Stripe Checkout.
- The server derives the amount (current balance), currency, purpose
  ("final"), customer contact, provider account, and return URLs — the
  browser submits none of these.
- The idempotency key
  `customer-access:<grantId>:invoice.checkout:<invoiceId>:<balanceMinor>`
  prevents duplicate Checkout sessions for the same balance.
- After payment, the Stripe webhook updates the Invoice and Payment status.
- The customer portal reflects the updated status after the return redirect
  and context refresh.
- The Owner's workspace reflects the paid Invoice.

**Fail when:** The customer can submit amount or currency from the browser;
the Checkout amount does not match the Invoice balance; the webhook does not
update the Invoice; the portal does not reflect payment after return; a
duplicate Checkout session is created for the same balance.

### Stage 6 — Customer logout and session termination

1. In the customer portal, click "Sign out".
2. Verify the portal transitions to the "Access unavailable" screen.
3. Reload the page.
4. Verify the "Access unavailable" screen persists (session cookie is
   cleared).
5. In browser dev tools, confirm the `runory_customer_access` cookie is
   expired/removed.

**Expected:**

- The `POST /api/customer-access/session/logout` call clears the session
  cookie (sets it to expired).
- The portal shows the "Access unavailable" screen after logout.
- Reloading does not restore access — the cookie is gone.
- The `customer_access.logout` audit event is recorded.
- The grant itself is **not** revoked (it remains `active` for future link
  use); only the client-side session is ended.

**Fail when:** The session cookie persists after logout; the portal shows
journey data after logout; the logout is not auditable.

### Stage 7 — Grant revocation blocks access

1. As Owner, revoke the grant from Stage 1:
   ```text
   POST /api/workspaces/<workspace-A-id>/customer-access/grants/<grantId>/revoke

   { "expectedVersion": 1 }
   ```
2. Verify the grant status changes to `revoked` with `revoked_at` and
   `revoked_by` populated.
3. Issue a **new** grant for the same customer (to get a fresh token), open
   it in a new incognito window, and establish a session.
4. As Owner, revoke this second grant while the customer session is active.
5. In the customer's browser, attempt to reload the portal or navigate
   within it (which calls `GET /api/customer-access/context`).
6. Verify the portal transitions to the "Access unavailable" screen.
7. Attempt to re-exchange the original token from the second grant by
   navigating to its `accessUrl` again.
8. Verify access is denied ("Access unavailable").

**Expected:**

- `customer_access.revoke` moves the grant `active → revoked`.
- Revocation is checked on every protected request — an active customer
  session is immediately blocked after revocation.
- A revoked grant's token can no longer be exchanged.
- All failure cases collapse to the same generic "Access unavailable" screen
  (the customer cannot distinguish revoked, expired, or missing).
- The `customer_access.access_denied` audit event is recorded (sampled).

**Fail when:** An active customer session continues to work after
revocation; a revoked token can still be exchanged; the error screen reveals
the specific failure reason (revoked vs. expired vs. missing).

### Stage 8 — Token expiry scenario

1. As Owner, issue a grant with a very short expiry (1 minute from now):
   ```text
   "expiresAt": "<ISO 1 minute from now>"
   ```
2. Copy the `accessUrl`.
3. Wait 2 minutes for the grant to expire.
4. Open the `accessUrl` in a new incognito window.
5. Verify the token exchange fails and the "Access unavailable" screen
   appears.
6. (If a session was established before expiry) wait for the session to
   expire, then attempt to reload the portal.
7. Verify access is denied.

**Expected:**

- An expired grant's token cannot be exchanged — the exchange endpoint
  returns `403 UNAVAILABLE`.
- An expired session cookie no longer resolves — the context endpoint
  returns `403 UNAVAILABLE`.
- The customer sees the same generic "Access unavailable" screen as
  revocation (no distinction between expiry and revocation).

**Fail when:** An expired token can still be exchanged; an expired session
cookie continues to work; the error reveals that the cause is expiry rather
than the generic "unavailable".

### Stage 9 — Cross-tenant security boundary

1. Ensure the secondary workspace (`workspace-B`) exists with its own Quote,
   Work Order, and Invoice (different customer, different data).
2. As Owner of `workspace-B`, issue a grant for `workspace-B`'s customer.
3. Open `workspace-B`'s `accessUrl` in a separate incognito window and
   establish a session.
4. In `workspace-B`'s customer portal, note the Quote number, Work Order
   number, and Invoice number visible.
5. Attempt to call `workspace-A`'s customer-access APIs using
   `workspace-B`'s session cookie:
   - `GET /api/customer-access/context` (should only return `workspace-B`
     data).
6. From `workspace-A`'s customer portal session (if still active), attempt
   to accept a Quote or pay an Invoice belonging to `workspace-B` by
   substituting `workspace-B`'s record IDs in the URL path:
   - `POST /api/customer-access/quotes/<workspace-B-quote-id>/accept`
   - `POST /api/customer-access/invoices/<workspace-B-invoice-id>/checkout`
7. Verify all cross-workspace attempts are denied.

**Expected:**

- The session cookie is bound to a specific `workspaceId` and `grantId`.
- `GET /api/customer-access/context` only returns data from the grant's
  workspace — `workspace-A`'s session never shows `workspace-B`'s data and
  vice versa.
- Mutation attempts with a foreign workspace's record IDs are denied:
  reachability resolution fails because the record is not reachable from the
  grant root, and the subject does not match.
- All denials collapse to the generic `403 UNAVAILABLE` response.
- The `customer_access.access_denied` audit event is recorded (sampled).

**Fail when:** A customer session in one workspace can read or mutate data
in another workspace; cross-workspace record ID substitution succeeds; the
denial response reveals which check failed.

## 6. DB Spot-check

Run these queries via `sqlite3 apps/cloud/data/runory.db -header -column` after
the corresponding stage completes. Compare the DB values against what the UI
shows. Any mismatch is a P1 finding.

### After Stage 1 — Grant created

```sql
SELECT id, subject_type, subject_id, root_object_type, root_record_id,
       status, token_hash, capabilities_json, expires_at, created_by,
       aggregate_version
FROM runory_runtime_customer_access_grants
WHERE id = '<grant-id>';
```

**Verify:** `status = 'active'`; `token_hash` is a non-empty hash and is NOT
the raw token shown in the `accessUrl` fragment (the raw token is never
persisted); `capabilities_json` contains both `quote.accept` and
`invoice.pay`; `subject_id` matches the Contact and `root_record_id` matches
the Quote; `expires_at` matches the issued 24h expiry.

### After Stage 3 — Customer accepts Quote

```sql
SELECT q.status, q.accepted_at, q.aggregate_version,
       al.actor_type, al.actor_id, al.action, al.created_at AS audited_at
FROM runory_business_quote q
LEFT JOIN runory_runtime_audit_logs al
  ON al.workspace_id = q.workspace_id
 AND al.entity_id = q.id
 AND al.action = 'quote.accept'
WHERE q.id = '<quote-id>'
ORDER BY al.created_at DESC
LIMIT 1;
```

**Verify:** `q.status = 'accepted'` and `q.accepted_at` is set;
`al.actor_type = 'customer'` (the customer-access grant is the actor, not an
operator) and `al.actor_id` is the grant id; `al.action = 'quote.accept'`.
The acceptance is audited as a customer action, proving the portal could not
submit actor or version values from the browser.

### After Stage 5 — Customer pays Invoice

```sql
SELECT inv.status, inv.balance_due_minor, inv.amount_paid_minor,
       inv.total_minor, inv.paid_at,
       pay.status AS payment_status, pay.succeeded_at, pay.amount_minor
FROM runory_business_invoice inv
LEFT JOIN runory_business_invoice_payment_allocation alloc
  ON alloc.workspace_id = inv.workspace_id AND alloc.invoice_id = inv.id
LEFT JOIN runory_business_payment pay
  ON pay.workspace_id = alloc.workspace_id AND pay.id = alloc.payment_id
WHERE inv.id = '<invoice-id>';
```

**Verify:** `inv.status = 'paid'`; `inv.balance_due_minor = 0`;
`inv.amount_paid_minor = inv.total_minor` and `inv.paid_at` is set;
`pay.status = 'succeeded'` with `succeeded_at` set and `pay.amount_minor`
equal to the invoice total. The Checkout amount was server-derived, so the
payment must match the invoice balance exactly.

### After Stage 7 — Grant revoked

```sql
SELECT id, status, revoked_at, revoked_by, aggregate_version, updated_at
FROM runory_runtime_customer_access_grants
WHERE id = '<grant-id>';
```

**Verify:** `status = 'revoked'`; `revoked_at` is populated; `revoked_by` is
the Owner user id who issued the revoke; `aggregate_version` is incremented
past the value seen in Stage 1. A revoked grant's token can no longer be
exchanged even though the raw token is unknown to the DB.

## 7. Cross-surface consistency matrix

Record observed values at the end of Stages 3, 5, and 7. Compare what the
customer sees in the portal against what the Owner sees in the workspace and
what Stripe shows.

| Field | Customer portal | Owner workspace | Stripe | Audit log |
| --- | --- | --- | --- | --- |
| Quote status | | | N/A | |
| Quote acceptedAt | | | N/A | |
| Quote accepted by | N/A | | N/A | |
| Work Order status | | | N/A | N/A |
| Invoice status | | | N/A | |
| Invoice balance due | | | N/A | N/A |
| Payment status | | | | |
| Payment amount | | | | N/A |
| Customer display name | | | N/A | N/A |
| Grant status | | N/A | N/A | |
| Internal IDs exposed | (should be none) | N/A | N/A | N/A |

Any unexplained disagreement is a failed run even when the customer
successfully accepts the Quote and pays the Invoice.

## 8. Run record template

```markdown
### Customer Access — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- Workspace A slug/id:
- Workspace B slug/id:
- Browser:
- Stripe CLI version:
- Quote id (accepted):
- Work Order id:
- Invoice id (paid):
- Grant id (normal):
- Grant id (revoked):
- Grant id (expired):
- Payment id:

| Stage | Result | Evidence | Finding |
| --- | --- | --- | --- |
| 0. Baseline and journey prep | PASS / FAIL | | |
| 1. Owner creates grant | PASS / FAIL | | |
| 2. Customer accesses portal | PASS / FAIL | | |
| 3. Customer accepts Quote | PASS / FAIL | | |
| 4. Customer views WO + reports | PASS / FAIL | | |
| 5. Customer pays Invoice | PASS / FAIL | | |
| 6. Customer logout | PASS / FAIL | | |
| 7. Grant revocation | PASS / FAIL | | |
| 8. Token expiry | PASS / FAIL | | |
| 9. Cross-tenant security | PASS / FAIL | | |
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
- Customer session isolated to incognito: YES / NO
```
