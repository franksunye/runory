# Payment v0.5 Engineering Review

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | `v0.5` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-17 |
| Supersedes | — |
| Superseded by | — |

## Decision

The `runory.payment` and Stripe integration is accepted for v0.5 engineering
closure in test mode. Live-money enablement is not approved by this record.
The external Stripe sandbox acceptance run completed on 2026-07-17 against the
dedicated Runory sandbox account.

## Reviewed architecture

- `runory.payment` owns Payment Request, Payment, Refund, provider account, and
  provider reference state.
- Quote and Work Order only initiate and display linked payments.
- Stripe SDK types and event names remain inside the Cloud adapter.
- Checkout and refund HTTP effects are delivered through the durable outbox and
  use Stripe idempotency keys.
- Only a raw-body, signature-verified webhook can authoritatively confirm a
  payment or refund. Browser redirects never update financial state.
- Generic object mutation routes reject Payment, Payment Request, Refund, and
  provider records; named Commands are the write boundary.
- v0.5 explicitly binds one Workspace, provider account, mode, and currency.
- Provider event identity, amount, currency, and account are validated before a
  state transition.
- Refund balance is checked by the Command and enforced again by a database
  trigger, protecting concurrent requests.

## Automated evidence

The automated route E2E uses the real Stripe SDK to construct and verify
webhook signatures while replacing only outbound provider HTTP calls. It covers:

```text
eligible Quote
→ Payment Request + pending Payment + durable Checkout message
→ hosted Checkout result
→ signed success webhook
→ duplicate webhook replay
→ source-record payment projection
→ invalid-signature rejection
→ refund request
→ signed refund confirmation
```

Additional Command tests cover atomic creation, idempotency conflicts,
ineligible source state, account/amount/currency mismatch, out-of-order failure,
partial and full refund limits, and webhook replay.

## External Stripe sandbox evidence

The acceptance run used the developer's authenticated Stripe sandbox and a
local Stripe CLI forwarder to the development webhook endpoint. No live-mode
credentials or real payment method were used.

```text
Workspace: ws_aa0d5970-efa2-40cd-b8c5-6a223bcc4fef
Stripe account: acct_1Tu85uS0YP1GbRwt (test mode)
Currency / Checkout amount: CNY / 500 minor units
Checkout: cs_test_a1leYOANnjB7zNAbTx28B81WNoQOJS4tIuI9orlTFxV6q1cPsDq1rNjzAj
Payment Intent: pi_3Tu8PfS0YP1GbRwt0LYFAD25
Checkout event: evt_1Tu8PgS0YP1GbRwtII5OiKS1
Refund: re_3Tu8PfS0YP1GbRwt0GbYPEcT
Refund amount: 200 minor units
```

Verified outcomes:

- Checkout returned through Stripe-hosted UI; the redirect did not mutate
  canonical payment state.
- The signed Checkout event changed Payment Request to `paid` and Payment to
  `succeeded`.
- Replaying the same event returned `200`; aggregate version and paid amount
  remained unchanged, with one provider-reference row.
- A forged signature returned `400`.
- A real sandbox partial refund returned `202`; Stripe refund callbacks returned
  `200`, and Payment became `partially_refunded` with 200 minor units refunded.
- An over-balance refund returned `409` and created no additional Refund.
- Payment Request list and Payment detail/refund UI read the governed payment
  tables and displayed the resulting canonical state.

The run exposed and closed three integration-only defects:

- blank contact email was sent to Stripe instead of being omitted;
- Stripe's machine-to-machine webhook was incorrectly blocked by browser CSRF
  middleware;
- generic financial-object reads did not project the governed payment tables,
  producing an empty return list and 404 Payment detail.

## Runtime configuration

The following server-only values are required:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PAYMENT_MODE=test
STRIPE_PAYMENT_CURRENCY=<ISO-4217 currency>
STRIPE_PAYMENT_WORKSPACE_ID=<canonical Workspace ID>
STRIPE_PAYMENT_PROVIDER_ACCOUNT_ID=<stable internal account ID>
STRIPE_ACCOUNT_ID=<optional Stripe account reference>
NEXT_PUBLIC_APP_URL=<public application origin>
```

The secret-key prefix must match `STRIPE_PAYMENT_MODE`. Secrets must not be
placed in browser-exposed variables or business records.

## Known v0.5 limits

- one configured Workspace, Stripe account, mode, and currency;
- one-time Stripe-hosted card Checkout only;
- no Stripe Connect onboarding, split settlement, subscriptions, saved cards,
  tax engine, or accounting ledger;
- live-money launch requires separate operational, legal, support, observability,
  and rollback approval.

## Related documents

- [Payment Product Definition](../product/payment-product-definition.md)
- [Payment Technical Specification](../product/payment-technical-spec.md)
- [Payment POC Execution Plan](../product/payment-poc-execution-plan.md)
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md)
