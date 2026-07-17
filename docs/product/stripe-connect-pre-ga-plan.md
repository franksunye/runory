# Stripe Connect Pre-GA Completion Plan

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product` |
| Applies to | `v0.6–v1.0` |
| Owner | Product / Engineering / Operations |
| Last reviewed | 2026-07-17 |
| Supersedes | — |
| Superseded by | — |

This plan records the remaining merchant-payment work after the v0.5 Payment
Module and Runory SaaS subscription billing were validated.

## 1. Release decision

Runory must not collect a Workspace merchant's customer payments into the
Runory platform Stripe balance.

Before Runory 1.0 General Availability:

```text
Runory software subscription
Organization → Runory Stripe account → Runory

Workspace merchant payment
Merchant customer → merchant Connected Account → merchant payout account
```

Stripe Connect with Direct Charges is the default international implementation
for Workspace merchant payments. The charge, PaymentIntent, refund, dispute,
balance, and payout context must belong to the merchant Connected Account.

Runory remains the software and workflow provider. A Workspace merchant remains
the seller receiving its customer funds. This is a product and architecture
gate, not an optional post-GA enhancement.

## 2. Explicit non-goals

The GA implementation must not:

- create merchant customer charges on the Runory platform account;
- use the Runory SaaS Billing customer or subscription as a merchant account;
- treat a platform Checkout redirect as merchant settlement;
- copy a merchant's Stripe secret key into Workspace records;
- introduce Destination Charges or Separate Charges and Transfers without a
  separate business, legal, risk, and architecture decision;
- make Runory the merchant of record merely to simplify implementation;
- mix SaaS subscription and merchant-payment webhook event ledgers.

Runory may later collect an application fee, but no transaction fee is required
for the first Connect release. Enabling application fees requires explicit
commercial, accounting, tax, refund, dispute, and reporting policy.

## 3. Target architecture

```text
Workspace Owner
→ connect Stripe account
→ Stripe-hosted or embedded onboarding
→ Connected Account status synchronized to Runory

Payment Request
→ durable provider command
→ Direct Checkout / PaymentIntent on Connected Account
→ customer payment
→ signed Connect webhook carrying connected-account context
→ normalized Payment Command
→ Payment / Refund / Audit / reconciliation projection

