# Runory Payment Technical Specification

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `architecture` |
| Applies to | `v0.5–v1.0` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-17 |
| Supersedes | — |
| Superseded by | — |

This specification defines the implemented `runory.payment` Module, Stripe adapter, Commands, data model, security boundary, webhook processing, and v0.5 acceptance requirements.

It specializes the canonical [Architecture Overview](../architecture/overview.md), [Module Architecture](../architecture/module-architecture.md), and [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md). It does not replace SaaS Core billing.

## 1. Architecture

```text
Operator / Agent / API
        ↓
Payment Commands
        ↓
runory.payment
        ↓
Payment Provider interface
        ↓
Stripe adapter
        ↓
Stripe Checkout / Refund API

Stripe signed webhook
        ↓
Stripe webhook adapter
        ↓
normalized provider event
        ↓
payment.confirm_* Command
        ↓
Payment state + Domain Event + Audit + Outbox
```

Provider redirects and client callbacks are presentation events only. They cannot authoritatively change Payment state.

## 2. Module boundary

Canonical location:

```text
catalog/modules/runory.payment/
```

The Module owns:

- Payment Request lifecycle;
- Payment lifecycle;
- Refund lifecycle;
- provider-account references;
- provider-reference uniqueness;
- payment permissions;
- payment Commands and events;
- provider-neutral views and agent skills.

The Module does not own:

- Quote approval or amount calculation;
- Work Order lifecycle;
- invoice accounting rules;
- subscription billing for Runory Cloud;
- bank settlement;
- tax calculation;
- provider credentials.

## 3. Provider adapter boundary

Suggested Cloud location:

```text
apps/cloud/src/integrations/payments/
  contracts.ts
  registry.ts
  stripe/
    client.ts
    checkout.ts
    refunds.ts
    webhooks.ts
    mapper.ts
```

The canonical Module must not depend on Stripe SDK types or Stripe event names.

Provider-neutral interface:

```typescript
interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  cancelCheckout(input: CancelCheckoutInput): Promise<void>;
  createRefund(input: CreateRefundInput): Promise<CreateRefundResult>;
  parseWebhook(input: RawWebhookInput): Promise<NormalizedPaymentEvent>;
  retrievePayment(input: RetrievePaymentInput): Promise<ProviderPaymentSnapshot>;
}
```

## 4. Canonical data model

All money amounts use integer minor units and explicit ISO currency codes.

### 4.1 payment_request

```text
id
workspace_id
number
status                  draft / open / paid / partially_paid / expired / cancelled
purpose                 deposit / final / general
amount_due_minor
amount_paid_minor
currency
customer_contact_id     optional
source_object_type      quote / work_order / future invoice
source_object_id
provider_account_id
checkout_url            optional, treated as sensitive operational data
expires_at              optional
created_by
created_at
updated_at
aggregate_version
```

### 4.2 payment

```text
id
workspace_id
payment_request_id
status                  pending / processing / succeeded / failed / cancelled / refunded / partially_refunded
amount_minor
refunded_amount_minor
currency
provider
provider_account_id
provider_payment_id
failure_code            optional normalized code
failure_message         optional safe message
succeeded_at            optional
created_at
updated_at
aggregate_version
```

### 4.3 refund

```text
id
workspace_id
payment_id
status                  requested / processing / succeeded / failed / cancelled
amount_minor
currency
reason                   optional
provider_refund_id       optional
requested_by
requested_at
succeeded_at             optional
aggregate_version
```

### 4.4 payment_provider_account

```text
id
workspace_id
provider
mode                     test / live
provider_account_ref
status                   configured / restricted / active / disabled
capabilities_json        provider-neutral capabilities only
created_at
updated_at
```

Provider credentials remain in secret storage, not this object.

For v0.5, one test Workspace can map to the configured Stripe test account.
This mapping must not be used for production merchant collection. Before GA,
`provider_account_ref` identifies the Workspace merchant's Stripe Connected
Account and every provider API call executes in that account context.

