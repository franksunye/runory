# Runory Payment Product Definition

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product` |
| Applies to | `v0.5–v1.0` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-17 |
| Supersedes | — |
| Superseded by | — |

Runory Payment is a horizontal business capability that lets an installed business Pack request, receive, refund, and reconcile customer payments without embedding provider-specific logic in CRM, Quote, FSM, After-sales, or future industry Modules.

This document defines the product boundary. It supports the canonical [Product Definition](product-definition.md), [Architecture Overview](../architecture/overview.md), and [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md).

## 1. Product decision

Runory provides one official horizontal Module:

```text
runory.payment
```

Stripe is the initial default provider for international POC and MVP work, but Stripe is not the business model. Provider-specific implementation belongs behind a Payment Provider adapter.

No standalone Payment Pack is required for the first POC. Existing Packs consume Payment through declared dependencies and Commands.

## 2. Two payment domains must remain separate

### 2.1 Runory platform billing

Runory charges an Organization or Workspace for using Runory Cloud.

```text
Runory plan / subscription / usage
→ platform billing account
→ invoice / subscription payment
```

This belongs to SaaS Core billing and may later use Stripe Billing.

### 2.2 Workspace business payments

A Runory customer charges its own customer for a quote, deposit, service, invoice, or other business obligation.

```text
Quote / Work Order / Invoice
→ Payment Request
→ customer checkout
→ Payment
→ Refund / reconciliation
```

This belongs to `runory.payment` and is the scope of the first Payment POC.

The two domains must not share records, provider accounts, authorization, reporting, or settlement assumptions.

For production Workspace payments, the Workspace merchant must receive customer
funds into its own provider account. The Stripe implementation uses a Connected
Account and Direct Charges. Merchant gross receipts must not settle into the
Runory platform balance.

## 3. Product proposition

The first proposition to validate is:

> A Runory operator can request a real customer payment from a Quote or Work Order, the customer can pay through a hosted Stripe checkout, and Runory records the authoritative result through a signed provider event without manual status editing.

## 4. Target users

- SMB owner or finance administrator;
- salesperson requesting a deposit after quote acceptance;
- dispatcher or service operator requesting a final payment;
- customer paying through a secure hosted page;
- support operator reviewing failed, refunded, or unresolved payments.

## 5. Core user journeys

### 5.1 Request deposit from Quote

```text
Accepted Quote
→ operator selects Request payment
→ enters deposit amount and due date
→ Runory creates Payment Request
→ Stripe Checkout link is created
→ customer pays
→ Stripe webhook confirms result
→ Quote shows deposit paid
```

### 5.2 Request final payment from Work Order

```text
Completed or billable Work Order
→ operator requests final amount
→ customer pays through hosted checkout
→ Payment succeeds
→ Work Order shows payment status
```

### 5.3 Payment failure

```text
Payment attempt fails or expires
→ Payment remains unpaid / failed
→ operator sees actionable status
→ customer may receive a new Payment Request
```

### 5.4 Refund

```text
Authorized operator requests refund
→ Runory validates refundable amount
→ Stripe processes refund
→ signed webhook confirms result
→ Payment and Refund records update
```

## 6. POC scope

### Included

- one Workspace;
- one Stripe test account;
- one currency;
- Stripe-hosted Checkout;
- one-time card payment;
- payment request from Quote and/or Work Order;
- partial amount such as deposit;
- full amount such as final payment;
- signed webhook processing;
- payment success, failure, expiration, and refund status;
- Payment list and Payment Detail;
- linkage to authoritative business records;
- idempotency, audit, and failure visibility.

### Excluded

- Runory SaaS subscriptions;
- Stripe Connect onboarding;
- platform fees or revenue share;
- multi-party split settlement;
- recurring customer billing;
- saved payment methods;
- invoices as a complete accounting subsystem;
- tax calculation;
- chargeback operations beyond event visibility;
- POS or card-present payment;
- WeChat Pay, Alipay, or other regional providers;
- automatic accounting reconciliation;
- production-grade financial reporting.

These exclusions describe the v0.5 POC. Stripe Connect onboarding and
merchant-owned Direct Charges are required before merchant payments can become
a Runory 1.0 GA production capability.

## 7. Product objects

The initial Module should own:

```text
payment_request
payment
refund
payment_provider_account
payment_provider_reference
```

Optional later objects:

```text
payment_method_reference
payout
settlement
chargeback
invoice
credit_note
```

The first POC should not introduce optional later objects unless a tested journey requires them.

## 8. Product commands

Initial named Commands:

```text
payment.request
payment.cancel_request
payment.confirm_provider_result
payment.fail_provider_result
payment.expire_request
payment.request_refund
payment.confirm_refund
payment.reconcile
```

Business Modules must not update Payment state directly. Provider webhooks must not write generic records directly.

## 9. Relationship to existing Modules

```text
Sales Quote
  references Payment Request / Payment

FSM Work Order
  references Payment Request / Payment

Customer / Contact
  supplies payer context

Audit / Outbox
  records actions and durable external effects
```

Payment does not own Quote acceptance, Work Order completion, customer identity, or accounting policy.

## 10. Commercial packaging direction

POC:

```text
runory.payment Module
+ Stripe adapter
+ existing Quote / FSM Pack
```

Future international commercial packaging may combine:

```text
Payments Pack
= Payment
+ Invoice
+ Tax adapter
+ Stripe Connect onboarding
+ reconciliation views
```

Regional Packs may use the same Payment Commands with different provider adapters.

## 11. Success criteria

The POC is successful when:

- an operator can create a valid Payment Request from an existing business record;
- the customer completes a hosted checkout;
- only a verified provider event can mark the Payment succeeded;
- duplicate webhooks create no duplicate Payment or Refund;
- the operator can understand payment status without reading provider JSON;
- Quote or Work Order displays the linked payment result;
- failed and expired payments remain visible and actionable;
- refund state is traceable through Audit.

## 12. Product principles

1. Payment is a business capability; Stripe is an adapter.
2. Provider redirects are not payment confirmation.
3. Provider event identity and Command idempotency are mandatory.
4. Money amounts use integer minor units and explicit currency.
5. Provider secrets and sensitive payment data never enter business records.
6. Payment status cannot be manually changed through generic record editing.
7. Financial operations require explicit permissions and complete audit attribution.
8. The initial implementation remains narrow enough to replace or add providers later.
9. Runory software revenue and Workspace merchant receipts must never share a settlement account.
10. Production Stripe merchant payments use Connect Direct Charges unless a separately approved financial architecture supersedes this decision.

## 13. Related documents

- [Payment Technical Specification](payment-technical-spec.md)
- [Payment POC Execution Plan](payment-poc-execution-plan.md)
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md)
- [Stripe Connect Pre-GA Completion Plan](stripe-connect-pre-ga-plan.md)
- [Sales Quote Pack Plan](sales-quote-pack-plan.md)
- [FSM Canonical Execution Product Architecture](fsm-canonical-execution-product-architecture.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
