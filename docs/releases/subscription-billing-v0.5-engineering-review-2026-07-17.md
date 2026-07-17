# Subscription Billing v0.5 Engineering Review

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

Runory SaaS subscription billing is accepted for v0.5 development and Stripe
Sandbox use. This record does not approve live-money enablement.

## Reviewed architecture

- Organization is the billing, subscription, and entitlement boundary.
- Runory SaaS Billing and Workspace customer payments use separate domain
  models, routes, webhook endpoints, and environment variables.
- Checkout selects the Stripe Price exclusively on the server.
- Stripe-hosted Checkout and Customer Portal keep card and invoice management
  out of Runory application pages.
- A raw-body, signature-verified webhook is the only provider ingress.
- Subscription and entitlement are projected atomically.
- Provider event IDs are unique; older events cannot roll subscription state
  back.
- Payment failure keeps Pro during a seven-day grace window; access changes do
  not delete Organization data.
- Only Organization Owners can create Checkout or Portal sessions.

## Automated evidence

Platform Core tests cover:

- active subscription to Pro entitlement projection;
- duplicate event replay;
- out-of-order cancellation rejection;
- `past_due` grace behavior;
- cancellation downgrade;
- one billing customer per Organization.

Cloud HTTP tests use Stripe's SDK to generate a real webhook signature and
cover active projection, replay, out-of-order delivery, and invalid signature
rejection. Middleware tests verify that only the exact Stripe billing webhook
path bypasses browser CSRF enforcement.

Type checks passed for Platform Core and Cloud before the external run.

## External Stripe Sandbox evidence

The acceptance run used the authenticated, dedicated Runory Stripe Sandbox and
the local Stripe CLI forwarder. It created:

```text
Product: Runory Pro
Price: USD 29.00 / month
Organization: org_078f3bce-8ac8-48aa-8844-7af9351fbade
Workspace: ws_aa0d5970-efa2-40cd-b8c5-6a223bcc4fef
Mode: test
```

Verified outcomes:

- Checkout displayed the server-selected Runory Pro monthly subscription.
- Stripe's test card completed Checkout and created an active subscription and
  paid invoice.
- Signed subscription, invoice, and Checkout events returned `200`.
- Runory stored one billing customer and one active Pro subscription for the
  Organization.
- The Organization entitlement changed from Early Access to Pro only after
  verified webhook processing.
- Replaying the same real Checkout event twice returned `200`; its event ledger
  remained one row.
- A forged webhook signature returned `400` and created no ledger row.
- A Member could not manage Organization billing.
- The Organization Owner saw Pro and opened the Stripe Customer Portal.
- The Portal showed the current Runory Pro subscription, next billing date,
  test payment method, and paid invoice.

No live Stripe key, real payment method, or real charge was used.

## Known limits and launch gate

- Pro is the only self-serve paid plan.
- Currency and amount are currently fixed by the configured Stripe Price.
- Upgrade/downgrade matrices, coupons, trials, tax automation, dunning policy,
  and enterprise invoicing are not included.
- Renewal and payment-failure behavior is covered by the state-machine tests;
  a production-like test-clock drill remains a pre-live operational exercise.
- Live launch requires production secrets, webhook registration, monitoring,
  tax/legal/support review, rollback procedures, and separate approval.

## Related documents

- [Subscription Billing Boundary](../architecture/subscription-billing-boundary.md)
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md)
- [Payment v0.5 Engineering Review](payment-v0.5-engineering-review-2026-07-17.md)