### 4.5 payment_provider_reference

```text
id
workspace_id
provider
provider_account_id
event_type
provider_object_type
provider_object_id
provider_event_id
payload_hash
processed_status
processed_at
error_code               optional
```

Unique constraints must prevent duplicate provider event processing.

## 5. Source-object linkage

Payment must not add provider fields directly to Quote or Work Order.

Canonical relationship:

```text
Quote / Work Order
        ↑
source_object_type + source_object_id
        |
Payment Request
        ↓
Payment
        ↓
Refund
```

The source Module may contribute read models, badges, actions, and events, but Payment remains the authority for payment state.

## 6. Commands

### 6.1 payment.request

Creates one Payment Request and initiates provider checkout.

Input includes:

```text
source object
purpose
amount and currency
payer context
expiration
provider account
idempotency key
```

Required behavior:

- validate Workspace and source object;
- validate amount and currency;
- validate permission;
- create Payment Request atomically;
- write Outbox work for external checkout creation, or create checkout after the local command according to the chosen integration policy;
- record provider references safely;
- return a stable result envelope.

### 6.2 payment.confirm_provider_result

Invoked only from a verified normalized provider event.

Required behavior:

- resolve provider account and Workspace;
- enforce unique provider event identity;
- resolve Payment Request and Payment;
- validate currency and amount consistency;
- transition Payment to succeeded only from legal states;
- update Payment Request totals;
- emit `payment.succeeded`;
- write Audit attribution to provider, account, event, and Integration Principal;
- return the prior result on valid replay.

### 6.3 payment.fail_provider_result

Records safe failure state without storing sensitive provider payloads.

### 6.4 payment.expire_request

Expires an open request after provider or local expiration.

### 6.5 payment.request_refund

Validates permission, refundable amount, Payment state, currency, and cumulative refunds. Creates Refund in `requested` or `processing` state and emits durable external work.

### 6.6 payment.confirm_refund

Processes a verified provider refund event and updates Payment refunded totals.

### 6.7 payment.reconcile

Compares canonical state with a provider snapshot when event delivery is uncertain. Reconciliation cannot bypass legal transitions or audit.

## 7. Command and external-effect policy

Payment follows the existing consistency classes:

- canonical Payment, Refund, Audit, Domain Event, and Outbox facts are atomic local effects;
- Stripe Checkout creation, refund API calls, email, and notifications are durable external effects;
- dashboards and source-object badges are rebuildable projections.

No provider HTTP call may participate as if it were part of the local database transaction.

## 8. Checkout creation policy

The implementation must choose one explicit policy:

### Preferred POC policy

```text
payment.request Command
→ create canonical Payment Request
→ create durable checkout job
→ worker calls Stripe
→ attach provider checkout reference
→ return or refresh checkout URL
```

This preserves retryability and Outbox semantics.

A synchronous adapter call may be used only if failure behavior, idempotency, and compensation are explicitly tested. It must not leave an invisible open request or duplicate Stripe sessions.

## 9. Webhook boundary

Suggested endpoint:

```text
POST /api/integrations/stripe/webhook
```

Required behavior:

1. read raw request body;
2. verify Stripe signature before parsing trusted data;
3. resolve mode and provider account;
4. persist provider-event identity or reject duplicate safely;
5. map Stripe payload to `NormalizedPaymentEvent`;
6. invoke the appropriate named Command;
7. return success quickly after durable acceptance;
8. process heavier follow-up asynchronously;
9. retain correlation IDs and safe diagnostics.

Unsupported event types must be acknowledged or rejected according to an explicit allowlist policy; they must never mutate business records generically.

## 10. Normalized provider events

