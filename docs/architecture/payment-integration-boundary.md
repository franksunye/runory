# Payment Integration Boundary

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `architecture` |
| Applies to | `post-v0.5 POC` |
| Owner | Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | — |
| Superseded by | — |

This document defines where Payment fits in Runory architecture and prevents provider concerns from leaking into business Modules.

It specializes the canonical [Architecture Overview](overview.md) and [Contract-driven Command Architecture](contract-driven-command-architecture.md).

## 1. Canonical boundary

```text
Business source
Quote / Work Order / future Invoice
        ↓
payment.request Command
        ↓
runory.payment
        ↓
Payment Provider interface
        ↓
Stripe adapter
        ↓
Hosted Checkout / Refund API

Provider webhook
        ↓
verified integration endpoint
        ↓
normalized provider event
        ↓
Payment Command Runtime
        ↓
Payment state + Event + Audit + Outbox
```

## 2. Authority map

| Concern | Authoritative owner |
| --- | --- |
| Quote amount and acceptance | Sales Quote Module |
| Work Order lifecycle | FSM Module |
| Customer/contact identity | Contact/Company Modules |
| Payment Request and Payment status | `runory.payment` |
| Refund status and refundable balance | `runory.payment` |
| Provider API and event mapping | Stripe adapter |
| External retry delivery | Outbox/runtime infrastructure |
| SaaS subscription billing | SaaS Core billing, outside this boundary |

## 3. Non-negotiable rules

```text
Stripe is not imported into business Module contracts.
Quote and FSM do not directly call Stripe.
Provider redirect does not confirm payment.
Provider webhook does not use generic record mutation.
Payment status changes only through named Commands.
All amounts use minor units plus currency.
Provider account identity is explicit on every provider-bound record.
Test and live modes are isolated.
```

## 4. Module and adapter placement

```text
catalog/modules/runory.payment/
  canonical objects, permissions, views, events, commands

packages/contracts/
  provider-neutral payment schemas and result envelopes

packages/platform-core/
  command handlers, persistence, audit, outbox integration

apps/cloud/src/integrations/payments/
  provider registry and HTTP integration boundary

apps/cloud/src/integrations/payments/stripe/
  Stripe SDK, Checkout, refunds, webhook verification, mapping
```

Exact physical placement may follow current repository conventions, but dependency direction must remain unchanged.

## 5. SaaS billing separation

Runory platform billing remains:

```text
Organization / Workspace
→ plan / entitlement / usage
→ Runory billing account
```

Workspace business payments remain:

```text
Workspace business record
→ customer Payment Request
→ Workspace merchant/provider account
```

These flows must not share Payment records or settlement assumptions. Stripe may implement both in the future, but through separate adapters, credentials, webhooks, and domain models.

## 6. Stripe Connect readiness

The POC may map one Workspace to one Stripe test account. The canonical design must still preserve:

```text
workspace_id
provider_account_id
provider
mode
```

Future Connect onboarding is an adapter and account-lifecycle extension. It must not require rewriting Payment Request, Payment, Refund, or source-object relationships.

## 7. Regional provider readiness

Future providers may include WeChat Pay, Alipay, or other regional services.

Provider addition must supply:

- capability declaration;
- Checkout/payment initiation implementation;
- webhook/event verification;
- normalized event mapping;
- refund implementation where supported;
- provider-account onboarding/configuration;
- conformance tests against Payment Commands.

A provider does not redefine Payment business states.

## 8. Related documents

- [Payment Product Definition](../product/payment-product-definition.md)
- [Payment Technical Specification](../product/payment-technical-spec.md)
- [Payment POC Execution Plan](../product/payment-poc-execution-plan.md)
- [Architecture Overview](overview.md)
- [Contract-driven Command Architecture](contract-driven-command-architecture.md)