Stripe
→ merchant Connected Account balance
→ merchant payout destination
```

The existing `runory.payment` aggregate and Commands remain provider-neutral.
Connect changes provider-account lifecycle and Stripe execution context; it
must not fork Quote, Work Order, Payment Request, Payment, or Refund truth.

## 4. Required product capabilities

### 4.1 Merchant onboarding

- one active Stripe Connected Account mapping per Workspace and mode;
- Stripe-hosted or embedded onboarding;
- reconnect and resume incomplete onboarding;
- display `details_submitted`, `charges_enabled`, `payouts_enabled`, and
  outstanding requirements as provider-neutral status;
- restrict onboarding and account replacement to authorized Workspace roles;
- explicit disconnect, replacement, and data-retention policy;
- test/live isolation.

Use Stripe-managed onboarding UI unless a separately reviewed requirement
justifies fully API-owned identity and compliance collection.

### 4.2 Payment execution

- create Checkout Sessions or PaymentIntents in the merchant Connected Account
  context;
- use the Workspace provider-account mapping selected by the server;
- reject payment creation while the account is missing, restricted, disabled,
  or not charge-enabled;
- preserve amount, currency, source object, idempotency, and provider-account
  validation already enforced by Payment Commands;
- keep browser redirects non-authoritative;
- support merchant-owned refunds through the same Connected Account context.

### 4.3 Connect event processing

- dedicated Connect webhook registration and signing secret;
- resolve Workspace using the connected account identifier carried by the
  verified event;
- reject events for unknown account, wrong mode, wrong currency, wrong amount,
  or mismatched provider object;
- unique event identity scoped to provider, mode, and Connected Account;
- harmless replay and protection against out-of-order regression;
- synchronize `account.updated` and payment/refund/dispute events;
- never accept `workspace_id` from an unverified customer redirect.

### 4.4 Merchant operations

- merchant-visible payment and refund history;
- payout/balance visibility through Stripe-hosted Dashboard or approved
  embedded components;
- actionable restricted-account and onboarding-requirement states;
- dispute visibility and an explicit responsibility/response path;
- reconciliation between Runory Payment records and Connected Account objects;
- support diagnostics that never expose credentials or sensitive provider
  payloads.

## 5. Data and isolation requirements

The provider-account model must include, directly or through governed
projections:

```text
workspace_id
provider = stripe
mode = test | live
connected_account_id
account_configuration_version
onboarding_status
charges_enabled
payouts_enabled
requirements_status
capabilities
created_at / updated_at
```

Every provider-bound Payment, Refund, Checkout, webhook event, idempotency key,
and reconciliation query must carry or resolve the Workspace provider account.
The platform must test that one Workspace cannot read, charge, refund, replay,
or reconcile another Workspace's Connected Account.

Stripe account configuration should use current controller properties rather
than making new architecture depend only on the legacy Standard, Express, and
Custom labels. The selected configuration must document responsibility for:

- merchant-of-record presentation;
- Stripe processing and Connect fees;
- negative balances;
- refunds and disputes;
- onboarding requirements and support;
- Dashboard or embedded-component access;
- payout scheduling and bank-account maintenance.

## 6. Delivery stages

### Stage A — Sandbox account lifecycle

- create the Connect platform configuration;
- onboard two independent sandbox merchants;
- persist Workspace mappings and readiness state;
- verify reconnect, incomplete requirements, disabled account, and cross-tenant
  denial.

### Stage B — Direct payment and refund

- move Stripe Checkout execution to Connected Account context;
- complete one payment per sandbox merchant;
- prove funds and payment objects belong to the correct Connected Account;
- complete partial and full refund paths;
- preserve existing Payment Command and outbox guarantees.

### Stage C — Operations and failure paths

- test authentication-required and failed payments;
- test webhook replay and out-of-order delivery;
- test account restriction after onboarding;
- test dispute visibility and responsibility workflow;
- test payout/balance access and reconciliation;
- add monitoring, dead-letter recovery, and support diagnostics.

### Stage D — Pre-production and live-readiness review

- complete legal, tax, terms, privacy, and merchant-support review;
- register and verify production Connect webhook endpoints;
- establish secret rotation and least-privilege operational access;
- run backup/restore and account-remapping drills;
- run limited live-money acceptance with an approved merchant;
- publish supported countries, currencies, payment methods, and known limits;
- obtain explicit production launch approval.

## 7. GA acceptance criteria

Runory 1.0 cannot claim production merchant payments until all of the following
are evidenced:

- at least two Workspace merchants complete independent Connect onboarding;
- each merchant receives a successful Direct Charge in its own Connected
  Account;
- Runory platform balance is not the destination for merchant gross receipts;
- Workspace isolation passes across onboarding, Checkout, webhook, refund,
  dispute, payout, and reconciliation paths;
- forged, duplicate, unknown-account, wrong-mode, wrong-amount, and
  out-of-order events fail safely;
- refunds are created against the owning Connected Account;
- merchant onboarding restrictions and capability changes are visible and
  recoverable;
- support can diagnose payment, webhook, account, dispute, and payout failures
  without direct database mutation;
- a production-shaped E2E and limited approved live-money drill are recorded;
- architecture, security, legal, finance, operations, and support reviews pass.

If these gates are incomplete, Runory may keep merchant payments in Sandbox or
feature-flagged preview, but must not market them as a GA production capability.

## 8. Related documents

- [Payment Product Definition](payment-product-definition.md)
- [Payment Technical Specification](payment-technical-spec.md)
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md)
- [Runory 1.0 GA Release Goal](v1.0-ga-release-goal.md)
- [Payment v0.5 Engineering Review](../releases/payment-v0.5-engineering-review-2026-07-17.md)
