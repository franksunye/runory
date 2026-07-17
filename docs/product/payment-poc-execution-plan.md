# Runory Payment POC Execution Plan

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product` |
| Applies to | `v0.5` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-17 |
| Supersedes | — |
| Superseded by | — |

This plan turns the proposed [Payment Product Definition](payment-product-definition.md) and [Payment Technical Specification](payment-technical-spec.md) into a bounded implementation and acceptance sequence.

The POC validates one proposition:

> A Runory operator can request a customer payment from an existing business record, the customer can complete Stripe-hosted Checkout, and Runory can record and expose the authoritative result through verified, idempotent provider events.

## 1. Scope lock

### Included

- one Workspace;
- one Stripe test account;
- one currency;
- one-time card payment;
- Stripe-hosted Checkout;
- Payment Request from Quote and/or Work Order;
- deposit and final-payment purposes;
- success, failure, expiration, and refund;
- signed webhooks;
- Payment list and Payment Detail;
- source-record linkage;
- audit, idempotency, and failure visibility.

### Excluded

- Runory SaaS subscription billing;
- live-money production launch;
- Stripe Connect onboarding;
- platform fees or split settlement;
- recurring billing;
- tax calculation;
- complete Invoice/accounting capability;
- saved cards;
- card-present payment;
- regional payment providers;
- automatic bookkeeping reconciliation.

Any requested work outside this boundary is recorded as follow-up rather than absorbed into the POC.

## 2. POC scenarios

### POC-01 — request deposit from Quote

```text
Quote exists and is eligible
→ operator requests deposit
→ Runory creates Payment Request
→ Stripe Checkout is available
→ customer pays
→ signed webhook confirms success
→ Quote shows linked deposit paid
```

### POC-02 — request final payment from Work Order

```text
Work Order exists and is billable
→ operator requests final payment
→ customer pays
→ Runory records Payment succeeded
→ Work Order shows linked payment state
```

### POC-03 — failed or expired checkout

```text
payment fails or Checkout expires
→ Runory does not report success
→ Payment Request remains actionable
→ operator can issue a replacement request according to policy
```

### POC-04 — refund

```text
Payment succeeded
→ authorized operator requests refund
→ Stripe processes refund
→ verified event confirms outcome
→ Refund and Payment totals update
```

### POC-05 — replay and out-of-order events

```text
Stripe repeats or reorders events
→ Runory applies only legal transitions
→ no duplicate Payment or Refund is created
→ prior successful result remains authoritative
```

### POC-06 — invalid provider request

```text
webhook signature is invalid
or amount/currency mismatches
→ request is rejected
→ no business state changes
→ safe diagnostic is recorded
```

## 3. Delivery stages

## Stage 0 — product and provider setup

Tasks:

- create or select Stripe test account;
- define one test currency;
- define deposit and final-payment policies;
- define eligible Quote and Work Order states;
- configure test webhook endpoint and secret;
- define POC Workspace-to-provider-account mapping;
- define success, cancel, and operator review URLs;
- prepare test customer and source records.

Exit gate:

- Stripe test mode is confirmed;
- secrets are not committed;
- one test Workspace maps to one provider account;
- source business records are ready.

## Stage 1 — Module skeleton and canonical contracts

Tasks:

- add proposed `runory.payment` Module;
- define Payment Request, Payment, Refund, Provider Account, and Provider Reference objects;
- define money, currency, status, purpose, and provider-neutral schemas;
- define permissions and events;
- define unique provider identity constraints;
- add Module installation and schema tests;
- confirm dependencies on Audit, Outbox, Quote, FSM, and Contact.

Exit gate:

- Module installs in the demo Workspace;
- canonical schemas contain no Stripe SDK types;
- minor-unit and currency validation passes;
- provider references are unique.

## Stage 2 — Payment Commands

Tasks:

- implement `payment.request`;
- implement cancellation/expiration behavior;
- implement provider-result confirmation and failure Commands;
- implement refund request and confirmation Commands;
- implement idempotency policy;
- implement source-object validation;
- emit Domain Events and Audit facts;
- enforce legal transitions and permissions.

Exit gate:

- Payment Request can be created without provider-specific mutation;
- retries return the prior result;
- conflicting idempotency input fails closed;
- Payment status cannot be changed through generic record editing.

## Stage 3 — Stripe adapter and Checkout

Tasks:

- add Stripe SDK to Cloud integration boundary;
- implement provider registry and Stripe adapter;
- implement Checkout Session creation;
- attach canonical Payment Request reference to provider metadata safely;
- implement expiration/cancellation mapping;
- implement safe provider error mapping;
- ensure test/live mode separation;
- implement durable external execution through Outbox or an explicitly tested equivalent.

Exit gate:

- a Payment Request produces one usable Stripe-hosted Checkout;
- retry does not create uncontrolled duplicate sessions;
- card data never enters Runory;
- provider failure leaves visible canonical state.

## Stage 4 — signed webhook processing

Tasks:

- add raw-body Stripe webhook endpoint;
- verify signature before trusting event data;
- allowlist supported event types;
- normalize provider events;
- persist provider-event identity;
- invoke named Commands;
- handle duplicate and out-of-order delivery;
- add correlation logging and safe diagnostics;
- acknowledge accepted events promptly.

Exit gate:

- valid success event updates Payment;
- duplicate event is harmless;
- invalid signature changes nothing;
- amount/currency mismatch is rejected;
- provider JSON does not directly mutate Quote or Work Order.

## Stage 5 — Quote and Work Order integration

Tasks:

- add Request Payment action where policy allows;
- pass authoritative source object and amount context;
- expose linked Payment Requests and Payments;
- show deposit/final payment status as a projection;
- define behavior when source record changes after request creation;
- prevent accidental payment requests from ineligible states.

Exit gate:

- operator can initiate payment from a normal business screen;
- source record links to Payment Detail;
- Payment remains authoritative for financial status;
- Quote/FSM lifecycle remains authoritative for business state.

## Stage 6 — Payment UI

### Payment list

Tasks:

- show customer, source record, purpose, amount, currency, status, provider mode, and dates;
- add filters for open, paid, failed, expired, refunded, and review-required;
- distinguish test mode visibly.

### Payment detail

Tasks:

- show Payment Request, Payment, and Refund chain;
- show source business record;
- show Checkout state without exposing sensitive URL data unnecessarily;
- show provider-safe identifiers;
- show Audit and event timeline;
- expose permitted cancel/refund/reconcile actions;
- keep raw provider diagnostics secondary.

Exit gate:

- operator understands the payment outcome without provider JSON;
- operator can navigate between business and payment records;
- failed and unresolved states are actionable.

## Stage 7 — refund path

Tasks:

- add high-risk refund permission;
- validate refundable balance;
- create Refund record before provider operation;
- call Stripe refund API through adapter;
- confirm final state from provider event;
- handle failed and repeated refund requests;
- update Payment cumulative refunded amount.

Exit gate:

- refund cannot exceed available amount;
- duplicate event or request creates no duplicate refund;
- Payment becomes partially or fully refunded correctly;
- Audit identifies requesting actor and provider result.

## Stage 8 — testing and acceptance hardening

Tasks:

- run scripted Checkout scenarios;
- test failure, expiration, replay, out-of-order events, and invalid signatures;
- test mismatched amount and currency;
- test source-record eligibility and permissions;
- test partial and full refund;
- add automated Command, adapter, webhook, and end-to-end tests;
- run existing Quote, FSM, architecture, and documentation gates;
- create immutable POC evidence under `docs/releases/` after acceptance.

Exit gate:

- all hard gates pass;
- blockers and deferred items are explicit;
- one reproducible demonstration flow is documented.

## 4. Workstreams and ownership

| Workstream | Primary output |
| --- | --- |
| Product policy | eligible source states, purpose, amount and refund rules |
| Module/contracts | canonical Payment objects, permissions, events, schemas |
| Command Runtime | governed request, confirmation, failure, refund, reconciliation |
| Stripe integration | Checkout, refund, mapping, mode separation |
| Webhook gateway | signature validation, normalization, event idempotency |
| Quote/FSM integration | source actions, links, projections |
| UI | Payment list, detail, actions and diagnostics |
| Testing | provider simulations, real test Checkout, regression and evidence |

Team allocation should follow current engineering capacity. Completion is determined by Exit Gates and acceptance criteria, not time estimates.

## 5. Implementation order

```text
1. Install canonical Payment Module
2. Create Payment Request locally
3. Create Stripe Checkout
4. Receive signed success webhook
5. Show Payment Detail
6. Link Quote / Work Order
7. Add failure and expiration
8. Add refund
9. Harden replay, ordering, permissions, and diagnostics
10. Record POC evidence
```

Do not begin with Stripe Connect, subscriptions, generalized accounting, multiple providers, or production live-money onboarding.

## 6. Hard acceptance gates

### Architecture

- [ ] Payment is a horizontal Module;
- [ ] Stripe remains behind an adapter;
- [ ] Quote and FSM do not own Payment state;
- [ ] provider webhooks invoke named Commands;
- [ ] external API operations follow Outbox/durable-effect policy;
- [ ] provider redirects cannot confirm payment.

### Correctness

- [ ] money uses integer minor units and explicit currency;
- [ ] signed provider event is required for success;
- [ ] duplicate event creates no duplicate record;
- [ ] out-of-order event cannot produce an illegal state;
- [ ] amount/currency mismatch fails closed;
- [ ] refund cannot exceed refundable balance;
- [ ] source linkage is stable and auditable.

### Security

- [ ] no card data is stored or logged;
- [ ] webhook signatures are verified from raw body;
- [ ] test and live credentials are separated;
- [ ] provider account maps to exactly one Workspace in POC;
- [ ] refund and provider configuration use high-risk permissions;
- [ ] secrets do not appear in source, business records, or diagnostics.

### Product experience

- [ ] operator requests payment from a normal business record;
- [ ] customer completes hosted Checkout;
- [ ] operator sees paid, failed, expired, and refunded states;
- [ ] source record links to payment outcome;
- [ ] technical provider concepts do not dominate the UI.

### Regression

- [ ] platform-core typecheck and tests pass;
- [ ] cloud typecheck and tests pass;
- [ ] architecture tests pass;
- [ ] Sales Quote and FSM tests pass;
- [ ] documentation checker passes.

## 7. Test matrix

| ID | Scenario | Expected outcome |
| --- | --- | --- |
| TC-01 | Quote deposit paid | Payment succeeded; Quote shows linked deposit |
| TC-02 | Work Order final payment paid | Payment succeeded; Work Order shows linked result |
| TC-03 | Checkout cancelled | no succeeded state; request remains actionable |
| TC-04 | Checkout expired | request becomes expired |
| TC-05 | Card payment fails | safe failed state; no false success |
| TC-06 | Success webhook repeated | prior result returned; no duplicate |
| TC-07 | Invalid signature | request rejected; no state change |
| TC-08 | Amount mismatch | event rejected or review-required; no success |
| TC-09 | Currency mismatch | event rejected; no success |
| TC-10 | Full refund | Refund succeeded; Payment refunded |
| TC-11 | Partial refund | totals updated; Payment partially refunded |
| TC-12 | Refund exceeds balance | Command rejected |
| TC-13 | Refund webhook repeated | no duplicate Refund |
| TC-14 | Event delivered out of order | only legal final state applied |
| TC-15 | Unauthorized user requests refund | permission denied and audited |
| TC-16 | Test/live mix attempt | rejected |

## 8. Demonstration script

1. Open a demo Workspace with an eligible Quote or Work Order.
2. Select Request Payment.
3. Enter or confirm deposit/final amount.
4. Open Stripe-hosted Checkout.
5. Complete payment with a Stripe test card.
6. Open Payment Detail and show verified success.
7. Open the linked Quote or Work Order and show its payment projection.
8. Replay the webhook and show no duplicate.
9. Request a partial or full refund.
10. Show Refund confirmation and Audit timeline.
11. Run one failed or expired Checkout scenario.

## 9. Risks and controls

| Risk | Control |
| --- | --- |
| redirect treated as success | only signed webhook Command can confirm |
| duplicate Checkout sessions | request and provider idempotency |
| duplicate webhooks | unique provider event identity |
| wrong amount/currency | immutable request values and event validation |
| direct financial field editing | governed fields and named Commands |
| sensitive data leakage | hosted Checkout, masking, no card storage |
| test/live contamination | explicit mode on account and records |
| Stripe coupling | provider-neutral Module and adapter mapper |
| refund abuse | high-risk permission, balance check, Audit |
| premature Connect complexity | POC scope lock with provider_account_id readiness |

## 10. Stop and review conditions

Pause and review architecture if:

- Payment success requires manual status editing;
- provider webhooks cannot be verified from raw body;
- Quote or FSM must directly own provider IDs or Payment status;
- one provider event can resolve to multiple Workspaces;
- amount or currency cannot be validated deterministically;
- external calls bypass durable retry and observability;
- Payment requires a full accounting subsystem to complete the primary path;
- POC expands into Connect, marketplace settlement, or subscriptions before basic Checkout passes.

## 11. Completion output

After acceptance, add:

```text
docs/releases/payment-poc-e2e-run-YYYY-MM-DD.md
```

The evidence should record tested commit, provider mode and non-secret identifiers, Workspace, scenarios, automated checks, observed results, known limitations, and acceptance decision.

## 12. Related documents

- [Payment Product Definition](payment-product-definition.md)
- [Payment Technical Specification](payment-technical-spec.md)
- [Payment Integration Boundary](../architecture/payment-integration-boundary.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
- [Sales Quote Pack Plan](sales-quote-pack-plan.md)
- [FSM Canonical Execution Product Architecture](fsm-canonical-execution-product-architecture.md)
