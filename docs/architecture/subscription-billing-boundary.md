# Subscription Billing Boundary

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `architecture` |
| Applies to | `v0.5+` |
| Owner | Engineering |
| Last reviewed | 2026-07-17 |
| Supersedes | — |
| Superseded by | — |

This document defines the boundary for Runory charging Organizations for
Runory Cloud. It is separate from Workspace merchants collecting money from
their own customers.

## 1. Canonical flow

```text
Organization Owner
→ server-selected Runory plan and Stripe Price
→ Stripe-hosted subscription Checkout
→ signed Stripe billing webhook
→ normalized subscription projection
→ Organization subscription + entitlement
→ quota and feature enforcement

Organization Owner
→ Runory billing API
→ Stripe-hosted Customer Portal
→ payment method, invoices, and cancellation
```

The browser redirect is navigation only. It never grants a plan or entitlement.
Verified provider events are the only external authority allowed to project a
Stripe subscription into Runory.

## 2. Authority map

| Concern | Authoritative owner |
| --- | --- |
| Public plan identity and Runory features | Runory plan catalog |
| Checkout Price allowlist | server-side billing configuration |
| Customer, invoice, payment method, subscription lifecycle | Stripe Billing |
| Organization subscription projection | SaaS Core billing |
| Feature and quota access | Organization entitlement |
| Billing management permission | Organization Owner role |
| Tenant customer payments | `runory.payment`, outside this boundary |

## 3. Persistence

```text
saas_billing_customers
  one Stripe Customer per Organization

saas_subscriptions
  at most one projected subscription per Organization

saas_billing_webhook_events
  unique provider event ledger for replay protection

saas_organization_entitlements
  canonical Runory access consumed by product enforcement
```

Subscription and entitlement changes are committed together. Provider events
older than the last applied event are recorded as ignored and cannot roll state
back. Duplicate event IDs are harmless.

## 4. State and access policy

| Stripe subscription state | Runory entitlement |
| --- | --- |
| `trialing`, `active` | Pro |
| `past_due` | Pro during a seven-day grace window |
| `incomplete`, `incomplete_expired`, `canceled`, `unpaid`, `paused` | Early Access |

Cancellation or non-payment changes access; it never deletes tenant business
data. Only an Organization Owner can start Checkout or open the Customer
Portal. Members may not manage Organization billing.

## 5. Security and isolation

- The browser submits a Runory plan ID, never a Stripe Price ID.
- Secret keys and webhook secrets are server-only.
- Test and live key prefixes must match the configured mode.
- The billing webhook reads the raw body and verifies the Stripe signature.
- Organization identity is carried in server-authored Stripe metadata.
- Billing customer, subscription, event, and entitlement writes use the
  Organization boundary.
- SaaS Billing uses `RUNORY_BILLING_STRIPE_*` configuration and a dedicated
  webhook, separate from tenant payment configuration.

## 6. Runtime configuration

```text
RUNORY_BILLING_STRIPE_SECRET_KEY
RUNORY_BILLING_STRIPE_WEBHOOK_SECRET
RUNORY_BILLING_STRIPE_MODE=test|live
RUNORY_BILLING_PRO_PRICE_ID
NEXT_PUBLIC_APP_URL
```

Production enablement requires a live-mode Price, live webhook endpoint, secret
rotation and storage, tax/legal decisions, alerting, support procedures, and a
separate launch approval.

## 7. Related documents

- [Payment Integration Boundary](payment-integration-boundary.md)
- [Architecture Overview](overview.md)
- [Subscription Billing Engineering Review](../releases/subscription-billing-v0.5-engineering-review-2026-07-17.md)