```typescript
type NormalizedPaymentEvent =
  | { type: "payment.succeeded"; providerEventId: string; providerPaymentId: string; amountMinor: number; currency: string; paymentRequestRef: string; occurredAt: string }
  | { type: "payment.failed"; providerEventId: string; providerPaymentId: string; safeFailureCode?: string; occurredAt: string }
  | { type: "checkout.expired"; providerEventId: string; checkoutId: string; paymentRequestRef: string; occurredAt: string }
  | { type: "refund.succeeded"; providerEventId: string; providerRefundId: string; providerPaymentId: string; amountMinor: number; currency: string; occurredAt: string }
  | { type: "refund.failed"; providerEventId: string; providerRefundId: string; occurredAt: string };
```

Raw provider payload may be retained only under an explicit encrypted retention policy. It is not the canonical business record.

## 11. Idempotency

Required keys:

```text
payment.request:
  workspace + source object + purpose + client idempotency key

provider event:
  provider + provider account + provider event ID

provider object:
  provider + provider account + provider payment/refund ID

refund request:
  payment + refund idempotency key
```

Reusing the same idempotency key with different amount, currency, or source input must fail closed.

## 12. Security

- Stripe secret keys are stored in environment or managed secret storage;
- webhook secrets are separate by environment;
- provider account maps to exactly one Workspace in POC;
- no PAN, CVC, or raw payment method data enters Runory;
- Checkout remains Stripe-hosted;
- Payment permissions are narrower than generic record permissions;
- refund requires a distinct high-risk permission;
- financial actions require complete actor and provider audit;
- logs mask Checkout URLs and provider identifiers where appropriate;
- test and live modes cannot share records or credentials silently.

## 13. Permissions

Initial permissions:

```text
payment.view
payment.request
payment.cancel
payment.refund
payment.reconcile
payment.configure_provider
payment.view_diagnostics
```

`payment.refund`, `payment.reconcile`, and `payment.configure_provider` are high-risk operations.

## 14. Events

```text
payment_request.created
payment_request.opened
payment_request.expired
payment.succeeded
payment.failed
payment.refund_requested
payment.refunded
payment.refund_failed
payment.reconciliation_required
```

Quote and FSM may consume these events to update projections or expose next actions. They must not duplicate Payment authority.

## 15. UI

### Payment list

- request number;
- customer;
- source Quote or Work Order;
- purpose;
- amount due and paid;
- status;
- provider mode;
- created and paid dates.

### Payment detail

- canonical status and amount;
- source business record;
- payer context;
- Payment attempts;
- Refunds;
- provider-safe references;
- event and Audit timeline;
- warnings and reconciliation state;
- permitted actions.

Provider diagnostics remain secondary to business meaning.

## 16. Stripe Connect readiness

The POC may use one Stripe test account, but the data model must retain:

```text
provider_account_id
```

on every provider-bound Payment Request, Payment, Refund, and provider reference.

Future Connect support must be additive:

```text
Workspace
→ Connected Account
→ Payment Request
→ Checkout / Payment
→ settlement to Workspace merchant
```

The POC must not assume all future Workspace payments settle into the Runory platform account.

## 17. Testing

Required automated coverage:

- amount and currency validation;
- legal state transitions;
- request idempotency;
- duplicate webhook replay;
- out-of-order provider events;
- invalid signature rejection;
- mismatched amount/currency rejection;
- refund cumulative amount limits;
- test/live separation;
- source-object linkage;
- permission denial;
- provider adapter mapping;
- existing Quote, FSM, architecture, and documentation gates.

## 18. POC acceptance gates

- one Payment Request can be created from an existing Quote or Work Order;
- Stripe Checkout opens without exposing card data to Runory;
- a signed webhook is the only path to `succeeded`;
- duplicate webhook delivery is harmless;
- invalid signatures never create or modify Payment records;
- Payment amount and currency match the request;
- refund cannot exceed the succeeded amount minus prior refunds;
- operator can trace Request → Checkout → Payment → Refund;
- source record shows the linked payment state;
- no Stripe-specific state becomes authoritative outside the adapter.

## 19. Related documents

- [Payment Product Definition](payment-product-definition.md)
- [Payment POC Execution Plan](payment-poc-execution-plan.md)
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
- [Sales Quote Pack Plan](sales-quote-pack-plan.md)
